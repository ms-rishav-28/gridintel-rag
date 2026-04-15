# POWERGRID SmartOps Assistant — Deployment Guide

> **Production-grade RAG system** for POWERGRID operations knowledge management.  
> Frontend → **Vercel** | Backend → **Railway** | Database → **Firebase Firestore**

---

## Architecture Overview

```
┌──────────────┐     HTTPS      ┌──────────────────┐     Firestore     ┌───────────┐
│   Vercel     │ ──────────────→│     Railway      │ ─────────────────→│  Firebase  │
│  (React SPA) │                │  (FastAPI + ML)  │                   │ (Firestore)│
│              │                │                  │                   │            │
│  Vite Build  │                │  ChromaDB (RAM)  │                   │  Documents │
│  Tailwind    │                │  Sentence-BERT   │                   │  Chat Logs │
│  Zustand     │                │  LangChain       │                   │  Settings  │
└──────────────┘                └──────────────────┘                   └───────────┘
```

---

## Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **Firebase Project** (Firestore enabled)
- **Google Gemini API Key** (or Groq)
- **Railway Account** (free tier works, Starter recommended)
- **Vercel Account** (free tier)

---

## 1. Firebase Setup

### Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (e.g., `powergrid-smartops`)
3. Enable **Cloud Firestore** (start in Production mode)

### Generate Service Account Key
1. Go to **Project Settings → Service Accounts**
2. Click **Generate New Private Key**
3. Download the JSON file
4. You'll paste this JSON as a single-line string into Railway's environment

### Firestore Security Rules (Production)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Documents collection
    match /documents/{docId} {
      allow read, write: if true; // Lock down with auth later
    }
    // Chat sessions
    match /chat_sessions/{sessionId} {
      allow read, write: if true;
    }
    // System config
    match /system_config/{configId} {
      allow read, write: if true;
    }
  }
}
```

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
| `FIREBASE_CREDENTIALS` | Full JSON of service account (single line) | ✅ |
| `FRONTEND_URL` | `https://your-app.vercel.app` | ✅ |
| `DEFAULT_LLM_PROVIDER` | `gemini` | ✅ |
| `DEFAULT_LLM_MODEL` | `gemini-1.5-flash` | ✅ |
| `SECRET_KEY` | Random 64-char string | ✅ |
| `ENVIRONMENT` | `production` | ✅ |
| `GROQ_API_KEY` | Your Groq key (if using Groq) | ❌ |
| `LOG_LEVEL` | `INFO` | ❌ |

> **Tip**: To paste Firebase credentials as a single line, run:
> ```bash
> cat firebase-service-account.json | jq -c .
> ```

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

### Verify
Visit your Vercel URL → you should see the GridIntel dashboard.

---

## 4. Local Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env from template
cp .env.example .env
# Edit .env with your API keys

python -m app.main
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
│   │   │   ├── firebase_service.py    # Firestore persistence layer
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
│   ├── src/
│   │   ├── components/
│   │   │   ├── ErrorBoundary.tsx   # Global crash recovery UI
│   │   │   └── Layout.tsx          # SideNav + TopBar shell
│   │   ├── lib/
│   │   │   ├── api.ts              # Axios API client + types
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
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/stats` | System statistics |
| `GET` | `/ping` | Load balancer ping |
| `GET` | `/docs` | Swagger UI |

---

## Troubleshooting

### "Network Error" on frontend
- Backend not running or URL mismatch
- Check `VITE_API_URL` matches your Railway URL
- Verify CORS: backend `FRONTEND_URL` must match your Vercel domain

### "Firebase not configured" warning in backend logs
- Set `FIREBASE_CREDENTIALS` env var with the full JSON string
- Without it, the app runs in memory-only mode (data lost on restart)

### Cold start takes 30+ seconds
- First request loads the sentence-transformers ML model (~90MB)
- Subsequent requests are fast (<2s for queries)
- Railway Starter tier ($5/mo) keeps the service warm

### Document upload fails
- Check file type is `.pdf`, `.docx`, `.doc`, or `.txt`
- Max file size is 50MB (configurable via `MAX_UPLOAD_SIZE_MB`)
