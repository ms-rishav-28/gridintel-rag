# POWERGRID SmartOps Assistant — Deployment Guide

![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-Frontend-61DAFB?logo=react&logoColor=0B1F2A)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-UI-06B6D4?logo=tailwindcss&logoColor=white)
![Convex](https://img.shields.io/badge/Convex-Realtime_DB-F9FAFB?logo=convex&logoColor=111827)
![Railway](https://img.shields.io/badge/Railway-Backend_Hosting-0B0D0E?logo=railway&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Frontend_Hosting-000000?logo=vercel&logoColor=white)
![ChromaDB](https://img.shields.io/badge/ChromaDB-Vector_Store-F97316)

> **Production-grade RAG system** for POWERGRID operations knowledge management.  
> Frontend → **Vercel** | Backend → **Railway** | Realtime DB → **Convex**

---

## Architecture Overview

```
┌──────────────┐   HTTPS + Convex   ┌──────────────────┐   Server SDK    ┌─────────────┐
│   Vercel     │ ─────────────────→ │     Railway      │ ───────────────→ │   Convex    │
│  (React SPA) │                    │  (FastAPI + ML)  │                  │  Realtime   │
│              │                    │                  │                  │     DB      │
│  Vite Build  │                    │  ChromaDB (RAM)  │                  │  Documents  │
│  Tailwind    │                    │  Sentence-BERT   │                  │ Chat Logs   │
│  Convex React│                    │  LangChain       │                  │  Settings   │
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
- **Convex Project**
- **Google Gemini API Key** (or Groq)
- **Railway Account** (free tier works, Starter recommended)
- **Vercel Account** (free tier)

---

## 1. Convex Setup

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
| `GOOGLE_API_KEY` | Your Gemini API key | ✅ |
| `CONVEX_URL` | Convex deployment URL (`https://...convex.cloud`) | ✅ |
| `FRONTEND_URL` | `https://your-app.vercel.app` | ✅ |
| `DEFAULT_LLM_PROVIDER` | `gemini` | ✅ |
| `DEFAULT_LLM_MODEL` | `gemini-1.5-flash` | ✅ |
| `SECRET_KEY` | Random 64-char string | ✅ |
| `CONVEX_ADMIN_KEY` | Convex admin key (optional, recommended for server mutations) | ❌ |
| `BACKEND_API_KEY` | Strong random API key for frontend-backend auth | Recommended |
| `ENABLE_RATE_LIMITING` | `true` | Recommended |
| `RATE_LIMIT_REQUESTS` | `100` | Recommended |
| `RATE_LIMIT_WINDOW` | `3600` | Recommended |
| `ENVIRONMENT` | `production` | ✅ |
| `GROQ_API_KEY` | Your Groq key (if using Groq) | ❌ |
| `LOG_LEVEL` | `INFO` | ❌ |

If `BACKEND_API_KEY` is configured, all non-exempt API routes require the `X-API-Key` request header.

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
| `VITE_CONVEX_URL` | `https://your-project.convex.cloud` |
| `VITE_BACKEND_API_KEY` | Same value as Railway `BACKEND_API_KEY` |

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
│   │   │   └── vector_store.py        # ChromaDB vector index
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

### Python dependency resolution fails during setup
- Upgrade pip tooling first: `python -m pip install --upgrade pip setuptools wheel`
- Re-run: `pip install -r backend/requirements.txt`
