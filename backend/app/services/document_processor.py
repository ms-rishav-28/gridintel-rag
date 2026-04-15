"""Document processing service for ingesting POWERGRID documents."""

import os
import io
import hashlib
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from pathlib import Path
import tempfile

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
