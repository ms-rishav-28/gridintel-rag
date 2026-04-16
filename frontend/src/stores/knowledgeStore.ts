import { create } from 'zustand'
import {
  getHealth, getStats, listDocuments, uploadDocument, uploadDocumentFromUrl, deleteDocument,
  getUserSettings, saveUserSettings, getMetadataOptions, uploadMultipleDocuments,
  type HealthResponse, type DocumentListItem, type UserSettings, type MetadataOptionsResponse,
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
  metadataOptions: MetadataOptionsResponse | null
  isLoadingMetadata: boolean
  isSavingSettings: boolean
  settingsError: string | null

  fetchDocuments: () => Promise<void>
  fetchHealth: () => Promise<void>
  fetchStats: () => Promise<void>
  fetchSettings: () => Promise<void>
  fetchMetadataOptions: () => Promise<void>
  persistSettings: (settings: UserSettings) => Promise<boolean>
  uploadFile: (file: File, metadata?: { doc_type?: string; equipment_type?: string; voltage_level?: string }) => Promise<boolean>
  uploadUrl: (url: string, metadata?: { doc_type?: string; equipment_type?: string; voltage_level?: string }) => Promise<boolean>
  uploadFiles: (files: File[]) => Promise<{ processed: number; failed: number }>
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
  metadataOptions: null,
  isLoadingMetadata: false,
  isSavingSettings: false,
  settingsError: null,

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
      set({ userSettings: settings, settingsError: null })
    } catch {
      set({ settingsError: 'Failed to load settings' })
    }
  },

  fetchMetadataOptions: async () => {
    set({ isLoadingMetadata: true })
    try {
      const metadataOptions = await getMetadataOptions()
      set({ metadataOptions, isLoadingMetadata: false })
    } catch {
      set({ metadataOptions: null, isLoadingMetadata: false })
    }
  },

  persistSettings: async (settings: UserSettings) => {
    set({ isSavingSettings: true, settingsError: null })
    try {
      await saveUserSettings(settings)
      set({
        userSettings: { ...get().userSettings, ...settings },
        isSavingSettings: false,
      })
      return true
    } catch {
      set({ isSavingSettings: false, settingsError: 'Failed to save settings' })
      return false
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

  uploadUrl: async (url, metadata) => {
    set({ isUploading: true, uploadError: null })
    try {
      await uploadDocumentFromUrl({
        url,
        doc_type: metadata?.doc_type,
        equipment_type: metadata?.equipment_type,
        voltage_level: metadata?.voltage_level,
      })
      set({ isUploading: false })
      get().fetchDocuments()
      return true
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: { message?: string } } }; message?: string }
      const msg = error?.response?.data?.detail?.message || error?.message || 'URL ingestion failed'
      set({ isUploading: false, uploadError: msg })
      return false
    }
  },

  uploadFiles: async (files) => {
    set({ isUploading: true, uploadError: null })
    try {
      const result = await uploadMultipleDocuments(files)
      set({ isUploading: false })
      get().fetchDocuments()
      return { processed: result.processed, failed: result.failed }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: { message?: string } } }; message?: string }
      const msg = error?.response?.data?.detail?.message || error?.message || 'Batch upload failed'
      set({ isUploading: false, uploadError: msg })
      return { processed: 0, failed: files.length }
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
