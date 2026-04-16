"""Document processing service for ingesting POWERGRID documents."""

import os
import io
import hashlib
import ipaddress
import re
import socket
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
import tempfile
from urllib.parse import unquote, urlparse

import httpx
from langchain.schema import Document as LangChainDocument
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import (
    PyPDFLoader,
    Docx2txtLoader,
    TextLoader,
)

from app.core.config import get_settings
from app.core.exceptions import DocumentProcessingError
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class _HTMLTextExtractor(HTMLParser):
    """Extract visible text from an HTML page."""

    _block_tags = {
        "p", "div", "br", "li", "section", "article", "header", "footer",
        "h1", "h2", "h3", "h4", "h5", "h6", "tr", "td", "th",
    }
    _skip_tags = {"script", "style", "noscript", "svg", "canvas"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._parts: List[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs):
        tag_name = tag.lower()
        if tag_name in self._skip_tags:
            self._skip_depth += 1
        if self._skip_depth == 0 and tag_name in self._block_tags:
            self._parts.append("\n")

    def handle_endtag(self, tag: str):
        tag_name = tag.lower()
        if tag_name in self._skip_tags and self._skip_depth > 0:
            self._skip_depth -= 1
            return
        if self._skip_depth == 0 and tag_name in self._block_tags:
            self._parts.append("\n")

    def handle_data(self, data: str):
        if self._skip_depth > 0:
            return
        cleaned = data.strip()
        if cleaned:
            self._parts.append(cleaned)

    def get_text(self) -> str:
        raw_text = " ".join(self._parts)
        normalized = re.sub(r"\s*\n\s*", "\n", raw_text)
        normalized = re.sub(r"\n{3,}", "\n\n", normalized)
        normalized = re.sub(r"[ \t]{2,}", " ", normalized)
        return normalized.strip()


@dataclass
class ProcessedDocument:
    """Represents a processed document with metadata."""
    doc_id: str
    chunks: List[LangChainDocument]
    metadata: Dict[str, Any]
    total_chunks: int
    file_hash: str


class DocumentProcessor:
    """Handles document loading, processing, and chunking."""
    
    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", ".", "!", "?", ";", ",", " ", ""],
        )
        self.upload_dir = Path(settings.UPLOAD_DIR)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
    
    def _compute_file_hash(self, file_content: bytes) -> str:
        """Compute SHA-256 hash of file content."""
        return hashlib.sha256(file_content).hexdigest()
    
    def _detect_document_type(self, filename: str, content: bytes) -> str:
        """Detect document type from filename and content."""
        ext = Path(filename).suffix.lower()
        
        type_mapping = {
            '.pdf': 'CEA_GUIDELINE' if 'cea' in filename.lower() else 
                    'IT_CIRCULAR' if 'it' in filename.lower() or 'circular' in filename.lower()
                    else 'TECHNICAL_MANUAL',
            '.docx': 'CEA_GUIDELINE' if 'cea' in filename.lower() else 
                     'IT_CIRCULAR' if 'it' in filename.lower() or 'circular' in filename.lower()
                     else 'TECHNICAL_MANUAL',
            '.doc': 'CEA_GUIDELINE' if 'cea' in filename.lower() else 
                    'IT_CIRCULAR' if 'it' in filename.lower() or 'circular' in filename.lower()
                    else 'TECHNICAL_MANUAL',
            '.txt': 'TEXT_DOCUMENT',
        }
        
        return type_mapping.get(ext, 'UNKNOWN')
    
    def _extract_metadata(self, filename: str, content: bytes, doc_type: str) -> Dict[str, Any]:
        """Extract metadata from document filename and content."""
        metadata = {
            'source': filename,
            'doc_type': doc_type,
            'file_size': len(content),
            'file_hash': self._compute_file_hash(content),
        }
        
        # Extract potential equipment types from filename
        equipment_keywords = {
            'transformer': 'TRANSFORMER',
            'breaker': 'CIRCUIT_BREAKER',
            'cb': 'CIRCUIT_BREAKER',
            'line': 'TRANSMISSION_LINE',
            'bay': 'SUBSTATION_BAY',
            'protection': 'PROTECTION_SYSTEM',
            'relay': 'PROTECTION_RELAY',
            'insulator': 'INSULATOR',
            'busbar': 'BUSBAR',
            'ct': 'CURRENT_TRANSFORMER',
            'pt': 'POTENTIAL_TRANSFORMER',
            'vt': 'VOLTAGE_TRANSFORMER',
        }
        
        filename_lower = filename.lower()
        for keyword, equipment_type in equipment_keywords.items():
            if keyword in filename_lower:
                metadata['equipment_type'] = equipment_type
                break
        
        # Extract voltage level if present (e.g., 220kV, 400kV)
        import re
        voltage_pattern = r'(\d+)\s*kV'
        voltage_matches = re.findall(voltage_pattern, filename, re.IGNORECASE)
        if voltage_matches:
            metadata['voltage_level'] = f"{voltage_matches[0]} kV"
        
        return metadata

    def _validate_source_url(self, url: str) -> str:
        """Validate URL format and block local/private network targets."""
        normalized_url = url.strip()
        parsed = urlparse(normalized_url)

        if parsed.scheme not in {"http", "https"}:
            raise DocumentProcessingError(
                "Only HTTP/HTTPS URLs are supported",
                details={"url": url},
            )

        if not parsed.hostname:
            raise DocumentProcessingError(
                "URL must include a valid hostname",
                details={"url": url},
            )

        hostname = parsed.hostname.lower()
        blocked_hostnames = {"localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"}
        if hostname in blocked_hostnames or hostname.endswith(".local"):
            raise DocumentProcessingError(
                "Local or internal URLs are not allowed",
                details={"url": normalized_url},
            )

        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        try:
            addr_info = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        except socket.gaierror as e:
            raise DocumentProcessingError(
                "Unable to resolve URL hostname",
                details={"url": normalized_url, "error": str(e)},
            )

        for info in addr_info:
            ip_value = info[4][0]
            try:
                ip_obj = ipaddress.ip_address(ip_value)
            except ValueError:
                continue

            if (
                ip_obj.is_loopback
                or ip_obj.is_private
                or ip_obj.is_link_local
                or ip_obj.is_multicast
                or ip_obj.is_reserved
                or ip_obj.is_unspecified
            ):
                raise DocumentProcessingError(
                    "URL resolves to a non-public address and cannot be ingested",
                    details={"url": normalized_url, "ip": ip_value},
                )

        return normalized_url

    def _build_filename_from_url(self, url: str, content_type: str) -> str:
        """Infer a local filename from URL path and content type."""
        parsed = urlparse(url)
        raw_name = Path(unquote(parsed.path)).name
        default_stem = f"webpage-{hashlib.sha256(url.encode('utf-8')).hexdigest()[:10]}"
        base_name = raw_name or default_stem

        extension = Path(base_name).suffix.lower()
        if extension in {".pdf", ".docx", ".doc", ".txt", ".html", ".htm"}:
            return base_name

        content_type_value = content_type.split(";")[0].strip().lower()
        extension_map = {
            "application/pdf": ".pdf",
            "application/msword": ".doc",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
            "text/plain": ".txt",
            "text/html": ".html",
        }
        inferred_extension = extension_map.get(content_type_value)
        if inferred_extension:
            if extension:
                return f"{Path(base_name).stem}{inferred_extension}"
            return f"{base_name}{inferred_extension}"

        return base_name

    def _is_html_content(self, filename: str, content_type: str) -> bool:
        """Check if remote content should be parsed as HTML."""
        extension = Path(filename).suffix.lower()
        content_type_value = content_type.split(";")[0].strip().lower()
        return extension in {".html", ".htm"} or content_type_value == "text/html"

    def _is_supported_web_content(self, filename: str, content_type: str) -> bool:
        """Validate downloadable content types accepted by ingestion pipeline."""
        extension = Path(filename).suffix.lower()
        content_type_value = content_type.split(";")[0].strip().lower()

        supported_extensions = {".pdf", ".docx", ".doc", ".txt", ".html", ".htm"}
        supported_types = {
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            "text/html",
        }

        return extension in supported_extensions or content_type_value in supported_types

    def _extract_html_title(self, content: bytes) -> Optional[str]:
        """Extract page title from HTML bytes."""
        decoded = content.decode("utf-8", errors="ignore")
        match = re.search(r"<title[^>]*>(.*?)</title>", decoded, re.IGNORECASE | re.DOTALL)
        if not match:
            return None

        title = re.sub(r"\s+", " ", match.group(1)).strip()
        return title[:120] if title else None

    def _extract_text_from_html(self, content: bytes) -> str:
        """Convert HTML bytes into readable text."""
        decoded = content.decode("utf-8", errors="ignore")
        parser = _HTMLTextExtractor()
        parser.feed(decoded)
        parser.close()
        return parser.get_text()
    
    def _load_document(self, file_path: Path, metadata: Dict[str, Any]) -> List[LangChainDocument]:
        """Load document using appropriate loader."""
        ext = file_path.suffix.lower()
        
        try:
            if ext == '.pdf':
                loader = PyPDFLoader(str(file_path))
            elif ext in ['.docx', '.doc']:
                loader = Docx2txtLoader(str(file_path))
            elif ext == '.txt':
                loader = TextLoader(str(file_path), encoding='utf-8')
            else:
                raise DocumentProcessingError(
                    f"Unsupported file type: {ext}",
                    details={"file_path": str(file_path)}
                )
            
            documents = loader.load()
            
            # Add metadata to each document
            for doc in documents:
                doc.metadata.update(metadata)
            
            return documents
            
        except Exception as e:
            logger.error("document_load_failed", error=str(e), file_path=str(file_path))
            raise DocumentProcessingError(
                f"Failed to load document: {str(e)}",
                details={"file_path": str(file_path), "error": str(e)}
            )
    
    async def process_file(
        self,
        filename: str,
        content: bytes,
        custom_metadata: Optional[Dict[str, Any]] = None
    ) -> ProcessedDocument:
        """
        Process a file into chunks ready for vector embedding.
        
        Args:
            filename: Original filename
            content: File content as bytes
            custom_metadata: Optional additional metadata
            
        Returns:
            ProcessedDocument containing chunks and metadata
        """
        logger.info("processing_document", filename=filename, size=len(content))
        
        try:
            # Detect document type
            doc_type = self._detect_document_type(filename, content)
            
            # Extract metadata
            metadata = self._extract_metadata(filename, content, doc_type)
            if custom_metadata:
                metadata.update(custom_metadata)
            
            # Save to temp file for processing
            ext = Path(filename).suffix.lower()
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_file:
                tmp_file.write(content)
                tmp_path = Path(tmp_file.name)
            
            try:
                # Load document
                documents = self._load_document(tmp_path, metadata)
                
                # Split into chunks
                chunks = self.text_splitter.split_documents(documents)
                
                # Add chunk metadata
                for i, chunk in enumerate(chunks):
                    chunk.metadata['chunk_index'] = i
                    chunk.metadata['total_chunks'] = len(chunks)
                    chunk.metadata['chunk_id'] = f"{metadata['file_hash']}_{i}"
                
                # Create document ID
                doc_id = metadata['file_hash'][:16]
                
                logger.info(
                    "document_processed",
                    doc_id=doc_id,
                    filename=filename,
                    chunks=len(chunks),
                    doc_type=doc_type
                )
                
                return ProcessedDocument(
                    doc_id=doc_id,
                    chunks=chunks,
                    metadata=metadata,
                    total_chunks=len(chunks),
                    file_hash=metadata['file_hash']
                )
                
            finally:
                # Cleanup temp file
                if tmp_path.exists():
                    tmp_path.unlink()
                    
        except DocumentProcessingError:
            raise
        except Exception as e:
            logger.error("document_processing_failed", error=str(e), filename=filename)
            raise DocumentProcessingError(
                f"Failed to process document: {str(e)}",
                details={"filename": filename, "error": str(e)}
            )

    async def process_url(
        self,
        url: str,
        custom_metadata: Optional[Dict[str, Any]] = None,
        verify_ssl: bool = True,
    ) -> ProcessedDocument:
        """Fetch content from a URL and process it into vector-ready chunks."""
        safe_url = self._validate_source_url(url)
        logger.info("processing_url_document", url=safe_url)

        timeout = httpx.Timeout(timeout=25.0, connect=10.0, read=20.0)

        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                follow_redirects=True,
                max_redirects=5,
                verify=verify_ssl,
                headers={"User-Agent": "POWERGRID-RAG-Ingestor/1.0"},
            ) as client:
                response = await client.get(safe_url)
        except httpx.HTTPError as e:
            logger.error("url_fetch_failed", url=safe_url, error=str(e))
            raise DocumentProcessingError(
                "Failed to fetch content from URL",
                details={"url": safe_url, "error": str(e)},
            )

        if response.status_code >= 400:
            raise DocumentProcessingError(
                f"URL returned HTTP {response.status_code}",
                details={"url": safe_url, "status_code": response.status_code},
            )

        content = response.content
        if not content:
            raise DocumentProcessingError(
                "URL returned empty content",
                details={"url": safe_url},
            )

        max_size_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(content) > max_size_bytes:
            raise DocumentProcessingError(
                f"URL content exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
                details={"url": safe_url, "size": len(content)},
            )

        content_type = response.headers.get("content-type", "").lower()
        filename = self._build_filename_from_url(safe_url, content_type)

        if not self._is_supported_web_content(filename, content_type):
            raise DocumentProcessingError(
                "Unsupported URL content type. Supported: HTML, TXT, PDF, DOCX, DOC",
                details={"url": safe_url, "content_type": content_type, "filename": filename},
            )

        metadata: Dict[str, Any] = {"source_url": safe_url}
        if custom_metadata:
            metadata.update(custom_metadata)

        if self._is_html_content(filename, content_type):
            extracted_text = self._extract_text_from_html(content)
            if not extracted_text:
                raise DocumentProcessingError(
                    "The URL does not contain readable text content",
                    details={"url": safe_url},
                )

            page_title = self._extract_html_title(content)
            title_slug = ""
            if page_title:
                title_slug = re.sub(r"[^A-Za-z0-9]+", "-", page_title).strip("-").lower()

            if not title_slug:
                title_slug = Path(filename).stem or f"webpage-{hashlib.sha256(safe_url.encode('utf-8')).hexdigest()[:10]}"

            filename = f"{title_slug[:80]}.txt"

            header_lines = [f"Source URL: {safe_url}"]
            if page_title:
                header_lines.append(f"Page Title: {page_title}")
            text_payload = "\n".join(header_lines) + "\n\n" + extracted_text
            content = text_payload.encode("utf-8")

            if "doc_type" not in metadata:
                metadata["doc_type"] = "TEXT_DOCUMENT"

        return await self.process_file(filename, content, metadata)
    
    async def process_multiple_files(
        self,
        files: List[tuple[str, bytes]]
    ) -> List[ProcessedDocument]:
        """Process multiple files."""
        results = []
        for filename, content in files:
            try:
                processed = await self.process_file(filename, content)
                results.append(processed)
            except DocumentProcessingError as e:
                logger.error(
                    "batch_processing_error",
                    filename=filename,
                    error=str(e)
                )
                # Continue processing other files
                continue
        return results


# Singleton instance
document_processor = DocumentProcessor()
