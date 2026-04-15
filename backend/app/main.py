"""FastAPI application entry point for POWERGRID RAG system."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.core.logging import setup_logging, get_logger
from app.core.exceptions import PowergridException
from app.api.routes import router

# Setup logging
setup_logging()
logger = get_logger(__name__)
settings = get_settings()


def _build_cors_origins() -> list[str]:
    """Build CORS origins list from config + environment."""
    origins = list(settings.CORS_ORIGINS)
    # Add explicit frontend URL if set
    if settings.FRONTEND_URL:
        origins.append(settings.FRONTEND_URL)
    # Auto-detect Railway
    if settings.RAILWAY_STATIC_URL:
        origins.append(f"https://{settings.RAILWAY_STATIC_URL}")
    # Deduplicate
    return list(set(origins))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup and shutdown."""
    # Startup
    logger.info(
        "application_starting",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        cors_origins=_build_cors_origins(),
    )

    # Ensure data directories exist
    from pathlib import Path
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.CHROMA_PERSIST_DIRECTORY).mkdir(parents=True, exist_ok=True)

    logger.info("application_ready")
    yield

    # Shutdown
    logger.info("application_shutting_down")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="""
    POWERGRID Operations Knowledge Assistant API.

    Provides RAG (Retrieval-Augmented Generation) capabilities for querying
    CEA guidelines, POWERGRID technical manuals, and IT circulars.
    """,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware — production-ready dynamic origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_build_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)


# Exception handlers
@app.exception_handler(PowergridException)
async def powergrid_exception_handler(request: Request, exc: PowergridException):
    """Handle custom Powergrid exceptions."""
    logger.error(
        "powergrid_exception",
        error_code=exc.error_code,
        message=exc.message,
        path=request.url.path
    )
    return JSONResponse(
        status_code=400 if exc.error_code == "VALIDATION_ERROR" else 500,
        content={
            "error_code": exc.error_code,
            "message": exc.message,
            "details": exc.details
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions."""
    logger.error(
        "unhandled_exception",
        error=str(exc),
        type=type(exc).__name__,
        path=request.url.path
    )
    return JSONResponse(
        status_code=500,
        content={
            "error_code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred",
            "details": {"error_type": type(exc).__name__}
        }
    )


# Include API routes
app.include_router(router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "operational",
        "docs": "/docs"
    }


@app.get("/ping")
async def ping():
    """Simple ping endpoint for load balancers."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
