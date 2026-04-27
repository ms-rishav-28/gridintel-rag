"""Application settings for POWERGRID SmartOps."""

# CODEX-FIX: align settings with Railway/Vercel/Convex/LanceDB production contract.

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    ENVIRONMENT: str = Field(default="development")
    SECRET_KEY: str = Field(default="change-me-in-production")
    LOG_LEVEL: str = Field(default="INFO")
    BACKEND_API_KEY: str | None = Field(default=None)
    FRONTEND_URL: str = Field(default="http://localhost:3000")

    # Convex
    CONVEX_URL: str | None = Field(default=None)
    CONVEX_ADMIN_KEY: str | None = Field(default=None)

    # LanceDB
    LANCEDB_PATH: str = Field(default="./data/lancedb")

    # Embedding
    EMBEDDING_MODEL: str = Field(default="BAAI/bge-m3")
    EMBEDDING_DEVICE: str = Field(default="cpu")

    # Vision
    VISION_MODEL: str = Field(default="microsoft/Florence-2-base")
    ENABLE_VISION: bool = Field(default=True)

    # LLM
    DEFAULT_LLM_PROVIDER: str = Field(default="gemini")
    DEFAULT_LLM_MODEL: str = Field(default="gemini-2.0-flash")
    GOOGLE_API_KEY: str | None = Field(default=None)
    GROQ_API_KEY: str | None = Field(default=None)
    HF_API_TOKEN: str | None = Field(default=None)

    # Document ingestion
    MAX_UPLOAD_SIZE_MB: int = Field(default=150)
    MAX_REQUEST_BODY_MB: int = Field(default=155)
    ENABLE_BROWSER_INGESTION: bool = Field(default=False)
    URL_CACHE_TTL_HOURS: int = Field(default=24)

    # Security
    ENABLE_RATE_LIMITING: bool = Field(default=True)
    RATE_LIMIT_REQUESTS: int = Field(default=100)
    RATE_LIMIT_WINDOW: int = Field(default=3600)
    ENABLE_SECURITY_HEADERS: bool = Field(default=True)
    ENABLE_HSTS: bool = Field(default=True)
    TRUST_PROXY_HEADERS: bool = Field(default=False)

    class Config:
        env_file = ".env"
        case_sensitive = True


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
