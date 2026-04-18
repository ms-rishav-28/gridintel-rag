"""Vector store service for document embeddings and retrieval."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from chromadb.config import Settings as ChromaSettings
from langchain.schema import Document as LangChainDocument
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

from app.core.config import get_settings
from app.core.exceptions import VectorStoreError
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Dedicated thread pool for blocking ChromaDB / embedding calls so the
# event loop is never starved.  A small pool is fine — we only need to
# avoid blocking, not achieve massive parallelism.
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="vectorstore")


class VectorStoreService:
    """Manages vector embeddings and similarity search.

    All public methods are ``async`` and offload blocking work to a thread pool
    via ``run_in_executor`` so they can be called safely from async route
    handlers without freezing the event loop (fixes #5).
    """

    def __init__(self) -> None:
        self.persist_dir = Path(settings.CHROMA_PERSIST_DIRECTORY)
        self.persist_dir.mkdir(parents=True, exist_ok=True)

        self._embeddings: Optional[HuggingFaceEmbeddings] = None
        self._vectorstore: Optional[Chroma] = None

    def _ensure_initialized(self) -> None:
        """Initialize expensive embedding/vector clients lazily on first use."""
        if self._vectorstore is not None:
            return

        try:
            self._embeddings = HuggingFaceEmbeddings(
                model_name=settings.EMBEDDING_MODEL,
                model_kwargs={"device": settings.EMBEDDING_DEVICE},
                encode_kwargs={"normalize_embeddings": True},
            )

            self._vectorstore = Chroma(
                collection_name=settings.CHROMA_COLLECTION_NAME,
                embedding_function=self._embeddings,
                persist_directory=str(self.persist_dir),
                client_settings=ChromaSettings(
                    anonymized_telemetry=False,
                    allow_reset=True,
                ),
            )

            logger.info(
                "vector_store_initialized",
                collection=settings.CHROMA_COLLECTION_NAME,
                persist_dir=str(self.persist_dir),
            )

        except Exception as e:
            logger.error("vector_store_init_failed", error=str(e))
            raise VectorStoreError(
                f"Failed to initialize vector store: {str(e)}",
                operation="initialize",
            )

    def _get_vectorstore(self) -> Chroma:
        self._ensure_initialized()
        if self._vectorstore is None:
            raise VectorStoreError("Vector store is unavailable", operation="initialize")
        return self._vectorstore

    # ── Blocking internals (run inside thread pool) ──────────────

    def _add_documents_sync(
        self,
        documents: List[LangChainDocument],
        doc_id: str,
    ) -> int:
        if not documents:
            logger.warning("no_documents_to_add", doc_id=doc_id)
            return 0

        vectorstore = self._get_vectorstore()

        for doc in documents:
            doc.metadata["doc_id"] = doc_id

        ids = [f"{doc_id}_{i}" for i in range(len(documents))]
        vectorstore.add_documents(documents, ids=ids)

        logger.info(
            "documents_added_to_vectorstore",
            doc_id=doc_id,
            count=len(documents),
        )
        return len(documents)

    def _similarity_search_sync(
        self,
        query: str,
        k: int,
        filter_dict: Optional[Dict[str, Any]],
        score_threshold: float,
    ) -> List[Tuple[LangChainDocument, float]]:
        vectorstore = self._get_vectorstore()

        results = vectorstore.similarity_search_with_relevance_scores(
            query=query,
            k=k * 2,
            filter=filter_dict,
        )

        filtered_results = [
            (doc, score) for doc, score in results if score >= score_threshold
        ][:k]

        logger.info(
            "similarity_search_completed",
            query=query[:50],
            results_found=len(results),
            results_returned=len(filtered_results),
            threshold=score_threshold,
        )

        return filtered_results

    def _delete_document_sync(self, doc_id: str) -> bool:
        vectorstore = self._get_vectorstore()

        try:
            vectorstore.delete(where={"doc_id": doc_id})
        except Exception:
            raw = vectorstore._collection.get(include=[])
            all_ids = raw.get("ids", [])
            target_ids = [
                chunk_id for chunk_id in all_ids
                if chunk_id == doc_id or chunk_id.startswith(f"{doc_id}_")
            ]
            if target_ids:
                vectorstore.delete(ids=target_ids)

        logger.info("document_deleted_from_vectorstore", doc_id=doc_id)
        return True

    def _get_collection_stats_sync(self) -> Dict[str, Any]:
        vectorstore = self._get_vectorstore()
        count = vectorstore._collection.count()
        return {
            "total_documents": count,
            "collection_name": settings.CHROMA_COLLECTION_NAME,
            "embedding_model": settings.EMBEDDING_MODEL,
            "status": "ready",
        }

    def _check_hash_exists_sync(self, file_hash: str) -> bool:
        """Return True if any chunk with the given file_hash already exists."""
        vectorstore = self._get_vectorstore()
        try:
            results = vectorstore._collection.get(
                where={"file_hash": file_hash},
                limit=1,
                include=[],
            )
            return bool(results and results.get("ids"))
        except Exception:
            return False

    def _list_documents_sync(self) -> List[Dict[str, Any]]:
        """List unique documents via paginated chunk metadata scan."""
        collection = self._get_vectorstore()._collection
        count = collection.count()
        if count == 0:
            return []

        docs_map: Dict[str, Dict[str, Any]] = {}
        page_size = 500
        offset = 0

        while offset < count:
            batch = collection.get(
                include=["metadatas"],
                limit=page_size,
                offset=offset,
            )
            metadatas = batch.get("metadatas", [])
            ids = batch.get("ids", [])

            if not metadatas:
                break

            for index, meta in enumerate(metadatas):
                if not meta:
                    continue

                fallback_id = ids[index] if index < len(ids) else ""
                doc_id = meta.get(
                    "doc_id",
                    fallback_id.rsplit("_", 1)[0] if "_" in fallback_id else fallback_id,
                )

                if doc_id not in docs_map:
                    docs_map[doc_id] = {
                        "doc_id": doc_id,
                        "filename": meta.get("source", meta.get("filename", "Unknown")),
                        "doc_type": meta.get("doc_type", "UNKNOWN"),
                        "equipment_type": meta.get("equipment_type"),
                        "voltage_level": meta.get("voltage_level"),
                        "chunks_count": 0,
                    }

                docs_map[doc_id]["chunks_count"] += 1

            offset += page_size

        return list(docs_map.values())

    def _clear_collection_sync(self) -> bool:
        vectorstore = self._get_vectorstore()
        vectorstore.delete_collection()
        self._vectorstore = None
        self._ensure_initialized()
        logger.warning("vector_collection_cleared")
        return True

    # ── Async public API ─────────────────────────────────────────

    async def add_documents(
        self,
        documents: List[LangChainDocument],
        doc_id: str,
    ) -> int:
        """Add documents to vector store (non-blocking)."""
        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                _executor, self._add_documents_sync, documents, doc_id,
            )
        except VectorStoreError:
            raise
        except Exception as e:
            logger.error("failed_to_add_documents", error=str(e), doc_id=doc_id)
            raise VectorStoreError(
                f"Failed to add documents: {str(e)}",
                operation="add_documents",
            )

    async def similarity_search(
        self,
        query: str,
        k: int = None,
        filter_dict: Optional[Dict[str, Any]] = None,
        score_threshold: float = None,
    ) -> List[Tuple[LangChainDocument, float]]:
        """Perform similarity search with relevance score filtering (non-blocking)."""
        try:
            k = k or settings.VECTOR_SEARCH_K
            score_threshold = score_threshold if score_threshold is not None else settings.VECTOR_SEARCH_SCORE_THRESHOLD
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                _executor,
                self._similarity_search_sync,
                query, k, filter_dict, score_threshold,
            )
        except VectorStoreError:
            raise
        except Exception as e:
            logger.error("similarity_search_failed", error=str(e), query=query[:50])
            raise VectorStoreError(
                f"Search failed: {str(e)}",
                operation="similarity_search",
            )

    async def delete_document(self, doc_id: str) -> bool:
        """Delete all chunks belonging to a document ID (non-blocking)."""
        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                _executor, self._delete_document_sync, doc_id,
            )
        except VectorStoreError:
            raise
        except Exception as e:
            logger.error("failed_to_delete_document", error=str(e), doc_id=doc_id)
            raise VectorStoreError(
                f"Failed to delete document: {str(e)}",
                operation="delete_document",
            )

    async def get_collection_stats(self) -> Dict[str, Any]:
        """Return collection stats (non-blocking, degrades gracefully)."""
        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                _executor, self._get_collection_stats_sync,
            )
        except Exception as e:
            logger.warning("vector_store_stats_unavailable", error=str(e))
            return {
                "total_documents": 0,
                "collection_name": settings.CHROMA_COLLECTION_NAME,
                "embedding_model": settings.EMBEDDING_MODEL,
                "status": "unavailable",
                "error": str(e),
            }

    async def check_hash_exists(self, file_hash: str) -> bool:
        """Check if a document with the given hash is already indexed (#11)."""
        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                _executor, self._check_hash_exists_sync, file_hash,
            )
        except Exception:
            return False

    async def clear_collection(self) -> bool:
        """Clear all indexed data and recreate the collection (non-blocking)."""
        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                _executor, self._clear_collection_sync,
            )
        except Exception as e:
            logger.error("failed_to_clear_collection", error=str(e))
            raise VectorStoreError(
                f"Failed to clear collection: {str(e)}",
                operation="clear_collection",
            )

    async def list_documents(self) -> List[Dict[str, Any]]:
        """List unique documents in the vector index (non-blocking, paginated)."""
        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                _executor, self._list_documents_sync,
            )
        except VectorStoreError:
            raise
        except Exception as e:
            logger.error("failed_to_list_documents", error=str(e))
            raise VectorStoreError(
                f"Failed to list documents: {str(e)}",
                operation="list_documents",
            )


# Singleton instance
vector_store = VectorStoreService()
