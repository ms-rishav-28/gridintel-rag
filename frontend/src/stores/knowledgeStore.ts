// CODEX-FIX: keep knowledge-store helpers compatible with the current backend API contracts.

import { create } from 'zustand'
import {
  deleteDocument,
  getHealth,
  listDocuments,
  uploadFile,
  uploadUrl,
  type DocumentRecord,
  type HealthResponse,
  type UploadResult,
} from '../lib/api'

export type DocumentItem = DocumentRecord

interface KnowledgeState {
  documents: DocumentRecord[]
  health: HealthResponse | null
  isLoading: boolean
  error: string | null
  fetchDocuments: () => Promise<void>
  fetchHealth: () => Promise<void>
  uploadFile: (file: File) => Promise<UploadResult | null>
  uploadUrl: (url: string) => Promise<UploadResult | null>
  removeDocument: (docId: string) => Promise<boolean>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed'
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  documents: [],
  health: null,
  isLoading: false,
  error: null,

  fetchDocuments: async () => {
    set({ isLoading: true, error: null })
    try {
      set({ documents: await listDocuments(), isLoading: false })
    } catch (error) {
      set({ isLoading: false, error: errorMessage(error) })
    }
  },

  fetchHealth: async () => {
    try {
      set({ health: await getHealth() })
    } catch {
      set({ health: null })
    }
  },

  uploadFile: async (file) => {
    try {
      return await uploadFile(file)
    } catch (error) {
      set({ error: errorMessage(error) })
      return null
    }
  },

  uploadUrl: async (url) => {
    try {
      return await uploadUrl(url)
    } catch (error) {
      set({ error: errorMessage(error) })
      return null
    }
  },

  removeDocument: async (docId) => {
    const previous = get().documents
    set({ documents: previous.filter((document) => document.docId !== docId) })
    try {
      await deleteDocument(docId)
      return true
    } catch {
      set({ documents: previous })
      return false
    }
  },
}))
