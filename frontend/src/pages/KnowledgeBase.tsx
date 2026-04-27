// CODEX-FIX: connect document upload, URL ingestion, polling, and deletion to the durable backend API.

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { FileText, Globe2, Loader2, Trash2, UploadCloud } from 'lucide-react'
import {
  deleteDocument,
  getJob,
  listDocuments,
  uploadFile,
  uploadUrl,
  type DocumentRecord,
  type Job,
} from '../lib/api'

const URL_RE = /^https?:\/\/.+/i

const statusIcon: Record<string, string> = {
  pending: '🕐',
  processing: '⏳',
  done: '✅',
  failed: '❌',
}

const KnowledgeBase = () => {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [jobs, setJobs] = useState<Record<string, Job>>({})
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const refreshDocuments = async () => {
    setIsLoading(true)
    try {
      setDocuments(await listDocuments())
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refreshDocuments()
  }, [])

  const pollJob = async (jobId: string) => {
    let keepPolling = true
    while (keepPolling) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      const job = await getJob(jobId)
      setJobs((state) => ({ ...state, [jobId]: job }))
      keepPolling = job.status === 'pending' || job.status === 'processing'
      if (!keepPolling) {
        if (job.status === 'failed') {
          toast.error(job.errorMessage || 'Ingestion failed')
        }
        await refreshDocuments()
      }
    }
  }

  const onDrop = async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      const result = await uploadFile(file)
      const placeholder: Job = {
        jobId: result.job_id,
        docId: result.doc_id,
        sourceType: 'file',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      setJobs((state) => ({ ...state, [result.job_id]: placeholder }))
      void pollJob(result.job_id)
      toast.success(`${file.name} queued for ingestion`)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => void onDrop(files),
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/plain': ['.txt'],
    },
    multiple: true,
  })

  const submitUrl = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = url.trim()
    if (!URL_RE.test(trimmed)) {
      toast.error('Enter a valid http/https URL')
      return
    }
    const result = await uploadUrl(trimmed)
    const placeholder: Job = {
      jobId: result.job_id,
      docId: result.doc_id,
      sourceType: 'webpage',
      sourceUrl: trimmed,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setUrl('')
    setJobs((state) => ({ ...state, [result.job_id]: placeholder }))
    void pollJob(result.job_id)
    toast.success('URL queued for ingestion')
  }

  const removeDocument = async (docId: string) => {
    const previous = documents
    setDocuments((state) => state.filter((document) => document.docId !== docId))
    try {
      await deleteDocument(docId)
      toast.success('Document removed')
    } catch {
      setDocuments(previous)
      toast.error('Delete failed')
    }
  }

  const activeJobs = useMemo(() => Object.values(jobs).sort((a, b) => b.updatedAt - a.updatedAt), [jobs])
  const indexedChunks = documents.reduce((sum, document) => sum + (document.chunkCount ?? 0), 0)

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-label text-xs font-bold uppercase tracking-widest text-primary">Knowledge Base</p>
          <h1 className="mt-1 text-3xl font-bold text-on-surface">Documents and Web Sources</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{documents.length} documents, {indexedChunks} chunks indexed</p>
        </div>
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div
          {...getRootProps()}
          className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-surface-container-lowest p-8 text-center transition-colors ${
            isDragActive ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary'
          }`}
        >
          <input {...getInputProps()} />
          <UploadCloud className="mb-3 h-10 w-10 text-primary" />
          <h2 className="text-lg font-bold text-on-surface">Drop PDFs, DOCX, DOC, or TXT files</h2>
          <p className="mt-1 max-w-lg text-sm text-on-surface-variant">Files are stored in Convex, parsed by the backend, embedded with BGE-M3, and indexed into LanceDB.</p>
        </div>

        <form onSubmit={(event) => void submitUrl(event)} className="rounded-lg bg-surface-container-low p-5">
          <div className="mb-4 flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-primary" />
            <h2 className="font-bold text-on-surface">Ingest URL</h2>
          </div>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://cercind.gov.in/..."
            className="w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!url.trim()}
            className="mt-3 w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Queue URL
          </button>
        </form>
      </section>

      {activeJobs.length > 0 && (
        <section className="rounded-lg bg-surface-container-lowest p-4 shadow-sm">
          <h2 className="mb-3 font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">Ingestion Jobs</h2>
          <div className="grid gap-2">
            {activeJobs.map((job) => (
              <div key={job.jobId} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-container-low px-3 py-2 text-sm">
                <span className={job.status === 'processing' ? 'animate-pulse' : ''}>{statusIcon[job.status]}</span>
                <span className="font-semibold">{job.sourceUrl ?? job.docId ?? job.jobId}</span>
                <span className="ml-auto text-on-surface-variant">{job.progressMessage ?? job.status}</span>
                {job.errorMessage && <span className="w-full rounded bg-error-container px-3 py-2 text-on-error-container">{job.errorMessage}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-3">
        {documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center text-on-surface-variant">
            No documents indexed yet.
          </div>
        ) : (
          documents.map((document) => (
            <article key={document.docId} className="flex items-center gap-4 rounded-lg bg-surface-container-lowest p-4 shadow-sm">
              <FileText className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-on-surface">{document.name}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-on-surface-variant">
                  <span>{document.sourceType}</span>
                  <span>{document.ingestionStatus}</span>
                  <span>{document.chunkCount ?? 0} chunks</span>
                  <span>{document.imageCount ?? 0} images</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void removeDocument(document.docId)}
                className="rounded-lg p-2 text-error hover:bg-error-container"
                title="Delete document"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </article>
          ))
        )}
      </section>
    </div>
  )
}

export default KnowledgeBase
