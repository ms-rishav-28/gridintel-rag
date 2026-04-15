import { useEffect, useState } from 'react'
import { useKnowledgeStore } from '../stores/knowledgeStore'

const Settings = () => {
  const { health, stats, isLoadingHealth, fetchHealth, fetchStats } = useKnowledgeStore()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    fetchHealth()
    fetchStats()
  }, [fetchHealth, fetchStats])

  // Refresh health data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      fetchHealth()
    }, 30000) // every 30 seconds
    return () => clearInterval(interval)
  }, [fetchHealth])

  const toggleTheme = (mode: 'light' | 'dark') => {
    setTheme(mode)
    document.documentElement.classList.toggle('dark', mode === 'dark')
  }

  const isBackendOnline = !!health
  const totalDocs = health?.vector_store?.total_documents ?? 0

  return (
    <>
      <div className="p-8 space-y-8 max-w-6xl w-full mx-auto flex-1">
        {/* Header */}
        <div className="flex justify-between items-end mb-12">
          <div className="space-y-1">
            <h2 className="text-4xl font-black text-on-surface tracking-tighter">System Configuration</h2>
            <p className="text-on-surface-variant font-label text-sm tracking-tight uppercase">Operational Parameters & Personalization</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-sm border ${isBackendOnline ? 'bg-secondary-container border-secondary/20' : 'bg-error-container border-error/20'}`}>
              <span className={`material-symbols-outlined text-sm ${isBackendOnline ? 'text-on-secondary-container' : 'text-on-error-container'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                {isBackendOnline ? 'check_circle' : 'error'}
              </span>
              <span className={`font-label text-[10px] font-bold uppercase tracking-widest ${isBackendOnline ? 'text-on-secondary-container' : 'text-on-error-container'}`}>
                {isBackendOnline ? 'Backend Connected' : 'Backend Offline'}
              </span>
            </div>
            {health?.firebase_connected && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-sm border bg-orange-50 border-orange-200">
                <span className="material-symbols-outlined text-sm text-orange-600" style={{ fontVariationSettings: "'FILL' 1" }}>cloud_done</span>
                <span className="font-label text-[10px] font-bold uppercase tracking-widest text-orange-700">Firebase Active</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Profile Section */}
          <div className="col-span-12 lg:col-span-8 bg-surface-container-low rounded-xl p-8 flex flex-col md:flex-row gap-8">
            <div className="relative group">
              <div className="w-32 h-32 rounded-xl overflow-hidden ring-4 ring-surface-container-lowest">
                <img alt="Field Engineer Profile" className="w-full h-full object-cover transition-transform group-hover:scale-105" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDU62Y-bbdFM4vhMBUDGRoheXGsugrKPmZVGd_EZ4JM9CUObG0lh2T80hG5rTlEzL6S5_263-8od-WYpA8NWTORo6bPIknrMuh0PyVhD25EQ0htCECjqfn0-fA2m62eIBQvKc-q1cQrxHC_sWsb_u7c0FnrxWUuGgSs-X6FOrL_tS6_x3yVeC-Le9Vj7DE7arsyF0ZGbI4rEgqjI0d1PPKRJm57JdQd7SGhiCmb6TkJVOrgGW3Fast3AWvhGbYJsvXZ1UzljtIJ8d18" />
              </div>
              <button className="absolute -bottom-2 -right-2 bg-primary text-on-primary p-2 rounded-lg shadow-lg hover:bg-primary-container transition-all">
                <span className="material-symbols-outlined text-sm">edit</span>
              </button>
            </div>
            <div className="flex-1 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="font-label text-xs font-bold text-primary uppercase tracking-widest">Field ID Name</label>
                  <input className="w-full bg-surface-container-lowest border-none border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-lg p-3 font-medium text-on-surface transition-all" type="text" defaultValue="Elena Rodriguez" />
                </div>
                <div className="space-y-1">
                  <label className="font-label text-xs font-bold text-primary uppercase tracking-widest">Designation</label>
                  <input className="w-full bg-surface-container-lowest border-none border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-lg p-3 font-medium text-on-surface transition-all" type="text" defaultValue="Senior Grid Analyst" />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="font-label text-xs font-bold text-primary uppercase tracking-widest">Direct Comms (Email)</label>
                  <input className="w-full bg-surface-container-lowest border-none border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-lg p-3 font-medium text-on-surface transition-all" type="email" defaultValue="e.rodriguez@powergrid.ai" />
                </div>
              </div>
            </div>
          </div>

          {/* Appearance Selection */}
          <div className="col-span-12 lg:col-span-4 bg-surface-container rounded-xl p-8 space-y-6">
            <h3 className="font-label text-sm font-bold text-on-surface tracking-widest uppercase">Visual Mode</h3>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => toggleTheme('light')}
                className={`flex items-center justify-between p-4 rounded-xl transition-all ${theme === 'light' ? 'bg-surface-container-lowest border-2 border-primary text-primary' : 'bg-surface-container-high text-on-surface-variant hover:text-primary'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined">light_mode</span>
                  <span className="font-semibold">Light Industry</span>
                </div>
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: theme === 'light' ? "'FILL' 1" : "'FILL' 0" }}>
                  {theme === 'light' ? 'radio_button_checked' : 'radio_button_unchecked'}
                </span>
              </button>
              <button
                onClick={() => toggleTheme('dark')}
                className={`flex items-center justify-between p-4 rounded-xl transition-all ${theme === 'dark' ? 'bg-surface-container-lowest border-2 border-primary text-primary' : 'bg-surface-container-high text-on-surface-variant hover:text-primary'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined">dark_mode</span>
                  <span className="font-semibold">Midnight Grid</span>
                </div>
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: theme === 'dark' ? "'FILL' 1" : "'FILL' 0" }}>
                  {theme === 'dark' ? 'radio_button_checked' : 'radio_button_unchecked'}
                </span>
              </button>
            </div>
          </div>

          {/* AI System Health Panel — LIVE DATA */}
          <div className="col-span-12 bg-surface-container-lowest rounded-xl overflow-hidden border border-outline-variant/10">
            <div className="bg-surface-container-high px-8 py-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">monitoring</span>
                <h3 className="font-label text-sm font-black text-on-surface tracking-widest uppercase">Engine Health & Pipeline Integrity</h3>
              </div>
              <div className="flex items-center gap-4">
                {isLoadingHealth ? (
                  <span className="material-symbols-outlined text-sm text-outline animate-spin">progress_activity</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isBackendOnline ? 'bg-secondary' : 'bg-error'}`}></span>
                    <span className="font-label text-[10px] font-bold text-on-surface-variant">
                      {isBackendOnline ? `${totalDocs} chunks indexed` : 'Offline'}
                    </span>
                  </span>
                )}
                <button onClick={() => { fetchHealth(); fetchStats() }} className="p-1 text-outline hover:text-primary transition-colors" title="Refresh">
                  <span className="material-symbols-outlined text-sm">refresh</span>
                </button>
              </div>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* RAG Pipeline */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-label text-xs font-bold text-on-surface tracking-wide uppercase">RAG Pipeline</span>
                  <span className={`text-[10px] font-label font-bold ${isBackendOnline ? 'text-secondary' : 'text-error'}`}>
                    {isBackendOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-surface-container rounded-xl">
                  <span className="material-symbols-outlined text-primary text-3xl">database</span>
                  <div>
                    <div className="font-black text-xl text-primary leading-none">{totalDocs}</div>
                    <div className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Total Chunks</div>
                  </div>
                </div>
                <p className="text-xs text-on-surface-variant font-label leading-tight">
                  {stats ? `Embedding: ${stats.configuration.embedding_model.split('/').pop()}` : 'Loading...'}
                </p>
              </div>

              {/* LLM Connection */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-label text-xs font-bold text-on-surface tracking-wide uppercase">
                    {health?.llm_model || 'LLM'}
                  </span>
                  <span className={`text-[10px] font-label font-bold ${isBackendOnline ? 'text-secondary' : 'text-error'}`}>
                    {isBackendOnline ? 'CONNECTED' : 'DISCONNECTED'}
                  </span>
                </div>
                <div className="flex items-center gap-4 p-4 bg-surface-container rounded-xl">
                  <span className="material-symbols-outlined text-primary text-3xl">cloud_done</span>
                  <div>
                    <div className="font-black text-xl text-primary leading-none">{health?.llm_provider || '—'}</div>
                    <div className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Provider</div>
                  </div>
                </div>
              </div>

              {/* Configuration */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-label text-xs font-bold text-on-surface tracking-wide uppercase">Chunking Config</span>
                  <span className="text-[10px] font-label text-secondary font-bold">{stats ? 'ACTIVE' : '—'}</span>
                </div>
                <div className="p-4 bg-surface-container rounded-xl space-y-3">
                  <div className="flex justify-between text-[10px] font-bold font-label uppercase">
                    <span>Chunk size</span>
                    <span>{stats?.configuration.chunk_size ?? '—'}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold font-label uppercase">
                    <span>Overlap</span>
                    <span>{stats?.configuration.chunk_overlap ?? '—'}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold font-label uppercase">
                    <span>Collection</span>
                    <span>{health?.vector_store?.collection_name ?? '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="col-span-12 lg:col-span-6 bg-surface-container-low rounded-xl p-8 space-y-6">
            <h3 className="font-label text-sm font-bold text-on-surface tracking-widest uppercase">Notification Protocols</h3>
            <div className="space-y-4">
              <ToggleRow icon="warning" title="Critical Grid Failures" subtitle="Immediate mobile push & email" defaultChecked />
              <ToggleRow icon="insights" title="AI Optimization Insights" subtitle="Weekly summarized report" defaultChecked />
            </div>
          </div>

          {/* Security & Logs */}
          <div className="col-span-12 lg:col-span-6 bg-surface-container rounded-xl p-8 space-y-6">
            <h3 className="font-label text-sm font-bold text-on-surface tracking-widest uppercase">Security & Verification</h3>
            <div className="space-y-4">
              <button className="w-full flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl hover:bg-white transition-colors group">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-primary">key</span>
                  <div className="text-left">
                    <div className="font-bold text-on-surface">Change Access Credentials</div>
                    <div className="text-xs text-on-surface-variant">Last updated 14 days ago</div>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant group-hover:translate-x-1 transition-transform">chevron_right</span>
              </button>
              <button className="w-full flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl hover:bg-white transition-colors group">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-primary">history</span>
                  <div className="text-left">
                    <div className="font-bold text-on-surface">Analysis Audit Log</div>
                    <div className="text-xs text-on-surface-variant">View all historical AI interactions</div>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant group-hover:translate-x-1 transition-transform">chevron_right</span>
              </button>
            </div>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex justify-end gap-4 pt-12">
          <button className="px-8 py-3 text-primary font-bold hover:bg-blue-100/50 rounded-xl transition-all">
            Revert to Default
          </button>
          <button className="px-10 py-3 bg-primary text-on-primary font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-container transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">save</span>
            Deploy Changes
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto p-8 text-center text-on-surface-variant opacity-50">
        <p className="font-label text-[10px] uppercase tracking-[0.3em]">Authorized Access Only • POWERGRID Industrial Intelligence • Proprietary System</p>
      </footer>
    </>
  )
}

// ─── Toggle Row Sub-component ─────────────────────────────────

function ToggleRow({ icon, title, subtitle, defaultChecked = false }: { icon: string; title: string; subtitle: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked)

  return (
    <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl">
      <div className="flex items-center gap-4">
        <span className="material-symbols-outlined text-primary">{icon}</span>
        <div>
          <div className="font-bold text-on-surface">{title}</div>
          <div className="text-xs text-on-surface-variant">{subtitle}</div>
        </div>
      </div>
      <button
        onClick={() => setChecked(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-surface-container-highest'}`}
      >
        <span className={`absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

export default Settings
