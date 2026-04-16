"""Convex service for persistent data storage.

Provides durable storage for document metadata, chat sessions, and settings.
Gracefully degrades to in-memory mode if Convex is not configured,
allowing local development without a Convex deployment.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

# In-memory fallback stores
_mem_documents: Dict[str, Dict[str, Any]] = {}
_mem_chats: Dict[str, Dict[str, Any]] = {}
_mem_settings: Dict[str, Any] = {
    "theme": "light",
    "notifications": {"critical": True, "insights": True},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_convex_client():
    """Lazily initialize and return the Convex client, or None."""
    try:
        if not settings.CONVEX_URL:
            return None

        from convex import ConvexClient

        client = ConvexClient(settings.CONVEX_URL)
        if settings.CONVEX_ADMIN_KEY:
            client.set_admin_auth(settings.CONVEX_ADMIN_KEY)
        return client
    except Exception as e:
        logger.warning("convex_init_failed", error=str(e))
        return None


class ConvexService:
    """Persistent storage backed by Convex with in-memory fallback."""

    def __init__(self):
        self._client = _get_convex_client()
        if self._client:
            logger.info("convex_connected", deployment_url=settings.CONVEX_URL)
        else:
            logger.warning(
                "convex_not_configured",
                message=(
                    "Running in memory-only mode. Data will NOT persist across restarts. "
                    "Set CONVEX_URL to enable persistence."
                ),
            )

    @property
    def is_connected(self) -> bool:
        return self._client is not None

    def _query(self, name: str, args: Optional[Dict[str, Any]] = None) -> Any:
        if not self._client:
            raise RuntimeError("Convex client unavailable")
        return self._client.query(name, args or {})

    def _mutation(self, name: str, args: Optional[Dict[str, Any]] = None) -> Any:
        if not self._client:
            raise RuntimeError("Convex client unavailable")
        return self._client.mutation(name, args or {})

    # ─── Document Metadata ───────────────────────────────────────

    def save_document_metadata(self, doc_id: str, metadata: Dict[str, Any]) -> None:
        """Persist document metadata after successful vector ingestion."""
        record = {
            "doc_id": doc_id,
            "filename": metadata.get("source", metadata.get("filename", "Unknown")),
            "doc_type": metadata.get("doc_type", "UNKNOWN"),
            "equipment_type": metadata.get("equipment_type"),
            "voltage_level": metadata.get("voltage_level"),
            "chunks_count": metadata.get("chunks_count", 0),
            "file_hash": metadata.get("file_hash", ""),
            "file_size": metadata.get("file_size", 0),
            "uploaded_at": _now_iso(),
            "status": "active",
        }

        try:
            if self._client:
                self._mutation("documents:upsertMetadata", record)
            else:
                _mem_documents[doc_id] = record
            logger.info("document_metadata_saved", doc_id=doc_id)
        except Exception as e:
            logger.warning("convex_document_save_failed_fallback", error=str(e), doc_id=doc_id)
            _mem_documents[doc_id] = record

    def list_documents(self) -> List[Dict[str, Any]]:
        """Return all active documents."""
        try:
            if self._client:
                documents = self._query("documents:listActive")
                if isinstance(documents, list):
                    return documents
                return []
            return [d for d in _mem_documents.values() if d.get("status") == "active"]
        except Exception as e:
            logger.warning("convex_documents_list_failed_fallback", error=str(e))
            return [d for d in _mem_documents.values() if d.get("status") == "active"]

    def delete_document_metadata(self, doc_id: str) -> None:
        """Soft-delete a document by marking status."""
        try:
            if self._client:
                self._mutation("documents:softDeleteDocument", {"doc_id": doc_id})
            elif doc_id in _mem_documents:
                _mem_documents[doc_id]["status"] = "deleted"
        except Exception as e:
            logger.warning("convex_document_delete_failed_fallback", error=str(e), doc_id=doc_id)
            if doc_id in _mem_documents:
                _mem_documents[doc_id]["status"] = "deleted"

    # ─── Chat Sessions ───────────────────────────────────────────

    def save_chat_message(self, session_id: str, message: Dict[str, Any]) -> None:
        """Append a message to a chat session."""
        msg = {
            "role": message.get("role", "user"),
            "content": message.get("content", ""),
            "timestamp": message.get("timestamp", _now_iso()),
            "citations": message.get("citations", []),
            "confidence": message.get("confidence"),
            "model_used": message.get("model_used"),
            "query_time_ms": message.get("query_time_ms"),
        }

        try:
            if self._client:
                self._mutation(
                    "chat:saveMessage",
                    {
                        "session_id": session_id,
                        **msg,
                    },
                )
                return

            if session_id not in _mem_chats:
                _mem_chats[session_id] = {
                    "session_id": session_id,
                    "created_at": _now_iso(),
                    "messages": [],
                }
            _mem_chats[session_id]["messages"].append(msg)
            _mem_chats[session_id]["updated_at"] = _now_iso()
        except Exception as e:
            logger.warning("convex_chat_save_failed_fallback", error=str(e), session_id=session_id)
            if session_id not in _mem_chats:
                _mem_chats[session_id] = {
                    "session_id": session_id,
                    "created_at": _now_iso(),
                    "messages": [],
                }
            _mem_chats[session_id]["messages"].append(msg)
            _mem_chats[session_id]["updated_at"] = _now_iso()

    def get_chat_history(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve full chat session."""
        try:
            if self._client:
                session = self._query("chat:getSession", {"session_id": session_id})
                if session and isinstance(session, dict):
                    return session
                return None
            return _mem_chats.get(session_id)
        except Exception as e:
            logger.warning("convex_chat_history_failed_fallback", error=str(e), session_id=session_id)
            return _mem_chats.get(session_id)

    def list_chat_sessions(self) -> List[Dict[str, Any]]:
        """List all chat sessions (metadata only, no messages)."""
        try:
            if self._client:
                sessions = self._query("chat:listSessions")
                if isinstance(sessions, list):
                    return sessions
                return []
            return [
                {
                    "session_id": v["session_id"],
                    "created_at": v.get("created_at"),
                    "updated_at": v.get("updated_at"),
                    "message_count": len(v.get("messages", [])),
                }
                for v in _mem_chats.values()
            ]
        except Exception as e:
            logger.warning("convex_chat_sessions_failed_fallback", error=str(e))
            return [
                {
                    "session_id": v["session_id"],
                    "created_at": v.get("created_at"),
                    "updated_at": v.get("updated_at"),
                    "message_count": len(v.get("messages", [])),
                }
                for v in _mem_chats.values()
            ]

    # ─── User Settings ───────────────────────────────────────────

    def save_settings(self, user_settings: Dict[str, Any]) -> None:
        """Persist user/app settings."""
        try:
            if self._client:
                self._mutation("settings:upsertSettings", user_settings)
            else:
                _mem_settings.update(user_settings)
        except Exception as e:
            logger.warning("convex_settings_save_failed_fallback", error=str(e))
            _mem_settings.update(user_settings)

    def get_settings(self) -> Dict[str, Any]:
        """Retrieve user/app settings."""
        default_settings = {
            "theme": "light",
            "notifications": {"critical": True, "insights": True},
        }
        try:
            if self._client:
                data = self._query("settings:getSettings")
                if isinstance(data, dict) and data:
                    return data
                return default_settings
            return _mem_settings.copy()
        except Exception as e:
            logger.warning("convex_settings_get_failed_fallback", error=str(e))
            return _mem_settings.copy()


# Singleton — safe to import because it gracefully degrades
convex_service = ConvexService()
