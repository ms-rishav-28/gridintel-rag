from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional, List


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # Application
    APP_NAME: str = "POWERGRID Operations Knowledge Assistant"
    APP_VERSION: str = "1.0.0"
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
    DEFAULT_LLM_MODEL: str = "gemini-1.5-flash"

    # Embedding Model
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DEVICE: str = "cpu"

    # Vector Database
    CHROMA_PERSIST_DIRECTORY: str = "./data/chroma_db"
    CHROMA_COLLECTION_NAME: str = "powergrid_docs"
    VECTOR_SEARCH_K: int = 5
    VECTOR_SEARCH_SCORE_THRESHOLD: float = 0.7

    # Document Processing
    UPLOAD_DIR: str = "./data/uploads"
    MAX_UPLOAD_SIZE_MB: int = 50
    SUPPORTED_DOC_TYPES: List[str] = ["pdf", "docx", "doc", "txt"]

    # Chunking Strategy
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200

    # RAG Configuration
    RAG_TEMPERATURE: float = 0.1
    RAG_MAX_TOKENS: int = 2048
    RAG_TOP_P: float = 0.95

    # Citation Settings
    CITATION_ENABLED: bool = True
    MIN_CITATION_SCORE: float = 0.6
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
    """Get cached settings instance."""
    return Settings()
