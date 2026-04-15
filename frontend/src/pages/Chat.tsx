import { useState, useRef, useEffect } from 'react'
import { useChatStore, type ChatMessage } from '../stores/chatStore'
import { formatDuration, formatConfidence } from '../lib/utils'

const Chat = () => {
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { messages, isLoading, sendMessage, clearChat, hydrateFromBackend } = useChatStore()

  // Hydrate chat history from backend on mount
  useEffect(() => {
    hydrateFromBackend()
  }, [hydrateFromBackend])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSubmit = async () => {
    const question = inputValue.trim()
    if (!question || isLoading) return
    setInputValue('')
    await sendMessage(question)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  // Find the latest assistant message's citations for the sidebar
  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.citations && m.citations.length > 0)

  return (
    <div className="flex flex-col flex-1 h-[calc(100vh-64px)] relative">
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col p-8 overflow-y-auto space-y-8 pb-48">
          {/* Empty State */}
          {messages.length === 0 && !isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-60">
              <span className="material-symbols-outlined text-6xl text-primary/30 mb-6">smart_toy</span>
              <h3 className="text-2xl font-bold text-on-surface/50 mb-2">GridIntel Assistant</h3>
              <p className="text-on-surface-variant max-w-md">
                Ask questions about POWERGRID maintenance protocols, CEA guidelines, safety procedures, or equipment specifications.
              </p>
              <div className="flex flex-wrap gap-3 mt-8 max-w-lg justify-center">
                {[
                  'What is the maintenance interval for a 220 kV circuit breaker?',
                  'Safety procedures for transformer oil testing?',
                  'CEA guideline on transmission line inspection',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => { setInputValue(suggestion); inputRef.current?.focus() }}
                    className="px-4 py-2 bg-surface-container-low text-on-surface-variant text-sm rounded-xl hover:bg-surface-container-high transition-colors text-left"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === 'user' ? (
                <UserBubble message={msg} formatTime={formatTime} />
              ) : (
                <AssistantBubble message={msg} formatTime={formatTime} />
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex flex-col items-start max-w-4xl w-full animate-pulse">
              <div className="flex items-center gap-3 mb-2 px-1">
                <div className="w-6 h-6 bg-primary text-white rounded flex items-center justify-center">
                  <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                </div>
                <span className="text-[10px] font-label text-primary uppercase tracking-widest font-bold">GridIntel Analyzing...</span>
              </div>
              <div className="bg-surface-container-lowest p-8 rounded-2xl rounded-tl-none shadow-sm ring-1 ring-blue-100/50 w-full max-w-xl">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <span className="text-sm text-on-surface-variant">Retrieving knowledge and generating response...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Context Panel (Sidebar) */}
        <aside className="w-80 bg-surface-container-low border-l border-blue-100 p-6 flex flex-col gap-6 overflow-y-auto pb-40">
          <div>
            <h3 className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest mb-4">Referenced Documents</h3>
            {latestAssistant?.citations && latestAssistant.citations.length > 0 ? (
              <div className="space-y-3">
                {latestAssistant.citations.map((citation, i) => (
                  <div key={i} className={`bg-surface-container-lowest p-4 rounded-xl shadow-sm border-l-4 ${i === 0 ? 'border-primary' : 'border-secondary'}`}>
                    <div className="flex items-start justify-between">
                      <span className="material-symbols-outlined text-primary">{i === 0 ? 'menu_book' : 'engineering'}</span>
                      <span className={`text-[10px] font-label px-2 py-0.5 rounded ${i === 0 ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                        {citation.doc_type}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-blue-900 mt-2">{citation.source}</h4>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{citation.text_preview}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] font-label text-outline">Score: {formatConfidence(citation.relevance_score)}</span>
                      <span className="text-[10px] font-label text-outline">Page {citation.page}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant italic">Ask a question to see referenced documents here.</p>
            )}
          </div>
          <div>
            <h3 className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest mb-4">Session Info</h3>
            <div className="p-4 bg-primary text-on-primary rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-sm">database</span>
                <span className="text-xs font-label uppercase">Chat Session</span>
              </div>
              <p className="text-sm font-medium mb-3">{messages.length} messages in this session.</p>
              {latestAssistant?.queryTimeMs && (
                <p className="text-[10px] mt-2 opacity-80">Last query: {formatDuration(latestAssistant.queryTimeMs)}</p>
              )}
              {messages.length > 0 && (
                <button onClick={clearChat} className="mt-3 w-full bg-on-primary/10 text-on-primary py-1.5 rounded-lg text-xs font-bold hover:bg-on-primary/20 transition-colors">
                  Clear Session
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 w-[calc(100%-320px)] p-8 bg-gradient-to-t from-surface via-surface/90 to-transparent">
        <div className="max-w-4xl mx-auto relative group">
          <div className="absolute inset-0 bg-primary/5 blur-xl rounded-2xl transition-all group-focus-within:bg-primary/10"></div>
          <div className="relative bg-surface-container-lowest ring-2 ring-blue-100 rounded-2xl shadow-lg p-2 flex items-center transition-all focus-within:ring-primary focus-within:ring-offset-2">
            <button className="p-3 text-slate-400 hover:text-primary transition-colors">
              <span className="material-symbols-outlined">attach_file</span>
            </button>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent border-none focus:ring-0 text-on-surface py-4 px-2 placeholder:text-slate-400"
              placeholder="Ask GridIntel about maintenance, safety, or manuals..."
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <div className="flex items-center gap-2 px-2">
              <button className="p-3 text-slate-400 hover:text-primary transition-colors">
                <span className="material-symbols-outlined">mic</span>
              </button>
              <button
                onClick={handleSubmit}
                disabled={isLoading || !inputValue.trim()}
                className="bg-primary text-on-primary w-12 h-12 flex items-center justify-center rounded-xl transition-all active:scale-90 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined">{isLoading ? 'hourglass_top' : 'send'}</span>
              </button>
            </div>
          </div>
          <div className="flex justify-center gap-6 mt-3">
            <button
              onClick={() => { setInputValue('Show recent maintenance queries'); inputRef.current?.focus() }}
              className="text-[10px] font-label text-slate-400 hover:text-primary uppercase tracking-widest flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">history</span> Recent queries
            </button>
            <button
              onClick={() => { setInputValue('List available site manuals'); inputRef.current?.focus() }}
              className="text-[10px] font-label text-slate-400 hover:text-primary uppercase tracking-widest flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">book</span> Site manuals
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────

function UserBubble({ message, formatTime }: { message: ChatMessage; formatTime: (d: Date) => string }) {
  return (
    <div className="flex flex-col items-end max-w-3xl ml-auto w-full group">
      <div className="flex items-center gap-3 mb-2 px-1">
        <span className="text-[10px] font-label text-slate-400 uppercase tracking-widest">
          User Request • {formatTime(message.timestamp)}
        </span>
      </div>
      <div className="bg-surface-container-highest p-6 rounded-2xl rounded-tr-none text-on-surface shadow-sm ring-1 ring-outline-variant/10">
        <p className="leading-relaxed">{message.content}</p>
      </div>
    </div>
  )
}

function AssistantBubble({ message, formatTime }: { message: ChatMessage; formatTime: (d: Date) => string }) {
  return (
    <div className="flex flex-col items-start max-w-4xl w-full">
      <div className="flex items-center gap-3 mb-2 px-1">
        <div className="w-6 h-6 bg-primary text-white rounded flex items-center justify-center">
          <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
        </div>
        <span className="text-[10px] font-label text-primary uppercase tracking-widest font-bold">
          GridIntel Analysis • {formatTime(message.timestamp)}
        </span>
        {message.confidence !== undefined && (
          <span className="text-[10px] font-label text-secondary uppercase">
            Confidence: {formatConfidence(message.confidence)}
          </span>
        )}
      </div>
      <div className="bg-surface-container-lowest p-8 rounded-2xl rounded-tl-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-blue-100/50 space-y-6 w-full">
        <div className="prose prose-sm max-w-none text-on-surface">
          {message.content.split('\n').map((paragraph, i) => (
            paragraph.trim() ? <p key={i} className="leading-relaxed mb-2">{paragraph}</p> : null
          ))}
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="pt-6 border-t border-blue-50 flex flex-wrap gap-4">
            {message.citations.map((citation, i) => (
              <span key={i} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full text-xs font-medium text-primary">
                <span className="material-symbols-outlined text-sm">description</span>
                {citation.source} {citation.page && `§${citation.page}`}
              </span>
            ))}
          </div>
        )}

        {/* Metadata row */}
        {message.queryTimeMs !== undefined && (
          <div className="flex gap-4 text-[10px] font-label text-outline uppercase pt-2">
            <span>⏱ {formatDuration(message.queryTimeMs)}</span>
            {message.modelUsed && <span>🤖 {message.modelUsed}</span>}
            {message.documentsRetrieved !== undefined && <span>📄 {message.documentsRetrieved} docs</span>}
          </div>
        )}
      </div>
    </div>
  )
}

export default Chat
