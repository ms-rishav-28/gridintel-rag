"""Logging helpers for POWERGRID SmartOps."""

# CODEX-FIX: remove undeclared structlog dependency and keep stdlib logging API-safe.

from __future__ import annotations

import asyncio
import logging
import sys
import time
from functools import wraps
from typing import Any, Callable

from app.core.config import get_settings


def setup_logging() -> None:
    settings = get_settings()
    logging.basicConfig(
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        force=True,
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def log_execution_time(logger: logging.Logger, operation: str):
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                logger.info(
                    "%s completed in %.2fms",
                    operation,
                    (time.time() - start_time) * 1000,
                )
                return result
            except Exception as exc:
                logger.error(
                    "%s failed in %.2fms: %s",
                    operation,
                    (time.time() - start_time) * 1000,
                    exc,
                    exc_info=True,
                )
                raise

        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                logger.info(
                    "%s completed in %.2fms",
                    operation,
                    (time.time() - start_time) * 1000,
                )
                return result
            except Exception as exc:
                logger.error(
                    "%s failed in %.2fms: %s",
                    operation,
                    (time.time() - start_time) * 1000,
                    exc,
                    exc_info=True,
                )
                raise

        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper

    return decorator
