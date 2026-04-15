import { create } from 'zustand'
import { queryDocuments, saveChatMessage, getChatHistory, type QueryResponse, type Citation } from '../lib/api'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  citations?: Citation[]
  confidence?: number
  modelUsed?: string
  provider?: string
  queryTimeMs?: number
  documentsRetrieved?: number
  isInsufficient?: boolean
}

interface ChatState {
  sessionId: string
  messages: ChatMessage[]
  isLoading: boolean
  isHydrated: boolean
  error: string | null
  sendMessage: (question: string) => Promise<void>
  clearChat: () => void
  hydrateFromBackend: () => Promise<void>
}

let messageCounter = 0
const generateId = () => `msg_${Date.now()}_${++messageCounter}`

// Generate a stable session ID per browser tab
const SESSION_KEY = 'powergrid_session_id'
function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: getOrCreateSessionId(),
  messages: [],
  isLoading: false,
  isHydrated: false,
  error: null,

  hydrateFromBackend: async () => {
    if (get().isHydrated) return
    try {
      const session = await getChatHistory(get().sessionId)
      if (session?.messages?.length) {
        const hydrated: ChatMessage[] = session.messages.map((m, i) => ({
          id: `hydrated_${i}`,
          role: (m.role as 'user' | 'assistant'),
          content: m.content,
          timestamp: new Date(m.timestamp || Date.now()),
          citations: m.citations as Citation[] | undefined,
          confidence: m.confidence as number | undefined,
          modelUsed: m.model_used as string | undefined,
          queryTimeMs: m.query_time_ms as number | undefined,
        }))
        set({ messages: hydrated, isHydrated: true })
      } else {
        set({ isHydrated: true })
      }
    } catch {
      // Backend might be offline — that's fine, proceed with empty state
      set({ isHydrated: true })
    }
  },

  sendMessage: async (question: string) => {
    const sessionId = get().sessionId
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    }

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      error: null,
    }))

    // Persist user message (fire-and-forget)
    saveChatMessage({
      session_id: sessionId,
      role: 'user',
      content: question,
    }).catch(() => {})

    try {
      const response: QueryResponse = await queryDocuments({ question, use_fallback: true })

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
        citations: response.citations,
        confidence: response.confidence,
        modelUsed: response.model_used,
        provider: response.provider,
        queryTimeMs: response.query_time_ms,
        documentsRetrieved: response.documents_retrieved,
        isInsufficient: response.is_insufficient,
      }

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false,
      }))

      // Persist assistant message (fire-and-forget)
      saveChatMessage({
        session_id: sessionId,
        role: 'assistant',
        content: response.answer,
        citations: response.citations,
        confidence: response.confidence,
        model_used: response.model_used,
        query_time_ms: response.query_time_ms,
      }).catch(() => {})

    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: { message?: string } } }; message?: string }
      const errorMsg = error?.response?.data?.detail?.message || error?.message || 'Failed to get response'

      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `⚠️ Error: ${errorMsg}. Please check that the backend server is running.`,
        timestamp: new Date(),
        isInsufficient: true,
      }

      set((state) => ({
        messages: [...state.messages, errorMessage],
        isLoading: false,
        error: errorMsg,
      }))
    }
  },

  clearChat: () => {
    // New session on clear
    const newId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem(SESSION_KEY, newId)
    set({ messages: [], error: null, sessionId: newId, isHydrated: true })
  },
}))
