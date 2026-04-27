# POWERGRID SmartOps Assistant — Deployment Guide

![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-Frontend-61DAFB?logo=react&logoColor=0B1F2A)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-UI-06B6D4?logo=tailwindcss&logoColor=white)
![Convex](https://img.shields.io/badge/Convex-Realtime_DB-F9FAFB?logo=convex&logoColor=111827)
![Railway](https://img.shields.io/badge/Railway-Backend_Hosting-0B0D0E?logo=railway&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Frontend_Hosting-000000?logo=vercel&logoColor=white)
![LanceDB](https://img.shields.io/badge/LanceDB-Vector_Store-0F766E)

> **Production-grade RAG system** for POWERGRID operations knowledge management.  
> Frontend → **Vercel** | Backend → **Railway** | Durable persistence → **Convex + LanceDB**

---

## Architecture Overview

```
┌──────────────┐   HTTPS + Convex   ┌──────────────────┐   Server SDK    ┌─────────────┐
│   Vercel     │ ─────────────────→ │     Railway      │ ───────────────→ │   Convex    │
│  (React SPA) │                    │  (FastAPI + ML)  │                  │  Realtime   │
│              │                    │                  │                  │     DB      │
│  Vite Build  │                    │  LanceDB /data   │                  │  Documents  │
│  Tailwind    │                    │  BGE-M3          │                  │ Chat Logs   │
│  Convex React│                    │  Hybrid RAG      │                  │  Settings   │
└──────────────┘                    └──────────────────┘                  └─────────────┘
```

## Current Validation Snapshot

- Live smoke checks passing: `/ping`, `/api/v1/health`, `/api/v1/metadata/options`, `/api/v1/query`
- End-to-end workflow verified: document upload → query with citations → document delete
- Frontend to backend auth supported via `X-API-Key` header when `BACKEND_API_KEY` is configured

---

## Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **Google Gemini API Key** (or Groq)
- **Railway Account** (free tier works, Starter recommended)
- **Vercel Account** (free tier)

---

## 1. Optional Convex Setup

Convex is optional. The frontend now works directly with Railway APIs, and backend storage gracefully falls back to in-memory mode when Convex is not configured.

Use Convex only if you want durable chat/settings/document metadata across backend restarts.

### Create Convex Project
1. Go to [Convex Dashboard](https://dashboard.convex.dev/)
2. Create a new project (for example `powergrid-smartops`)
3. In `frontend`, authenticate and link your project:

```bash
cd frontend
npx convex dev
```

### Deploy Convex Functions
From `frontend`, deploy the Convex schema and functions in `frontend/convex`:

```bash
npx convex deploy
```

### Collect Convex Connection Values
- `VITE_CONVEX_URL`: your Convex deployment URL (for frontend)
- `CONVEX_URL`: same deployment URL for backend server integration
- `CONVEX_ADMIN_KEY`: optional admin token if you want server-to-server privileged access

If `CONVEX_URL` is not set in backend, persistence falls back to in-memory storage.

---

## 2. Backend Deployment (Railway)

### Quick Deploy
1. Push the repository to GitHub
2. Go to [Railway](https://railway.app/) → **New Project → Deploy from GitHub Repo**
3. Set the **root directory** to `backend`
4. Railway auto-detects Python and uses the `railway.json` config

### Environment Variables (Railway Dashboard)
Set these in **Variables** tab:

| Variable | Value | Required |
|---|---|---|
| `ENVIRONMENT` | `production` | Required |
| `SECRET_KEY` | Random 64-char string | Required |
| `LOG_LEVEL` | `INFO` | Optional |
| `BACKEND_API_KEY` | Strong random API key for frontend-backend auth | Required for protected deployments |
| `FRONTEND_URL` | `https://your-app.vercel.app` | Required |
| `CONVEX_URL` | Convex deployment URL (`https://...convex.cloud`) | Required for persistence |
| `CONVEX_ADMIN_KEY` | Convex admin key for server mutations | Recommended |
| `LANCEDB_PATH` | `/data/lancedb` | Required on Railway |
| `EMBEDDING_MODEL` | `BAAI/bge-m3` | Required |
| `EMBEDDING_DEVICE` | `cpu` | Required |
| `VISION_MODEL` | `microsoft/Florence-2-base` | Required |
| `ENABLE_VISION` | `true` | Recommended |
| `DEFAULT_LLM_PROVIDER` | `gemini` | Required |
| `DEFAULT_LLM_MODEL` | `gemini-2.0-flash` | Required |
| `GOOGLE_API_KEY` | Your Gemini API key | Required unless using another provider |
| `GROQ_API_KEY` | Your Groq key | Optional fallback |
| `HF_API_TOKEN` | Hugging Face token for HF fallback | Required for HF fallback |
| `MAX_UPLOAD_SIZE_MB` | `150` | Required |
| `MAX_REQUEST_BODY_MB` | `155` | Required |
| `ENABLE_BROWSER_INGESTION` | `false` | Optional |
| `URL_CACHE_TTL_HOURS` | `24` | Optional |
| `ENABLE_RATE_LIMITING` | `true` | Recommended |
| `RATE_LIMIT_REQUESTS` | `100` | Recommended |
| `RATE_LIMIT_WINDOW` | `3600` | Recommended |
| `ENABLE_SECURITY_HEADERS` | `true` | Recommended |
| `ENABLE_HSTS` | `true` | Recommended |
| `TRUST_PROXY_HEADERS` | `true` on Railway | Recommended |

If `BACKEND_API_KEY` is configured, all non-exempt API routes require the `X-API-Key` request header.

### Backend Security Hardening Notes
- API key checks now use constant-time comparison.
- Request body size is rejected early via middleware when `Content-Length` exceeds `MAX_REQUEST_BODY_MB`.
- Forwarded client IP headers are ignored unless `TRUST_PROXY_HEADERS=true`.
- Response headers include `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, plus optional CSP/Permissions/HSTS controls.

### Verify Deployment
```bash
curl https://your-railway-url.up.railway.app/ping
# → {"status":"ok"}

curl https://your-railway-url.up.railway.app/api/v1/health
# → {"status":"healthy","version":"1.0.0",...}
```

---

## 3. Frontend Deployment (Vercel)

### Quick Deploy
1. Go to [Vercel](https://vercel.com/) → **Add New Project → Import Git Repository**
2. Set the **Root Directory** to `frontend`
3. Framework Preset: **Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`

### Environment Variables (Vercel Dashboard)
| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://your-railway-url.up.railway.app/api/v1` |
| `VITE_BACKEND_API_KEY` | Same value as Railway `BACKEND_API_KEY` |

`VITE_CONVEX_URL` is optional and only needed if you are running the legacy direct-Convex frontend mode.

### Verify
Visit your Vercel URL → you should see the GridIntel dashboard.

---

## 4. Local Development

### Backend
```bash
# From repository root
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# macOS/Linux
source .venv/bin/activate

pip install -r backend/requirements.txt

# Create backend .env from template
copy backend\.env.example backend\.env  # Windows
# cp backend/.env.example backend/.env    # macOS/Linux

uvicorn app.main:app --app-dir backend --reload --port 8000
# → Running on http://localhost:8000
# → Docs at http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → Running on http://localhost:3000
```

> The frontend `.env` is pre-configured to point to `localhost:8000`.

---

## 4.1 Source Catalog and Bulk Ingestion

The repository now includes a curated ingestion catalog based on official POWERGRID, regulatory, grid operations, web, and encyclopedia sources:

- Catalog file: `backend/ingestion/source_catalog.json`
- Runner script: `backend/scripts/ingest_source_catalog.py`

### What the runner can automate right now
- `pdf_catalog`: crawls listing pages for PDF links and ingests discovered PDF URLs
- `webpage`: ingests live page text via URL
- `wikipedia`: ingests article pages via URL

Other source types (for example `tabular`, `youtube`, `standards_summary`) are recorded in the catalog and reported as skipped until a dedicated loader is wired.

### Dry-run (recommended first)
```bash
# From repository root
python backend/scripts/ingest_source_catalog.py --dry-run --max-urls-per-source 3
```

### Ingest selected categories
```bash
python backend/scripts/ingest_source_catalog.py --categories official_powergrid regulatory --max-urls-per-source 5
```

If some external sites fail due certificate-chain issues on your machine, you can retry in ingestion-script mode with:

```bash
python backend/scripts/ingest_source_catalog.py --categories regulatory --allow-insecure-tls
```

Use this option only for controlled ingestion runs.

### Ingest specific source IDs
```bash
python backend/scripts/ingest_source_catalog.py --source-ids pgcil_annual_reports cea_technical_standards posoco_daily_reports
```

Each run writes a JSON report to `data/ingestion_reports/` (git-ignored) with attempted URLs, successes, failures, duplicates, and skipped source types.

---

## 5. Project Structure

```
powergrid-rag/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── models.py          # Pydantic request/response schemas
│   │   │   └── routes.py          # All API endpoints
│   │   ├── core/
│   │   │   ├── config.py          # Environment config (Settings)
│   │   │   ├── exceptions.py      # Custom exception hierarchy
│   │   │   └── logging.py         # Structured logging
│   │   ├── services/
│   │   │   ├── document_processor.py  # PDF/DOCX → chunks
│   │   │   ├── convex_service.py      # Convex persistence layer
│   │   │   ├── llm_service.py         # Gemini/Groq integration
│   │   │   ├── rag_engine.py          # RAG orchestrator
│   │   │   └── vector_store.py        # LanceDB vector index
│   │   └── main.py                # FastAPI app entry point
│   ├── railway.json               # Railway deployment config
│   ├── Procfile                   # Gunicorn start command
│   ├── requirements.txt           # Python dependencies
│   └── .env.example               # Environment template
│
├── frontend/
│   ├── convex/
│   │   ├── schema.ts              # Convex data model
│   │   ├── chat.ts                # Chat/session queries + mutations
│   │   ├── documents.ts           # Document metadata queries + mutations
│   │   └── settings.ts            # Settings queries + mutations
│   ├── src/
│   │   ├── components/
│   │   │   ├── ErrorBoundary.tsx   # Global crash recovery UI
│   │   │   └── Layout.tsx          # SideNav + TopBar shell
│   │   ├── lib/
│   │   │   ├── api.ts              # Axios API client + types
│   │   │   ├── convexApi.ts        # Typed Convex function references
│   │   │   ├── convexClient.ts     # Convex client bootstrap
│   │   │   └── utils.ts            # Formatting helpers
│   │   ├── pages/
│   │   │   ├── Chat.tsx            # RAG chat interface
│   │   │   ├── Home.tsx            # Dashboard with live stats
│   │   │   ├── KnowledgeBase.tsx   # Document management
│   │   │   └── Settings.tsx        # System config & health
│   │   ├── stores/
│   │   │   ├── chatStore.ts        # Chat state + persistence
│   │   │   └── knowledgeStore.ts   # Docs, health, settings state
│   │   ├── App.tsx                 # Routes + Error Boundary
│   │   └── main.tsx                # React entry point
│   ├── vercel.json                # Vercel SPA routing + headers
│   ├── .env                       # Local dev env
│   ├── .env.production            # Production env template
│   └── package.json
│
└── README.md                      # This file
```

---

## API Endpoints Reference

When `BACKEND_API_KEY` is set, include `X-API-Key: <your-key>` in client requests to `/api/v1/*` endpoints.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/query` | RAG query with citations |
| `POST` | `/api/v1/documents/upload` | Upload & ingest a document |
| `POST` | `/api/v1/documents/upload-url` | Ingest a public URL (HTML/TXT/PDF/DOCX/DOC) |
| `POST` | `/api/v1/documents/batch-upload` | Batch upload |
| `GET` | `/api/v1/documents/list` | List all ingested documents |
| `DELETE` | `/api/v1/documents/{doc_id}` | Delete a document |
| `POST` | `/api/v1/chat/message` | Persist a chat message |
| `GET` | `/api/v1/chat/history/{session_id}` | Retrieve chat history |
| `GET` | `/api/v1/chat/sessions` | List all chat sessions |
| `GET` | `/api/v1/settings` | Get user settings |
| `POST` | `/api/v1/settings` | Save user settings |
| `GET` | `/api/v1/metadata/options` | Get filter/upload metadata options |
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/stats` | System statistics |
| `GET` | `/ping` | Load balancer ping |
| `GET` | `/docs` | Swagger UI |

---

## Deployment Checklist Commands

### Local Preflight (before push)
```bash
# 1) Backend syntax and dependency sanity
.\.venv\Scripts\python.exe -m compileall backend\app

# 2) Frontend typecheck + production build
cd frontend
npm run build
cd ..

# 3) Convex functions/schema deploy from frontend
cd frontend
npx convex deploy
cd ..
```

### Production Post-Deploy Verification
```bash
# Backend health and ping
curl https://YOUR-BACKEND/ping
curl https://YOUR-BACKEND/api/v1/health

# Metadata and documents
curl https://YOUR-BACKEND/api/v1/metadata/options
curl https://YOUR-BACKEND/api/v1/documents/list

# Optional: with API key if BACKEND_API_KEY is enabled
curl -H "X-API-Key: YOUR_BACKEND_API_KEY" https://YOUR-BACKEND/api/v1/health
```

---

## Troubleshooting

### "Network Error" on frontend
- Backend not running or URL mismatch
- Check `VITE_API_URL` matches your Railway URL
- Verify CORS: backend `FRONTEND_URL` must match your Vercel domain

### "Convex not configured" warning in backend logs
- Set `CONVEX_URL` (and optionally `CONVEX_ADMIN_KEY`) in Railway env vars
- Without it, the app runs in memory-only mode (data lost on restart)

### Cold start takes 30+ seconds
- First request loads the sentence-transformers ML model (~90MB)
- Subsequent requests are fast (<2s for queries)
- Railway Starter tier ($5/mo) keeps the service warm

### 401 Unauthorized from API routes
- Set the same value for Railway `BACKEND_API_KEY` and Vercel `VITE_BACKEND_API_KEY`
- Ensure requests send `X-API-Key` header (frontend does this automatically when configured)

### Document upload fails
- Check file type is `.pdf`, `.docx`, `.doc`, or `.txt`
- Max file size is 50MB (configurable via `MAX_UPLOAD_SIZE_MB`)

### URL ingestion fails
- Use a public `http://` or `https://` URL (localhost/private network targets are blocked)
- Supported content types: HTML, plain text, PDF, DOCX, DOC

### Python dependency resolution fails during setup
- Upgrade pip tooling first: `python -m pip install --upgrade pip setuptools wheel`
- Re-run: `pip install -r backend/requirements.txt`
