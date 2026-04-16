import { makeFunctionReference, type DefaultFunctionArgs } from 'convex/server'

export interface ConvexDocument {
  doc_id: string
  filename: string
  doc_type: string
  equipment_type?: string | null
  voltage_level?: string | null
  chunks_count: number
  uploaded_at?: string
  status?: string
}

export interface ConvexChatMessage {
  session_id?: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  citations?: unknown[]
  confidence?: number
  model_used?: string
  query_time_ms?: number
}

export interface ConvexChatSession {
  session_id: string
  created_at?: string
  updated_at?: string
  message_count?: number
  messages?: ConvexChatMessage[]
}

export type ConvexSettings = Record<string, unknown> & {
  theme?: string
  notifications?: { critical: boolean; insights: boolean }
  profile?: { name?: string; designation?: string; email?: string }
}

const queryRef = <TArgs extends DefaultFunctionArgs, TReturn>(name: string) =>
  makeFunctionReference<'query', TArgs, TReturn>(name)

const mutationRef = <TArgs extends DefaultFunctionArgs, TReturn>(name: string) =>
  makeFunctionReference<'mutation', TArgs, TReturn>(name)

export const convexApi = {
  documents: {
    listActive: queryRef<{}, ConvexDocument[]>('documents:listActive'),
    softDeleteDocument: mutationRef<{ doc_id: string }, { status: string; doc_id: string }>(
      'documents:softDeleteDocument',
    ),
  },
  chat: {
    getSession: queryRef<{ session_id: string }, ConvexChatSession>('chat:getSession'),
    listSessions: queryRef<{}, ConvexChatSession[]>('chat:listSessions'),
    listRecentMessages: queryRef<{ limit?: number }, ConvexChatMessage[]>('chat:listRecentMessages'),
    saveMessage: mutationRef<
      {
        session_id: string
        role: string
        content: string
        timestamp?: string
        citations?: unknown[]
        confidence?: number
        model_used?: string
        query_time_ms?: number
      },
      { status: string; session_id: string }
    >('chat:saveMessage'),
  },
  settings: {
    getSettings: queryRef<{}, ConvexSettings>('settings:getSettings'),
    upsertSettings: mutationRef<ConvexSettings, { status: string }>('settings:upsertSettings'),
  },
} as const
