"""Security and request guardrails for POWERGRID API."""

from __future__ import annotations

import ipaddress
import secrets
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Deque, Dict

from fastapi import HTTPException, Request, status

from app.core.config import get_settings

settings = get_settings()


class _InMemoryRateLimiter:
    """Simple process-local sliding-window rate limiter."""

    def __init__(self) -> None:
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, now: float, max_requests: int, window_seconds: int) -> tuple[bool, int]:
        """Return whether request is allowed and retry-after seconds if blocked."""
        window_start = now - window_seconds

        with self._lock:
            bucket = self._hits[key]

            while bucket and bucket[0] < window_start:
                bucket.popleft()

            if len(bucket) >= max_requests:
                retry_after = max(1, int(window_seconds - (now - bucket[0])))
                return False, retry_after

            bucket.append(now)
            return True, 0


rate_limiter = _InMemoryRateLimiter()


def _ip_matches_trusted_networks(ip_value: str, trusted_values: list[str]) -> bool:
    """Check if IP matches explicit trusted proxy IP/CIDR definitions."""
    if not trusted_values:
        return False

    try:
        ip_obj = ipaddress.ip_address(ip_value)
    except ValueError:
        return False

    for trusted in trusted_values:
        candidate = trusted.strip()
        if not candidate:
            continue

        try:
            if "/" in candidate:
                if ip_obj in ipaddress.ip_network(candidate, strict=False):
                    return True
            else:
                if ip_obj == ipaddress.ip_address(candidate):
                    return True
        except ValueError:
            continue

    return False


def _should_trust_forward_headers(request: Request) -> bool:
    """Determine whether forwarded headers can be trusted for client-IP derivation."""
    if not settings.TRUST_PROXY_HEADERS:
        return False

    if not request.client or not request.client.host:
        return False

    # If no explicit allow-list is provided, trust proxy headers when enabled.
    if not settings.TRUSTED_PROXY_IPS:
        return True

    return _ip_matches_trusted_networks(request.client.host, settings.TRUSTED_PROXY_IPS)


def _extract_first_valid_ip(raw: str) -> str | None:
    """Return first valid IP from comma-separated header values."""
    for candidate in raw.split(","):
        value = candidate.strip()
        if not value:
            continue
        try:
            ipaddress.ip_address(value)
            return value
        except ValueError:
            continue
    return None


def get_client_ip(request: Request) -> str:
    """Extract client IP, considering common proxy forwarding headers."""
    if _should_trust_forward_headers(request):
        forwarded_for = request.headers.get("x-forwarded-for", "")
        parsed_forwarded = _extract_first_valid_ip(forwarded_for)
        if parsed_forwarded:
            return parsed_forwarded

        real_ip = request.headers.get("x-real-ip", "").strip()
        if real_ip:
            try:
                ipaddress.ip_address(real_ip)
                return real_ip
            except ValueError:
                pass

    if request.client and request.client.host:
        return request.client.host

    return "unknown"


def _is_exempt_path(path: str) -> bool:
    """Check if path is excluded from API guardrails."""
    exempt_paths = {
        "/",
        "/ping",
        "/openapi.json",
        "/docs",
        "/redoc",
        f"{settings.API_V1_PREFIX}/health",
    }
    return path in exempt_paths


async def enforce_api_key(request: Request) -> None:
    """Require API key for API endpoints when BACKEND_API_KEY is configured."""
    if not settings.BACKEND_API_KEY:
        return

    if _is_exempt_path(request.url.path):
        return

    incoming_key = request.headers.get(settings.API_KEY_HEADER) or request.headers.get(
        settings.API_KEY_HEADER.lower()
    )

    if not incoming_key or not secrets.compare_digest(incoming_key, settings.BACKEND_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "UNAUTHORIZED",
                "message": "Missing or invalid API key",
            },
        )


async def enforce_rate_limit(request: Request) -> None:
    """Apply request rate limiting for API endpoints."""
    if not settings.ENABLE_RATE_LIMITING:
        return

    if _is_exempt_path(request.url.path):
        return

    client_ip = get_client_ip(request)
    path = request.url.path
    key = f"{client_ip}:{path}"

    allowed, retry_after = rate_limiter.check(
        key=key,
        now=time.time(),
        max_requests=settings.RATE_LIMIT_REQUESTS,
        window_seconds=settings.RATE_LIMIT_WINDOW,
    )

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error_code": "RATE_LIMIT_EXCEEDED",
                "message": "Too many requests. Please retry later.",
                "details": {
                    "retry_after_seconds": retry_after,
                    "window_seconds": settings.RATE_LIMIT_WINDOW,
                    "limit": settings.RATE_LIMIT_REQUESTS,
                },
            },
            headers={"Retry-After": str(retry_after)},
        )
