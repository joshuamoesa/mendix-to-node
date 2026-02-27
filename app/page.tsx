'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Code2, CheckCircle, AlertCircle } from 'lucide-react'

export default function SettingsPage() {
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [userId, setUserId] = useState('')
  const [saved, setSaved] = useState(false)
  const [hasSettings, setHasSettings] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('mendixToNodeSettings')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setApiKey(parsed.apiKey || '')
        setUserId(parsed.userId || '')
        if (parsed.apiKey && parsed.userId) setHasSettings(true)
      } catch { /* ignore */ }
    }
  }, [])

  const handleSave = () => {
    if (!apiKey.trim() || !userId.trim()) return
    localStorage.setItem('mendixToNodeSettings', JSON.stringify({ apiKey: apiKey.trim(), userId: userId.trim() }))
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
      </div>
    </div>
  )
}
