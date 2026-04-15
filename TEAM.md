# POWERGRID SmartOps - Team Development Guide

![FastAPI](https://img.shields.io/badge/FastAPI-API-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-UI-61DAFB?logo=react&logoColor=0B1F2A)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?logo=firebase&logoColor=black)
![Railway](https://img.shields.io/badge/Railway-Backend_Hosting-0B0D0E?logo=railway&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Frontend_Hosting-000000?logo=vercel&logoColor=white)

## Team Ownership

### Backend Team
Focus areas:
- RAG query orchestration and fallback flow
- Document processing and ingestion
- Vector indexing and retrieval behavior
- API guardrails (auth, rate limiting, request context)

Key files:
- `backend/app/api/routes.py` - API endpoints and dependency guardrails
- `backend/app/api/models.py` - Shared enums and request/response contracts
- `backend/app/services/rag_engine.py` - Query pipeline and retrieval flow
- `backend/app/services/vector_store.py` - ChromaDB indexing, filtering, deletion
- `backend/app/services/document_processor.py` - File parsing and chunk generation
- `backend/app/core/security.py` - API key and in-memory rate limiter

### Frontend Team
Focus areas:
- Dashboard and operational UX
- Chat workflow with metadata filters and citations
- Knowledge base upload/list/delete flows
- Settings + health visibility

Key files:
- `frontend/src/pages/Home.tsx` - Operational dashboard and quick actions
- `frontend/src/pages/Chat.tsx` - Main RAG chat experience
- `frontend/src/pages/KnowledgeBase.tsx` - Upload, list, and delete documents
- `frontend/src/pages/Settings.tsx` - Service health and user/system settings
- `frontend/src/lib/api.ts` - Typed API client and request headers
- `frontend/src/stores/chatStore.ts` - Chat/session state and persistence
- `frontend/src/stores/knowledgeStore.ts` - Docs, stats, settings state

### Platform and DevOps Team
Focus areas:
- Railway backend runtime health
- Vercel frontend deployment and environment management
- Firebase Firestore credentials and retention controls
- Build reliability, logs, and smoke validation

Key files:
- `backend/railway.json` - Railway service config
- `backend/Procfile` - Gunicorn process command
- `frontend/vercel.json` - Vercel routing and security headers
- `docker-compose.yml` - Local container orchestration
- `Dockerfile` - Combined image for local/prod workflows

## Local Development Workflow

### 1) Environment setup

```bash
# From repository root
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# macOS/Linux
source .venv/bin/activate

pip install -r backend/requirements.txt

# Backend env
copy backend\.env.example backend\.env  # Windows
# cp backend/.env.example backend/.env    # macOS/Linux

# Frontend deps
cd frontend
npm install
cd ..
```

### 2) Run local services

```bash
# Terminal A (backend)
uvicorn app.main:app --app-dir backend --reload --port 8000

# Terminal B (frontend)
cd frontend
npm run dev
```

Local URLs:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- OpenAPI docs: http://localhost:8000/docs

### 3) Smoke validation

```bash
curl http://localhost:8000/ping
curl http://localhost:8000/api/v1/health
curl http://localhost:8000/api/v1/metadata/options
```

If `BACKEND_API_KEY` is set, include `X-API-Key` in requests to protected API routes.

## Coding Standards

### Backend
- Keep type hints on function signatures and service interfaces
- Raise domain exceptions (`PowergridException` family) where possible
- Use structured logs with stable keys for observability
- Keep API contracts in `models.py` and route logic in `routes.py`

### Frontend
- Use strict TypeScript types for API payloads and store state
- Keep page-level logic in `pages/` and reusable shell in `components/`
- Route all HTTP calls through `frontend/src/lib/api.ts`
- Prefer store actions for shared async flows over ad hoc page-local duplication

## Feature Change Playbook

### Add a new metadata enum option
1. Update enum in `backend/app/api/models.py`
2. Ensure upload/query handling uses the enum in `backend/app/api/routes.py`
3. Verify option appears automatically via `GET /api/v1/metadata/options`
4. Confirm frontend forms/filters consume the new option without hardcoded values

### Add a new LLM provider
1. Implement provider branch in `backend/app/services/llm_service.py`
2. Add required env variable(s) in `backend/.env.example`
3. Update README deployment environment table
4. Validate `/api/v1/query` with both normal and fallback execution

## Hosting and Release Runbook

### Backend (Railway)
- Root directory: `backend`
- Required env: `GOOGLE_API_KEY`, `FIREBASE_CREDENTIALS`, `FRONTEND_URL`, `DEFAULT_LLM_PROVIDER`, `DEFAULT_LLM_MODEL`, `SECRET_KEY`, `ENVIRONMENT`
- Recommended env: `BACKEND_API_KEY`, `ENABLE_RATE_LIMITING`, `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW`

### Frontend (Vercel)
- Root directory: `frontend`
- Required env: `VITE_API_URL`
- Recommended env: `VITE_BACKEND_API_KEY` (must match Railway `BACKEND_API_KEY`)

### Release checklist
- [ ] Railway deployment healthy at `/ping` and `/api/v1/health`
- [ ] Metadata endpoint returns enums at `/api/v1/metadata/options`
- [ ] Frontend can upload, query, and delete a document successfully
- [ ] CORS and API key configuration validated for deployed Vercel URL
- [ ] README and TEAM docs updated with any contract or env changes

## Common Operational Issues

### 401 Unauthorized on API routes
- Cause: `BACKEND_API_KEY` configured, but client missing `X-API-Key`
- Fix: Set `VITE_BACKEND_API_KEY` in Vercel and redeploy frontend

### Query works locally but fails in production
- Cause: Missing provider key (`GOOGLE_API_KEY` or `GROQ_API_KEY`) or wrong model
- Fix: Verify Railway env and check backend logs for provider initialization errors

### Upload success but no retrieval hits
- Cause: metadata mismatch or vector index filters too strict
- Fix: query without filters first, then re-apply filters incrementally

## References

- FastAPI: https://fastapi.tiangolo.com/
- LangChain: https://python.langchain.com/
- ChromaDB: https://docs.trychroma.com/
- Firebase Firestore: https://firebase.google.com/docs/firestore
- Railway: https://docs.railway.app/
- Vercel: https://vercel.com/docs