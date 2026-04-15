import { create } from 'zustand'
import {
  getHealth, getStats, listDocuments, uploadDocument, deleteDocument,
  getUserSettings, saveUserSettings,
  type HealthResponse, type DocumentListItem, type UserSettings,
} from '../lib/api'

export type { DocumentListItem as DocumentItem }

export interface StatsData {
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
}

interface KnowledgeState {
  documents: DocumentListItem[]
  isLoadingDocs: boolean
  health: HealthResponse | null
  stats: StatsData | null
  isLoadingHealth: boolean
  isUploading: boolean
  uploadError: string | null
  userSettings: UserSettings | null

  fetchDocuments: () => Promise<void>
  fetchHealth: () => Promise<void>
  fetchStats: () => Promise<void>
  fetchSettings: () => Promise<void>
  persistSettings: (settings: UserSettings) => Promise<void>
  uploadFile: (file: File, metadata?: { doc_type?: string; equipment_type?: string; voltage_level?: string }) => Promise<boolean>
  removeDocument: (docId: string) => Promise<boolean>
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  documents: [],
  isLoadingDocs: false,
  health: null,
  stats: null,
  isLoadingHealth: false,
  isUploading: false,
  uploadError: null,
  userSettings: null,

  fetchDocuments: async () => {
    set({ isLoadingDocs: true })
    try {
      const response = await listDocuments()
      set({ documents: response.documents, isLoadingDocs: false })
    } catch {
      set({ isLoadingDocs: false, documents: [] })
    }
  },

  fetchHealth: async () => {
    set({ isLoadingHealth: true })
    try {
      const health = await getHealth()
      set({ health, isLoadingHealth: false })
    } catch {
      set({ isLoadingHealth: false, health: null })
    }
  },

  fetchStats: async () => {
    try {
      const stats = await getStats()
      set({ stats })
    } catch {
      // silently fail
    }
  },

  fetchSettings: async () => {
    try {
      const settings = await getUserSettings()
      set({ userSettings: settings })
    } catch {
      // silently fail — use defaults
    }
  },

  persistSettings: async (settings: UserSettings) => {
    try {
      await saveUserSettings(settings)
      set({ userSettings: { ...get().userSettings, ...settings } })
    } catch {
      // silently fail
    }
  },

  uploadFile: async (file, metadata) => {
    set({ isUploading: true, uploadError: null })
    try {
      await uploadDocument(file, metadata)
      set({ isUploading: false })
      get().fetchDocuments()
      return true
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: { message?: string } } }; message?: string }
      const msg = error?.response?.data?.detail?.message || error?.message || 'Upload failed'
      set({ isUploading: false, uploadError: msg })
      return false
    }
  },

  removeDocument: async (docId: string) => {
    try {
      await deleteDocument(docId)
      set((state) => ({
        documents: state.documents.filter((d) => d.doc_id !== docId),
      }))
      return true
    } catch {
      return false
    }
  },
}))
