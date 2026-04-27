// CODEX-FIX: replace legacy profile settings with RAG provider, vision, browser ingestion, and prompt controls.

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Save, ServerCog } from 'lucide-react'
import { getHealth, getSettings, saveSettings, type HealthResponse, type Settings as AppSettings } from '../lib/api'

const Settings = () => {
  const [values, setValues] = useState<AppSettings>({
    llmProvider: 'gemini',
    llmModel: 'gemini-2.0-flash',
    enableVision: true,
    enableBrowserIngestion: false,
    systemPromptOverride: '',
  })
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [settings, nextHealth] = await Promise.allSettled([getSettings(), getHealth()])
      if (settings.status === 'fulfilled') {
        setValues((current) => ({ ...current, ...settings.value }))
      }
      if (nextHealth.status === 'fulfilled') {
        setHealth(nextHealth.value)
      }
    }
    void load()
  }, [])

  const save = async () => {
    setIsSaving(true)
    try {
      await saveSettings(values)
      toast.success('Settings saved')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <p className="font-label text-xs font-bold uppercase tracking-widest text-primary">Settings</p>
        <h1 className="mt-1 text-3xl font-bold text-on-surface">Runtime Configuration</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Provider selection is persisted in Convex and consumed by deployment workflows.</p>
      </header>

      <section className="grid gap-4 rounded-lg bg-surface-container-lowest p-5 shadow-sm md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold">LLM Provider</span>
          <select
            value={values.llmProvider ?? 'gemini'}
            onChange={(event) => setValues((state) => ({ ...state, llmProvider: event.target.value }))}
            className="w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm"
          >
            <option value="gemini">Gemini</option>
            <option value="groq">Groq</option>
            <option value="huggingface">Hugging Face</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold">LLM Model</span>
          <input
            value={values.llmModel ?? ''}
            onChange={(event) => setValues((state) => ({ ...state, llmModel: event.target.value }))}
            className="w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm"
          />
        </label>

        <Toggle
          label="Enable Vision"
          checked={Boolean(values.enableVision)}
          onChange={(enableVision) => setValues((state) => ({ ...state, enableVision }))}
        />
        <Toggle
          label="Enable Browser Ingestion"
          checked={Boolean(values.enableBrowserIngestion)}
          onChange={(enableBrowserIngestion) => setValues((state) => ({ ...state, enableBrowserIngestion }))}
        />

        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-semibold">System Prompt Override</span>
          <textarea
            value={values.systemPromptOverride ?? ''}
            onChange={(event) => setValues((state) => ({ ...state, systemPromptOverride: event.target.value }))}
            rows={6}
            className="w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm"
          />
        </label>

        <div className="md:col-span-2 flex justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={isSaving}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-on-primary disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving' : 'Save Settings'}
          </button>
        </div>
      </section>

      <section className="rounded-lg bg-surface-container-low p-5">
        <div className="mb-4 flex items-center gap-2">
          <ServerCog className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-on-surface">Health</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="API" value={health?.status ?? 'unknown'} />
          <Metric label="Convex" value={health?.components.convex?.status ?? 'unknown'} />
          <Metric label="LanceDB Rows" value={String(health?.components.lancedb?.row_count ?? 0)} />
          <Metric label="Last LLM" value={health?.components.llm?.last_provider ?? 'not used'} />
        </div>
      </section>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between rounded-lg border border-outline-variant bg-white px-4 py-3 text-left"
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className={`h-6 w-11 rounded-full p-0.5 transition-colors ${checked ? 'bg-primary' : 'bg-surface-container-highest'}`}>
        <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-lowest p-4">
      <div className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</div>
      <div className="mt-2 truncate text-sm font-bold text-on-surface">{value}</div>
    </div>
  )
}

export default Settings
