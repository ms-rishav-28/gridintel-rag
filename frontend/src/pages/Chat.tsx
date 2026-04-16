import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useNavigate } from 'react-router-dom'
import {
  getMetadataOptions,
  queryDocuments,
  type Citation,
  type MetadataOptionsResponse,
} from '../lib/api'
import { convexApi, type ConvexChatMessage } from '../lib/convexApi'
import { formatConfidence, formatDuration } from '../lib/utils'

interface ChatMessage {
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

const SESSION_KEY = 'powergrid_session_id'
const CHAT_PREFILL_KEY = 'powergrid_chat_prefill'

function getOrCreateSessionId() {
  const existing = sessionStorage.getItem(SESSION_KEY)
  if (existing) return existing

  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  sessionStorage.setItem(SESSION_KEY, sessionId)
  return sessionId
}

function createNewSessionId() {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  sessionStorage.setItem(SESSION_KEY, sessionId)
  return sessionId
}

const Chat = () => {
  const navigate = useNavigate()
  const [sessionId, setSessionId] = useState(() => getOrCreateSessionId())
  const [inputValue, setInputValue] = useState('')
  const [selectedEquipment, setSelectedEquipment] = useState('')
  const [selectedVoltage, setSelectedVoltage] = useState('')
  const [selectedDocTypes, setSelectedDocTypes] = useState<string[]>([])
  const [useFallback, setUseFallback] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [metadataOptions, setMetadataOptions] = useState<MetadataOptionsResponse | null>(null)
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const saveMessage = useMutation(convexApi.chat.saveMessage)
  const session = useQuery(convexApi.chat.getSession, { session_id: sessionId })

  const messages: ChatMessage[] = useMemo(() => {
    const source = session?.messages ?? []
    return source.map((message: ConvexChatMessage, index) => ({
      id: `${message.timestamp || 'ts'}_${index}`,
      role: message.role,
      content: message.content,
      timestamp: new Date(message.timestamp || Date.now()),
      citations: (message.citations as Citation[] | undefined) ?? [],
      confidence: message.confidence,
      modelUsed: message.model_used,
      provider: message.provider,
      queryTimeMs: message.query_time_ms,
      documentsRetrieved: message.documents_retrieved,
      isInsufficient: message.is_insufficient,
    }))
  }, [session?.messages])

  useEffect(() => {
    const prefill = sessionStorage.getItem(CHAT_PREFILL_KEY)
    if (!prefill) return

    setInputValue(prefill)
    sessionStorage.removeItem(CHAT_PREFILL_KEY)
  }, [])

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        setIsLoadingMetadata(true)
        const options = await getMetadataOptions()
        setMetadataOptions(options)
      } catch {
        setMetadataOptions(null)
      } finally {
        setIsLoadingMetadata(false)
      }
    }
    loadMetadata()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const latestAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant' && m.citations && m.citations.length > 0),
    [messages],
  )

  const activeFiltersCount =
    (selectedEquipment ? 1 : 0) +
    (selectedVoltage ? 1 : 0) +
    (selectedDocTypes.length > 0 ? 1 : 0) +
    (useFallback ? 1 : 0)

  const handleDocTypeToggle = (value: string) => {
    setSelectedDocTypes((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    )
  }

  const handleSubmit = async () => {
    const question = inputValue.trim()
    if (!question || isLoading) return

    const timestamp = new Date().toISOString()
    setInputValue('')
    setIsLoading(true)

    await saveMessage({
      session_id: sessionId,
      role: 'user',
      content: question,
      timestamp,
    })

    try {
      const response = await queryDocuments({
        question,
        equipment_type: selectedEquipment || undefined,
        voltage_level: selectedVoltage || undefined,
        doc_types: selectedDocTypes.length > 0 ? selectedDocTypes : undefined,
        use_fallback: useFallback,
      })

      await saveMessage({
        session_id: sessionId,
        role: 'assistant',
        content: response.answer,
        timestamp: new Date().toISOString(),
        citations: response.citations,
        confidence: response.confidence,
        model_used: response.model_used,
        provider: response.provider,
        query_time_ms: response.query_time_ms,
        documents_retrieved: response.documents_retrieved,
        is_insufficient: response.is_insufficient,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get response from backend.'
      await saveMessage({
        session_id: sessionId,
        role: 'assistant',
        content: `⚠️ Error: ${message}`,
        timestamp: new Date().toISOString(),
      })
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const handleClearSession = () => {
    setSessionId(createNewSessionId())
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-blue-100 bg-surface-container-low px-4 py-4 md:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowFilters((prev) => !prev)}
              className="flex items-center gap-2 rounded-lg bg-surface-container-lowest px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-blue-50"
            >
              <span className="material-symbols-outlined text-base">tune</span>
              Retrieval Filters
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs">{activeFiltersCount}</span>
            </button>
            <button
              onClick={() => {
                setSelectedEquipment('')
                setSelectedVoltage('')
                setSelectedDocTypes([])
                setUseFallback(true)
              }}
              className="rounded-lg px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
            >
              Reset Filters
            </button>
            <div className="ml-auto text-xs text-on-surface-variant">
              {isLoadingMetadata ? 'Loading metadata options...' : 'Filters apply to next query'}
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 grid gap-4 rounded-xl border border-blue-100 bg-surface-container-lowest p-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Equipment Type</span>
                <select
                  value={selectedEquipment}
                  onChange={(e) => setSelectedEquipment(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Any equipment</option>
                  {(metadataOptions?.equipment_types || []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Voltage Level</span>
                <select
                  value={selectedVoltage}
                  onChange={(e) => setSelectedVoltage(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Any voltage level</option>
                  {(metadataOptions?.voltage_levels || []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2 md:col-span-2">
                <span className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Document Types</span>
                <div className="flex flex-wrap gap-2">
                  {(metadataOptions?.document_types || []).map((option) => {
                    const active = selectedDocTypes.includes(option.value)
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleDocTypeToggle(option.value)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container-high text-on-surface-variant hover:bg-blue-100'
                        }`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <label className="flex items-center gap-3 md:col-span-2">
                <input
                  type="checkbox"
                  checked={useFallback}
                  onChange={(e) => setUseFallback(e.target.checked)}
                  className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                />
                <span className="text-sm text-on-surface-variant">
                  Enable fallback retrieval when strict filters return insufficient context
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          <div className="space-y-8 pb-20">
            {messages.length === 0 && !isLoading && (
              <div className="flex min-h-[40vh] flex-col items-center justify-center text-center opacity-70">
                <span className="material-symbols-outlined mb-5 text-6xl text-primary/30">smart_toy</span>
                <h3 className="mb-2 text-2xl font-bold text-on-surface/60">GridIntel Assistant</h3>
                <p className="max-w-lg text-on-surface-variant">
                  Ask safety-critical questions about POWERGRID maintenance protocols, CEA standards, and technical manuals.
                </p>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  {[
                    'What is the maintenance interval for a 220 kV circuit breaker?',
                    'Safety procedures for transformer oil testing?',
                    'CEA guideline on transmission line inspection?',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setInputValue(suggestion)
                        inputRef.current?.focus()
                      }}
                      className="rounded-xl bg-surface-container-low px-4 py-2 text-left text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id}>{msg.role === 'user' ? <UserBubble message={msg} /> : <AssistantBubble message={msg} />}</div>
            ))}

            {isLoading && (
              <div className="flex max-w-4xl flex-col items-start">
                <div className="mb-2 flex items-center gap-3 px-1">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-white">
                    <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
                      smart_toy
                    </span>
                  </div>
                  <span className="font-label text-[10px] font-bold uppercase tracking-widest text-primary">GridIntel Analyzing</span>
                </div>
                <div className="w-full max-w-xl rounded-2xl rounded-tl-none bg-surface-container-lowest p-6 shadow-sm ring-1 ring-blue-100/50">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '0ms' }}></span>
                      <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '150ms' }}></span>
                      <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '300ms' }}></span>
                    </div>
                    <span className="text-sm text-on-surface-variant">Retrieving documents and generating a response...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-blue-100 bg-gradient-to-t from-surface via-surface to-surface/90 px-4 py-4 md:px-8 md:py-6">
          <div className="mx-auto max-w-5xl">
            <div className="rounded-2xl bg-surface-container-lowest p-2 shadow-lg ring-2 ring-blue-100 transition-all focus-within:ring-primary">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/knowledge-base')}
                  className="rounded-xl p-3 text-slate-400 transition-colors hover:text-primary"
                  aria-label="Attach file"
                  title="Open Knowledge Base upload"
                >
                  <span className="material-symbols-outlined">attach_file</span>
                </button>
                <input
                  ref={inputRef}
                  className="flex-1 border-none bg-transparent px-2 py-3 text-on-surface placeholder:text-slate-400 focus:ring-0"
                  placeholder="Ask GridIntel about maintenance, safety, or standards..."
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                />
                <button
                  onClick={() => void handleSubmit()}
                  disabled={isLoading || !inputValue.trim()}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-on-primary shadow-md transition-all active:scale-90 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send message"
                >
                  <span className="material-symbols-outlined">{isLoading ? 'hourglass_top' : 'send'}</span>
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-4">
              <button
                onClick={() => {
                  setInputValue('Show recent maintenance queries')
                  inputRef.current?.focus()
                }}
                className="flex items-center gap-1 text-[10px] font-label uppercase tracking-widest text-slate-400 transition-colors hover:text-primary"
              >
                <span className="material-symbols-outlined text-xs">history</span>
                Recent queries
              </button>
              <button
                onClick={() => {
                  setInputValue('List available site manuals')
                  inputRef.current?.focus()
                }}
                className="flex items-center gap-1 text-[10px] font-label uppercase tracking-widest text-slate-400 transition-colors hover:text-primary"
              >
                <span className="material-symbols-outlined text-xs">book</span>
                Site manuals
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className="w-full border-t border-blue-100 bg-surface-container-low p-5 lg:w-80 lg:border-l lg:border-t-0 lg:p-6">
        <div className="space-y-6 lg:sticky lg:top-20">
          <div>
            <h3 className="mb-4 font-label text-xs font-bold uppercase tracking-widest text-slate-500">Referenced Documents</h3>
            {latestAssistant?.citations && latestAssistant.citations.length > 0 ? (
              <div className="space-y-3">
                {latestAssistant.citations.map((citation, index) => (
                  <div
                    key={`${citation.source}_${citation.chunk_index}_${index}`}
                    className={`rounded-xl border-l-4 bg-surface-container-lowest p-4 shadow-sm ${
                      index === 0 ? 'border-primary' : 'border-secondary'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="material-symbols-outlined text-primary">description</span>
                      <span className="rounded bg-blue-50 px-2 py-0.5 font-label text-[10px] text-blue-600">
                        {citation.doc_type}
                      </span>
                    </div>
                    <h4 className="mt-2 text-sm font-bold text-blue-900">{citation.source}</h4>
                    <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{citation.text_preview}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] font-label text-outline">Score: {formatConfidence(citation.relevance_score)}</span>
                      <span className="text-[10px] font-label text-outline">Page {citation.page}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs italic text-on-surface-variant">Ask a question to view source citations.</p>
            )}
          </div>

          <div>
            <h3 className="mb-4 font-label text-xs font-bold uppercase tracking-widest text-slate-500">Session Info</h3>
            <div className="rounded-xl bg-primary p-4 text-on-primary">
              <div className="mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">database</span>
                <span className="font-label text-xs uppercase">Chat Session</span>
              </div>
              <p className="mb-3 text-sm font-medium">{messages.length} messages in this session.</p>
              {latestAssistant?.queryTimeMs && (
                <p className="text-[10px] opacity-90">Last query time: {formatDuration(latestAssistant.queryTimeMs)}</p>
              )}
              {messages.length > 0 && (
                <button
                  onClick={handleClearSession}
                  className="mt-3 w-full rounded-lg bg-on-primary/10 py-1.5 text-xs font-bold text-on-primary transition-colors hover:bg-on-primary/20"
                >
                  Clear Session
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="ml-auto flex w-full max-w-3xl flex-col items-end">
      <div className="mb-2 flex items-center gap-3 px-1">
        <span className="font-label text-[10px] uppercase tracking-widest text-slate-400">
          User Request • {new Date(message.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="rounded-2xl rounded-tr-none bg-surface-container-highest p-6 text-on-surface shadow-sm ring-1 ring-outline-variant/10">
        <p className="leading-relaxed">{message.content}</p>
      </div>
    </div>
  )
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex w-full max-w-4xl flex-col items-start">
      <div className="mb-2 flex flex-wrap items-center gap-3 px-1">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-white">
          <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
            smart_toy
          </span>
        </div>
        <span className="font-label text-[10px] font-bold uppercase tracking-widest text-primary">
          GridIntel Analysis • {new Date(message.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {message.confidence !== undefined && (
          <span className="font-label text-[10px] uppercase text-secondary">Confidence: {formatConfidence(message.confidence)}</span>
        )}
      </div>

      <div className="w-full space-y-5 rounded-2xl rounded-tl-none bg-surface-container-lowest p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-blue-100/50">
        <div className="prose prose-sm max-w-none text-on-surface">
          {message.content.split('\n').map((paragraph, index) =>
            paragraph.trim() ? (
              <p key={index} className="mb-2 leading-relaxed">
                {paragraph}
              </p>
            ) : null,
          )}
        </div>

        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-3 border-t border-blue-50 pt-4">
            {message.citations.map((citation, index) => (
              <span
                key={`${citation.source}_${citation.chunk_index}_${index}`}
                className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-primary"
              >
                <span className="material-symbols-outlined text-sm">description</span>
                {citation.source} {citation.page && `§${citation.page}`}
              </span>
            ))}
          </div>
        )}

        {message.queryTimeMs !== undefined && (
          <div className="flex flex-wrap gap-4 border-t border-blue-50 pt-3 text-[10px] font-label uppercase text-outline">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">schedule</span>
              {formatDuration(message.queryTimeMs)}
            </span>
            {message.modelUsed && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">memory</span>
                {message.modelUsed}
              </span>
            )}
            {message.provider && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">cloud</span>
                {message.provider}
              </span>
            )}
            {message.documentsRetrieved !== undefined && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">article</span>
                {message.documentsRetrieved} docs
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Chat
