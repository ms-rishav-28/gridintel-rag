"""Vector store service for document embeddings and retrieval."""

from __future__ import annotations

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


class VectorStoreService:
    """Manages vector embeddings and similarity search."""

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

    def add_documents(
        self,
        documents: List[LangChainDocument],
        doc_id: str,
    ) -> int:
        """Add documents to vector store and return inserted chunk count."""
        try:
            if not documents:
                logger.warning("no_documents_to_add", doc_id=doc_id)
                return 0

            vectorstore = self._get_vectorstore()

            # Ensure every chunk carries the parent document ID for lifecycle operations.
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

        except VectorStoreError:
            raise
        except Exception as e:
            logger.error("failed_to_add_documents", error=str(e), doc_id=doc_id)
            raise VectorStoreError(
                f"Failed to add documents: {str(e)}",
                operation="add_documents",
            )

    def similarity_search(
        self,
        query: str,
        k: int = None,
        filter_dict: Optional[Dict[str, Any]] = None,
        score_threshold: float = None,
    ) -> List[Tuple[LangChainDocument, float]]:
        """Perform similarity search with relevance score filtering."""
        try:
            vectorstore = self._get_vectorstore()
            k = k or settings.VECTOR_SEARCH_K
            score_threshold = score_threshold or settings.VECTOR_SEARCH_SCORE_THRESHOLD

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

        except VectorStoreError:
            raise
        except Exception as e:
            logger.error("similarity_search_failed", error=str(e), query=query[:50])
            raise VectorStoreError(
                f"Search failed: {str(e)}",
                operation="similarity_search",
            )

    def delete_document(self, doc_id: str) -> bool:
        """Delete all chunks belonging to a document ID."""
        try:
            vectorstore = self._get_vectorstore()

            # Primary path: metadata-based deletion.
            try:
                vectorstore.delete(where={"doc_id": doc_id})
            except Exception:
                # Fallback path: delete by generated chunk ID prefix.
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

        except VectorStoreError:
            raise
        except Exception as e:
            logger.error("failed_to_delete_document", error=str(e), doc_id=doc_id)
            raise VectorStoreError(
                f"Failed to delete document: {str(e)}",
                operation="delete_document",
            )

    def get_collection_stats(self) -> Dict[str, Any]:
        """Return collection stats; degrade gracefully when vector store is unavailable."""
        try:
            vectorstore = self._get_vectorstore()
            count = vectorstore._collection.count()
            return {
                "total_documents": count,
                "collection_name": settings.CHROMA_COLLECTION_NAME,
                "embedding_model": settings.EMBEDDING_MODEL,
                "status": "ready",
            }

        except Exception as e:
            logger.warning("vector_store_stats_unavailable", error=str(e))
            return {
                "total_documents": 0,
                "collection_name": settings.CHROMA_COLLECTION_NAME,
                "embedding_model": settings.EMBEDDING_MODEL,
                "status": "unavailable",
                "error": str(e),
            }

    def clear_collection(self) -> bool:
        """Clear all indexed data and recreate the collection."""
        try:
            vectorstore = self._get_vectorstore()
            vectorstore.delete_collection()
            self._vectorstore = None
            self._ensure_initialized()

            logger.warning("vector_collection_cleared")
            return True

        except Exception as e:
            logger.error("failed_to_clear_collection", error=str(e))
            raise VectorStoreError(
                f"Failed to clear collection: {str(e)}",
                operation="clear_collection",
            )

    def list_documents(self) -> List[Dict[str, Any]]:
        """List all unique documents in the vector index based on chunk metadata."""
        try:
            collection = self._get_vectorstore()._collection
            count = collection.count()
            if count == 0:
                return []

            results = collection.get(include=["metadatas"], limit=min(count, 10000))

            docs_map: Dict[str, Dict[str, Any]] = {}
            metadatas = results.get("metadatas", [])
            ids = results.get("ids", [])

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

            return list(docs_map.values())

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
