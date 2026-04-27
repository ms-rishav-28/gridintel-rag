"""Security and request guardrails for POWERGRID SmartOps API."""

# CODEX-FIX: align API key and rate-limit guards with the /api/v1 production surface.

from __future__ import annotations

import asyncio
import ipaddress
import secrets
import time
from collections import defaultdict, deque
from typing import Deque

from fastapi import HTTPException, Request, status

from app.core.config import get_settings

settings = get_settings()
API_PREFIX = "/api/v1"
API_KEY_HEADER = "X-API-Key"


class _InMemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, Deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(
        self,
        key: str,
        now: float,
        max_requests: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        window_start = now - window_seconds
        async with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] < window_start:
                bucket.popleft()
            if len(bucket) >= max_requests:
                retry_after = max(1, int(window_seconds - (now - bucket[0])))
                return False, retry_after
            bucket.append(now)
            return True, 0


rate_limiter = _InMemoryRateLimiter()


def _is_exempt_path(path: str) -> bool:
    return path in {
        "/",
        "/ping",
        "/openapi.json",
        "/docs",
        "/redoc",
        f"{API_PREFIX}/health",
    }


def get_client_ip(request: Request) -> str:
    if settings.TRUST_PROXY_HEADERS:
        for header in ("x-forwarded-for", "x-real-ip"):
            raw = request.headers.get(header, "")
            for value in raw.split(","):
                candidate = value.strip()
                try:
                    ipaddress.ip_address(candidate)
                    return candidate
                except ValueError:
                    continue
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


async def enforce_api_key(request: Request) -> None:
    if not settings.BACKEND_API_KEY or _is_exempt_path(request.url.path):
        return
    incoming_key = request.headers.get(API_KEY_HEADER) or request.headers.get(API_KEY_HEADER.lower())
    if not incoming_key or not secrets.compare_digest(incoming_key, settings.BACKEND_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )


async def enforce_rate_limit(request: Request) -> None:
    if not settings.ENABLE_RATE_LIMITING or _is_exempt_path(request.url.path):
        return
    allowed, retry_after = await rate_limiter.check(
        key=f"{get_client_ip(request)}:{request.url.path}",
        now=time.time(),
        max_requests=settings.RATE_LIMIT_REQUESTS,
        window_seconds=settings.RATE_LIMIT_WINDOW,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests",
            headers={"Retry-After": str(retry_after)},
        )


check_api_key = enforce_api_key
