# POWERGRID RAG - Team Development Guide

## Development Team Structure

### Backend Team
**Focus Areas:**
- Document processing pipeline
- Vector store management
- RAG engine logic
- LLM integrations
- API development

**Key Files:**
- `backend/app/services/rag_engine.py` - Core RAG logic
- `backend/app/services/document_processor.py` - Document ingestion
- `backend/app/services/vector_store.py` - ChromaDB operations
- `backend/app/services/llm_service.py` - LLM providers (Gemini/Groq)
- `backend/app/api/routes.py` - API endpoints

### Frontend Team
**Focus Areas:**
- React UI components
- Query interface
- Document upload interface
- API integration
- User experience

**Key Files:**
- `frontend/src/pages/QueryPage.tsx` - Main search interface
- `frontend/src/pages/UploadPage.tsx` - Document upload
- `frontend/src/pages/StatusPage.tsx` - System monitoring
- `frontend/src/lib/api.ts` - Backend API client
- `frontend/src/components/Layout.tsx` - App layout

### DevOps Team
**Focus Areas:**
- Docker deployment
- Environment setup
- Monitoring and logging
- CI/CD pipelines

**Key Files:**
- `Dockerfile` - Multi-stage build
- `docker-compose.yml` - Local orchestration
- `backend/app/core/logging.py` - Structured logging

## Development Workflow

### 1. Setting Up Local Environment

```bash
# Clone and enter project
cd "powergrid RAG"

# Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys

# Frontend setup
cd ../frontend
npm install
```

### 2. Running Development Servers

```bash
# Terminal 1: Backend
cd backend
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

Access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### 3. Testing Document Upload

```bash
# Using curl
curl -X POST http://localhost:8000/api/v1/documents/upload \
  -F "file=@path/to/your/document.pdf" \
  -F "doc_type=TECHNICAL_MANUAL" \
  -F "equipment_type=CIRCUIT_BREAKER"
```

### 4. Testing RAG Query

```bash
curl -X POST http://localhost:8000/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the maintenance interval for a 220 kV circuit breaker?",
    "use_fallback": true
  }'
```

## Code Standards

### Backend (Python)

- Use type hints for all function signatures
- Follow PEP 8 style guide
- Add docstrings for all public functions
- Use structured logging via `structlog`
- Handle exceptions with custom exception classes

Example:
```python
from app.core.logging import get_logger
from app.core.exceptions import RAGQueryError

logger = get_logger(__name__)

async def process_query(question: str) -> dict:
    """Process a RAG query.
    
    Args:
        question: The user's question
        
    Returns:
        dict containing answer and citations
        
    Raises:
        RAGQueryError: If query processing fails
    """
    try:
        logger.info("processing_query", question=question[:50])
        # ... logic ...
    except Exception as e:
        logger.error("query_failed", error=str(e))
        raise RAGQueryError(f"Failed to process: {str(e)}")
```

### Frontend (TypeScript/React)

- Use TypeScript for type safety
- Follow functional component pattern with hooks
- Use Tailwind CSS for styling
- Implement error boundaries for error handling
- Use `zustand` for state management (when needed)

Example:
```tsx
import { useState } from 'react'
import { cn } from '../lib/utils'

interface QueryFormProps {
  onSubmit: (query: string) => void
  loading: boolean
}

export function QueryForm({ onSubmit, loading }: QueryFormProps) {
  const [query, setQuery] = useState('')
  
  return (
    <form onSubmit={() => onSubmit(query)}>
      {/* ... */}
    </form>
  )
}
```

## Architecture Patterns

### RAG Pipeline

```
User Query → Filter Builder → Vector Search → LLM Generation → Cited Answer
                ↓                    ↓
          Equipment Type       Relevance Scoring
          Voltage Level        Context Assembly
          Doc Types            Fallback Logic
```

### Document Processing

```
PDF/DOCX → Text Extraction → Chunking → Embedding → Vector Store
                ↓                ↓           ↓
          PyPDF/Docx2txt   Recursive    HuggingFace
                           Splitter     Embeddings
```

## Adding Features

### Adding New Equipment Type

1. **Backend** - `backend/app/core/config.py`:
```python
class EquipmentType(str, Enum):
    # ... existing types ...
    NEW_EQUIPMENT = "NEW_EQUIPMENT"
```

2. **Frontend** - `frontend/src/lib/utils.ts`:
```typescript
export const EQUIPMENT_TYPES = [
  // ... existing ...
  { value: 'NEW_EQUIPMENT', label: 'New Equipment' },
] as const
```

3. **Document Processor** - `backend/app/services/document_processor.py`:
```python
equipment_keywords = {
    # ... existing ...
    'new_keyword': 'NEW_EQUIPMENT',
}
```

### Adding New LLM Provider

1. Update `backend/app/services/llm_service.py`:
```python
elif self.provider == "new_provider":
    return NewProviderLLM(
        model=self.model_name,
        api_key=settings.NEW_PROVIDER_KEY,
    )
```

2. Add configuration to `backend/app/core/config.py`

3. Update environment variables

## Testing Strategy

### Unit Tests (Backend)
```bash
cd backend
pytest tests/ -v
```

### Integration Tests
```bash
# Start services
docker-compose up -d

# Run integration tests
pytest tests/integration/ -v
```

### Frontend Testing
```bash
cd frontend
npm run test
```

## Deployment Checklist

- [ ] Set production API keys in `.env`
- [ ] Configure `ENVIRONMENT=production`
- [ ] Set `DEBUG=false`
- [ ] Update `SECRET_KEY` (generate new)
- [ ] Configure backup for `/app/data` volume
- [ ] Set up monitoring/alerting
- [ ] Test document upload
- [ ] Test RAG query flow
- [ ] Verify citation accuracy

## Common Issues

### Backend

**Issue**: ChromaDB persistence errors
**Fix**: Ensure `data/chroma_db` directory exists and is writable

**Issue**: LLM timeout
**Fix**: Increase `timeout` in `api.py` or use faster model

**Issue**: Out of memory during embedding
**Fix**: Reduce `CHUNK_SIZE` or use smaller embedding model

### Frontend

**Issue**: API connection errors
**Fix**: Check `VITE_API_URL` in `.env` and CORS settings in backend

**Issue**: Large file upload fails
**Fix**: Check `MAX_UPLOAD_SIZE_MB` in backend config

## Resources

- **LangChain Docs**: https://python.langchain.com/
- **ChromaDB Docs**: https://docs.trychroma.com/
- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **Gemini API**: https://ai.google.dev/
- **Groq API**: https://console.groq.com/

## Contact

- Backend Team Lead: [TBD]
- Frontend Team Lead: [TBD]
- DevOps Team Lead: [TBD]
- Project Manager: [TBD]
