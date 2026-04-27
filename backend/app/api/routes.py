"""API routes for POWERGRID SmartOps."""

# CODEX-FIX: wire durable Convex metadata/storage, LanceDB vectors, RAG query, and reindex endpoints.

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import logging
import socket
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, Header, HTTPException, UploadFile, status

from app.api.models import (
    HealthResponse,
    JobResponse,
    QueryRequest,
    QueryResponse,
    ReindexResponse,
    SettingsRequest,
    UploadResponse,
    UrlUploadRequest,
)
from app.core.config import get_settings
from app.core.security import enforce_api_key, enforce_rate_limit
from app.services.convex_service import get_convex_service
from app.services.document_processor import get_document_processor
from app.services.embedding_service import get_embedding_service
from app.services.llm_service import get_llm_service
from app.services.rag_engine import get_rag_engine
from app.services.vector_store import get_vector_store
from app.services.vision_service import get_vision_service
from app.services.web_ingestion import ingest_url

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(
    prefix="/api/v1",
    dependencies=[Depends(enforce_api_key), Depends(enforce_rate_limit)],
)


async def _read_upload_bytes(file: UploadFile, max_bytes: int) -> bytes:
    total = 0
    with tempfile.SpooledTemporaryFile(max_size=10 * 1024 * 1024) as tmp:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB upload limit",
                )
            tmp.write(chunk)
        tmp.seek(0)
        return tmp.read()


def _source_type_from_filename(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        return "pdf"
    if suffix in {".doc", ".docx"}:
        return "docx"
    if suffix == ".txt":
        return "txt"
    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Unsupported file type. Upload .pdf, .docx, .doc, or .txt files.",
    )


async def _upload_to_convex_storage(
    file_bytes: bytes,
    content_type: str | None,
) -> str | None:
    convex = get_convex_service()
    if not convex.enabled:
        return None

    upload_url = await convex.generate_upload_url()
    if not upload_url:
        raise HTTPException(status_code=503, detail="Could not generate Convex upload URL")

    # CODEX-FIX: Convex upload URLs are POST endpoints in convex 1.17+ docs.
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            upload_url,
            content=file_bytes,
            headers={"Content-Type": content_type or "application/octet-stream"},
        )
        response.raise_for_status()
        payload = response.json()

    storage_id = payload.get("storageId")
    if not storage_id:
        raise HTTPException(status_code=503, detail="Convex upload did not return storageId")
    return storage_id


def _validate_public_url(raw_url: str) -> str:
    parsed = urlparse(raw_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=422, detail="URL must be http or https")

    hostname = parsed.hostname.lower()
    if hostname in {"localhost", "127.0.0.1", "::1"} or hostname.endswith(".localhost"):
        raise HTTPException(status_code=400, detail="Private or localhost URLs are not allowed")

    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail=f"Could not resolve URL host: {exc}") from exc

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise HTTPException(status_code=400, detail="Private network URLs are not allowed")

    return raw_url


async def require_admin_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    if not settings.BACKEND_API_KEY:
        raise HTTPException(status_code=503, detail="BACKEND_API_KEY is required for admin routes")
    if not x_api_key or not hmac.compare_digest(x_api_key, settings.BACKEND_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@router.post("/documents/upload", response_model=UploadResponse, status_code=202)
async def upload_file(background_tasks: BackgroundTasks, file: UploadFile = File(...)) -> UploadResponse:
    filename = file.filename or "uploaded-document"
    source_type = _source_type_from_filename(filename)
    file_bytes = await _read_upload_bytes(file, settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024)
    sha256 = hashlib.sha256(file_bytes).hexdigest()
    convex = get_convex_service()

    existing = await convex.get_document_by_hash(sha256)
    if existing:
        raise HTTPException(status_code=409, detail="This document has already been uploaded")

    doc_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    await convex.create_document(
        doc_id=doc_id,
        name=filename,
        source_type=source_type,
        file_size_bytes=len(file_bytes),
        sha256=sha256,
    )
    await convex.create_job(job_id=job_id, source_type=source_type, doc_id=doc_id)

    storage_id = await _upload_to_convex_storage(file_bytes, file.content_type)
    if storage_id:
        await convex.update_document(doc_id, storage_id=storage_id)

    background_tasks.add_task(
        get_document_processor().ingest_file,
        file_bytes,
        filename,
        doc_id,
        job_id,
        storage_id,
    )
    return UploadResponse(doc_id=doc_id, job_id=job_id, status="processing")


@router.post("/documents/upload-url", response_model=UploadResponse, status_code=202)
async def upload_url(background_tasks: BackgroundTasks, request: UrlUploadRequest) -> UploadResponse:
    url = _validate_public_url(str(request.url))
    doc_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    convex = get_convex_service()

    await convex.create_document(
        doc_id=doc_id,
        name=urlparse(url).netloc,
        source_type="webpage",
        source_url=url,
    )
    await convex.create_job(job_id=job_id, source_type="webpage", doc_id=doc_id, source_url=url)

    background_tasks.add_task(ingest_url, url, doc_id, job_id)
    return UploadResponse(doc_id=doc_id, job_id=job_id, status="processing")


@router.post("/query", response_model=QueryResponse)
async def query_rag(request: QueryRequest) -> QueryResponse:
    session_id = request.session_id
    convex = get_convex_service()
    if not session_id:
        session_id = await convex.create_session("New Chat") or str(uuid.uuid4())

    result = await get_rag_engine().get_answer(
        query=request.query,
        session_id=session_id,
        filters=request.filters,
    )
    return QueryResponse(
        answer=result["answer"],
        citations=result["citations"],
        session_id=session_id,
        llm_provider=result["llm_provider"],
        duration_ms=result["duration_ms"],
    )


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str) -> dict[str, str | bool]:
    await get_vector_store().delete_by_doc_id(doc_id)
    await get_convex_service().delete_document(doc_id)
    return {"deleted": True, "doc_id": doc_id}


@router.get("/documents")
@router.get("/documents/list")
async def list_documents() -> list[dict]:
    return await get_convex_service().list_documents()


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> dict:
    job = await get_convex_service().get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/chat/sessions")
async def create_chat_session() -> dict[str, str]:
    session_id = await get_convex_service().create_session("New Chat") or str(uuid.uuid4())
    return {"session_id": session_id}


@router.get("/chat/sessions")
async def list_chat_sessions() -> list[dict]:
    return await get_convex_service().list_sessions()


@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str) -> dict[str, bool]:
    await get_convex_service().delete_session(session_id)
    return {"deleted": True}


@router.get("/settings")
async def get_settings_route() -> dict:
    stored = await get_convex_service().get_settings()
    return stored or {
        "llmProvider": settings.DEFAULT_LLM_PROVIDER,
        "llmModel": settings.DEFAULT_LLM_MODEL,
        "embeddingModel": settings.EMBEDDING_MODEL,
        "enableVision": settings.ENABLE_VISION,
        "enableBrowserIngestion": settings.ENABLE_BROWSER_INGESTION,
        "systemPromptOverride": "",
    }


@router.post("/settings")
async def save_settings_route(request: SettingsRequest) -> dict[str, bool]:
    payload = {key: value for key, value in request.model_dump().items() if value is not None}
    await get_convex_service().save_settings(**payload)
    return {"saved": True}


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    convex = get_convex_service()
    vector_stats = await get_vector_store().get_stats()
    embedder = get_embedding_service()
    vision = get_vision_service()
    llm = get_llm_service()

    degraded = vector_stats.get("status") != "healthy" or not convex.enabled
    return HealthResponse(
        status="degraded" if degraded else "healthy",
        version="1.0.0",
        components={
            "lancedb": vector_stats,
            "convex": {"status": "connected" if convex.enabled else "disabled"},
            "embedding_model": {
                "status": "loaded" if embedder.is_loaded else "not_loaded",
                "model": settings.EMBEDDING_MODEL,
            },
            "vision_model": {
                "status": (
                    "disabled"
                    if not settings.ENABLE_VISION
                    else "loaded"
                    if vision.is_loaded
                    else "not_loaded"
                ),
                "model": settings.VISION_MODEL,
            },
            "llm": {"status": "ok", "last_provider": llm.last_provider},
        },
    )


@router.post(
    "/admin/reindex",
    response_model=ReindexResponse,
    dependencies=[Depends(require_admin_api_key)],
    status_code=202,
)
async def admin_reindex(background_tasks: BackgroundTasks) -> ReindexResponse:
    convex = get_convex_service()
    if not convex.enabled:
        raise HTTPException(status_code=503, detail="Convex must be configured for reindex")

    documents = await convex.list_documents()
    done_documents = [doc for doc in documents if doc.get("ingestionStatus") == "done"]
    await get_vector_store().delete_all()

    async def _reindex_file_document(document: dict) -> None:
        doc_id = document["docId"]
        job_id = str(uuid.uuid4())
        source_type = document.get("sourceType", "")
        await convex.create_job(job_id=job_id, source_type=source_type, doc_id=doc_id)

        if source_type == "webpage" and document.get("sourceUrl"):
            await ingest_url(document["sourceUrl"], doc_id, job_id)
            return

        download_url = await convex.get_document_download_url(doc_id)
        if not download_url:
            await convex.update_job(job_id, status="failed", error_message="Missing Convex storage file")
            return

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.get(download_url)
            response.raise_for_status()

        await get_document_processor().ingest_file(
            response.content,
            document.get("name") or f"{doc_id}.{source_type}",
            doc_id,
            job_id,
            document.get("storageId"),
        )

    for document in done_documents:
        background_tasks.add_task(_reindex_file_document, document)

    return ReindexResponse(reindex_started=True, document_count=len(done_documents))
