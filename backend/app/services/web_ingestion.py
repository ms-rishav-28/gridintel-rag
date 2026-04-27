"""
web_ingestion.py - Ingest web pages into the RAG pipeline.

Tier 1: trafilatura
Tier 2: newspaper3k
Tier 3: BeautifulSoup4 + lxml
Tier 4: Playwright (gated by ENABLE_BROWSER_INGESTION)
"""

# CODEX-FIX: add tiered web ingestion with robots.txt checks and optional vision image chunks.

import asyncio
import logging
import uuid
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

from app.core.config import get_settings
from app.services.convex_service import get_convex_service
from app.services.document_processor import get_document_processor
from app.services.embedding_service import get_embedding_service
from app.services.vector_store import ChunkRecord, get_vector_store
from app.services.vision_service import get_vision_service

logger = logging.getLogger(__name__)
settings = get_settings()

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def _is_robots_allowed(url: str) -> bool:
    try:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        rp = RobotFileParser()
        rp.set_url(robots_url)
        rp.read()
        return rp.can_fetch("*", url)
    except Exception:
        return True


async def _fetch_with_trafilatura(url: str) -> str | None:
    import httpx
    import trafilatura

    try:
        async with httpx.AsyncClient(
            headers={"User-Agent": UA},
            timeout=30,
            follow_redirects=True,
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
        text = trafilatura.extract(
            response.text,
            include_tables=True,
            include_images=False,
            include_links=False,
            output_format="markdown",
            url=url,
        )
        return text if text and len(text) > 200 else None
    except Exception as exc:
        logger.warning("trafilatura failed for %s: %s", url, exc)
        return None


async def _fetch_with_newspaper(url: str) -> str | None:
    try:
        import newspaper

        article = newspaper.Article(url, fetch_images=False)
        await asyncio.to_thread(article.download)
        await asyncio.to_thread(article.parse)
        return article.text if article.text and len(article.text) > 200 else None
    except Exception as exc:
        logger.warning("newspaper3k failed for %s: %s", url, exc)
        return None


async def _fetch_with_bs4(url: str) -> tuple[str | None, str]:
    """Returns (text, page_title)."""
    import httpx
    from bs4 import BeautifulSoup

    try:
        async with httpx.AsyncClient(
            headers={"User-Agent": UA},
            timeout=30,
            follow_redirects=True,
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        title = soup.title.string.strip() if soup.title and soup.title.string else urlparse(url).netloc
        text = soup.get_text(separator="\n", strip=True)
        return (text if len(text) > 200 else None), title
    except Exception as exc:
        logger.warning("BeautifulSoup fallback failed for %s: %s", url, exc)
        return None, ""


async def _fetch_with_playwright(url: str) -> str | None:
    if not settings.ENABLE_BROWSER_INGESTION:
        return None
    try:
        from playwright.async_api import async_playwright
        import trafilatura

        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            page = await browser.new_page(user_agent=UA)
            await page.goto(url, timeout=30000, wait_until="networkidle")
            content = await page.content()
            await browser.close()

        text = trafilatura.extract(
            content,
            include_tables=True,
            output_format="markdown",
            url=url,
        )
        return text if text and len(text) > 200 else None
    except Exception as exc:
        logger.warning("Playwright failed for %s: %s", url, exc)
        return None


async def _extract_page_images(url: str, max_images: int = 8) -> list[dict]:
    """Download up to max_images from a page for vision processing."""
    import httpx
    from bs4 import BeautifulSoup

    images: list[dict] = []
    try:
        async with httpx.AsyncClient(
            headers={"User-Agent": UA},
            timeout=20,
            follow_redirects=True,
        ) as client:
            response = await client.get(url)
            soup = BeautifulSoup(response.text, "lxml")
            srcs = [
                urljoin(url, img["src"])
                for img in soup.find_all("img", src=True)
                if img.get("src")
            ][:max_images]
            for index, src in enumerate(srcs):
                try:
                    image_response = await client.get(src, timeout=10)
                    if (
                        image_response.status_code == 200
                        and "image" in image_response.headers.get("content-type", "")
                    ):
                        images.append(
                            {
                                "bytes": image_response.content,
                                "page_number": 1,
                                "image_index": index,
                            }
                        )
                except Exception:
                    continue
    except Exception as exc:
        logger.warning("Page image extraction failed for %s: %s", url, exc)
    return images


async def ingest_url(url: str, doc_id: str, job_id: str) -> dict[str, int | str | None]:
    """
    Full URL ingestion pipeline.
    Updates Convex job status throughout.
    Returns { chunk_count, image_count, page_title, error }.
    """
    convex = get_convex_service()
    processor = get_document_processor()
    vision = get_vision_service()
    embedder = get_embedding_service()
    store = get_vector_store()

    try:
        await convex.update_job(
            job_id,
            status="processing",
            progress_message="Checking robots.txt...",
        )

        if not _is_robots_allowed(url):
            raise ValueError(f"robots.txt disallows crawling {url}")

        await convex.update_job(job_id, progress_message="Fetching page content...")
        await convex.update_document(doc_id, ingestion_status="processing")

        page_title = urlparse(url).netloc
        text = await _fetch_with_trafilatura(url)

        if not text:
            text = await _fetch_with_newspaper(url)

        if not text:
            text, page_title = await _fetch_with_bs4(url)

        if not text:
            text = await _fetch_with_playwright(url)

        if not text:
            raise ValueError("All fetch strategies failed to extract meaningful content.")

        await convex.update_job(job_id, progress_message="Chunking and embedding text...")
        text_chunks = await processor._chunk_and_embed(
            text,
            doc_id,
            page_title or url,
            source_type="webpage",
            source_url=url,
        )

        image_chunks: list[ChunkRecord] = []
        if settings.ENABLE_VISION:
            await convex.update_job(job_id, progress_message="Processing page images...")
            raw_images = await _extract_page_images(url)
            for image in raw_images:
                desc = await vision.describe_image(
                    image["bytes"],
                    image["page_number"],
                    image["image_index"],
                )
                if desc:
                    vector = (await embedder.async_encode_dense([desc]))[0]
                    image_chunks.append(
                        ChunkRecord(
                            chunk_id=str(uuid.uuid4()),
                            doc_id=doc_id,
                            doc_name=page_title or url,
                            source_type="webpage",
                            source_url=url,
                            page_number=1,
                            chunk_index=image["image_index"],
                            section_heading=None,
                            chunk_type="image_description",
                            content=desc,
                            vector=vector,
                        )
                    )

        all_chunks = text_chunks + image_chunks
        await convex.update_job(job_id, progress_message="Indexing into vector store...")
        await store.add_chunks(all_chunks)

        await convex.update_document(
            doc_id,
            ingestion_status="done",
            chunk_count=len(all_chunks),
            image_count=len(image_chunks),
        )
        await convex.update_job(
            job_id,
            status="done",
            progress_message="Done",
            total_chunks=len(all_chunks),
            processed_chunks=len(all_chunks),
        )
        return {
            "chunk_count": len(all_chunks),
            "image_count": len(image_chunks),
            "page_title": page_title,
            "error": None,
        }

    except Exception as exc:
        logger.error("URL ingestion failed for %s: %s", url, exc, exc_info=True)
        await convex.update_document(
            doc_id,
            ingestion_status="failed",
            error_message=str(exc),
        )
        await convex.update_job(job_id, status="failed", error_message=str(exc))
        return {"chunk_count": 0, "image_count": 0, "page_title": "", "error": str(exc)}
