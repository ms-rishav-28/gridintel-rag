"""Firebase Firestore service for persistent data storage.

Provides durable storage for document metadata, chat sessions, and settings.
Gracefully degrades to in-memory mode if Firebase is not configured,
allowing local development without a Firebase project.
"""

import json
import os
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

# In-memory fallback stores
_mem_documents: Dict[str, Dict[str, Any]] = {}
_mem_chats: Dict[str, Dict[str, Any]] = {}
_mem_settings: Dict[str, Any] = {"theme": "light", "notifications": {"critical": True, "insights": True}}


def _get_firestore_client():
    """Lazily initialize and return the Firestore client, or None."""
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            cred_json = settings.FIREBASE_CREDENTIALS
            if not cred_json:
                return None
            cred_dict = json.loads(cred_json)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)

        return firestore.client()
    except Exception as e:
        logger.warning("firebase_init_failed", error=str(e))
        return None


class FirebaseService:
    """Persistent storage backed by Firestore with in-memory fallback."""

    def __init__(self):
        self._db = _get_firestore_client()
        if self._db:
            logger.info("firebase_connected", project=self._db.project)
        else:
            logger.warning(
                "firebase_not_configured",
                message="Running in memory-only mode. Data will NOT persist across restarts. "
                        "Set FIREBASE_CREDENTIALS env var to enable persistence."
            )

    @property
    def is_connected(self) -> bool:
        return self._db is not None

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
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "status": "active",
        }

        if self._db:
            self._db.collection("documents").document(doc_id).set(record)
        else:
            _mem_documents[doc_id] = record

        logger.info("document_metadata_saved", doc_id=doc_id)

    def list_documents(self) -> List[Dict[str, Any]]:
        """Return all active documents."""
        if self._db:
            docs = (
                self._db.collection("documents")
                .where("status", "==", "active")
                .stream()
            )
            return [doc.to_dict() for doc in docs]
        else:
            return [d for d in _mem_documents.values() if d.get("status") == "active"]

    def delete_document_metadata(self, doc_id: str) -> None:
        """Soft-delete a document by marking status."""
        if self._db:
            self._db.collection("documents").document(doc_id).update({"status": "deleted"})
        elif doc_id in _mem_documents:
            _mem_documents[doc_id]["status"] = "deleted"

    # ─── Chat Sessions ───────────────────────────────────────────

    def save_chat_message(self, session_id: str, message: Dict[str, Any]) -> None:
        """Append a message to a chat session."""
        msg = {
            "role": message.get("role", "user"),
            "content": message.get("content", ""),
            "timestamp": message.get("timestamp", datetime.now(timezone.utc).isoformat()),
            "citations": message.get("citations", []),
            "confidence": message.get("confidence"),
            "model_used": message.get("model_used"),
            "query_time_ms": message.get("query_time_ms"),
        }

        if self._db:
            from google.cloud.firestore_v1 import ArrayUnion
            ref = self._db.collection("chat_sessions").document(session_id)
            doc = ref.get()
            if doc.exists:
                ref.update({
                    "messages": ArrayUnion([msg]),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
            else:
                ref.set({
                    "session_id": session_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "messages": [msg],
                })
        else:
            if session_id not in _mem_chats:
                _mem_chats[session_id] = {
                    "session_id": session_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "messages": [],
                }
            _mem_chats[session_id]["messages"].append(msg)
            _mem_chats[session_id]["updated_at"] = datetime.now(timezone.utc).isoformat()

    def get_chat_history(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve full chat session."""
        if self._db:
            doc = self._db.collection("chat_sessions").document(session_id).get()
            return doc.to_dict() if doc.exists else None
        else:
            return _mem_chats.get(session_id)

    def list_chat_sessions(self) -> List[Dict[str, Any]]:
        """List all chat sessions (metadata only, no messages)."""
        if self._db:
            sessions = self._db.collection("chat_sessions").order_by(
                "updated_at", direction="DESCENDING"
            ).limit(50).stream()
            results = []
            for s in sessions:
                data = s.to_dict()
                results.append({
                    "session_id": data.get("session_id"),
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                    "message_count": len(data.get("messages", [])),
                })
            return results
        else:
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
        if self._db:
            self._db.collection("system_config").document("settings").set(user_settings, merge=True)
        else:
            _mem_settings.update(user_settings)

    def get_settings(self) -> Dict[str, Any]:
        """Retrieve user/app settings."""
        if self._db:
            doc = self._db.collection("system_config").document("settings").get()
            return doc.to_dict() if doc.exists else {"theme": "light", "notifications": {"critical": True, "insights": True}}
        else:
            return _mem_settings.copy()


# Singleton — safe to import because it gracefully degrades
firebase_service = FirebaseService()
