"""Pydantic models for POWERGRID SmartOps API."""

# CODEX-FIX: replace legacy metadata models with durable RAG, job, settings, and health contracts.

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


SourceType = Literal["pdf", "docx", "txt", "webpage"]


class RAGFilters(BaseModel):
    doc_ids: list[str] = Field(default_factory=list)
    source_type: SourceType | None = None


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    session_id: str | None = None
    filters: RAGFilters | None = None


class Citation(BaseModel):
    docId: str
    docName: str
    pageNumber: int | None = None
    chunkIndex: int | None = None
    relevanceScore: float | None = None
    chunkPreview: str | None = None
    isImageChunk: bool | None = None


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    session_id: str
    llm_provider: str
    duration_ms: int


class UrlUploadRequest(BaseModel):
    url: HttpUrl


class UploadResponse(BaseModel):
    doc_id: str
    job_id: str
    status: Literal["processing"]


class JobResponse(BaseModel):
    jobId: str | None = None
    docId: str | None = None
    sourceType: str | None = None
    sourceUrl: str | None = None
    status: str
    progressMessage: str | None = None
    errorMessage: str | None = None
    totalChunks: int | None = None
    processedChunks: int | None = None
    createdAt: float | None = None
    updatedAt: float | None = None


class SettingsRequest(BaseModel):
    llmProvider: str | None = None
    llmModel: str | None = None
    embeddingModel: str | None = None
    enableVision: bool | None = None
    enableBrowserIngestion: bool | None = None
    systemPromptOverride: str | None = None


class ReindexResponse(BaseModel):
    reindex_started: bool
    document_count: int


class HealthResponse(BaseModel):
    status: Literal["healthy", "degraded"]
    version: str
    components: dict
