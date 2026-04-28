"""Bulk ingestion runner for the POWERGRID source catalog.

This script ingests curated sources from backend/ingestion/source_catalog.json into
the existing RAG pipeline (document processor -> vector store -> Convex metadata).

Supported automated source types:
- pdf_catalog: crawls page(s) for PDF links, then ingests the discovered files
- webpage: ingests page text directly by URL
- wikipedia: ingests page text directly by URL

Unsupported source types are skipped and listed in the generated report.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import mimetypes
import sys
import uuid
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urldefrag, urljoin, urlparse

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.logging import get_logger, setup_logging
from app.services.convex_service import get_convex_service
from app.services.document_processor import get_document_processor
from app.services.vector_store import get_vector_store
from app.services.web_ingestion import ingest_url

logger = get_logger(__name__)
SUPPORTED_SOURCE_TYPES = {"pdf_catalog", "webpage", "wikipedia"}


class AnchorLinkExtractor(HTMLParser):
    """Extract anchor href values from HTML pages."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[tuple[str, Optional[str]]]) -> None:
        if tag.lower() != "a":
            return
        attrs_map = {k.lower(): v for k, v in attrs}
        href = attrs_map.get("href")
        if href:
            self.links.append(href)


class CatalogIngestionRunner:
    """Orchestrates catalog-driven ingestion into vector and metadata stores."""

    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.catalog_path = Path(args.catalog_path)
        self.report_path = self._resolve_report_path(args.report_path)
        self.existing_doc_ids: Set[str] = set()
        # CODEX-FIX: track durable Convex identifiers after moving ingestion to UUID doc IDs.
        self.existing_source_urls: Set[str] = set()
        self.existing_hashes: Set[str] = set()
        self.http_timeout = httpx.Timeout(timeout=25.0, connect=10.0, read=20.0)
        self.verify_tls = not args.allow_insecure_tls

    def _resolve_report_path(self, report_path: str) -> Path:
        if report_path:
            return Path(report_path)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        return REPO_ROOT / "data" / "ingestion_reports" / f"source_ingestion_{timestamp}.json"

    def _load_catalog(self) -> Dict[str, Any]:
        if not self.catalog_path.exists():
            raise FileNotFoundError(f"Catalog file not found: {self.catalog_path}")

        return json.loads(self.catalog_path.read_text(encoding="utf-8"))

    def _select_sources(self, all_sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        selected = all_sources

        if self.args.source_ids:
            id_filter = {value.strip() for value in self.args.source_ids if value.strip()}
            selected = [source for source in selected if source.get("id") in id_filter]

        if self.args.categories:
            category_filter = {value.strip() for value in self.args.categories if value.strip()}
            selected = [source for source in selected if source.get("category") in category_filter]

        if self.args.source_types:
            type_filter = {value.strip() for value in self.args.source_types if value.strip()}
            selected = [source for source in selected if source.get("source_type") in type_filter]

        return selected

    def _is_supported_source(self, source: Dict[str, Any]) -> bool:
        return source.get("source_type") in SUPPORTED_SOURCE_TYPES

    def _build_source_metadata(self, source: Dict[str, Any]) -> Dict[str, Any]:
        metadata = {
            k: v
            for k, v in (source.get("default_metadata") or {}).items()
            if v is not None and str(v).strip() != ""
        }
        metadata.update(
            {
                "catalog_source_id": source.get("id"),
                "source_category": source.get("category"),
                "source_priority": source.get("priority"),
                "source_title": source.get("title"),
                "source_ingestion_method": source.get("ingestion_method"),
            }
        )
        return metadata

    def _normalize_http_url(self, raw_url: str, base_url: str) -> Optional[str]:
        candidate = (raw_url or "").strip()
        if not candidate:
            return None

        joined = urljoin(base_url, candidate)
        joined = urldefrag(joined).url
        parsed = urlparse(joined)

        if parsed.scheme not in {"http", "https"}:
            return None
        if not parsed.netloc:
            return None

        return joined

    def _looks_like_pdf_link(self, url: str) -> bool:
        parsed = urlparse(url)
        path_lower = parsed.path.lower()
        query_lower = parsed.query.lower()
        return path_lower.endswith(".pdf") or ".pdf" in path_lower or ".pdf" in query_lower

    async def _discover_pdf_links(self, client: httpx.AsyncClient, page_url: str) -> List[str]:
        try:
            response = await client.get(page_url, follow_redirects=True)
            response.raise_for_status()
        except Exception as e:
            # CODEX-FIX: stdlib logger does not accept structlog-style keyword fields.
            logger.warning("pdf_catalog_fetch_failed page_url=%s error=%s", page_url, e)
            return []

        extractor = AnchorLinkExtractor()
        extractor.feed(response.text)
        extractor.close()

        discovered: List[str] = []
        seen: Set[str] = set()

        for href in extractor.links:
            normalized = self._normalize_http_url(href, page_url)
            if not normalized:
                continue
            if normalized in seen:
                continue
            if not self._looks_like_pdf_link(normalized):
                continue
            seen.add(normalized)
            discovered.append(normalized)
            if len(discovered) >= self.args.max_pdf_links_per_page:
                break

        return discovered

    async def _candidate_urls_for_source(
        self,
        client: httpx.AsyncClient,
        source: Dict[str, Any],
    ) -> List[str]:
        source_type = source.get("source_type")
        base_urls = [
            url.strip()
            for url in (source.get("urls") or [])
            if isinstance(url, str) and url.strip()
        ]

        if source_type == "pdf_catalog":
            candidates: List[str] = []
            seen: Set[str] = set()
            for page_url in base_urls:
                pdf_links = await self._discover_pdf_links(client, page_url)
                for link in pdf_links:
                    if link in seen:
                        continue
                    seen.add(link)
                    candidates.append(link)

            if not candidates:
                # Fallback to ingesting the listing pages themselves when no direct PDFs are visible.
                return base_urls[: self.args.max_urls_per_source]

            return candidates[: self.args.max_urls_per_source]

        # webpage and wikipedia directly ingest the listed URLs.
        return base_urls[: self.args.max_urls_per_source]

    async def _load_existing_doc_ids(self) -> None:
        if self.args.dry_run:
            return

        doc_ids: Set[str] = set()
        try:
            convex_docs = await get_convex_service().list_documents()
            for doc in convex_docs:
                doc_id = doc.get("docId") or doc.get("doc_id")
                if doc_id:
                    doc_ids.add(doc_id)
                source_url = doc.get("sourceUrl") or doc.get("source_url")
                if source_url:
                    self.existing_source_urls.add(source_url)
                sha256 = doc.get("sha256")
                if sha256:
                    self.existing_hashes.add(sha256)
        except Exception as e:
            logger.warning("existing_docs_convex_list_failed error=%s", e)

        if not doc_ids:
            try:
                vector_doc_ids = await get_vector_store().list_doc_ids()
                doc_ids.update(vector_doc_ids)
            except Exception as e:
                logger.warning("existing_docs_vector_list_failed error=%s", e)

        self.existing_doc_ids = doc_ids

    async def _store_file_in_convex(
        self,
        client: httpx.AsyncClient,
        file_bytes: bytes,
        filename: str,
        content_type: str,
    ) -> str | None:
        """Store downloaded catalog files in Convex so reindex can rebuild LanceDB."""
        convex = get_convex_service()
        if not convex.enabled:
            return None

        upload_url = await convex.generate_upload_url()
        if not upload_url:
            raise RuntimeError("Convex upload URL could not be generated")

        # CODEX-FIX: preserve catalog-downloaded originals in Convex File Storage.
        response = await client.post(
            upload_url,
            content=file_bytes,
            headers={"Content-Type": content_type or "application/octet-stream"},
        )
        response.raise_for_status()
        storage_id = response.json().get("storageId")
        if not storage_id:
            raise RuntimeError(f"Convex storage upload for {filename} did not return storageId")
        return storage_id

    async def _ingest_downloaded_file(
        self,
        client: httpx.AsyncClient,
        source: Dict[str, Any],
        url: str,
    ) -> Dict[str, Any]:
        source_id = source.get("id", "unknown")
        response = await client.get(url, follow_redirects=True)
        response.raise_for_status()

        file_bytes = response.content
        sha256 = hashlib.sha256(file_bytes).hexdigest()
        if not self.args.allow_duplicate_doc_ids and sha256 in self.existing_hashes:
            return {
                "status": "skipped_duplicate",
                "source_id": source_id,
                "url": url,
                "reason": "sha256 already exists in Convex",
            }

        doc_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())
        parsed = urlparse(url)
        filename = Path(parsed.path).name or f"{source_id}.pdf"
        content_type = response.headers.get("content-type") or mimetypes.guess_type(filename)[0] or "application/pdf"
        storage_id = await self._store_file_in_convex(client, file_bytes, filename, content_type)

        convex = get_convex_service()
        await convex.create_document(
            doc_id=doc_id,
            name=filename,
            source_type="pdf",
            source_url=url,
            storage_id=storage_id,
            file_size_bytes=len(file_bytes),
            sha256=sha256,
        )
        await convex.create_job(job_id=job_id, source_type="pdf", doc_id=doc_id, source_url=url)

        result = await get_document_processor().ingest_file(
            file_bytes=file_bytes,
            filename=filename,
            doc_id=doc_id,
            job_id=job_id,
            storage_id=storage_id,
        )
        if result.get("error"):
            return {
                "status": "failed",
                "source_id": source_id,
                "url": url,
                "doc_id": doc_id,
                "error": result["error"],
                "details": {},
            }

        self.existing_doc_ids.add(doc_id)
        self.existing_hashes.add(sha256)
        return {
            "status": "ingested",
            "source_id": source_id,
            "url": url,
            "doc_id": doc_id,
            "filename": filename,
            "chunks_processed": result.get("chunk_count", 0),
            "doc_type": "pdf",
        }

    async def _ingest_single_url(
        self,
        client: httpx.AsyncClient,
        source: Dict[str, Any],
        url: str,
    ) -> Dict[str, Any]:
        source_id = source.get("id", "unknown")

        if self.args.dry_run:
            return {
                "status": "planned",
                "source_id": source_id,
                "url": url,
            }

        # CODEX-FIX: route catalog ingestion through the current web/file pipelines.
        if self._looks_like_pdf_link(url):
            try:
                return await self._ingest_downloaded_file(client, source, url)
            except Exception as e:
                return {
                    "status": "failed",
                    "source_id": source_id,
                    "url": url,
                    "error": str(e),
                    "details": {},
                }

        if not self.args.allow_duplicate_doc_ids and url in self.existing_source_urls:
            return {
                "status": "skipped_duplicate",
                "source_id": source_id,
                "url": url,
                "reason": "sourceUrl already exists in Convex",
            }

        doc_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())
        convex = get_convex_service()
        title = source.get("title") or urlparse(url).netloc

        try:
            await convex.create_document(
                doc_id=doc_id,
                name=title,
                source_type="webpage",
                source_url=url,
            )
            await convex.create_job(job_id=job_id, source_type="webpage", doc_id=doc_id, source_url=url)
            result = await ingest_url(url, doc_id, job_id)
        except Exception as e:
            return {
                "status": "failed",
                "source_id": source_id,
                "url": url,
                "doc_id": doc_id,
                "error": str(e),
                "details": {},
            }

        if result.get("error"):
            return {
                "status": "failed",
                "source_id": source_id,
                "url": url,
                "doc_id": doc_id,
                "error": result["error"],
                "details": {},
            }

        self.existing_doc_ids.add(doc_id)
        self.existing_source_urls.add(url)
        return {
            "status": "ingested",
            "source_id": source_id,
            "url": url,
            "doc_id": doc_id,
            "filename": result.get("page_title") or title,
            "chunks_processed": result.get("chunk_count", 0),
            "doc_type": "webpage",
        }

    async def run(self) -> Dict[str, Any]:
        catalog = self._load_catalog()
        all_sources = catalog.get("sources") or []
        selected_sources = self._select_sources(all_sources)

        if not selected_sources:
            raise ValueError("No catalog sources matched your filters.")

        if not self.args.dry_run:
            # CODEX-FIX: standalone script must initialise LanceDB outside FastAPI lifespan.
            await get_vector_store().initialize()
        await self._load_existing_doc_ids()

        report: Dict[str, Any] = {
            "catalog_version": catalog.get("catalog_version"),
            "started_at": datetime.now(timezone.utc).isoformat(),
            "dry_run": self.args.dry_run,
            "filters": {
                "source_ids": self.args.source_ids,
                "categories": self.args.categories,
                "source_types": self.args.source_types,
                "max_urls_per_source": self.args.max_urls_per_source,
                "max_pdf_links_per_page": self.args.max_pdf_links_per_page,
                "allow_insecure_tls": self.args.allow_insecure_tls,
            },
            "totals": {
                "sources_selected": len(selected_sources),
                "urls_attempted": 0,
                "ingested": 0,
                "failed": 0,
                "planned": 0,
                "skipped_duplicate": 0,
                "skipped_unsupported_source_type": 0,
            },
            "sources": [],
        }

        async with httpx.AsyncClient(timeout=self.http_timeout, verify=self.verify_tls) as client:
            for source in selected_sources:
                source_id = source.get("id", "unknown")
                source_type = source.get("source_type", "unknown")

                source_result: Dict[str, Any] = {
                    "source_id": source_id,
                    "source_type": source_type,
                    "title": source.get("title"),
                    "status": "pending",
                    "urls": [],
                }

                if not self._is_supported_source(source):
                    source_result["status"] = "skipped_unsupported_source_type"
                    source_result["reason"] = (
                        "Automated ingestion currently supports only pdf_catalog, webpage, wikipedia."
                    )
                    report["sources"].append(source_result)
                    report["totals"]["skipped_unsupported_source_type"] += 1
                    continue

                candidate_urls = await self._candidate_urls_for_source(client, source)
                if not candidate_urls:
                    source_result["status"] = "no_candidate_urls"
                    report["sources"].append(source_result)
                    continue

                source_result["status"] = "processed"

                for url in candidate_urls:
                    report["totals"]["urls_attempted"] += 1
                    item_result = await self._ingest_single_url(client, source, url)
                    source_result["urls"].append(item_result)

                    status = item_result.get("status")
                    if status == "ingested":
                        report["totals"]["ingested"] += 1
                    elif status == "failed":
                        report["totals"]["failed"] += 1
                    elif status == "planned":
                        report["totals"]["planned"] += 1
                    elif status == "skipped_duplicate":
                        report["totals"]["skipped_duplicate"] += 1

                report["sources"].append(source_result)

        report["completed_at"] = datetime.now(timezone.utc).isoformat()

        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        self.report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

        return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Bulk ingest sources from backend/ingestion/source_catalog.json"
    )
    parser.add_argument(
        "--catalog-path",
        default=str(BACKEND_DIR / "ingestion" / "source_catalog.json"),
        help="Path to source catalog JSON file.",
    )
    parser.add_argument(
        "--source-ids",
        nargs="*",
        default=[],
        help="Optional source IDs to ingest. If omitted, all sources are eligible.",
    )
    parser.add_argument(
        "--categories",
        nargs="*",
        default=[],
        help="Optional category filter(s).",
    )
    parser.add_argument(
        "--source-types",
        nargs="*",
        default=[],
        help="Optional source_type filter(s).",
    )
    parser.add_argument(
        "--max-urls-per-source",
        type=int,
        default=5,
        help="Maximum URLs to ingest per source entry.",
    )
    parser.add_argument(
        "--max-pdf-links-per-page",
        type=int,
        default=40,
        help="Maximum PDF links discovered per listing page before truncation.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Resolve source URLs and produce report without ingesting.",
    )
    parser.add_argument(
        "--allow-duplicate-doc-ids",
        action="store_true",
        help="Allow reprocessing content whose doc_id already exists.",
    )
    parser.add_argument(
        "--report-path",
        default="",
        help="Optional custom path for output report JSON.",
    )
    parser.add_argument(
        "--allow-insecure-tls",
        action="store_true",
        help=(
            "Disable TLS certificate verification for external fetches in this script only. "
            "Use only if required for sources with certificate-chain issues."
        ),
    )
    return parser


def main() -> int:
    setup_logging()
    parser = build_parser()
    args = parser.parse_args()

    runner = CatalogIngestionRunner(args)

    try:
        report = asyncio.run(runner.run())
    except Exception as e:
        logger.error("catalog_ingestion_failed error=%s", e)
        print(f"ERROR: {e}")
        return 1

    totals = report.get("totals", {})
    print("Catalog ingestion completed.")
    print(f"  Sources selected: {totals.get('sources_selected', 0)}")
    print(f"  URLs attempted:   {totals.get('urls_attempted', 0)}")
    print(f"  Ingested:         {totals.get('ingested', 0)}")
    print(f"  Planned:          {totals.get('planned', 0)}")
    print(f"  Failed:           {totals.get('failed', 0)}")
    print(f"  Duplicates:       {totals.get('skipped_duplicate', 0)}")
    print(f"  Unsupported:      {totals.get('skipped_unsupported_source_type', 0)}")
    print(f"  Report:           {runner.report_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
