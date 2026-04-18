import asyncio
import structlog
import logging
import sys
from functools import wraps
from typing import Any, Callable
import time

from app.core.config import get_settings


def setup_logging():
    """Configure structured logging for the application."""
    settings = get_settings()
    
    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.LOG_LEVEL.upper()),
    )
    
    # Configure structlog
    processors = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    
    if settings.LOG_FORMAT == "json":
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())
    
    structlog.configure(
        processors=processors,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Get a structured logger instance."""
    return structlog.get_logger(name)


def log_execution_time(logger: structlog.stdlib.BoundLogger, operation: str):
    """Decorator to log function execution time."""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                execution_time = time.time() - start_time
                logger.info(
                    f"{operation}_completed",
                    execution_time_ms=round(execution_time * 1000, 2),
                    operation=operation,
                )
                return result
            except Exception as e:
                execution_time = time.time() - start_time
                logger.error(
                    f"{operation}_failed",
                    execution_time_ms=round(execution_time * 1000, 2),
                    operation=operation,
                    error=str(e),
                    error_type=type(e).__name__,
                )
                raise
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                execution_time = time.time() - start_time
                logger.info(
                    f"{operation}_completed",
                    execution_time_ms=round(execution_time * 1000, 2),
                    operation=operation,
                )
                return result
            except Exception as e:
                execution_time = time.time() - start_time
                logger.error(
                    f"{operation}_failed",
                    execution_time_ms=round(execution_time * 1000, 2),
                    operation=operation,
                    error=str(e),
                    error_type=type(e).__name__,
                )
                raise
        
        # Fix #18: Use asyncio.iscoroutinefunction instead of broken co_flags check.
        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    return decorator
