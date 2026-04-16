import axios from 'axios'
import toast from 'react-hot-toast'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
const API_KEY = import.meta.env.VITE_BACKEND_API_KEY

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
  },
  timeout: 120000, // 120 seconds — LLM + embedding can be slow on cold start
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.detail?.message
      || error.response?.data?.message
      || error.message
      || 'An error occurred'
    const errorCode = error.response?.data?.detail?.error_code
      || error.response?.data?.error_code

    // Don't show toast for query or chat endpoints (handled by components)
    const silentPaths = ['/query', '/chat/', '/settings']
    const isSilent = silentPaths.some((p) => error.config?.url?.includes(p))

    if (!isSilent) {
      toast.error(`${errorCode ? `[${errorCode}] ` : ''}${message}`)
    }

    return Promise.reject(error)
  }
)

// ═══════════════════════════════════════════════════════════════════
//  TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export interface QueryRequest {
  question: string
  equipment_type?: string
  voltage_level?: string
  doc_types?: string[]
  use_fallback?: boolean
}

export interface Citation {
  source: string
  doc_type: string
  page: string
  chunk_index: number
  relevance_score: number
  equipment_type?: string
  voltage_level?: string
  text_preview: string
}

export interface QueryResponse {
  answer: string
  citations: Citation[]
  confidence: number
  model_used: string
  provider: string
  query_time_ms: number
  documents_retrieved: number
  is_insufficient: boolean
}

export interface DocumentUploadResponse {
  doc_id: string
  filename: string
  doc_type: string
  chunks_processed: number
  file_hash: string
  equipment_type?: string
  voltage_level?: string
  status: string
}

export interface HealthResponse {
  status: string
  version: string
  vector_store: {
    total_documents: number
    collection_name: string
    embedding_model: string
    status?: string
    error?: string
  }
  llm_provider: string
  llm_model: string
  convex_connected: boolean
}

export interface DocumentListItem {
  doc_id: string
  filename: string
  doc_type: string
  equipment_type?: string | null
  voltage_level?: string | null
  chunks_count: number
  uploaded_at?: string
}

export interface ChatMessagePayload {
  session_id: string
  role: string
  content: string
  timestamp?: string
  citations?: Citation[]
  confidence?: number
  model_used?: string
  query_time_ms?: number
}

export interface ChatSession {
  session_id: string
  created_at?: string
  updated_at?: string
  messages: ChatMessagePayload[]
}

export interface UserSettings {
  theme?: string
  notifications?: { critical: boolean; insights: boolean }
  profile?: { name?: string; designation?: string; email?: string }
}

export interface MetadataOption {
  value: string
  label: string
}

export interface MetadataOptionsResponse {
  equipment_types: MetadataOption[]
  voltage_levels: MetadataOption[]
  document_types: MetadataOption[]
}

// ═══════════════════════════════════════════════════════════════════
//  RAG QUERY
// ═══════════════════════════════════════════════════════════════════

export async function queryDocuments(request: QueryRequest): Promise<QueryResponse> {
  const response = await api.post<QueryResponse>('/query', request)
  return response.data
}

// ═══════════════════════════════════════════════════════════════════
//  DOCUMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

export async function uploadDocument(
  file: File,
  metadata?: {
    doc_type?: string
    equipment_type?: string
    voltage_level?: string
  }
): Promise<DocumentUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  if (metadata?.doc_type) formData.append('doc_type', metadata.doc_type)
  if (metadata?.equipment_type) formData.append('equipment_type', metadata.equipment_type)
  if (metadata?.voltage_level) formData.append('voltage_level', metadata.voltage_level)

  const response = await api.post<DocumentUploadResponse>('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export async function uploadMultipleDocuments(files: File[]): Promise<{
  processed: number
  failed: number
  documents: DocumentUploadResponse[]
  errors: { file: string; error: string }[]
}> {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))

  const response = await api.post('/documents/batch-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export async function listDocuments(): Promise<{ documents: DocumentListItem[]; total: number }> {
  const response = await api.get('/documents/list')
  return response.data
}

export async function deleteDocument(docId: string): Promise<{ status: string; message: string }> {
  const response = await api.delete(`/documents/${docId}`)
  return response.data
}

// ═══════════════════════════════════════════════════════════════════
//  CHAT PERSISTENCE
// ═══════════════════════════════════════════════════════════════════

export async function saveChatMessage(payload: ChatMessagePayload): Promise<void> {
  await api.post('/chat/message', payload)
}

export async function getChatHistory(sessionId: string): Promise<ChatSession> {
  const response = await api.get<ChatSession>(`/chat/history/${sessionId}`)
  return response.data
}

export async function listChatSessions(): Promise<{ sessions: { session_id: string; message_count: number }[] }> {
  const response = await api.get('/chat/sessions')
  return response.data
}

// ═══════════════════════════════════════════════════════════════════
//  USER SETTINGS
// ═══════════════════════════════════════════════════════════════════

export async function getUserSettings(): Promise<UserSettings> {
  const response = await api.get<UserSettings>('/settings')
  return response.data
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  await api.post('/settings', settings)
}

// ═══════════════════════════════════════════════════════════════════
//  HEALTH & STATS
// ═══════════════════════════════════════════════════════════════════

export async function getHealth(): Promise<HealthResponse> {
  const response = await api.get<HealthResponse>('/health')
  return response.data
}

export async function getStats(): Promise<{
  vector_store: {
    total_documents: number
    collection_name: string
    embedding_model: string
  }
  configuration: {
    chunk_size: number
    chunk_overlap: number
    embedding_model: string
    llm_provider: string
    llm_model: string
  }
}> {
  const response = await api.get('/stats')
  return response.data
}

export async function getMetadataOptions(): Promise<MetadataOptionsResponse> {
  const response = await api.get<MetadataOptionsResponse>('/metadata/options')
  return response.data
}
