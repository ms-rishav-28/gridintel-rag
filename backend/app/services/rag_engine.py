"""RAG engine for POWERGRID SmartOps hybrid retrieval and answer generation."""

# CODEX-FIX: replace legacy LangChain RAG with LanceDB hybrid search, reranking, and Convex memory.

from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
import time
from typing import Any

from app.core.exceptions import RAGQueryError
from app.services.convex_service import get_convex_service
from app.services.embedding_service import get_embedding_service
from app.services.llm_service import get_llm_service
from app.services.vector_store import get_vector_store

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are POWERGRID SmartOps Assistant, an expert AI on Indian power grid operations,
regulations, and infrastructure. You answer questions strictly based on the provided
context documents. Rules:
1. If the context contains the answer, cite the source for every factual claim:
   [Source: {doc_name}, page {page_number}].
2. If a context chunk is labelled [IMAGE - ...], treat it as a diagram or chart and
   reference it explicitly: "As shown in the diagram on page X..."
3. If the context does not contain enough information, say exactly:
   "I couldn't find enough information in the knowledge base to answer this question."
   Do not guess or hallucinate.
4. Be concise but complete. Use markdown for structured answers."""


class CrossEncoderReranker:
    """Lazy, thread-safe cross-encoder reranker."""

    MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    def __init__(self):
        self._model = None
        self._lock = threading.Lock()

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def _load(self):
        with self._lock:
            if self._model is not None:
                return
            logger.info("Loading reranker model %s", self.MODEL_NAME)
            from sentence_transformers import CrossEncoder

            self._model = CrossEncoder(self.MODEL_NAME)

    def predict(self, pairs: list[tuple[str, str]]) -> list[float]:
        if not pairs:
            return []
        self._load()
        scores = self._model.predict(pairs)
        if hasattr(scores, "tolist"):
            return [float(score) for score in scores.tolist()]
        return [float(score) for score in scores]

    async def async_predict(self, pairs: list[tuple[str, str]]) -> list[float]:
        return await asyncio.to_thread(self.predict, pairs)


_reranker: CrossEncoderReranker | None = None


def get_reranker() -> CrossEncoderReranker:
    global _reranker
    if _reranker is None:
        _reranker = CrossEncoderReranker()
    return _reranker


class RAGEngine:
    """Coordinates query rewriting, retrieval, reranking, LLM calls, and persistence."""

    async def get_answer(
        self,
        query: str,
        session_id: str | None = None,
        filters: Any | None = None,
    ) -> dict[str, Any]:
        started = time.time()
        convex = get_convex_service()

        try:
            history = []
            if session_id:
                history = await convex.get_last_n_messages(session_id, 6)
                history = list(reversed(history))

            rewrites = await self._rewrite_queries(query, history)
            search_queries = self._dedupe_queries([query, *rewrites])[:4]
            where = self._build_filter_clause(filters)

            candidates = await self._retrieve_candidates(search_queries, where)
            top_20 = sorted(
                candidates.values(),
                key=lambda row: float(row.get("rrf_score", 0.0)),
                reverse=True,
            )[:20]
            top_5 = await self._rerank(query, top_20)

            context = self._format_context(top_5)
            conversation = self._format_history(history)
            user_prompt = (
                f"[CONVERSATION HISTORY]\n{conversation or 'No prior messages.'}\n\n"
                f"[RETRIEVED CONTEXT]\n{context or 'No context retrieved.'}\n\n"
                f"User question: {query}"
            )

            answer, provider = await get_llm_service().complete(
                [{"role": "user", "content": user_prompt}],
                system=SYSTEM_PROMPT,
            )

            citations = self._build_citations(top_5)
            duration_ms = round((time.time() - started) * 1000)

            if session_id:
                await convex.append_message(session_id, "user", query)
                await convex.append_message(
                    session_id,
                    "assistant",
                    answer,
                    citations=citations,
                    llm_provider=provider,
                    duration_ms=duration_ms,
                )

            return {
                "answer": answer,
                "citations": citations,
                "llm_provider": provider,
                "duration_ms": duration_ms,
            }

        except Exception as exc:
            logger.error("RAG query failed: %s", exc, exc_info=True)
            raise RAGQueryError(f"Query failed: {exc}", query=query) from exc

    async def _rewrite_queries(self, query: str, history: list[dict[str, Any]]) -> list[str]:
        prompt = (
            "Given this conversation history and user query, produce 3 alternative "
            "search queries as a JSON array. Be concise.\n\n"
            f"Conversation history:\n{self._format_history(history) or 'None'}\n\n"
            f"Query: {query}"
        )
        try:
            text, _ = await get_llm_service().complete(
                [{"role": "user", "content": prompt}],
                system="Return only valid JSON.",
            )
            parsed = self._parse_json_array(text)
            return [item.strip() for item in parsed if item.strip() and item.strip() != query]
        except Exception as exc:
            logger.warning("Query rewriting failed, using original query only: %s", exc)
            return []

    def _parse_json_array(self, text: str) -> list[str]:
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\[[\s\S]*\]", text)
            if not match:
                return []
            parsed = json.loads(match.group(0))
        if not isinstance(parsed, list):
            return []
        return [str(item) for item in parsed[:3]]

    def _dedupe_queries(self, queries: list[str]) -> list[str]:
        seen: set[str] = set()
        deduped: list[str] = []
        for item in queries:
            normalized = " ".join(item.split()).lower()
            if item.strip() and normalized not in seen:
                seen.add(normalized)
                deduped.append(item.strip())
        return deduped

    async def _retrieve_candidates(
        self,
        search_queries: list[str],
        where: str | None,
    ) -> dict[str, dict[str, Any]]:
        embedder = get_embedding_service()
        store = get_vector_store()
        candidates: dict[str, dict[str, Any]] = {}

        for search_query in search_queries:
            dense_vec, _sparse = await embedder.async_encode_query(search_query)
            rows = await store.hybrid_search(search_query, dense_vec, top_k=20, where=where)
            for row in rows:
                chunk_id = row.get("chunk_id")
                if not chunk_id:
                    continue
                current = candidates.get(chunk_id)
                if current is None:
                    candidates[chunk_id] = row
                else:
                    current["rrf_score"] = max(
                        float(current.get("rrf_score", 0.0)),
                        float(row.get("rrf_score", 0.0)),
                    )
        return candidates

    async def _rerank(self, query: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not rows:
            return []
        pairs = [(query, str(row.get("content", ""))) for row in rows]
        scores = await get_reranker().async_predict(pairs)
        reranked: list[dict[str, Any]] = []
        for row, score in zip(rows, scores):
            copy = row.copy()
            copy["rerank_score"] = score
            reranked.append(copy)
        reranked.sort(key=lambda row: float(row.get("rerank_score", 0.0)), reverse=True)
        return reranked[:5]

    def _format_history(self, history: list[dict[str, Any]]) -> str:
        lines: list[str] = []
        for message in history[-6:]:
            role = str(message.get("role", "")).lower()
            prefix = "User" if role == "user" else "Assistant"
            content = str(message.get("content", "")).strip()
            if content:
                lines.append(f"{prefix}: {content}")
        return "\n".join(lines)

    def _format_context(self, chunks: list[dict[str, Any]]) -> str:
        parts: list[str] = []
        for chunk in chunks:
            parts.append(
                "---\n"
                f"Source: {chunk.get('doc_name') or 'Unknown'} | "
                f"Page: {chunk.get('page_number') or 'N/A'} | "
                f"Type: {chunk.get('chunk_type') or 'text'}\n"
                f"{chunk.get('content') or ''}\n"
                "---"
            )
        return "\n\n".join(parts)

    def _build_citations(self, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        citations: list[dict[str, Any]] = []
        for chunk in chunks:
            content = str(chunk.get("content") or "")
            citations.append(
                {
                    "docId": str(chunk.get("doc_id") or ""),
                    "docName": str(chunk.get("doc_name") or "Unknown"),
                    "pageNumber": chunk.get("page_number"),
                    "chunkIndex": chunk.get("chunk_index"),
                    "relevanceScore": float(
                        chunk.get("rerank_score", chunk.get("rrf_score", 0.0)) or 0.0
                    ),
                    "chunkPreview": content[:200],
                    "isImageChunk": chunk.get("chunk_type") == "image_description",
                }
            )
        return citations

    def _build_filter_clause(self, filters: Any | None) -> str | None:
        if not filters:
            return None

        doc_ids = self._filter_value(filters, "doc_ids") or []
        source_type = self._filter_value(filters, "source_type")
        clauses: list[str] = []

        if doc_ids:
            escaped = ", ".join(repr(str(doc_id)) for doc_id in doc_ids)
            clauses.append(f"doc_id IN ({escaped})")

        if source_type:
            clauses.append(f"source_type = '{self._escape_lancedb_literal(str(source_type))}'")

        return " AND ".join(clauses) if clauses else None

    def _filter_value(self, filters: Any, key: str) -> Any:
        if isinstance(filters, dict):
            return filters.get(key)
        return getattr(filters, key, None)

    def _escape_lancedb_literal(self, value: str) -> str:
        return value.replace("'", "''")


_rag_engine: RAGEngine | None = None


def get_rag_engine() -> RAGEngine:
    global _rag_engine
    if _rag_engine is None:
        _rag_engine = RAGEngine()
    return _rag_engine


rag_engine = get_rag_engine()
