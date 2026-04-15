"""RAG (Retrieval-Augmented Generation) engine for POWERGRID queries."""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from app.services.vector_store import vector_store
from app.services.llm_service import llm_service
from app.core.config import get_settings
from app.core.exceptions import RAGQueryError
from app.core.logging import get_logger, log_execution_time

logger = get_logger(__name__)
settings = get_settings()


@dataclass
class RAGResponse:
    """Complete RAG response with answer and citations."""
    answer: str
    citations: List[Dict[str, Any]]
    confidence: float
    model_used: str
    provider: str
    query_time_ms: float
    documents_retrieved: int
    is_insufficient: bool


class RAGEngine:
    """Main RAG engine orchestrating retrieval and generation."""
    
    def __init__(self):
        self.vector_store = vector_store
        self.llm_service = llm_service
    
    def _build_filters(
        self,
        equipment_type: Optional[str] = None,
        voltage_level: Optional[str] = None,
        doc_types: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """Build metadata filters for vector search."""
        filters = {}
        
        if equipment_type:
            filters['equipment_type'] = equipment_type.upper()
        
        if voltage_level:
            filters['voltage_level'] = voltage_level
        
        if doc_types:
            if len(doc_types) == 1:
                filters['doc_type'] = doc_types[0]
            else:
                filters['doc_type'] = {'$in': doc_types}
        
        return filters if filters else None
    
    @log_execution_time(logger, "rag_query")
    async def query(
        self,
        question: str,
        equipment_type: Optional[str] = None,
        voltage_level: Optional[str] = None,
        doc_types: Optional[List[str]] = None,
        top_k: Optional[int] = None,
    ) -> RAGResponse:
        """
        Execute a RAG query.
        
        Args:
            question: User's question
            equipment_type: Optional filter by equipment type
            voltage_level: Optional filter by voltage level (e.g., "220 kV")
            doc_types: Optional filter by document types
            top_k: Number of documents to retrieve
            
        Returns:
            RAGResponse with answer and citations
        """
        try:
            import time
            start_time = time.time()
            
            # Build filters
            filters = self._build_filters(equipment_type, voltage_level, doc_types)
            
            logger.info(
                "rag_query_started",
                question=question[:100],
                filters=filters,
                equipment_type=equipment_type,
                voltage_level=voltage_level
            )
            
            # Retrieve relevant documents
            retrieved_docs = self.vector_store.similarity_search(
                query=question,
                k=top_k or settings.VECTOR_SEARCH_K,
                filter_dict=filters,
                score_threshold=settings.VECTOR_SEARCH_SCORE_THRESHOLD
            )
            
            # Generate response
            llm_response = self.llm_service.generate_response(question, retrieved_docs)
            
            # Calculate query time
            query_time_ms = round((time.time() - start_time) * 1000, 2)
            
            # Check if information is insufficient
            is_insufficient = (
                not retrieved_docs or 
                llm_response['confidence'] < 0.5 or
                "don't have sufficient information" in llm_response['answer'].lower()
            )
            
            logger.info(
                "rag_query_completed",
                question=question[:50],
                documents_retrieved=len(retrieved_docs),
                citations=len(llm_response['citations']),
                confidence=llm_response['confidence'],
                query_time_ms=query_time_ms
            )
            
            return RAGResponse(
                answer=llm_response['answer'],
                citations=llm_response['citations'],
                confidence=llm_response['confidence'],
                model_used=llm_response['model_used'],
                provider=llm_response['provider'],
                query_time_ms=query_time_ms,
                documents_retrieved=len(retrieved_docs),
                is_insufficient=is_insufficient
            )
            
        except Exception as e:
            logger.error("rag_query_failed", error=str(e), question=question[:50])
            raise RAGQueryError(
                f"Query failed: {str(e)}",
                query=question
            )
    
    async def query_with_fallback(
        self,
        question: str,
        equipment_type: Optional[str] = None,
        voltage_level: Optional[str] = None,
        doc_types: Optional[List[str]] = None,
    ) -> RAGResponse:
        """
        Execute query with fallback strategies if initial retrieval fails.
        
        Strategy:
        1. Try with all filters
        2. If no results, try without equipment filter
        3. If still no results, try without any filters
        """
        # First attempt: with all filters
        response = await self.query(
            question=question,
            equipment_type=equipment_type,
            voltage_level=voltage_level,
            doc_types=doc_types
        )
        
        if not response.is_insufficient:
            return response
        
        logger.info("fallback_triggered", strategy="remove_equipment_filter")
        
        # Second attempt: without equipment filter
        response = await self.query(
            question=question,
            equipment_type=None,
            voltage_level=voltage_level,
            doc_types=doc_types
        )
        
        if not response.is_insufficient:
            return response
        
        logger.info("fallback_triggered", strategy="remove_all_filters")
        
        # Third attempt: no filters
        response = await self.query(
            question=question,
            equipment_type=None,
            voltage_level=None,
            doc_types=None
        )
        
        return response


# Singleton instance
rag_engine = RAGEngine()
