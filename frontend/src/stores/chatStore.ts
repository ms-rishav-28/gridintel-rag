// CODEX-FIX: make chat state session-aware and backed by the RAG API/Convex persistence path.

import { create } from 'zustand'
import {
  createChatSession,
  getChatMessages,
  listChatSessions,
  queryRag,
  type Citation,
  type ChatMessageRecord,
  type ChatSession,
} from '../lib/api'

export interface Session {
  id: string
  title: string
  messageCount: number
  updatedAt: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  createdAt: number
  llmProvider?: string
  durationMs?: number
}

interface ChatStore {
  sessions: Session[]
  currentSessionId: string | null
  messages: Message[]
  isLoading: boolean
  error: string | null
  loadSessions: () => Promise<void>
  createSession: () => Promise<string>
  setCurrentSession: (id: string) => Promise<void>
  sendMessage: (query: string) => Promise<void>
  clearError: () => void
}

function normalizeSession(session: ChatSession): Session {
  return {
    id: session._id ?? '',
    title: session.title,
    messageCount: session.messageCount,
    updatedAt: session.updatedAt,
  }
}

function normalizeMessage(message: ChatMessageRecord, index: number): Message {
  return {
    id: message._id ?? `${message.role}_${message.createdAt}_${index}`,
    role: message.role,
    content: message.content,
    citations: message.citations,
    createdAt: message.createdAt,
    llmProvider: message.llmProvider,
    durationMs: message.durationMs,
  }
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed'
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: [],
  isLoading: false,
  error: null,

  loadSessions: async () => {
    const rawSessions = await listChatSessions()
    const sessions = rawSessions.map(normalizeSession).filter((session) => session.id)
    set({ sessions })
  },

  createSession: async () => {
    const result = await createChatSession()
    const session: Session = {
      id: result.session_id,
      title: 'New Chat',
      messageCount: 0,
      updatedAt: Date.now(),
    }
    set((state) => ({
      sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
      currentSessionId: session.id,
      messages: [],
      error: null,
    }))
    return session.id
  },

  setCurrentSession: async (id: string) => {
    set({ currentSessionId: id, isLoading: true, error: null })
    try {
      const records = await getChatMessages(id)
      set({
        messages: records.map(normalizeMessage),
        isLoading: false,
      })
    } catch (error) {
      set({ isLoading: false, error: errorToMessage(error), messages: [] })
    }
  },

  sendMessage: async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return

    let sessionId = get().currentSessionId
    if (!sessionId) {
      sessionId = await get().createSession()
    }

    const optimistic: Message = {
      id: `local_user_${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    }

    set((state) => ({
      messages: [...state.messages, optimistic],
      isLoading: true,
      error: null,
    }))

    try {
      const response = await queryRag(trimmed, sessionId)
      const assistant: Message = {
        id: `local_assistant_${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        citations: response.citations,
        createdAt: Date.now(),
        llmProvider: response.llm_provider,
        durationMs: response.duration_ms,
      }
      set((state) => ({
        messages: [...state.messages, assistant],
        currentSessionId: response.session_id,
        isLoading: false,
      }))
      void get().loadSessions()
    } catch (error) {
      set((state) => ({
        messages: state.messages.filter((message) => message.id !== optimistic.id),
        isLoading: false,
        error: errorToMessage(error),
      }))
    }
  },

  clearError: () => set({ error: null }),
}))
