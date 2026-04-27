// CODEX-FIX: rebuild chat UI around persisted sessions, optimistic sending, and citation cards.

import { FormEvent, useEffect, useRef, useState } from 'react'
import { Bot, Database, FileText, Image as ImageIcon, Loader2, Plus, Send } from 'lucide-react'
import { useChatStore, type Message, type Session } from '../stores/chatStore'
import { formatDuration } from '../lib/utils'

const EXAMPLES = [
  'Summarize the latest CERC transmission planning guidance in the repository.',
  'Which uploaded documents mention protection relay testing?',
  'Find diagrams or scanned tables related to substation maintenance.',
]

const Chat = () => {
  const {
    sessions,
    currentSessionId,
    messages,
    isLoading,
    error,
    loadSessions,
    createSession,
    setCurrentSession,
    sendMessage,
    clearError,
  } = useChatStore()
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const boot = async () => {
      await loadSessions()
      const latest = useChatStore.getState().sessions[0]
      if (latest) {
        await setCurrentSession(latest.id)
      } else {
        await createSession()
      }
    }
    void boot()
  }, [createSession, loadSessions, setCurrentSession])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isLoading])

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const query = draft.trim()
    if (!query || isLoading) return
    setDraft('')
    await sendMessage(query)
  }

  return (
    <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 bg-surface lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-b border-outline-variant/40 bg-surface-container-low p-4 lg:border-b-0 lg:border-r">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">Sessions</h2>
          <button
            type="button"
            onClick={() => void createSession()}
            className="rounded-lg p-2 text-primary hover:bg-surface-container-high"
            title="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {sessions.map((session) => (
            <SessionButton
              key={session.id}
              session={session}
              active={session.id === currentSessionId}
              onClick={() => void setCurrentSession(session.id)}
            />
          ))}
          {sessions.length === 0 && (
            <p className="rounded-lg border border-dashed border-outline-variant p-4 text-sm text-on-surface-variant">
              No sessions yet.
            </p>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col">
        <div className="border-b border-outline-variant/40 bg-surface-container-lowest px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-on-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-on-surface">POWERGRID SmartOps Assistant</h1>
              <p className="text-xs text-on-surface-variant">Hybrid retrieval with Convex history and LanceDB context</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-4 flex items-center justify-between rounded-lg border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container md:mx-6">
            <span>{error}</span>
            <button type="button" onClick={clearError} className="font-semibold">Dismiss</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
          {messages.length === 0 && !isLoading ? (
            <div className="mx-auto flex max-w-3xl flex-col justify-center gap-5 py-16">
              <div>
                <p className="font-label text-xs font-bold uppercase tracking-widest text-primary">Ready</p>
                <h2 className="mt-2 text-2xl font-bold text-on-surface">Ask from the indexed knowledge base.</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setDraft(example)}
                    className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4 text-left text-sm text-on-surface-variant hover:border-primary hover:text-on-surface"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-5">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && <LoadingBubble />}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <form onSubmit={(event) => void submit(event)} className="border-t border-outline-variant/40 bg-surface-container-lowest p-4 md:p-6">
          <div className="mx-auto flex max-w-4xl items-end gap-3 rounded-lg border border-outline-variant bg-white p-2 focus-within:border-primary">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submit()
                }
              }}
              rows={2}
              placeholder="Ask about uploaded documents, regulatory pages, scanned tables, or diagrams..."
              className="min-h-[52px] flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm outline-none focus:ring-0"
            />
            <button
              type="submit"
              disabled={isLoading || !draft.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
              title="Send"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function SessionButton({ session, active, onClick }: { session: Session; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg p-3 text-left transition-colors ${
        active ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-high'
      }`}
    >
      <div className="truncate text-sm font-semibold">{session.title || 'New Chat'}</div>
      <div className={`mt-1 text-xs ${active ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
        {session.messageCount} messages
      </div>
    </button>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] rounded-lg p-4 ${isUser ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface shadow-sm'}`}>
        <div className="whitespace-pre-wrap text-sm leading-6">{message.content}</div>
        {!isUser && message.citations && message.citations.length > 0 && (
          <details className="mt-4 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <summary className="cursor-pointer text-xs font-bold text-primary">Sources ({message.citations.length})</summary>
            <div className="mt-3 grid gap-3">
              {message.citations.map((citation, index) => (
                <div key={`${citation.docId}_${citation.chunkIndex}_${index}`} className="rounded-lg bg-white p-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-on-surface">
                    {citation.isImageChunk ? <ImageIcon className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
                    <span className="truncate">{citation.docName}</span>
                    <span className="ml-auto text-on-surface-variant">{citation.pageNumber ?? 'web'}</span>
                  </div>
                  {citation.chunkPreview && (
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-on-surface-variant">{citation.chunkPreview.slice(0, 200)}</p>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
        {!isUser && message.durationMs && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-on-surface-variant">
            <Database className="h-3.5 w-3.5" />
            <span>{message.llmProvider ?? 'llm'} in {formatDuration(message.durationMs)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingBubble() {
  return (
    <div className="max-w-xl rounded-lg bg-surface-container-lowest p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold text-primary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Retrieving and reranking
      </div>
      <div className="space-y-2">
        <div className="h-3 w-5/6 animate-pulse rounded bg-surface-container-high" />
        <div className="h-3 w-4/6 animate-pulse rounded bg-surface-container-high" />
        <div className="h-3 w-3/6 animate-pulse rounded bg-surface-container-high" />
      </div>
    </div>
  )
}

export default Chat
