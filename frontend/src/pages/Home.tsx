import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { useChatStore } from '../stores/chatStore'

const Home = () => {
  const navigate = useNavigate()
  const { health, documents, fetchHealth, fetchDocuments } = useKnowledgeStore()
  const { messages } = useChatStore()

  useEffect(() => {
    fetchHealth()
    fetchDocuments()
  }, [fetchHealth, fetchDocuments])

  const totalChunks = health?.vector_store?.total_documents ?? 0
  const isOnline = !!health

  return (
    <>
      {/* Hero Section */}
      <section className="p-4 md:p-8">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary-container p-6 text-on-primary md:p-12">
          <div className="relative z-10 max-w-2xl">
            <span className="font-label text-xs uppercase tracking-[0.2em] opacity-80 mb-4 block">Operation Dashboard</span>
            <h2 className="mb-6 font-headline text-4xl font-black leading-none tracking-tighter md:text-5xl">Welcome, Chief Engineer</h2>
            <p className="text-lg opacity-90 font-light leading-relaxed mb-8">
              POWERGRID Intelligence is {isOnline ? 'synchronized' : 'connecting'}. {isOnline ? `Access ${totalChunks} indexed knowledge chunks, real-time grid diagnostics, and maintenance protocols instantly.` : 'Start the backend server to enable AI-powered queries.'}
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => navigate('/chat')}
                className="bg-surface-container-lowest text-primary px-6 py-3 font-bold rounded-lg flex items-center hover:bg-blue-50 transition-all"
              >
                <span className="material-symbols-outlined mr-2">bolt</span>
                Start Emergency Query
              </button>
              <button
                onClick={() => navigate('/knowledge-base')}
                className="border border-white/20 bg-white/10 backdrop-blur-md px-6 py-3 font-bold rounded-lg flex items-center hover:bg-white/20 transition-all"
              >
                View Knowledge Base
              </button>
            </div>
          </div>
          {/* Decorative Grid */}
          <div className="absolute right-0 bottom-0 top-0 w-1/2 opacity-10 pointer-events-none">
            <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
              <path d="M0 10 L100 10 M0 30 L100 30 M0 50 L100 50 M0 70 L100 70 M0 90 L100 90 M10 0 L10 100 M30 0 L30 100 M50 0 L50 100 M70 0 L70 100 M90 0 L90 100" fill="none" stroke="currentColor" strokeWidth="0.5"></path>
            </svg>
          </div>
        </div>
      </section>

      {/* Bento Grid Quick Actions */}
      <section className="px-4 pb-8 md:px-8 md:pb-12">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h3 className="text-2xl font-bold font-headline tracking-tight text-on-surface">Knowledge Hub</h3>
            <p className="text-outline text-sm">Automated retrieval of mission-critical documentation</p>
          </div>
          <button onClick={() => navigate('/knowledge-base')} className="text-primary font-bold text-sm flex items-center hover:underline">
            Expand Repository <span className="material-symbols-outlined ml-1 text-sm">open_in_new</span>
          </button>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Large Card: Technical Manuals */}
          <div
            onClick={() => navigate('/knowledge-base')}
            className="col-span-1 cursor-pointer gap-6 rounded-xl bg-surface-container-lowest p-6 shadow-sm transition-shadow hover:shadow-md md:col-span-8 md:flex md:items-start md:gap-8 md:p-8"
          >
            <div className="h-48 w-full shrink-0 overflow-hidden rounded-lg md:h-48 md:w-1/3">
              <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCl7e0vtY8bmVFAWPkNZeuKmMzl6-tOGvJaILQNOzNfJlHKv8oxUBAdpPDGBzH1_TgSeOdnpSoy-4_jpoe_dYeaJ2kg1zMUdgVox2nYeSxwqr6I4DGaLLduBQWO3EXA3qHLy-eeJOsx69p-j-GmKY7VzeWFOCy1hMfjtMsLVIPx7owL-JRjOF-P5MuMVrWHzF3EsI0LdM9hur_cgDsyQRJMg67XdYUXI-S5EZYon2PqeJD3YJm9R3NzrUs2Yf13U3hfsWgmVV7hh7-x" alt="Manual" />
            </div>
            <div className="flex h-full flex-1 flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-sm font-label text-[10px] uppercase font-bold">Standard OP</span>
                  <span className="text-outline font-label text-[10px] uppercase">
                    {documents.length > 0 ? `${documents.length} docs indexed` : 'No docs yet'}
                  </span>
                </div>
                <h4 className="text-xl font-bold mb-2">Technical Manuals & Blueprints</h4>
                <p className="text-on-surface-variant text-sm leading-relaxed">Access full schematic diagrams for HVDC transmission lines and substation architectures. AI-optimized search indexing enabled.</p>
              </div>
              <button className="mt-6 flex items-center text-primary font-bold">
                Open Library <span className="material-symbols-outlined ml-2 group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
            </div>
          </div>

          {/* Vertical Card: Maintenance */}
          <div className="col-span-1 flex flex-col justify-between rounded-xl bg-surface-container-high p-6 md:col-span-4 md:p-8">
            <div>
              <div className="p-3 bg-primary text-on-primary w-fit rounded-lg mb-6">
                <span className="material-symbols-outlined">calendar_today</span>
              </div>
              <h4 className="text-xl font-bold mb-2">System Health</h4>
              <p className="text-on-surface-variant text-sm">Live backend connection status and AI engine readiness indicators.</p>
            </div>
            <div className="mt-8 space-y-3">
              <div className="flex items-center justify-between text-sm border-b border-outline-variant/30 pb-2">
                <span className="text-on-surface-variant">Backend</span>
                <span className={`font-bold ${isOnline ? 'text-secondary' : 'text-error'}`}>{isOnline ? 'Online' : 'Offline'}</span>
              </div>
              <div className="flex items-center justify-between text-sm border-b border-outline-variant/30 pb-2">
                <span className="text-on-surface-variant">LLM Provider</span>
                <span className="font-bold">{health?.llm_provider || '—'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">Indexed chunks</span>
                <span className="text-secondary font-bold">{totalChunks}</span>
              </div>
            </div>
          </div>

          {/* Small Cards */}
          <div onClick={() => navigate('/knowledge-base')} className="col-span-1 cursor-pointer rounded-xl bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high md:col-span-4">
            <span className="material-symbols-outlined text-primary mb-4">verified_user</span>
            <h5 className="font-bold mb-1">Safety Protocols</h5>
            <p className="text-xs text-on-surface-variant">Current OSHA and Grid-Specific safety mandates for field crew.</p>
          </div>
          <div onClick={() => navigate('/chat')} className="col-span-1 cursor-pointer rounded-xl bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high md:col-span-4">
            <span className="material-symbols-outlined text-primary mb-4">analytics</span>
            <h5 className="font-bold mb-1">Live Diagnostics</h5>
            <p className="text-xs text-on-surface-variant">Real-time load balancing data and thermal variance reports.</p>
          </div>
          <div onClick={() => navigate('/chat')} className="col-span-1 cursor-pointer rounded-xl bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high md:col-span-4">
            <span className="material-symbols-outlined text-primary mb-4">history_edu</span>
            <h5 className="font-bold mb-1">Incident Archive</h5>
            <p className="text-xs text-on-surface-variant">Historical post-mortem reports and mitigation strategies.</p>
          </div>
        </div>
      </section>

      {/* Recent Activity Section — LIVE */}
      <section className="px-4 pb-8 md:px-8 md:pb-12">
        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold font-headline tracking-tight">Recent Knowledge Activity</h3>
            <div className="flex gap-2">
              <span className={`h-2 w-2 rounded-full ${messages.length > 0 ? 'bg-secondary' : 'bg-outline'}`}></span>
              <span className="font-label text-[10px] uppercase text-outline">
                {messages.length > 0 ? `${messages.length} messages this session` : 'No activity yet'}
              </span>
            </div>
          </div>
          <div className="space-y-0">
            {messages.length > 0 ? (
              [...messages].reverse().slice(0, 6).map((msg, i) => (
                <div key={msg.id} className={`flex items-center py-4 gap-6 ${i < Math.min(messages.length, 6) - 1 ? 'border-b border-surface-container' : ''}`}>
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-blue-50' : 'bg-green-50'}`}>
                    <span className={`material-symbols-outlined ${msg.role === 'user' ? 'text-primary' : 'text-secondary'}`}>
                      {msg.role === 'user' ? 'chat_bubble' : 'smart_toy'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h6 className="text-sm font-bold truncate">
                      {msg.role === 'user' ? `Query: ${msg.content.slice(0, 60)}${msg.content.length > 60 ? '...' : ''}` : 'AI Response'}
                    </h6>
                    <p className="text-xs text-on-surface-variant mt-1 truncate">
                      {msg.role === 'assistant' ? msg.content.slice(0, 100) + '...' : 'Sent to GridIntel AI'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-label text-[10px] text-outline block uppercase">{msg.role === 'user' ? 'User' : 'AI'}</span>
                    <span className="text-xs text-on-surface-variant">{new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))
            ) : (
              <>
                <div className="flex items-center py-4 border-b border-surface-container gap-6">
                  <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary">info</span>
                  </div>
                  <div className="flex-1">
                    <h6 className="text-sm font-bold">No recent activity</h6>
                    <p className="text-xs text-on-surface-variant mt-1">Start a conversation in the Assistant to see activity here.</p>
                  </div>
                  <button onClick={() => navigate('/chat')} className="text-primary font-bold text-sm hover:underline">
                    Open Assistant →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* AI Floating Button */}
      <div className="fixed bottom-6 right-4 z-50 md:bottom-8 md:right-8">
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-secondary rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
          <button
            onClick={() => navigate('/chat')}
            className="relative flex items-center gap-3 rounded-full bg-primary px-5 py-3 text-on-primary shadow-2xl transition-all hover:scale-105 active:scale-95 md:px-6 md:py-4"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
            <span className="font-bold tracking-tight text-sm md:text-base">Ask GridIntel AI</span>
          </button>
        </div>
      </div>
    </>
  )
}

export default Home
