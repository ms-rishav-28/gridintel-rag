"""LLM service for generating responses using Gemini or Groq."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional, Tuple

import tiktoken
from langchain.schema import Document as LangChainDocument
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain.prompts import ChatPromptTemplate

from app.core.config import get_settings
from app.core.exceptions import LLMError
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="llm")


SYSTEM_PROMPT = """You are a POWERGRID Operations Knowledge Assistant. Your role is to provide accurate, safety-critical information to field staff based on official CEA guidelines, POWERGRID technical manuals, and IT circulars.

CRITICAL RULES:
1. ONLY use information from the provided context documents
2. If the answer is not in the context, say "I don't have sufficient information in the available documents to answer this question. Please refer to your supervisor or the official POWERGRID documentation."
3. NEVER make up or infer technical specifications, maintenance intervals, or safety procedures
4. Always cite the source document and page/reference number when available
5. For maintenance-related questions, specify the exact interval, procedure reference, and equipment type
6. Highlight safety warnings and precautions prominently

When answering:
- Be precise and technical (field staff need exact specifications)
- Include voltage levels, equipment types, and standard references
- Format maintenance intervals clearly (e.g., "Monthly", "Quarterly", "Annually")
- Reference the document type (CEA Guideline, Technical Manual, IT Circular)"""


RAG_PROMPT_TEMPLATE = """Context documents:
{context}

Question: {question}

Provide a detailed, technical answer based strictly on the context above. Include specific citations with document names and reference numbers.

If the context doesn't contain sufficient information, state that clearly.

Answer:"""


# Lazy-loaded tiktoken encoder for token counting.
_tok_encoder = None


def _get_encoder():
    global _tok_encoder
    if _tok_encoder is None:
        try:
            _tok_encoder = tiktoken.get_encoding("cl100k_base")
        except Exception:
            _tok_encoder = tiktoken.get_encoding("gpt2")
    return _tok_encoder


def _count_tokens(text: str) -> int:
    """Return approximate token count for *text*."""
    return len(_get_encoder().encode(text, disallowed_special=()))


class LLMService:
    """Handles LLM interactions for RAG responses."""
    
    def __init__(self):
        self.provider = settings.DEFAULT_LLM_PROVIDER.lower()
        self.model_name = settings.DEFAULT_LLM_MODEL
        self.llm = None
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", SYSTEM_PROMPT),
            ("human", RAG_PROMPT_TEMPLATE)
        ])

    def _resolve_provider_and_model(self) -> Tuple[str, str]:
        """Resolve provider/model with fallback to an available configured provider."""
        requested = settings.DEFAULT_LLM_PROVIDER.lower()

        if requested == "gemini" and settings.GOOGLE_API_KEY:
            return "gemini", settings.DEFAULT_LLM_MODEL

        if requested == "groq" and settings.GROQ_API_KEY:
            return "groq", settings.DEFAULT_LLM_MODEL

        if settings.GOOGLE_API_KEY:
            logger.warning(
                "llm_provider_fallback",
                requested=requested,
                selected="gemini",
                reason="requested_provider_not_configured",
            )
            return "gemini", "gemini-2.0-flash"

        if settings.GROQ_API_KEY:
            logger.warning(
                "llm_provider_fallback",
                requested=requested,
                selected="groq",
                reason="requested_provider_not_configured",
            )
            return "groq", "llama-3.1-70b-versatile"

        raise LLMError(
            "No LLM provider is configured. Set GOOGLE_API_KEY or GROQ_API_KEY.",
            provider=requested,
        )
    
    def _initialize_llm(self):
        """Initialize the LLM based on provider configuration."""
        provider, model_name = self._resolve_provider_and_model()

        if provider == "gemini":
            if not settings.GOOGLE_API_KEY:
                raise LLMError(
                    "Google API key not configured",
                    provider="gemini"
                )
            self.provider = provider
            self.model_name = model_name
            return ChatGoogleGenerativeAI(
                model=model_name,
                temperature=settings.RAG_TEMPERATURE,
                max_output_tokens=settings.RAG_MAX_TOKENS,
                top_p=settings.RAG_TOP_P,
                google_api_key=settings.GOOGLE_API_KEY,
            )
        
        elif provider == "groq":
            if not settings.GROQ_API_KEY:
                raise LLMError(
                    "Groq API key not configured",
                    provider="groq"
                )
            self.provider = provider
            self.model_name = model_name
            return ChatGroq(
                model_name=model_name,
                temperature=settings.RAG_TEMPERATURE,
                max_tokens=settings.RAG_MAX_TOKENS,
                api_key=settings.GROQ_API_KEY,
            )
        
        else:
            raise LLMError(f"Unsupported LLM provider: {provider}")

    def _get_or_initialize_llm(self):
        """Initialize the provider lazily and cache it for subsequent requests."""
        if self.llm is None:
            self.llm = self._initialize_llm()
        return self.llm
    
    def _format_context(
        self,
        documents: List[Tuple[LangChainDocument, float]]
    ) -> str:
        """Format retrieved documents into context string with token budget (#14).

        Keeps the highest-scoring documents first and stops appending once
        ``MAX_CONTEXT_TOKENS`` would be exceeded.
        """
        budget = settings.MAX_CONTEXT_TOKENS
        context_parts: list[str] = []
        tokens_used = 0
        
        for i, (doc, score) in enumerate(documents, 1):
            metadata = doc.metadata
            source = metadata.get('source', 'Unknown')
            doc_type = metadata.get('doc_type', 'Document')
            page = metadata.get('page', 'N/A')
            chunk_idx = metadata.get('chunk_index', 0)
            
            context_part = f"""--- Document {i} (Relevance: {score:.2f}) ---
Source: {source}
Type: {doc_type}
Page/Ref: {page}
Chunk: {chunk_idx}

{doc.page_content}
"""
            part_tokens = _count_tokens(context_part)
            if tokens_used + part_tokens > budget and context_parts:
                # Already have at least one doc; stop to avoid overflow.
                logger.info(
                    "context_budget_exceeded",
                    docs_included=len(context_parts),
                    docs_total=len(documents),
                    tokens_used=tokens_used,
                    budget=budget,
                )
                break

            context_parts.append(context_part)
            tokens_used += part_tokens
        
        return "\n\n".join(context_parts)
    
    def _generate_sync(
        self,
        question: str,
        documents: List[Tuple[LangChainDocument, float]],
    ) -> Dict[str, Any]:
        """Synchronous LLM generation — runs inside thread pool."""
        if not documents:
            return {
                "answer": (
                    "I don't have sufficient information in the available documents "
                    "to answer this question. Please refer to your supervisor or "
                    "the official POWERGRID documentation."
                ),
                "citations": [],
                "confidence": 0.0,
                "model_used": self.model_name,
                "provider": self.provider,
            }
        
        # Resolve actual model (may differ from config after fallback) — fix #19
        actual_provider, actual_model = self._resolve_provider_and_model()

        # Format context with token budget
        context = self._format_context(documents)
        llm = self._get_or_initialize_llm()
        
        # Create chain and invoke
        chain = self.prompt | llm
        response = chain.invoke({
            "context": context,
            "question": question
        })
        
        # Extract citations
        citations = self._extract_citations(documents)
        
        # Calculate overall confidence
        avg_score = sum(score for _, score in documents) / len(documents)
        
        logger.info(
            "response_generated",
            question=question[:50],
            provider=actual_provider,
            model=actual_model,
            citations=len(citations),
            confidence=round(avg_score, 3)
        )
        
        return {
            "answer": response.content,
            "citations": citations,
            "confidence": round(avg_score, 3),
            "model_used": actual_model,
            "provider": actual_provider,
            "documents_used": len(documents),
        }

    async def generate_response(
        self,
        question: str,
        documents: List[Tuple[LangChainDocument, float]],
    ) -> Dict[str, Any]:
        """Generate an LLM response (non-blocking — fix #6).

        Wraps the blocking LangChain chain invocation in ``run_in_executor``
        so the event loop is never frozen.
        """
        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                _executor, self._generate_sync, question, documents,
            )
        except LLMError:
            raise
        except Exception as e:
            logger.error("llm_generation_failed", error=str(e), question=question[:50])
            raise LLMError(
                f"Failed to generate response: {str(e)}",
                provider=self.provider,
            )
    
    def _extract_citations(
        self,
        documents: List[Tuple[LangChainDocument, float]]
    ) -> List[Dict[str, Any]]:
        """Extract citation information from documents."""
        citations = []
        
        for doc, score in documents:
            if score < settings.MIN_CITATION_SCORE:
                continue
                
            metadata = doc.metadata
            citation = {
                "source": metadata.get('source', 'Unknown'),
                "doc_type": metadata.get('doc_type', 'Unknown'),
                "page": metadata.get('page', 'N/A'),
                "chunk_index": metadata.get('chunk_index', 0),
                "relevance_score": round(score, 3),
                "equipment_type": metadata.get('equipment_type'),
                "voltage_level": metadata.get('voltage_level'),
                "text_preview": doc.page_content[:200] + "..." if len(doc.page_content) > 200 else doc.page_content,
            }
            citations.append(citation)
        
        # Limit citations
        return citations[:settings.MAX_CITATIONS]


# Singleton instance
llm_service = LLMService()
