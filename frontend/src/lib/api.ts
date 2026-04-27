// CODEX-FIX: align frontend HTTP client with secured FastAPI RAG endpoints and typed responses.

import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import toast from 'react-hot-toast'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
const API_KEY = import.meta.env.VITE_BACKEND_API_KEY as string | undefined
const RETRY_DELAYS_MS = [2000, 4000, 8000] as const

interface RetryRequestConfig extends InternalAxiosRequestConfig {
  __retryCount?: number
}

interface ApiErrorPayload {
  detail?: unknown
  message?: string
  error_code?: string
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractErrorMessage(payload: ApiErrorPayload | undefined): string {
  const detail = payload?.detail
  if (typeof detail === 'string') return detail
  if (isRecord(detail) && typeof detail.message === 'string') return detail.message
  if (payload?.message) return payload.message
  return 'Request failed'
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000,
})

api.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers)
  headers.set('X-Request-ID', createRequestId())
  if (API_KEY) headers.set('X-API-Key', API_KEY)
  config.headers = headers
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorPayload>) => {
    const response = error.response
    const config = error.config as RetryRequestConfig | undefined

    if (response?.status === 503 && config) {
      const retryCount = config.__retryCount ?? 0
      if (retryCount < RETRY_DELAYS_MS.length) {
        config.__retryCount = retryCount + 1
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[retryCount]))
        return api.request(config)
      }
      toast.error('Backend is starting up...')
    } else if (response?.status === 401) {
      toast.error('API key invalid or missing')
    } else if (response?.status === 429) {
      const retryAfter = String(response.headers['retry-after'] ?? '')
      toast.error(`Rate limit - retry in ${retryAfter || 'a few'}s`)
    } else if (response && response.status >= 500) {
      toast.error('Server error. Check backend logs.')
    } else if (response && response.status >= 400) {
      toast.error(extractErrorMessage(response.data))
    }

    return Promise.reject(error)
  },
)

export type SourceType = 'pdf' | 'docx' | 'txt' | 'webpage'
export type IngestionStatus = 'pending' | 'processing' | 'done' | 'failed'
export type ChatRole = 'user' | 'assistant'

export interface RAGFilters {
  doc_ids?: string[]
  source_type?: SourceType
}

export interface Citation {
  docId: string
  docName: string
  pageNumber?: number | null
  chunkIndex?: number | null
  relevanceScore?: number | null
  chunkPreview?: string | null
  isImageChunk?: boolean | null
}

export interface RAGResponse {
  answer: string
  citations: Citation[]
  session_id: string
  llm_provider: string
  duration_ms: number
}

export interface UploadResult {
  doc_id: string
  job_id: string
  status: 'processing'
}

export interface Job {
  _id?: string
  jobId: string
  docId?: string
  sourceType: string
  sourceUrl?: string
  status: IngestionStatus
  progressMessage?: string
  errorMessage?: string
  totalChunks?: number
  processedChunks?: number
  createdAt: number
  updatedAt: number
}

export interface DocumentRecord {
  _id?: string
  docId: string
  name: string
  sourceType: SourceType
  sourceUrl?: string
  storageId?: string
  fileSizeBytes?: number
  chunkCount?: number
  imageCount?: number
  sha256?: string
  ingestionStatus: IngestionStatus
  errorMessage?: string
  createdAt: number
  updatedAt: number
}

export interface HealthResponse {
  status: 'healthy' | 'degraded'
  version: string
  components: {
    lancedb?: {
      status: string
      row_count: number
      path: string
      size_bytes?: number
    }
    convex?: { status: string }
    embedding_model?: { status: string; model: string }
    vision_model?: { status: string; model: string }
    llm?: { status: string; last_provider?: string | null }
  }
}

export interface Settings {
  llmProvider?: string
  llmModel?: string
  embeddingModel?: string
  enableVision?: boolean
  enableBrowserIngestion?: boolean
  systemPromptOverride?: string
}

export interface ChatSession {
  _id?: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
  userId?: string
}

export interface ChatMessageRecord {
  _id?: string
  sessionId?: string
  role: ChatRole
  content: string
  citations?: Citation[]
  llmProvider?: string
  durationMs?: number
  createdAt: number
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post<UploadResult>('/documents/upload', formData)
  return response.data
}

export async function uploadUrl(url: string): Promise<UploadResult> {
  const response = await api.post<UploadResult>('/documents/upload-url', { url })
  return response.data
}

export async function queryRag(
  query: string,
  sessionId?: string,
  filters?: RAGFilters,
): Promise<RAGResponse> {
  const response = await api.post<RAGResponse>('/query', {
    query,
    session_id: sessionId,
    filters,
  })
  return response.data
}

export async function getJob(jobId: string): Promise<Job> {
  const response = await api.get<Job>(`/jobs/${jobId}`)
  return response.data
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const response = await api.get<DocumentRecord[]>('/documents')
  return response.data
}

export async function deleteDocument(docId: string): Promise<void> {
  await api.delete(`/documents/${docId}`)
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await api.get<HealthResponse>('/health')
  return response.data
}

export async function getSettings(): Promise<Settings> {
  const response = await api.get<Settings>('/settings')
  return response.data
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  await api.post('/settings', settings)
}

export async function createChatSession(): Promise<{ session_id: string }> {
  const response = await api.post<{ session_id: string }>('/chat/sessions')
  return response.data
}

export async function listChatSessions(): Promise<ChatSession[]> {
  const response = await api.get<ChatSession[]>('/chat/sessions')
  return response.data
}

export async function getChatMessages(sessionId: string): Promise<ChatMessageRecord[]> {
  const response = await api.get<ChatMessageRecord[]>(`/chat/sessions/${sessionId}/messages`)
  return response.data
}
