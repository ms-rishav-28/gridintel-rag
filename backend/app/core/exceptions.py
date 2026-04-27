"""Custom exceptions for the POWERGRID RAG system."""


class PowergridException(Exception):
    """Base exception for all POWERGRID RAG errors."""
    
    def __init__(self, message: str, error_code: str = None, details: dict = None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code or "UNKNOWN_ERROR"
        self.details = details or {}


class DocumentProcessingError(PowergridException):
    """Raised when document processing fails."""
    
    def __init__(self, message: str, document_id: str = None, details: dict = None):
        super().__init__(
            message=message,
            error_code="DOC_PROCESSING_ERROR",
            details={"document_id": document_id, **(details or {})}
        )


class VectorStoreError(PowergridException):
    """Raised when vector store operations fail."""
    
    def __init__(self, message: str, operation: str = None, details: dict = None):
        super().__init__(
            message=message,
            error_code="VECTOR_STORE_ERROR",
            details={"operation": operation, **(details or {})}
        )


class LLMError(PowergridException):
    """Raised when LLM operations fail."""
    
    def __init__(self, message: str, provider: str = None, details: dict = None):
        super().__init__(
            message=message,
            error_code="LLM_ERROR",
            details={"provider": provider, **(details or {})}
        )


# CODEX-FIX: expose 503-class provider exhaustion for the LLM failover chain.
class ServiceUnavailableError(PowergridException):
    """Raised when all provider fallbacks are unavailable."""

    def __init__(self, message: str, details: dict = None):
        super().__init__(
            message=message,
            error_code="SERVICE_UNAVAILABLE",
            details=details or {},
        )


class RAGQueryError(PowergridException):
    """Raised when RAG query fails."""
    
    def __init__(self, message: str, query: str = None, details: dict = None):
        super().__init__(
            message=message,
            error_code="RAG_QUERY_ERROR",
            details={"query": query, **(details or {})}
        )


class ValidationError(PowergridException):
    """Raised when input validation fails."""
    
    def __init__(self, message: str, field: str = None, details: dict = None):
        super().__init__(
            message=message,
            error_code="VALIDATION_ERROR",
            details={"field": field, **(details or {})}
        )


class AuthenticationError(PowergridException):
    """Raised when authentication fails."""
    
    def __init__(self, message: str = "Authentication failed", details: dict = None):
        super().__init__(
            message=message,
            error_code="AUTHENTICATION_ERROR",
            details=details or {}
        )


class RateLimitError(PowergridException):
    """Raised when rate limit is exceeded."""
    
    def __init__(self, message: str = "Rate limit exceeded", retry_after: int = None):
        super().__init__(
            message=message,
            error_code="RATE_LIMIT_ERROR",
            details={"retry_after": retry_after}
        )
