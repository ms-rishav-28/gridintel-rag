"""Vector store service for document embeddings and retrieval."""

import os
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
import json

from langchain.schema import Document as LangChainDocument
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from chromadb.config import Settings as ChromaSettings

from app.core.config import get_settings
from app.core.exceptions import VectorStoreError
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class VectorStoreService:
    """Manages vector embeddings and similarity search."""
    
    def __init__(self):
        self.persist_dir = Path(settings.CHROMA_PERSIST_DIRECTORY)
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize embeddings model
        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={'device': settings.EMBEDDING_DEVICE},
            encode_kwargs={'normalize_embeddings': True}
        )
        
        # Initialize Chroma client
        self.vectorstore = Chroma(
            collection_name=settings.CHROMA_COLLECTION_NAME,
            embedding_function=self.embeddings,
            persist_directory=str(self.persist_dir),
            client_settings=ChromaSettings(
                anonymized_telemetry=False,
                allow_reset=True,
            )
        )
        
        logger.info(
            "vector_store_initialized",
            collection=settings.CHROMA_COLLECTION_NAME,
            persist_dir=str(self.persist_dir)
        )
    
    def add_documents(
        self,
        documents: List[LangChainDocument],
        doc_id: str
    ) -> int:
        """
        Add documents to vector store.
        
        Args:
            documents: List of documents to add
            doc_id: Document ID for batch identification
            
        Returns:
            Number of documents added
        """
        try:
            if not documents:
                logger.warning("no_documents_to_add", doc_id=doc_id)
                return 0
            
            # Add documents with IDs
            ids = [f"{doc_id}_{i}" for i in range(len(documents))]
            self.vectorstore.add_documents(documents, ids=ids)
            
            logger.info(
                "documents_added_to_vectorstore",
                doc_id=doc_id,
                count=len(documents)
            )
            return len(documents)
            
        except Exception as e:
            logger.error("failed_to_add_documents", error=str(e), doc_id=doc_id)
            raise VectorStoreError(
                f"Failed to add documents: {str(e)}",
                operation="add_documents"
            )
    
    def similarity_search(
        self,
        query: str,
        k: int = None,
        filter_dict: Optional[Dict[str, Any]] = None,
        score_threshold: float = None
    ) -> List[Tuple[LangChainDocument, float]]:
        """
        Perform similarity search with relevance scores.
        
        Args:
            query: Search query
            k: Number of results (default from settings)
            filter_dict: Optional metadata filters
            score_threshold: Minimum relevance score
            
        Returns:
            List of (document, score) tuples
        """
        try:
            k = k or settings.VECTOR_SEARCH_K
            score_threshold = score_threshold or settings.VECTOR_SEARCH_SCORE_THRESHOLD
            
            # Perform search with scores
            results = self.vectorstore.similarity_search_with_relevance_scores(
                query=query,
                k=k * 2,  # Get more results for filtering
                filter=filter_dict
            )
            
            # Filter by score threshold
            filtered_results = [
                (doc, score) for doc, score in results
                if score >= score_threshold
            ]
            
            # Limit to k results
            filtered_results = filtered_results[:k]
            
            logger.info(
                "similarity_search_completed",
                query=query[:50],
                results_found=len(results),
                results_returned=len(filtered_results),
                threshold=score_threshold
            )
            
            return filtered_results
            
        except Exception as e:
            logger.error("similarity_search_failed", error=str(e), query=query[:50])
            raise VectorStoreError(
                f"Search failed: {str(e)}",
                operation="similarity_search"
            )
    
    def delete_document(self, doc_id: str) -> bool:
        """
        Delete all chunks for a document.
        
        Args:
            doc_id: Document ID to delete
            
        Returns:
            True if deletion was successful
        """
        try:
            # Delete all chunks with IDs starting with doc_id
            where_clause = {"doc_id": doc_id}
            self.vectorstore.delete(where=where_clause)
            
            logger.info("document_deleted_from_vectorstore", doc_id=doc_id)
            return True
            
        except Exception as e:
            logger.error("failed_to_delete_document", error=str(e), doc_id=doc_id)
            raise VectorStoreError(
                f"Failed to delete document: {str(e)}",
                operation="delete_document"
            )
    
    def get_collection_stats(self) -> Dict[str, Any]:
        """Get statistics about the vector collection."""
        try:
            count = self.vectorstore._collection.count()
            
            return {
                "total_documents": count,
                "collection_name": settings.CHROMA_COLLECTION_NAME,
                "embedding_model": settings.EMBEDDING_MODEL,
            }
            
        except Exception as e:
            logger.error("failed_to_get_stats", error=str(e))
            raise VectorStoreError(
                f"Failed to get stats: {str(e)}",
                operation="get_stats"
            )
    
    def clear_collection(self) -> bool:
        """Clear all documents from collection. Use with caution."""
        try:
            self.vectorstore.delete_collection()
            # Recreate collection
            self.vectorstore = Chroma(
                collection_name=settings.CHROMA_COLLECTION_NAME,
                embedding_function=self.embeddings,
                persist_directory=str(self.persist_dir),
            )
            
            logger.warning("vector_collection_cleared")
            return True
            
        except Exception as e:
            logger.error("failed_to_clear_collection", error=str(e))
            raise VectorStoreError(
                f"Failed to clear collection: {str(e)}",
                operation="clear_collection"
            )

    def list_documents(self) -> List[Dict[str, Any]]:
        """
        List all unique documents in the collection with metadata.
        Groups chunks by doc_id and returns document-level info.
        """
        try:
            collection = self.vectorstore._collection
            count = collection.count()
            
            if count == 0:
                return []
            
            # Get all metadata from the collection
            results = collection.get(
                include=["metadatas"],
                limit=min(count, 10000)
            )
            
            # Group by doc_id to get unique documents
            docs_map: Dict[str, Dict[str, Any]] = {}
            for i, meta in enumerate(results.get("metadatas", [])):
                if not meta:
                    continue
                    
                doc_id = meta.get("doc_id", results["ids"][i].rsplit("_", 1)[0] if "_" in results["ids"][i] else results["ids"][i])
                
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
            
        except Exception as e:
            logger.error("failed_to_list_documents", error=str(e))
            raise VectorStoreError(
                f"Failed to list documents: {str(e)}",
                operation="list_documents"
            )


# Singleton instance
vector_store = VectorStoreService()
