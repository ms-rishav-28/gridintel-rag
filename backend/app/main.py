"""FastAPI entry point for POWERGRID SmartOps."""

# CODEX-FIX: configure production startup, middleware, API guards, and structured error responses.

from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.api.routes import router
from app.core.config import get_settings
from app.core.exceptions import PowergridException, ServiceUnavailableError
from app.core.logging import setup_logging

setup_logging()
logger = logging.getLogger(__name__)
settings = get_settings()


class RequestBodySizeMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, max_bytes: int):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next: Callable):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.max_bytes:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": f"Request body exceeds {settings.MAX_REQUEST_BODY_MB}MB"},
                    )
            except ValueError:
                pass
        return await call_next(request)


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "%s %s -> %s in %.2fms request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            (time.perf_counter() - started) * 1000,
            request_id,
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable):
        response = await call_next(request)
        if settings.ENABLE_SECURITY_HEADERS:
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
            if request.url.path not in {"/docs", "/redoc", "/openapi.json"}:
                response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
        if settings.ENABLE_HSTS and request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


def _masked_settings() -> dict:
    values = settings.model_dump()
    for key in values:
        if any(secret in key.lower() for secret in ("key", "token", "secret")) and values[key]:
            values[key] = "***"
    return values


def _cors_origins() -> list[str]:
    origins = [settings.FRONTEND_URL]
    if settings.ENVIRONMENT == "development":
        origins.extend(["http://localhost:3000", "http://localhost:5173"])
    return sorted(set(origin for origin in origins if origin))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting POWERGRID SmartOps with settings: %s", _masked_settings())
    from app.services.vector_store import get_vector_store

    await get_vector_store().initialize()
    logger.info("LanceDB startup stats: %s", await get_vector_store().get_stats())
    yield
    logger.info("POWERGRID SmartOps shutdown complete")


app = FastAPI(
    title="POWERGRID SmartOps API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

if settings.TRUST_PROXY_HEADERS:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])

app.add_middleware(RequestBodySizeMiddleware, max_bytes=settings.MAX_REQUEST_BODY_MB * 1024 * 1024)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "Retry-After"],
)
app.add_middleware(SecurityHeadersMiddleware)

if settings.ENABLE_RATE_LIMITING:
    from slowapi import Limiter
    from slowapi.middleware import SlowAPIMiddleware
    from slowapi.util import get_remote_address

    app.state.limiter = Limiter(key_func=get_remote_address)
    app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Validation error",
            "errors": exc.errors(),
            "request_id": getattr(request.state, "request_id", None),
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "request_id": getattr(request.state, "request_id", None),
        },
        headers=exc.headers,
    )


@app.exception_handler(PowergridException)
async def powergrid_exception_handler(request: Request, exc: PowergridException):
    status_code = 503 if isinstance(exc, ServiceUnavailableError) else 500
    return JSONResponse(
        status_code=status_code,
        content={
            "error_code": exc.error_code,
            "message": exc.message,
            "details": exc.details,
            "request_id": getattr(request.state, "request_id", None),
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None)
    logger.exception("Unhandled exception request_id=%s path=%s", request_id, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "request_id": request_id,
        },
    )


app.include_router(router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"name": "POWERGRID SmartOps API", "version": "1.0.0", "status": "operational"}


@app.get("/ping")
async def ping() -> dict[str, str]:
    return {"status": "ok"}
