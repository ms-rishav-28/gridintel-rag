"""RAG (Retrieval-Augmented Generation) engine for POWERGRID queries."""

from __future__ import annotations

from typing import List, Dict, Any, Optional, TYPE_CHECKING
from dataclasses import dataclass

from app.core.config import get_settings
from app.core.exceptions import RAGQueryError
from app.core.logging import get_logger, log_execution_time

if TYPE_CHECKING:
    from app.services.vector_store import VectorStoreService
    from app.services.llm_service import LLMService

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
        # Lazy imports — avoid triggering heavy service init at module load time
        self._vector_store: VectorStoreService | None = None
        self._llm_service: LLMService | None = None

    @property
    def vector_store(self) -> VectorStoreService:
        if self._vector_store is None:
            from app.services.vector_store import vector_store
            self._vector_store = vector_store
        return self._vector_store

    @property
    def llm_service(self) -> LLMService:
        if self._llm_service is None:
            from app.services.llm_service import llm_service
            self._llm_service = llm_service
        return self._llm_service
    
    def _build_filters(
        self,
        equipment_type: Optional[str] = None,
        voltage_level: Optional[str] = None,
        doc_types: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """Build metadata filters for vector search."""
        clauses: List[Dict[str, Any]] = []

        if equipment_type:
            clauses.append({'equipment_type': equipment_type.upper()})

        if voltage_level:
            clauses.append({'voltage_level': voltage_level})

        if doc_types:
            if len(doc_types) == 1:
                clauses.append({'doc_type': doc_types[0]})
            else:
                clauses.append({'doc_type': {'$in': doc_types}})

        if not clauses:
            return None

        if len(clauses) == 1:
            return clauses[0]

        # Chroma where-filter expects a single top-level operator when combining conditions.
        return {'$and': clauses}
    
    @log_execution_time(logger, "rag_query")
    async def query(
        self,
        question: str,
        equipment_type: Optional[str] = None,
        voltage_level: Optional[str] = None,
        doc_types: Optional[List[str]] = None,
        top_k: Optional[int] = None,
    ) -> RAGResponse:
        """Execute a RAG query."""
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
            
            # Retrieve relevant documents (now async — fix #5)
            retrieved_docs = await self.vector_store.similarity_search(
                query=question,
                k=top_k or settings.VECTOR_SEARCH_K,
                filter_dict=filters,
                score_threshold=settings.VECTOR_SEARCH_SCORE_THRESHOLD
            )
            
            # Generate response (now async — fix #6)
            llm_response = await self.llm_service.generate_response(question, retrieved_docs)
            
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
        """Execute query with smart fallback (fix #9).

        Instead of 3 sequential full LLM+search passes, we:
        1.  Do a single broad vector search (no filters, lower threshold)
        2.  Re-rank results, boosting docs that match the requested filters
        3.  Call the LLM once with the best results

        This cuts latency and LLM quota by ~3×.
        """
        import time
        start_time = time.time()

        filters = self._build_filters(equipment_type, voltage_level, doc_types)

        # Step 1: Try with filters first (fast path)
        filtered_docs = await self.vector_store.similarity_search(
            query=question,
            k=settings.VECTOR_SEARCH_K,
            filter_dict=filters,
            score_threshold=settings.VECTOR_SEARCH_SCORE_THRESHOLD,
        )

        if filtered_docs and filtered_docs[0][1] >= 0.4:
            # Good results with filters — use directly, one LLM call
            llm_response = await self.llm_service.generate_response(question, filtered_docs)
            query_time_ms = round((time.time() - start_time) * 1000, 2)

            is_insufficient = (
                not filtered_docs
                or llm_response["confidence"] < 0.5
                or "don't have sufficient information" in llm_response["answer"].lower()
            )

            return RAGResponse(
                answer=llm_response["answer"],
                citations=llm_response["citations"],
                confidence=llm_response["confidence"],
                model_used=llm_response["model_used"],
                provider=llm_response["provider"],
                query_time_ms=query_time_ms,
                documents_retrieved=len(filtered_docs),
                is_insufficient=is_insufficient,
            )

        # Step 2: Fallback — broad unfiltered search
        logger.info("fallback_triggered", strategy="unfiltered_broad_search")

        broad_docs = await self.vector_store.similarity_search(
            query=question,
            k=settings.VECTOR_SEARCH_K * 2,
            filter_dict=None,
            score_threshold=settings.VECTOR_SEARCH_SCORE_THRESHOLD,
        )

        # Re-rank: boost docs that match the original filter criteria
        def _boost_score(doc_score_pair):
            doc, score = doc_score_pair
            meta = doc.metadata
            bonus = 0.0
            if equipment_type and meta.get("equipment_type", "").upper() == equipment_type.upper():
                bonus += 0.05
            if voltage_level and meta.get("voltage_level") == voltage_level:
                bonus += 0.05
            if doc_types and meta.get("doc_type") in doc_types:
                bonus += 0.03
            return score + bonus

        broad_docs.sort(key=_boost_score, reverse=True)
        best_docs = broad_docs[:settings.VECTOR_SEARCH_K]

        # Step 3: One LLM call with best results
        llm_response = await self.llm_service.generate_response(question, best_docs)
        query_time_ms = round((time.time() - start_time) * 1000, 2)

        is_insufficient = (
            not best_docs
            or llm_response["confidence"] < 0.5
            or "don't have sufficient information" in llm_response["answer"].lower()
        )

        return RAGResponse(
            answer=llm_response["answer"],
            citations=llm_response["citations"],
            confidence=llm_response["confidence"],
            model_used=llm_response["model_used"],
            provider=llm_response["provider"],
            query_time_ms=query_time_ms,
            documents_retrieved=len(best_docs),
            is_insufficient=is_insufficient,
        )


# Singleton instance
rag_engine = RAGEngine()
