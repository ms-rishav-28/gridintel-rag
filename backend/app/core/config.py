import sys
from pydantic import Field
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional, List


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # Application
    APP_NAME: str = "POWERGRID Operations Knowledge Assistant"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"

    # API
    API_V1_PREFIX: str = "/api/v1"
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS — dynamic: add your Vercel domain here
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]
    FRONTEND_URL: Optional[str] = None  # e.g. https://powergrid.vercel.app

    # LLM Providers
    GOOGLE_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None

    # Default LLM Configuration
    DEFAULT_LLM_PROVIDER: str = "gemini"
    DEFAULT_LLM_MODEL: str = "gemini-2.0-flash"

    # Embedding Model
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DEVICE: str = "cpu"

    # Vector Database
    # CODEX-FIX: add LanceDB path for crash-safe vector persistence.
    LANCEDB_PATH: str = Field(
        default="./data/lancedb",
        description="Path to LanceDB database directory. On Railway set to /data/lancedb.",
    )
    VECTOR_SEARCH_K: int = 5
    # MiniLM-384 cosine similarity produces 0.2–0.6 for genuinely relevant
    # results. A threshold of 0.7 was killing almost every real match.
    VECTOR_SEARCH_SCORE_THRESHOLD: float = 0.3

    # Document Processing
    UPLOAD_DIR: str = "./data/uploads"
    MAX_UPLOAD_SIZE_MB: int = 50
    SUPPORTED_DOC_TYPES: List[str] = ["pdf", "docx", "doc", "txt"]

    # Chunking Strategy — aligned with MiniLM 512-token limit.
    # At ~0.9 tokens/char 450 chars ≈ 405 tokens, safely under the 512 cap.
    CHUNK_SIZE: int = 450
    CHUNK_OVERLAP: int = 50

    # RAG Configuration
    RAG_TEMPERATURE: float = 0.1
    RAG_MAX_TOKENS: int = 2048
    RAG_TOP_P: float = 0.95
    # Maximum tokens of context to feed the LLM prompt.
    MAX_CONTEXT_TOKENS: int = 4000

    # Citation Settings
    CITATION_ENABLED: bool = True
    MIN_CITATION_SCORE: float = 0.3
    MAX_CITATIONS: int = 3

    # Rate Limiting
    ENABLE_RATE_LIMITING: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW: int = 3600

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    # Security
    SECRET_KEY: Optional[str] = None
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    BACKEND_API_KEY: Optional[str] = None
    API_KEY_HEADER: str = "X-API-Key"
    MAX_REQUEST_BODY_MB: int = 55
    TRUST_PROXY_HEADERS: bool = False
    TRUSTED_PROXY_IPS: List[str] = []
    ENABLE_SECURITY_HEADERS: bool = True
    ENABLE_HSTS: bool = True
    HSTS_MAX_AGE_SECONDS: int = 31536000

    # Convex
    CONVEX_URL: Optional[str] = None
    CONVEX_ADMIN_KEY: Optional[str] = None

    # Railway / Render
    RAILWAY_STATIC_URL: Optional[str] = None
    RENDER_EXTERNAL_URL: Optional[str] = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance.

    Performs startup validation:
    - In production, SECRET_KEY must be explicitly set.
    """
    settings = Settings()

    if settings.ENVIRONMENT == "production" and not settings.SECRET_KEY:
        print(
            "FATAL: SECRET_KEY is not set. "
            "Set the SECRET_KEY environment variable before starting in production.",
            file=sys.stderr,
        )
        sys.exit(1)

    return settings
