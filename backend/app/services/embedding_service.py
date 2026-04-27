"""
embedding_service.py - BGE-M3 dense + sparse embeddings.

Lazy-loads on first use. Thread-safe singleton.
"""

# CODEX-FIX: add BGE-M3 embedding service with async wrappers for ingestion and querying.

import asyncio
import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)


class EmbeddingService:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self._model = None
        self._model_lock = threading.Lock()

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def _load_model(self):
        with self._model_lock:
            if self._model is not None:
                return
            logger.info("Loading BGE-M3 embedding model")
            import time
            from FlagEmbedding import BGEM3FlagModel
            from app.core.config import get_settings

            started = time.time()
            device = get_settings().EMBEDDING_DEVICE
            self._model = BGEM3FlagModel(
                get_settings().EMBEDDING_MODEL,
                use_fp16=(device != "cpu"),
                device=device,
            )
            logger.info(
                "BGE-M3 embedding model loaded in %.1fs on %s",
                time.time() - started,
                device,
            )

    def _ensure_loaded(self):
        if self._model is None:
            self._load_model()

    def encode_dense(self, texts: list[str]) -> list[list[float]]:
        self._ensure_loaded()
        all_vectors: list[list[float]] = []
        batch_size = 32
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            out = self._model.encode(
                batch,
                batch_size=len(batch),
                max_length=512,
                return_dense=True,
                return_sparse=False,
                return_colbert_vecs=False,
            )
            all_vectors.extend(out["dense_vecs"].tolist())
        return all_vectors

    def encode_query(self, query: str) -> tuple[list[float], dict[str, Any]]:
        """Returns (dense_vector, sparse_weights_dict) for hybrid search."""
        self._ensure_loaded()
        out = self._model.encode(
            [query],
            batch_size=1,
            max_length=512,
            return_dense=True,
            return_sparse=True,
            return_colbert_vecs=False,
        )
        dense = out["dense_vecs"][0].tolist()
        sparse = out["lexical_weights"][0]
        return dense, sparse

    async def async_encode_dense(self, texts: list[str]) -> list[list[float]]:
        return await asyncio.to_thread(self.encode_dense, texts)

    async def async_encode_query(self, query: str):
        return await asyncio.to_thread(self.encode_query, query)


_embedding_service: EmbeddingService | None = None


def get_embedding_service() -> EmbeddingService:
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
