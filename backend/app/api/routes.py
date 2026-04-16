"""API routes for POWERGRID RAG system."""

from typing import List
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
import time

from app.api.models import (
    QueryRequest, QueryResponse, DocumentUploadResponse,
    DocumentBatchUploadResponse, HealthResponse, ErrorResponse,
    EquipmentType, VoltageLevel, DocumentType,
    ChatMessageRequest, ChatSessionResponse,
    UserSettingsRequest, MetadataOptionsResponse, MetadataOption
)
from app.core.config import get_settings
from app.core.exceptions import PowergridException, RAGQueryError, DocumentProcessingError
from app.core.logging import get_logger
from app.core.security import enforce_api_key, enforce_rate_limit

logger = get_logger(__name__)
settings = get_settings()

router = APIRouter(
    prefix=settings.API_V1_PREFIX,
    dependencies=[Depends(enforce_api_key), Depends(enforce_rate_limit)],
)


# ─── Lazy service accessors (never crash at import time) ─────────

def _get_rag_engine():
    from app.services.rag_engine import rag_engine
    return rag_engine

def _get_document_processor():
    from app.services.document_processor import document_processor
    return document_processor

def _get_vector_store():
    from app.services.vector_store import vector_store
    return vector_store

def _get_persistence():
    from app.services.convex_service import convex_service
    return convex_service


# ═══════════════════════════════════════════════════════════════════
#  RAG QUERY
# ═══════════════════════════════════════════════════════════════════

@router.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    """
    Execute a RAG query to get answers from POWERGRID documentation.
    """
    try:
        rag = _get_rag_engine()
        if request.use_fallback:
            response = await rag.query_with_fallback(
                question=request.question,
                equipment_type=request.equipment_type.value if request.equipment_type else None,
                voltage_level=request.voltage_level.value if request.voltage_level else None,
                doc_types=[dt.value for dt in request.doc_types] if request.doc_types else None,
            )
        else:
            response = await rag.query(
                question=request.question,
                equipment_type=request.equipment_type.value if request.equipment_type else None,
                voltage_level=request.voltage_level.value if request.voltage_level else None,
                doc_types=[dt.value for dt in request.doc_types] if request.doc_types else None,
            )

        return QueryResponse(
            answer=response.answer,
            citations=response.citations,
            confidence=response.confidence,
            model_used=response.model_used,
            provider=response.provider,
            query_time_ms=response.query_time_ms,
            documents_retrieved=response.documents_retrieved,
            is_insufficient=response.is_insufficient
        )

    except RAGQueryError as e:
        logger.error("query_endpoint_error", error=str(e))
        raise HTTPException(status_code=500, detail={
            "error_code": e.error_code,
            "message": e.message,
            "details": e.details
        })
    except Exception as e:
        logger.error("unexpected_query_error", error=str(e))
        raise HTTPException(status_code=500, detail={
            "error_code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred",
            "details": {"error": str(e)}
        })


# ═══════════════════════════════════════════════════════════════════
#  DOCUMENT MANAGEMENT
# ═══════════════════════════════════════════════════════════════════

@router.post("/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doc_type: DocumentType = Form(None),
    equipment_type: EquipmentType = Form(None),
    voltage_level: VoltageLevel = Form(None),
):
    """Upload and process a single document (PDF, DOCX, DOC, TXT)."""
    try:
        filename = file.filename
        ext = filename.split(".")[-1].lower() if "." in filename else ""

        if ext not in settings.SUPPORTED_DOC_TYPES:
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "UNSUPPORTED_FILE_TYPE",
                    "message": f"File type '{ext}' not supported. Use: {settings.SUPPORTED_DOC_TYPES}"
                }
            )

        content = await file.read()

        if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "FILE_TOO_LARGE",
                    "message": f"File size exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit"
                }
            )

        custom_metadata = {}
        if doc_type:
            custom_metadata['doc_type'] = doc_type.value
        if equipment_type:
            custom_metadata['equipment_type'] = equipment_type.value
        if voltage_level:
            custom_metadata['voltage_level'] = voltage_level.value

        processor = _get_document_processor()
        vs = _get_vector_store()
        storage = _get_persistence()

        processed = await processor.process_file(filename, content, custom_metadata)
        chunks_added = vs.add_documents(processed.chunks, processed.doc_id)

        # Persist metadata to Convex
        storage.save_document_metadata(processed.doc_id, {
            **processed.metadata,
            "chunks_count": chunks_added,
        })

        return DocumentUploadResponse(
            doc_id=processed.doc_id,
            filename=filename,
            doc_type=processed.metadata.get('doc_type', 'UNKNOWN'),
            chunks_processed=chunks_added,
            file_hash=processed.file_hash,
            equipment_type=processed.metadata.get('equipment_type'),
            voltage_level=processed.metadata.get('voltage_level'),
            status="success"
        )

    except DocumentProcessingError as e:
        logger.error("document_upload_error", error=str(e), filename=file.filename)
        raise HTTPException(status_code=400, detail={
            "error_code": e.error_code,
            "message": e.message,
            "details": e.details
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error("unexpected_upload_error", error=str(e))
        raise HTTPException(status_code=500, detail={
            "error_code": "UPLOAD_FAILED",
            "message": "Failed to process document",
            "details": {"error": str(e)}
        })


@router.post("/documents/batch-upload", response_model=DocumentBatchUploadResponse)
async def batch_upload_documents(files: List[UploadFile] = File(...)):
    """Upload and process multiple documents in batch."""
    processor = _get_document_processor()
    vs = _get_vector_store()
    storage = _get_persistence()
    processed_docs = []
    errors = []

    for file in files:
        try:
            filename = file.filename
            ext = filename.split(".")[-1].lower() if "." in filename else ""

            if ext not in settings.SUPPORTED_DOC_TYPES:
                errors.append({"file": filename, "error": "Unsupported file type"})
                continue

            content = await file.read()

            if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                errors.append({"file": filename, "error": "File too large"})
                continue

            processed = await processor.process_file(filename, content)
            chunks_added = vs.add_documents(processed.chunks, processed.doc_id)

            storage.save_document_metadata(processed.doc_id, {
                **processed.metadata,
                "chunks_count": chunks_added,
            })

            processed_docs.append(DocumentUploadResponse(
                doc_id=processed.doc_id,
                filename=filename,
                doc_type=processed.metadata.get('doc_type', 'UNKNOWN'),
                chunks_processed=chunks_added,
                file_hash=processed.file_hash,
                equipment_type=processed.metadata.get('equipment_type'),
                voltage_level=processed.metadata.get('voltage_level'),
                status="success"
            ))

        except Exception as e:
            logger.error("batch_upload_error", error=str(e), filename=file.filename)
            errors.append({"file": file.filename, "error": str(e)})

    return DocumentBatchUploadResponse(
        processed=len(processed_docs),
        failed=len(errors),
        documents=processed_docs,
        errors=errors
    )


@router.get("/documents/list")
async def list_documents():
    """List all documents — reads from Convex (authoritative) with vector store fallback."""
    try:
        storage = _get_persistence()
        docs = storage.list_documents()

        # If Convex has data, use it. Otherwise fall back to vector store scan.
        if docs:
            return {"documents": docs, "total": len(docs)}

        # Fallback: scan ChromaDB metadata
        vs = _get_vector_store()
        docs = vs.list_documents()
        return {"documents": docs, "total": len(docs)}

    except Exception as e:
        logger.error("list_documents_error", error=str(e))
        raise HTTPException(status_code=500, detail={
            "error_code": "LIST_DOCUMENTS_ERROR",
            "message": str(e)
        })


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document from both vector store and Convex."""
    try:
        vs = _get_vector_store()
        storage = _get_persistence()

        success = vs.delete_document(doc_id)
        storage.delete_document_metadata(doc_id)

        if success:
            return {"status": "success", "message": f"Document {doc_id} deleted"}
        else:
            raise HTTPException(status_code=500, detail={
                "error_code": "DELETE_FAILED",
                "message": "Failed to delete document from vector store"
            })
    except HTTPException:
        raise
    except Exception as e:
        logger.error("delete_document_error", error=str(e), doc_id=doc_id)
        raise HTTPException(status_code=500, detail={
            "error_code": "DELETE_ERROR",
            "message": str(e)
        })


# ═══════════════════════════════════════════════════════════════════
#  CHAT SESSIONS
# ═══════════════════════════════════════════════════════════════════

@router.post("/chat/message")
async def save_chat_message(request: ChatMessageRequest):
    """Persist a chat message to Convex."""
    try:
        storage = _get_persistence()
        msg_data = request.model_dump()
        session_id = msg_data.pop("session_id")
        storage.save_chat_message(session_id, msg_data)
        return {"status": "ok"}
    except Exception as e:
        logger.error("chat_save_error", error=str(e))
        raise HTTPException(status_code=500, detail={
            "error_code": "CHAT_SAVE_ERROR",
            "message": str(e)
        })


@router.get("/chat/history/{session_id}", response_model=ChatSessionResponse)
async def get_chat_history(session_id: str):
    """Retrieve full chat history for a session."""
    try:
        storage = _get_persistence()
        session = storage.get_chat_history(session_id)
        if not session:
            return ChatSessionResponse(session_id=session_id, messages=[])
        return ChatSessionResponse(**session)
    except Exception as e:
        logger.error("chat_history_error", error=str(e))
        raise HTTPException(status_code=500, detail={
            "error_code": "CHAT_HISTORY_ERROR",
            "message": str(e)
        })


@router.get("/chat/sessions")
async def list_chat_sessions():
    """List all chat sessions."""
    try:
        storage = _get_persistence()
        sessions = storage.list_chat_sessions()
        return {"sessions": sessions}
    except Exception as e:
        logger.error("chat_sessions_error", error=str(e))
        raise HTTPException(status_code=500, detail={
            "error_code": "CHAT_SESSIONS_ERROR",
            "message": str(e)
        })


# ═══════════════════════════════════════════════════════════════════
#  USER SETTINGS
# ═══════════════════════════════════════════════════════════════════

@router.get("/settings")
async def get_settings_route():
    """Retrieve user settings."""
    try:
        storage = _get_persistence()
        return storage.get_settings()
    except Exception as e:
        logger.error("settings_get_error", error=str(e))
        raise HTTPException(status_code=500, detail={"message": str(e)})


@router.post("/settings")
async def save_settings_route(request: UserSettingsRequest):
    """Persist user settings."""
    try:
        storage = _get_persistence()
        data = {k: v for k, v in request.model_dump().items() if v is not None}
        storage.save_settings(data)
        return {"status": "ok"}
    except Exception as e:
        logger.error("settings_save_error", error=str(e))
        raise HTTPException(status_code=500, detail={"message": str(e)})


@router.get("/metadata/options", response_model=MetadataOptionsResponse)
async def metadata_options():
    """Return enum-backed options for frontend filter and upload controls."""
    return MetadataOptionsResponse(
        equipment_types=[
            MetadataOption(value=enum_item.value, label=enum_item.value.replace("_", " ").title())
            for enum_item in EquipmentType
        ],
        voltage_levels=[
            MetadataOption(value=enum_item.value, label=enum_item.value)
            for enum_item in VoltageLevel
        ],
        document_types=[
            MetadataOption(value=enum_item.value, label=enum_item.value.replace("_", " ").title())
            for enum_item in DocumentType
        ],
    )


# ═══════════════════════════════════════════════════════════════════
#  HEALTH & STATS
# ═══════════════════════════════════════════════════════════════════

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint to verify service status."""
    try:
        vs = _get_vector_store()
        storage = _get_persistence()
        stats = vs.get_collection_stats()

        return HealthResponse(
            status="healthy",
            version=settings.APP_VERSION,
            vector_store=stats,
            llm_provider=settings.DEFAULT_LLM_PROVIDER,
            llm_model=settings.DEFAULT_LLM_MODEL,
            convex_connected=storage.is_connected,
        )
    except Exception as e:
        logger.error("health_check_failed", error=str(e))
        raise HTTPException(status_code=503, detail={
            "error_code": "HEALTH_CHECK_FAILED",
            "message": "Service is unhealthy",
            "details": {"error": str(e)}
        })


@router.get("/stats")
async def get_stats():
    """Get vector store statistics."""
    try:
        vs = _get_vector_store()
        stats = vs.get_collection_stats()
        return {
            "vector_store": stats,
            "configuration": {
                "chunk_size": settings.CHUNK_SIZE,
                "chunk_overlap": settings.CHUNK_OVERLAP,
                "embedding_model": settings.EMBEDDING_MODEL,
                "llm_provider": settings.DEFAULT_LLM_PROVIDER,
                "llm_model": settings.DEFAULT_LLM_MODEL,
            }
        }
    except Exception as e:
        logger.error("stats_error", error=str(e))
        raise HTTPException(status_code=500, detail={
            "error_code": "STATS_ERROR",
            "message": str(e)
        })
