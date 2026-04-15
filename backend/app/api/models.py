"""Pydantic models for API requests and responses."""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class DocumentType(str, Enum):
    """Types of documents in the knowledge base."""
    CEA_GUIDELINE = "CEA_GUIDELINE"
    TECHNICAL_MANUAL = "TECHNICAL_MANUAL"
    IT_CIRCULAR = "IT_CIRCULAR"
    TEXT_DOCUMENT = "TEXT_DOCUMENT"


class EquipmentType(str, Enum):
    """Types of powergrid equipment."""
    TRANSFORMER = "TRANSFORMER"
    CIRCUIT_BREAKER = "CIRCUIT_BREAKER"
    TRANSMISSION_LINE = "TRANSMISSION_LINE"
    SUBSTATION_BAY = "SUBSTATION_BAY"
    PROTECTION_SYSTEM = "PROTECTION_SYSTEM"
    PROTECTION_RELAY = "PROTECTION_RELAY"
    INSULATOR = "INSULATOR"
    BUSBAR = "BUSBAR"
    CURRENT_TRANSFORMER = "CURRENT_TRANSFORMER"
    POTENTIAL_TRANSFORMER = "POTENTIAL_TRANSFORMER"
    VOLTAGE_TRANSFORMER = "VOLTAGE_TRANSFORMER"


class VoltageLevel(str, Enum):
    """Standard voltage levels in POWERGRID."""
    KV_66 = "66 kV"
    KV_132 = "132 kV"
    KV_220 = "220 kV"
    KV_400 = "400 kV"
    KV_765 = "765 kV"
    KV_1200 = "1200 kV"


class QueryRequest(BaseModel):
    """Request model for RAG queries."""
    question: str = Field(
        ...,
        description="The question to ask about POWERGRID operations",
        min_length=5,
        max_length=500,
        examples=["What is the maintenance interval for a 220 kV circuit breaker?"]
    )
    equipment_type: Optional[EquipmentType] = Field(
        None,
        description="Filter by equipment type"
    )
    voltage_level: Optional[VoltageLevel] = Field(
        None,
        description="Filter by voltage level"
    )
    doc_types: Optional[List[DocumentType]] = Field(
        None,
        description="Filter by document types"
    )
    use_fallback: bool = Field(
        True,
        description="Enable fallback search strategies if no results found"
    )


class Citation(BaseModel):
    """Citation information for a source document."""
    source: str = Field(..., description="Source document name")
    doc_type: str = Field(..., description="Type of document")
    page: str = Field(..., description="Page or reference number")
    chunk_index: int = Field(..., description="Chunk index in the document")
    relevance_score: float = Field(..., description="Similarity score (0-1)")
    equipment_type: Optional[str] = Field(None, description="Equipment type if applicable")
    voltage_level: Optional[str] = Field(None, description="Voltage level if applicable")
    text_preview: str = Field(..., description="Preview of the cited text")


class QueryResponse(BaseModel):
    """Response model for RAG queries."""
    answer: str = Field(..., description="Generated answer")
    citations: List[Citation] = Field(..., description="Source citations")
    confidence: float = Field(..., description="Overall confidence score (0-1)")
    model_used: str = Field(..., description="LLM model used")
    provider: str = Field(..., description="LLM provider used")
    query_time_ms: float = Field(..., description="Query processing time in milliseconds")
    documents_retrieved: int = Field(..., description="Number of documents retrieved")
    is_insufficient: bool = Field(..., description="Whether the information is insufficient")


class DocumentUploadResponse(BaseModel):
    """Response model for document upload."""
    doc_id: str = Field(..., description="Unique document ID")
    filename: str = Field(..., description="Original filename")
    doc_type: str = Field(..., description="Detected document type")
    chunks_processed: int = Field(..., description="Number of chunks created")
    file_hash: str = Field(..., description="SHA-256 hash of file")
    equipment_type: Optional[str] = Field(None, description="Detected equipment type")
    voltage_level: Optional[str] = Field(None, description="Detected voltage level")
    status: str = Field(..., description="Processing status")


class DocumentBatchUploadResponse(BaseModel):
    """Response model for batch document upload."""
    processed: int = Field(..., description="Number of successfully processed documents")
    failed: int = Field(..., description="Number of failed documents")
    documents: List[DocumentUploadResponse] = Field(..., description="List of processed documents")
    errors: List[Dict[str, str]] = Field(default=[], description="List of errors if any")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = Field(..., description="Service status")
    version: str = Field(..., description="API version")
    vector_store: Dict[str, Any] = Field(..., description="Vector store statistics")
    llm_provider: str = Field(..., description="Active LLM provider")
    llm_model: str = Field(..., description="Active LLM model")
    firebase_connected: bool = Field(False, description="Whether Firebase is connected")


class ErrorResponse(BaseModel):
    """Error response model."""
    error_code: str = Field(..., description="Error code")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")


# ─── Chat Models ─────────────────────────────────────────────────

class ChatMessageRequest(BaseModel):
    """Request to save a chat message."""
    session_id: str = Field(..., description="Chat session ID")
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")
    citations: Optional[List[Citation]] = Field(None, description="Citations for assistant messages")
    confidence: Optional[float] = Field(None, description="Confidence score")
    model_used: Optional[str] = Field(None, description="LLM model used")
    query_time_ms: Optional[float] = Field(None, description="Query time in ms")


class ChatSessionResponse(BaseModel):
    """Response model for a chat session."""
    session_id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    messages: List[Dict[str, Any]] = []


# ─── Settings Models ─────────────────────────────────────────────

class UserSettingsRequest(BaseModel):
    """Request to save user settings."""
    theme: Optional[str] = Field(None, description="'light' or 'dark'")
    notifications: Optional[Dict[str, bool]] = Field(None, description="Notification preferences")
    profile: Optional[Dict[str, str]] = Field(None, description="User profile fields")
