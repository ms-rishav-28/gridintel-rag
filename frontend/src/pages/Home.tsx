import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { getHealth, type HealthResponse } from '../lib/api'
import { convexApi } from '../lib/convexApi'

const Home = () => {
  const navigate = useNavigate()

  const documents = useQuery(convexApi.documents.listActive, {}) ?? []
  const recentMessages = useQuery(convexApi.chat.listRecentMessages, { limit: 12 }) ?? []

  const [health, setHealth] = useState<HealthResponse | null>(null)

  useEffect(() => {
    const loadHealth = async () => {
      try {
        setHealth(await getHealth())
      } catch {
        setHealth(null)
      }
    }

    void loadHealth()

    const interval = setInterval(() => {
      void loadHealth()
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const totalChunks = health?.vector_store?.total_documents ?? 0
  const isOnline = !!health

  const formattedMessages = useMemo(
    () =>
      recentMessages.map((msg, index) => ({
        id: `${msg.session_id || 'session'}_${msg.timestamp || 'time'}_${index}`,
        ...msg,
      })),
    [recentMessages],
  )

  return (
    <>
      <section className="p-4 md:p-8">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary-container p-6 text-on-primary md:p-12">
          <div className="relative z-10 max-w-2xl">
            <span className="mb-4 block font-label text-xs uppercase tracking-[0.2em] opacity-80">Operation Dashboard</span>
            <h2 className="mb-6 font-headline text-4xl font-black leading-none tracking-tighter md:text-5xl">Welcome, Chief Engineer</h2>
            <p className="mb-8 text-lg font-light leading-relaxed opacity-90">
              POWERGRID Intelligence is {isOnline ? 'synchronized' : 'connecting'}.{' '}
              {isOnline
                ? `Access ${totalChunks} indexed knowledge chunks, real-time grid diagnostics, and maintenance protocols instantly.`
                : 'Start the backend server to enable AI-powered queries.'}
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => navigate('/chat')}
                className="flex items-center rounded-lg bg-surface-container-lowest px-6 py-3 font-bold text-primary transition-all hover:bg-blue-50"
              >
                <span className="material-symbols-outlined mr-2">bolt</span>
                Start Emergency Query
              </button>
              <button
                onClick={() => navigate('/knowledge-base')}
                className="flex items-center rounded-lg border border-white/20 bg-white/10 px-6 py-3 font-bold backdrop-blur-md transition-all hover:bg-white/20"
              >
                View Knowledge Base
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-1/2 opacity-10">
            <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
              <path
                d="M0 10 L100 10 M0 30 L100 30 M0 50 L100 50 M0 70 L100 70 M0 90 L100 90 M10 0 L10 100 M30 0 L30 100 M50 0 L50 100 M70 0 L70 100 M90 0 L90 100"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
              ></path>
            </svg>
          </div>
        </div>
      </section>

      <section className="px-4 pb-8 md:px-8 md:pb-12">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h3 className="font-headline text-2xl font-bold tracking-tight text-on-surface">Knowledge Hub</h3>
            <p className="text-sm text-outline">Automated retrieval of mission-critical documentation</p>
          </div>
          <button onClick={() => navigate('/knowledge-base')} className="flex items-center text-sm font-bold text-primary hover:underline">
            Expand Repository <span className="material-symbols-outlined ml-1 text-sm">open_in_new</span>
          </button>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          <div
            onClick={() => navigate('/knowledge-base')}
            className="col-span-1 cursor-pointer gap-6 rounded-xl bg-surface-container-lowest p-6 shadow-sm transition-shadow hover:shadow-md md:col-span-8 md:flex md:items-start md:gap-8 md:p-8"
          >
            <div className="h-48 w-full shrink-0 overflow-hidden rounded-lg md:h-48 md:w-1/3">
              <img
                className="h-full w-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCl7e0vtY8bmVFAWPkNZeuKmMzl6-tOGvJaILQNOzNfJlHKv8oxUBAdpPDGBzH1_TgSeOdnpSoy-4_jpoe_dYeaJ2kg1zMUdgVox2nYeSxwqr6I4DGaLLduBQWO3EXA3qHLy-eeJOsx69p-j-GmKY7VzeWFOCy1hMfjtMsLVIPx7owL-JRjOF-P5MuMVrWHzF3EsI0LdM9hur_cgDsyQRJMg67XdYUXI-S5EZYon2PqeJD3YJm9R3NzrUs2Yf13U3hfsWgmVV7hh7-x"
                alt="Manual"
              />
            </div>
            <div className="flex h-full flex-1 flex-col justify-between">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded-sm bg-secondary-container px-2 py-0.5 font-label text-[10px] font-bold uppercase text-on-secondary-container">
                    Standard OP
                  </span>
                  <span className="font-label text-[10px] uppercase text-outline">
                    {documents.length > 0 ? `${documents.length} docs indexed` : 'No docs yet'}
                  </span>
                </div>
                <h4 className="mb-2 text-xl font-bold">Technical Manuals and Blueprints</h4>
                <p className="text-sm leading-relaxed text-on-surface-variant">
                  Access full schematic diagrams for HVDC transmission lines and substation architectures. AI-optimized search indexing enabled.
                </p>
              </div>
              <button className="mt-6 flex items-center font-bold text-primary">
                Open Library <span className="material-symbols-outlined ml-2 transition-transform">arrow_forward</span>
              </button>
            </div>
          </div>

          <div className="col-span-1 flex flex-col justify-between rounded-xl bg-surface-container-high p-6 md:col-span-4 md:p-8">
            <div>
              <div className="mb-6 w-fit rounded-lg bg-primary p-3 text-on-primary">
                <span className="material-symbols-outlined">calendar_today</span>
              </div>
              <h4 className="mb-2 text-xl font-bold">System Health</h4>
              <p className="text-sm text-on-surface-variant">Live backend connection status and AI engine readiness indicators.</p>
            </div>
            <div className="mt-8 space-y-3">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2 text-sm">
                <span className="text-on-surface-variant">Backend</span>
                <span className={`font-bold ${isOnline ? 'text-secondary' : 'text-error'}`}>{isOnline ? 'Online' : 'Offline'}</span>
              </div>
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2 text-sm">
                <span className="text-on-surface-variant">LLM Provider</span>
                <span className="font-bold">{health?.llm_provider || '—'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">Indexed chunks</span>
                <span className="font-bold text-secondary">{totalChunks}</span>
              </div>
            </div>
          </div>

          <div onClick={() => navigate('/knowledge-base')} className="col-span-1 cursor-pointer rounded-xl bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high md:col-span-4">
            <span className="material-symbols-outlined mb-4 text-primary">verified_user</span>
            <h5 className="mb-1 font-bold">Safety Protocols</h5>
            <p className="text-xs text-on-surface-variant">Current OSHA and Grid-Specific safety mandates for field crew.</p>
          </div>
          <div onClick={() => navigate('/chat')} className="col-span-1 cursor-pointer rounded-xl bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high md:col-span-4">
            <span className="material-symbols-outlined mb-4 text-primary">analytics</span>
            <h5 className="mb-1 font-bold">Live Diagnostics</h5>
            <p className="text-xs text-on-surface-variant">Real-time load balancing data and thermal variance reports.</p>
          </div>
          <div onClick={() => navigate('/chat')} className="col-span-1 cursor-pointer rounded-xl bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high md:col-span-4">
            <span className="material-symbols-outlined mb-4 text-primary">history_edu</span>
            <h5 className="mb-1 font-bold">Incident Archive</h5>
            <p className="text-xs text-on-surface-variant">Historical post-mortem reports and mitigation strategies.</p>
          </div>
        </div>
      </section>

      <section className="px-4 pb-8 md:px-8 md:pb-12">
        <div className="rounded-xl bg-surface-container-lowest p-8 shadow-sm">
          <div className="mb-8 flex items-center justify-between">
            <h3 className="font-headline text-xl font-bold tracking-tight">Recent Knowledge Activity</h3>
            <div className="flex gap-2">
              <span className={`h-2 w-2 rounded-full ${formattedMessages.length > 0 ? 'bg-secondary' : 'bg-outline'}`}></span>
              <span className="font-label text-[10px] uppercase text-outline">
                {formattedMessages.length > 0 ? `${formattedMessages.length} recent events` : 'No activity yet'}
              </span>
            </div>
          </div>
          <div className="space-y-0">
            {formattedMessages.length > 0 ? (
              formattedMessages.slice(0, 6).map((msg, i) => (
                <div key={msg.id} className={`flex items-center gap-6 py-4 ${i < Math.min(formattedMessages.length, 6) - 1 ? 'border-b border-surface-container' : ''}`}>
                  <div className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-50' : 'bg-green-50'}`}>
                    <span className={`material-symbols-outlined ${msg.role === 'user' ? 'text-primary' : 'text-secondary'}`}>
                      {msg.role === 'user' ? 'chat_bubble' : 'smart_toy'}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h6 className="truncate text-sm font-bold">
                      {msg.role === 'user' ? `Query: ${msg.content.slice(0, 60)}${msg.content.length > 60 ? '...' : ''}` : 'AI Response'}
                    </h6>
                    <p className="mt-1 truncate text-xs text-on-surface-variant">
                      {msg.role === 'assistant' ? msg.content.slice(0, 100) + '...' : 'Sent to GridIntel AI'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block font-label text-[10px] uppercase text-outline">{msg.role === 'user' ? 'User' : 'AI'}</span>
                    <span className="text-xs text-on-surface-variant">
                      {new Date(msg.timestamp || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-6 border-b border-surface-container py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                  <span className="material-symbols-outlined text-primary">info</span>
                </div>
                <div className="flex-1">
                  <h6 className="text-sm font-bold">No recent activity</h6>
                  <p className="mt-1 text-xs text-on-surface-variant">Start a conversation in the Assistant to see activity here.</p>
                </div>
                <button onClick={() => navigate('/chat')} className="text-sm font-bold text-primary hover:underline">
                  Open Assistant →
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="fixed bottom-6 right-4 z-50 md:bottom-8 md:right-8">
        <div className="group relative">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary to-secondary opacity-25 blur transition duration-1000 group-hover:opacity-75 group-hover:duration-200"></div>
          <button
            onClick={() => navigate('/chat')}
            className="relative flex items-center gap-3 rounded-full bg-primary px-5 py-3 text-on-primary shadow-2xl transition-all hover:scale-105 active:scale-95 md:px-6 md:py-4"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
            <span className="text-sm font-bold tracking-tight md:text-base">Ask GridIntel AI</span>
          </button>
        </div>
      </div>
    </>
  )
}

export default Home
