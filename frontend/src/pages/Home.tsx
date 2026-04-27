// CODEX-FIX: align dashboard summary with current health, documents, and chat-session APIs.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Bot, Database, FileText, Settings } from 'lucide-react'
import { getHealth, listChatSessions, listDocuments, type ChatSession, type DocumentRecord, type HealthResponse } from '../lib/api'

const Home = () => {
  const navigate = useNavigate()
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])

  useEffect(() => {
    const load = async () => {
      const [healthResult, docsResult, sessionsResult] = await Promise.allSettled([
        getHealth(),
        listDocuments(),
        listChatSessions(),
      ])
      if (healthResult.status === 'fulfilled') setHealth(healthResult.value)
      if (docsResult.status === 'fulfilled') setDocuments(docsResult.value)
      if (sessionsResult.status === 'fulfilled') setSessions(sessionsResult.value)
    }
    void load()
  }, [])

  const stats = useMemo(() => {
    const chunks = documents.reduce((sum, document) => sum + (document.chunkCount ?? 0), 0)
    const images = documents.reduce((sum, document) => sum + (document.imageCount ?? 0), 0)
    return { chunks, images }
  }, [documents])

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <section className="rounded-lg bg-surface-container-lowest p-6 shadow-sm md:p-8">
        <p className="font-label text-xs font-bold uppercase tracking-widest text-primary">POWERGRID SmartOps</p>
        <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-on-surface md:text-4xl">Operational RAG console</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-on-surface-variant">
              Query persisted regulatory documents, scanned PDFs, extracted diagrams, and complex web sources through the Railway backend.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button onClick={() => navigate('/chat')} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary">
              Ask Assistant
            </button>
            <button onClick={() => navigate('/knowledge-base')} className="rounded-lg bg-surface-container-high px-4 py-2 text-sm font-bold text-primary">
              Manage Sources
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard icon={<Activity />} label="API Status" value={health?.status ?? 'offline'} />
        <SummaryCard icon={<Database />} label="LanceDB Rows" value={String(health?.components.lancedb?.row_count ?? 0)} />
        <SummaryCard icon={<FileText />} label="Documents" value={String(documents.length)} />
        <SummaryCard icon={<Bot />} label="Chat Sessions" value={String(sessions.length)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg bg-surface-container-lowest p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-on-surface">Recently Indexed</h2>
            <button onClick={() => navigate('/knowledge-base')} className="text-sm font-bold text-primary">Open</button>
          </div>
          <div className="space-y-3">
            {documents.slice(0, 6).map((document) => (
              <div key={document.docId} className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
                <FileText className="h-4 w-4 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{document.name}</div>
                  <div className="text-xs text-on-surface-variant">{document.sourceType} - {document.ingestionStatus}</div>
                </div>
              </div>
            ))}
            {documents.length === 0 && <p className="text-sm text-on-surface-variant">No sources indexed yet.</p>}
          </div>
        </div>

        <div className="rounded-lg bg-surface-container-low p-5">
          <div className="mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="font-bold text-on-surface">Pipeline Snapshot</h2>
          </div>
          <div className="space-y-3 text-sm">
            <Row label="Convex" value={health?.components.convex?.status ?? 'unknown'} />
            <Row label="Embedding" value={health?.components.embedding_model?.status ?? 'unknown'} />
            <Row label="Vision" value={health?.components.vision_model?.status ?? 'unknown'} />
            <Row label="Chunks" value={String(stats.chunks)} />
            <Row label="Images" value={String(stats.images)} />
          </div>
        </div>
      </section>
    </div>
  )
}

function SummaryCard({ icon, label, value }: { icon: JSX.Element; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-lowest p-4 shadow-sm">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <div className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</div>
      <div className="mt-1 truncate text-lg font-bold text-on-surface">{value}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2 last:border-b-0 last:pb-0">
      <span className="text-on-surface-variant">{label}</span>
      <span className="font-semibold text-on-surface">{value}</span>
    </div>
  )
}

export default Home
