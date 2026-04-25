"""
convex_service.py - Backend interface to Convex.

All operations are async-compatible via asyncio.to_thread().
Falls back gracefully when CONVEX_URL is not configured.
"""

# CODEX-FIX: align backend persistence calls with the Convex schema/functions used by the frontend.

import asyncio
import logging
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class ConvexService:
    def __init__(self):
        self.enabled = False
        self._client = None
        settings = get_settings()

        if not settings.CONVEX_URL:
            logger.warning(
                "CONVEX_URL not set - running in memory-only mode. "
                "All data will be lost on backend restart."
            )
            return

        try:
            from convex import ConvexClient

            self._client = ConvexClient(settings.CONVEX_URL)
            if settings.CONVEX_ADMIN_KEY and hasattr(self._client, "set_admin_auth"):
                self._client.set_admin_auth(settings.CONVEX_ADMIN_KEY)
            self.enabled = True
            logger.info("convex_connected", url=settings.CONVEX_URL)
        except ImportError:
            logger.error("convex package not installed. pip install convex")
        except Exception as exc:
            logger.error("convex_connection_failed", error=str(exc))

    @property
    def is_connected(self) -> bool:
        return self.enabled

    async def _call(self, fn: str, args: dict[str, Any] | None = None) -> Any:
        """Run a Convex mutation or query in a thread because the client is sync."""
        if not self.enabled or self._client is None:
            return None
        try:
            if fn.startswith("query:"):
                return await asyncio.to_thread(self._client.query, fn[6:], args or {})
            return await asyncio.to_thread(self._client.mutation, fn, args or {})
        except Exception as exc:
            logger.error("convex_call_failed", function=fn, error=str(exc), exc_info=True)
            return None

    # -- Documents --------------------------------------------------------------

    async def generate_upload_url(self) -> str | None:
        return await self._call("documents:generateUploadUrl", {})

    async def create_document(
        self,
        doc_id: str,
        name: str,
        source_type: str,
        source_url: str | None = None,
        storage_id: str | None = None,
        file_size_bytes: int | None = None,
        sha256: str | None = None,
    ):
        return await self._call(
            "documents:createDocument",
            {
                "docId": doc_id,
                "name": name,
                "sourceType": source_type,
                "sourceUrl": source_url,
                "storageId": storage_id,
                "fileSizeBytes": file_size_bytes,
                "sha256": sha256,
            },
        )

    async def update_document(self, doc_id: str, **kwargs):
        camel = {
            "ingestion_status": "ingestionStatus",
            "chunk_count": "chunkCount",
            "image_count": "imageCount",
            "error_message": "errorMessage",
            "progress_message": "progressMessage",
            "storage_id": "storageId",
        }
        payload: dict[str, Any] = {"docId": doc_id}
        for key, value in kwargs.items():
            if value is not None:
                payload[camel.get(key, key)] = value
        return await self._call("documents:updateDocument", payload)

    async def delete_document(self, doc_id: str):
        return await self._call("documents:deleteDocument", {"docId": doc_id})

    async def list_documents(self) -> list[dict[str, Any]]:
        result = await self._call("query:documents:listDocuments", {})
        return result or []

    async def get_document_by_hash(self, sha256: str):
        return await self._call("query:documents:getDocumentByHash", {"sha256": sha256})

    async def get_document_download_url(self, doc_id: str) -> str | None:
        return await self._call("query:documents:getDocumentDownloadUrl", {"docId": doc_id})

    # -- Jobs -------------------------------------------------------------------

    async def create_job(
        self,
        job_id: str,
        source_type: str,
        doc_id: str | None = None,
        source_url: str | None = None,
    ):
        return await self._call(
            "jobs:createJob",
            {
                "jobId": job_id,
                "sourceType": source_type,
                "docId": doc_id,
                "sourceUrl": source_url,
            },
        )

    async def update_job(self, job_id: str, **kwargs):
        camel = {
            "progress_message": "progressMessage",
            "error_message": "errorMessage",
            "total_chunks": "totalChunks",
            "processed_chunks": "processedChunks",
            "doc_id": "docId",
        }
        payload: dict[str, Any] = {"jobId": job_id}
        for key, value in kwargs.items():
            if value is not None:
                payload[camel.get(key, key)] = value
        return await self._call("jobs:updateJob", payload)

    async def get_job(self, job_id: str):
        return await self._call("query:jobs:getJob", {"jobId": job_id})

    # -- Chat -------------------------------------------------------------------

    async def create_session(self, title: str = "New Chat") -> str | None:
        result = await self._call("chat:createSession", {"title": title})
        return result

    async def append_message(
        self,
        session_id: str,
        role: str,
        content: str,
        citations: list[dict[str, Any]] | None = None,
        llm_provider: str | None = None,
        duration_ms: int | None = None,
    ):
        return await self._call(
            "chat:appendMessage",
            {
                "sessionId": session_id,
                "role": role,
                "content": content,
                "citations": citations,
                "llmProvider": llm_provider,
                "durationMs": duration_ms,
            },
        )

    async def get_last_n_messages(self, session_id: str, n: int = 6) -> list[dict[str, Any]]:
        result = await self._call(
            "query:chat:getLastNMessages",
            {"sessionId": session_id, "n": n},
        )
        return result or []

    async def list_sessions(self) -> list[dict[str, Any]]:
        result = await self._call("query:chat:listSessions", {})
        return result or []

    async def delete_session(self, session_id: str):
        return await self._call("chat:deleteSession", {"sessionId": session_id})

    # -- Settings ---------------------------------------------------------------

    async def get_settings(self) -> dict[str, Any] | None:
        return await self._call("query:settings:getSettings", {})

    async def save_settings(self, **kwargs):
        return await self._call("settings:saveSettings", kwargs)


_convex_service: ConvexService | None = None


def get_convex_service() -> ConvexService:
    global _convex_service
    if _convex_service is None:
        _convex_service = ConvexService()
    return _convex_service
