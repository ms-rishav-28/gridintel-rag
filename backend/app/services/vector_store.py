"""
vector_store.py - LanceDB-backed vector store for POWERGRID SmartOps.

Storage layout:
  LANCEDB_PATH/
    powergrid_chunks.lance/   <- main table, Arrow format, crash-safe
    powergrid_chunks.lance/_indices/  <- FTS index

Data flow:
  ingest  -> EmbeddingService.encode_dense() -> ChunkRecord -> table.add()
  query   -> hybrid_search() -> rerank() -> top-5 chunks -> LLM
  delete  -> table.delete(f"doc_id = '{doc_id}'")
  reindex -> delete all -> re-add from re-processed documents
"""

# CODEX-FIX: replace the legacy SQLite-backed vector store with crash-safe LanceDB storage.

import asyncio
import logging
import os
from typing import Any

import lancedb
from lancedb.pydantic import LanceModel, Vector

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# -- Schema --------------------------------------------------------------------

class ChunkRecord(LanceModel):
    chunk_id: str
    doc_id: str
    doc_name: str
    source_type: str
    source_url: str | None
    page_number: int | None
    chunk_index: int
    section_heading: str | None
    chunk_type: str
    content: str
    vector: Vector(1024)


# -- Service -------------------------------------------------------------------

class VectorStore:
    TABLE_NAME = "powergrid_chunks"

    def __init__(self):
        self._db: lancedb.AsyncConnection | None = None
        self._table = None
        self._ready = False

    async def initialize(self) -> None:
        """Connect to or create the LanceDB database. Called once at startup."""
        path = settings.LANCEDB_PATH
        os.makedirs(path, exist_ok=True)
        logger.info("Initialising LanceDB at %s", path)

        self._db = await lancedb.connect_async(path)
        existing = await self._db.table_names()

        if self.TABLE_NAME in existing:
            self._table = await self._db.open_table(self.TABLE_NAME)
            schema = await self._table.schema()
            vec_field = next((field for field in schema if field.name == "vector"), None)
            if vec_field is not None:
                stored_dim = vec_field.type.list_size
                if stored_dim != 1024:
                    logger.critical(
                        "LanceDB embedding dimension mismatch: stored=%s current=1024",
                        stored_dim,
                    )
                    await self._db.drop_table(self.TABLE_NAME)
                    await self._create_table()
            logger.info(
                "LanceDB table %s opened with %s rows",
                self.TABLE_NAME,
                await self._table.count_rows(),
            )
        else:
            await self._create_table()

        self._ready = True

    async def _create_table(self) -> None:
        """Create the table and enable full-text search index."""
        if self._db is None:
            raise RuntimeError("LanceDB connection is not initialized")
        self._table = await self._db.create_table(
            self.TABLE_NAME,
            schema=ChunkRecord,
            mode="overwrite",
        )
        await self._table.create_fts_index("content", replace=True)
        logger.info("Created LanceDB table %s", self.TABLE_NAME)

    def _ensure_ready(self) -> None:
        if not self._ready or self._table is None:
            raise RuntimeError("LanceDB vector store is not initialized")

    # -- Write ------------------------------------------------------------------

    async def add_chunks(self, chunks: list[ChunkRecord]) -> None:
        """Batch upsert chunks. Existing chunk_ids are replaced."""
        if not chunks:
            return
        self._ensure_ready()
        records = [chunk.model_dump() for chunk in chunks]
        await asyncio.to_thread(
            lambda: self._table.merge_insert("chunk_id")
            .when_matched_update_all()
            .when_not_matched_insert_all()
            .execute(records)
        )

    async def delete_by_doc_id(self, doc_id: str) -> int:
        """Delete all chunks for a document. Returns deleted row count."""
        self._ensure_ready()
        before = await self._table.count_rows()
        escaped_doc_id = doc_id.replace("'", "''")
        await self._table.delete(f"doc_id = '{escaped_doc_id}'")
        after = await self._table.count_rows()
        deleted = before - after
        logger.info("Deleted %s chunks for doc_id=%s", deleted, doc_id)
        return deleted

    async def delete_all(self) -> None:
        """Wipe the entire table. Used before a full reindex."""
        if self._db is None:
            raise RuntimeError("LanceDB connection is not initialized")
        await self._db.drop_table(self.TABLE_NAME)
        await self._create_table()
        self._ready = True
        logger.warning("lancedb_table_wiped_for_reindex")

    # -- Read -------------------------------------------------------------------

    async def dense_search(
        self,
        query_vector: list[float],
        top_k: int = 20,
        where: str | None = None,
    ) -> list[dict[str, Any]]:
        """ANN search using dense BGE-M3 embeddings."""
        self._ensure_ready()
        query = self._table.vector_search(query_vector).limit(top_k)
        if where:
            query = query.where(where)
        return await query.to_list()

    async def hybrid_search(
        self,
        query_text: str,
        query_vector: list[float],
        top_k: int = 20,
        where: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Hybrid dense ANN + full-text search, merged via Reciprocal Rank Fusion.
        Returns up to top_k deduplicated results ranked by RRF score.
        """
        self._ensure_ready()
        dense_results = await self.dense_search(query_vector, top_k * 2, where)

        fts_query = self._table.fts_search(query_text).limit(top_k * 2)
        if where:
            fts_query = fts_query.where(where)
        fts_results = await fts_query.to_list()

        scores: dict[str, float] = {}
        records: dict[str, dict[str, Any]] = {}

        for rank, row in enumerate(dense_results):
            chunk_id = row["chunk_id"]
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (60 + rank + 1)
            records[chunk_id] = row

        for rank, row in enumerate(fts_results):
            chunk_id = row["chunk_id"]
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (60 + rank + 1)
            records[chunk_id] = row

        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:top_k]
        merged: list[dict[str, Any]] = []
        for chunk_id, score in ranked:
            row = records[chunk_id].copy()
            row["rrf_score"] = score
            merged.append(row)

        return merged

    async def list_doc_ids(self) -> list[str]:
        self._ensure_ready()
        rows = await self._table.query().select(["doc_id"]).to_list()
        return list({row["doc_id"] for row in rows})

    async def get_stats(self) -> dict[str, Any]:
        self._ensure_ready()
        row_count = await self._table.count_rows()
        db_path = settings.LANCEDB_PATH
        try:
            size_bytes = sum(
                os.path.getsize(os.path.join(dirpath, filename))
                for dirpath, _, filenames in os.walk(db_path)
                for filename in filenames
            )
        except Exception:
            size_bytes = -1
        return {
            "status": "healthy" if self._ready else "not_ready",
            "row_count": row_count,
            "path": db_path,
            "size_bytes": size_bytes,
        }


_vector_store: VectorStore | None = None


def get_vector_store() -> VectorStore:
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store
