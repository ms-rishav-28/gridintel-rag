import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  getHealth,
  getStats,
  getUserSettings,
  saveUserSettings,
  type HealthResponse,
  type UserSettings,
} from '../lib/api'

interface StatsData {
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

const Settings = () => {
  const navigate = useNavigate()
  const [settingsData, setSettingsData] = useState<UserSettings | null>(null)

  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [isLoadingHealth, setIsLoadingHealth] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [profile, setProfile] = useState({
    name: 'Grid Engineer',
    designation: 'Field Analyst',
    email: 'engineer@powergrid.local',
  })
  const [notifications, setNotifications] = useState({
    critical: true,
    insights: true,
  })

  const refreshHealth = async () => {
    try {
      setIsLoadingHealth(true)
      const [nextHealth, nextStats] = await Promise.all([getHealth(), getStats()])
      setHealth(nextHealth)
      setStats(nextStats)
    } catch {
      setHealth(null)
    } finally {
      setIsLoadingHealth(false)
    }
  }

  useEffect(() => {
    void refreshHealth()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshHealth()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const nextSettings = await getUserSettings()
        setSettingsData(nextSettings)
      } catch {
        setSettingsData(null)
      }
    }

    void loadSettings()
  }, [])

  useEffect(() => {
    if (!settingsData) return

    const nextTheme = settingsData.theme === 'dark' ? 'dark' : 'light'
    setTheme(nextTheme)

    setProfile((prev) => ({
      name: settingsData.profile?.name || prev.name,
      designation: settingsData.profile?.designation || prev.designation,
      email: settingsData.profile?.email || prev.email,
    }))

    setNotifications((prev) => ({
      critical: settingsData.notifications?.critical ?? prev.critical,
      insights: settingsData.notifications?.insights ?? prev.insights,
    }))
  }, [settingsData])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const isBackendOnline = !!health
  const totalDocs = health?.vector_store?.total_documents ?? 0

  const saveDisabled = useMemo(() => {
    return isSavingSettings || !profile.name.trim() || !profile.email.trim()
  }, [isSavingSettings, profile.email, profile.name])

  const handleSave = async () => {
    try {
      setIsSavingSettings(true)
      setSettingsError(null)
      const payload: UserSettings = {
        theme,
        notifications,
        profile,
      }

      await saveUserSettings(payload)
      setSettingsData(payload)
      toast.success('Settings saved successfully.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save settings.'
      setSettingsError(message)
      toast.error(message)
    } finally {
      setIsSavingSettings(false)
    }
  }

  const handleReset = () => {
    setTheme('light')
    setNotifications({ critical: true, insights: true })
    setProfile({
      name: settingsData?.profile?.name || 'Grid Engineer',
      designation: settingsData?.profile?.designation || 'Field Analyst',
      email: settingsData?.profile?.email || 'engineer@powergrid.local',
    })
    document.documentElement.classList.remove('dark')
  }

  const handleCredentialCardClick = async () => {
    const hint = 'X-API-Key: <your-backend-api-key>'
    try {
      await navigator.clipboard.writeText(hint)
      toast.success('API header template copied to clipboard.')
    } catch {
      toast('Set VITE_BACKEND_API_KEY and BACKEND_API_KEY with the same value.')
    }
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col space-y-8 p-4 md:p-8">
        <div className="mb-4 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-4xl font-black tracking-tighter text-on-surface">System Configuration</h2>
            <p className="font-label text-sm uppercase tracking-tight text-on-surface-variant">
              Operational Parameters and Personalization
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-sm border px-3 py-1 ${
                isBackendOnline ? 'border-secondary/20 bg-secondary-container' : 'border-error/20 bg-error-container'
              }`}
            >
              <span
                className={`material-symbols-outlined text-sm ${
                  isBackendOnline ? 'text-on-secondary-container' : 'text-on-error-container'
                }`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {isBackendOnline ? 'check_circle' : 'error'}
              </span>
              <span
                className={`font-label text-[10px] font-bold uppercase tracking-widest ${
                  isBackendOnline ? 'text-on-secondary-container' : 'text-on-error-container'
                }`}
              >
                {isBackendOnline ? 'Backend Connected' : 'Backend Offline'}
              </span>
            </div>

            {health?.persistence_connected && (
              <div className="flex items-center gap-2 rounded-sm border border-primary/20 bg-primary-container px-3 py-1">
                <span className="material-symbols-outlined text-sm text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>
                  cloud_done
                </span>
                <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-primary-container">
                  Persistence Active
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 rounded-xl bg-surface-container-low p-6 lg:col-span-8 lg:p-8">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-1">
                <label className="font-label text-xs font-bold uppercase tracking-widest text-primary">Field ID Name</label>
                <input
                  className="w-full rounded-lg border-none bg-surface-container-lowest p-3 font-medium text-on-surface transition-all focus:border-primary focus:ring-0"
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <label className="font-label text-xs font-bold uppercase tracking-widest text-primary">Designation</label>
                <input
                  className="w-full rounded-lg border-none bg-surface-container-lowest p-3 font-medium text-on-surface transition-all focus:border-primary focus:ring-0"
                  type="text"
                  value={profile.designation}
                  onChange={(e) => setProfile((prev) => ({ ...prev, designation: e.target.value }))}
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="font-label text-xs font-bold uppercase tracking-widest text-primary">Direct Comms (Email)</label>
                <input
                  className="w-full rounded-lg border-none bg-surface-container-lowest p-3 font-medium text-on-surface transition-all focus:border-primary focus:ring-0"
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="col-span-12 rounded-xl bg-surface-container p-6 lg:col-span-4 lg:p-8">
            <h3 className="font-label text-sm font-bold uppercase tracking-widest text-on-surface">Visual Mode</h3>
            <div className="mt-4 grid gap-3">
              <ThemeButton icon="light_mode" label="Light Industry" active={theme === 'light'} onClick={() => setTheme('light')} />
              <ThemeButton icon="dark_mode" label="Midnight Grid" active={theme === 'dark'} onClick={() => setTheme('dark')} />
            </div>
          </div>

          <div className="col-span-12 overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container-lowest">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container-high px-6 py-4 md:px-8">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">monitoring</span>
                <h3 className="font-label text-sm font-black uppercase tracking-widest text-on-surface">Engine Health and Pipeline Integrity</h3>
              </div>

              <div className="flex items-center gap-4">
                {isLoadingHealth ? (
                  <span className="material-symbols-outlined animate-spin text-sm text-outline">progress_activity</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${isBackendOnline ? 'bg-secondary' : 'bg-error'}`}></span>
                    <span className="font-label text-[10px] font-bold text-on-surface-variant">
                      {isBackendOnline ? `${totalDocs} chunks indexed` : 'Offline'}
                    </span>
                  </span>
                )}
                <button onClick={() => void refreshHealth()} className="p-1 text-outline transition-colors hover:text-primary" title="Refresh">
                  <span className="material-symbols-outlined text-sm">refresh</span>
                </button>
              </div>
            </div>

            <div className="grid gap-8 p-6 md:grid-cols-3 md:p-8">
              <StatusCard
                title="RAG Pipeline"
                status={isBackendOnline ? 'ONLINE' : 'OFFLINE'}
                icon="database"
                primaryValue={`${totalDocs}`}
                primaryLabel="Total Chunks"
                footer={stats ? `Embedding: ${stats.configuration.embedding_model.split('/').pop()}` : 'Loading...'}
              />

              <StatusCard
                title={health?.llm_model || 'LLM'}
                status={isBackendOnline ? 'CONNECTED' : 'DISCONNECTED'}
                icon="cloud_done"
                primaryValue={health?.llm_provider || '-'}
                primaryLabel="Provider"
                footer={health?.vector_store?.status === 'ready' ? 'Vector store ready' : 'Vector store degraded'}
              />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-label text-xs font-bold uppercase tracking-wide text-on-surface">Chunking Config</span>
                  <span className="font-label text-[10px] font-bold text-secondary">{stats ? 'ACTIVE' : '-'}</span>
                </div>
                <div className="space-y-3 rounded-xl bg-surface-container p-4">
                  <MetricRow label="Chunk size" value={stats?.configuration.chunk_size ?? '-'} />
                  <MetricRow label="Overlap" value={stats?.configuration.chunk_overlap ?? '-'} />
                  <MetricRow label="Collection" value={health?.vector_store?.collection_name ?? '-'} />
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12 rounded-xl bg-surface-container-low p-8 lg:col-span-6">
            <h3 className="font-label text-sm font-bold uppercase tracking-widest text-on-surface">Notification Protocols</h3>
            <div className="mt-6 space-y-4">
              <ToggleRow
                icon="warning"
                title="Critical Grid Failures"
                subtitle="Immediate mobile push and email"
                checked={notifications.critical}
                onChange={(checked) => setNotifications((prev) => ({ ...prev, critical: checked }))}
              />
              <ToggleRow
                icon="insights"
                title="AI Optimization Insights"
                subtitle="Weekly summarized report"
                checked={notifications.insights}
                onChange={(checked) => setNotifications((prev) => ({ ...prev, insights: checked }))}
              />
            </div>
          </div>

          <div className="col-span-12 rounded-xl bg-surface-container p-8 lg:col-span-6">
            <h3 className="font-label text-sm font-bold uppercase tracking-widest text-on-surface">Security and Verification</h3>
            <div className="mt-6 space-y-4">
              <ActionCard
                icon="key"
                title="Access Credentials"
                subtitle="API key and role policy are managed by deployment env vars"
                onClick={() => void handleCredentialCardClick()}
              />
              <ActionCard
                icon="history"
                title="Analysis Audit Log"
                subtitle="All persisted chat sessions are available from backend storage"
                onClick={() => navigate('/chat')}
              />
            </div>
          </div>
        </div>

        {settingsError && (
          <div className="rounded-lg border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">{settingsError}</div>
        )}

        <div className="flex flex-wrap justify-end gap-4 pt-4">
          <button onClick={handleReset} className="rounded-xl px-8 py-3 font-bold text-primary transition-all hover:bg-blue-100/50">
            Revert to Default
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saveDisabled}
            className="flex items-center gap-2 rounded-xl bg-primary px-10 py-3 font-bold text-on-primary shadow-lg shadow-primary/20 transition-all hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">{isSavingSettings ? 'hourglass_top' : 'save'}</span>
            {isSavingSettings ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <footer className="mt-auto p-8 text-center text-on-surface-variant opacity-50">
        <p className="font-label text-[10px] uppercase tracking-[0.3em]">Authorized Access Only - POWERGRID Industrial Intelligence - Proprietary System</p>
      </footer>
    </>
  )
}

function ThemeButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-xl p-4 transition-all ${
        active ? 'border-2 border-primary bg-surface-container-lowest text-primary' : 'bg-surface-container-high text-on-surface-variant hover:text-primary'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined">{icon}</span>
        <span className="font-semibold">{label}</span>
      </div>
      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>
        {active ? 'radio_button_checked' : 'radio_button_unchecked'}
      </span>
    </button>
  )
}

function StatusCard({
  title,
  status,
  icon,
  primaryValue,
  primaryLabel,
  footer,
}: {
  title: string
  status: string
  icon: string
  primaryValue: string
  primaryLabel: string
  footer: string
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-label text-xs font-bold uppercase tracking-wide text-on-surface">{title}</span>
        <span className="font-label text-[10px] font-bold text-secondary">{status}</span>
      </div>
      <div className="flex items-center gap-4 rounded-xl bg-surface-container p-4">
        <span className="material-symbols-outlined text-3xl text-primary">{icon}</span>
        <div>
          <div className="text-xl font-black leading-none text-primary">{primaryValue}</div>
          <div className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">{primaryLabel}</div>
        </div>
      </div>
      <p className="font-label text-xs leading-tight text-on-surface-variant">{footer}</p>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between font-label text-[10px] font-bold uppercase">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function ToggleRow({
  icon,
  title,
  subtitle,
  checked,
  onChange,
}: {
  icon: string
  title: string
  subtitle: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-4">
      <div className="flex items-center gap-4">
        <span className="material-symbols-outlined text-primary">{icon}</span>
        <div>
          <div className="font-bold text-on-surface">{title}</div>
          <div className="text-xs text-on-surface-variant">{subtitle}</div>
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-surface-container-highest'}`}
      >
        <span
          className={`absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

function ActionCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: string
  title: string
  subtitle: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-xl bg-surface-container-lowest p-4 transition-colors hover:bg-white"
    >
      <div className="flex items-center gap-4">
        <span className="material-symbols-outlined text-primary">{icon}</span>
        <div className="text-left">
          <div className="font-bold text-on-surface">{title}</div>
          <div className="text-xs text-on-surface-variant">{subtitle}</div>
        </div>
      </div>
      <span className="material-symbols-outlined text-on-surface-variant transition-transform group-hover:translate-x-1">chevron_right</span>
    </button>
  )
}

export default Settings
