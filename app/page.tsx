'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Code2, CheckCircle, AlertCircle, Trash2, RefreshCw } from 'lucide-react'

interface AppInfo {
  projectId: string
  running: boolean
  port: number | null
  sizeKb: number
}

export default function SettingsPage() {
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [userId, setUserId] = useState('')
  const [projectLimit, setProjectLimit] = useState(3)
  const [devSettingsEnabled, setDevSettingsEnabled] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasSettings, setHasSettings] = useState(false)
  const [generatedApps, setGeneratedApps] = useState<AppInfo[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchGeneratedApps = useCallback(() => {
    fetch('/api/launch/list')
      .then(r => r.json())
      .then((list: AppInfo[]) => setGeneratedApps(list))
      .catch(() => { /* non-critical */ })
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('mendixToNodeSettings')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setApiKey(parsed.apiKey || '')
        setUserId(parsed.userId || '')
        setProjectLimit(parsed.projectLimit ?? 3)
        setDevSettingsEnabled(parsed.devSettingsEnabled ?? false)
        if (parsed.apiKey && parsed.userId) setHasSettings(true)
      } catch { /* ignore */ }
    }

    fetchGeneratedApps()
  }, [fetchGeneratedApps])

  const handleDeleteApp = async (projectId: string) => {
    if (!confirm(`Delete the generated Node.js app for project ${projectId}? This cannot be undone.`)) return
    setDeletingId(projectId)
    try {
      await fetch('/api/launch/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      fetchGeneratedApps()
    } catch { /* ignore */ } finally {
      setDeletingId(null)
    }
  }

  const patchSettings = (patch: Record<string, unknown>) => {
    const stored = localStorage.getItem('mendixToNodeSettings')
    const current = stored ? JSON.parse(stored) : {}
    localStorage.setItem('mendixToNodeSettings', JSON.stringify({ ...current, ...patch }))
  }

  const handleToggleDev = () => {
    const next = !devSettingsEnabled
    setDevSettingsEnabled(next)
    patchSettings({ devSettingsEnabled: next })
  }

  const handleSave = () => {
    if (!apiKey.trim() || !userId.trim()) return
    localStorage.setItem('mendixToNodeSettings', JSON.stringify({
      apiKey: apiKey.trim(),
      userId: userId.trim(),
      projectLimit,
      devSettingsEnabled
    }))
    setSaved(true)
    setHasSettings(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-xl mb-4">
            <Code2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-800">mendix-to-node</h1>
          <p className="text-slate-500 mt-1 text-sm">Generate a Node.js app from any Mendix project</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-700 mb-5">Mendix Credentials</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Personal Access Token (PAT)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="MxToken ..."
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Requires scopes: <code className="bg-slate-100 px-1 rounded">mx:app:metadata:read</code> and <code className="bg-slate-100 px-1 rounded">mx:modelrepository:repo:read</code>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                User ID (OpenID)
              </label>
              <input
                type="text"
                value={userId}
                onChange={e => setUserId(e.target.value)}
                placeholder="a1b2c3d4-..."
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Found in Mendix Portal → Profile → Personal Data
              </p>
            </div>

            <button
              onClick={handleSave}
              disabled={!apiKey.trim() || !userId.trim()}
              className="w-full py-2.5 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saved ? (
                <span className="flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Saved!
                </span>
              ) : 'Save Settings'}
            </button>
          </div>

          {/* Warning */}
          <div className="mt-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>Credentials are stored in localStorage only — never sent to any server except Mendix.</span>
          </div>
        </div>

        {/* Developer Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mt-4 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <span className="text-base font-semibold text-slate-700">Developer Settings</span>
              {devSettingsEnabled && (
                <span className="ml-2 text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">active</span>
              )}
            </div>
            <button
              onClick={handleToggleDev}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${devSettingsEnabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
              role="switch"
              aria-checked={devSettingsEnabled}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${devSettingsEnabled ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
          </div>

          {devSettingsEnabled && (
            <div className="px-6 pb-6 border-t border-slate-100">
              <p className="text-xs text-slate-400 mt-4 mb-5">Speed up live demos by limiting how many projects are fully loaded.</p>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Project fetch limit
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={projectLimit}
                  onChange={e => setProjectLimit(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  Only the first <strong>{projectLimit}</strong> project{projectLimit !== 1 ? 's' : ''} will be enriched with SDK details. Set to a high value (e.g. 1000) to load all.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Go to Projects */}
        {hasSettings && (
          <div className="mt-4 text-center">
            <button
              onClick={() => router.push('/projects')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
            >
              Go to Projects →
            </button>
          </div>
        )}

        {/* Generated Apps */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mt-4 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <span className="text-base font-semibold text-slate-700">Generated Apps</span>
            <button
              onClick={fetchGeneratedApps}
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {generatedApps.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-400">
              No generated apps yet. Export a project to get started.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Project ID', 'Status', 'Size', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {generatedApps.map(app => (
                  <tr key={app.projectId} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-600 truncate block max-w-[200px]" title={app.projectId}>
                        {app.projectId}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {app.running ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                          Running :{app.port}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 rounded">
                          Stopped
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {app.sizeKb >= 1024 ? `${(app.sizeKb / 1024).toFixed(1)} MB` : `${app.sizeKb} KB`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => router.push(`/export/${app.projectId}`)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          {app.running ? 'View' : 'Launch'}
                        </button>
                        <button
                          onClick={() => handleDeleteApp(app.projectId)}
                          disabled={deletingId === app.projectId}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
                        >
                          {deletingId === app.projectId ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
