"""Security and request guardrails for POWERGRID API."""

from __future__ import annotations

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


def get_client_ip(request: Request) -> str:
    """Extract client IP, considering common proxy forwarding headers."""
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        # X-Forwarded-For may contain a comma-separated list.
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip

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

    if incoming_key != settings.BACKEND_API_KEY:
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
