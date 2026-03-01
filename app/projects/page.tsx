'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FolderOpen, RefreshCw, AlertCircle, Settings } from 'lucide-react'
import Link from 'next/link'
import VoiceCommandBar from '@/components/VoiceCommandBar'
import ProjectCard from '@/components/ProjectCard'
import { MendixProject } from '@/lib/types'
import { parseCommand } from '@/lib/commandParser'

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<MendixProject[]>([])
  const [filtered, setFiltered] = useState<MendixProject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorHint, setErrorHint] = useState<string | null>(null)
  const [hasSettings, setHasSettings] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [loadingProgress, setLoadingProgress] = useState({ stage: '', detail: '', count: 0, total: 0 })
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('mendixToNodeSettings')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed.apiKey && parsed.userId) setHasSettings(true)
      } catch { /* ignore */ }
    }
  }, [])

  // Apply search filter
  useEffect(() => {
    if (!searchQuery) {
      setFiltered(projects)
      return
    }
    const q = searchQuery.toLowerCase()
    setFiltered(projects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.account.toLowerCase().includes(q) ||
      p.owner.toLowerCase().includes(q) ||
      p.projectId.toLowerCase().includes(q)
    ))
  }, [projects, searchQuery])

  const loadProjects = useCallback(async () => {
    const stored = localStorage.getItem('mendixToNodeSettings')
    if (!stored) {
      setError('No settings found. Please configure credentials first.')
      return
    }

    let settings: { apiKey: string; userId: string; projectLimit?: number; devSettingsEnabled?: boolean }
    try {
      settings = JSON.parse(stored)
    } catch {
      setError('Invalid settings. Please re-save your credentials.')
      return
    }

    setLoading(true)
    setError(null)
    setErrorHint(null)
    setProjects([])
    setLoadingProgress({ stage: 'Starting...', detail: '', count: 0, total: 0 })
    setFeedback('Loading projects...')

    try {
      const response = await fetch('/api/projects/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: settings.apiKey,
          userId: settings.userId,
          projectLimit: settings.devSettingsEnabled ? (settings.projectLimit ?? 3) : null
        })
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Failed to fetch projects')
        if (data.hint) setErrorHint(data.hint)
        setLoading(false)
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const loaded: MendixProject[] = []

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'progress') {
              setLoadingProgress({
                stage: data.stage || '',
                detail: data.detail || '',
                count: data.count || 0,
                total: data.total || 0
              })
              setFeedback(`${data.stage}${data.detail ? ': ' + data.detail : ''}`)
            } else if (data.type === 'project') {
              loaded.push(data.project)
              setProjects([...loaded])
            } else if (data.type === 'complete') {
              setProjects([...loaded])
              setFeedback(`Loaded ${loaded.length} projects`)
            } else if (data.type === 'error') {
              setError(data.error)
              if (data.hint) setErrorHint(data.hint)
            }
          } catch { /* skip malformed line */ }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
      setLoadingProgress({ stage: '', detail: '', count: 0, total: 0 })
    }
  }, [])

  const handleCommand = useCallback((text: string) => {
    const cmd = parseCommand(text, projects)

    switch (cmd.type) {
      case 'fetchProjects':
        setFeedback('Fetching projects...')
        loadProjects()
        break

      case 'exportProject':
        if (cmd.projectId) {
          setFeedback(`Exporting "${cmd.projectName}"...`)
          router.push(`/export/${cmd.projectId}`)
        } else if (cmd.suggestions && cmd.suggestions.length > 0) {
          const names = cmd.suggestions.map(s => s.name).join(', ')
          setFeedback(`No exact match for "${cmd.projectName}". Did you mean: ${names}?`)
        } else {
          setFeedback(`No project found matching "${cmd.projectName}". Try loading projects first.`)
        }
        break

      case 'search':
        setSearchQuery(cmd.searchTerm || '')
        setFeedback(`Filtering by "${cmd.searchTerm}"`)
        break

      case 'clear':
        setSearchQuery('')
        setFeedback('Search cleared')
        break

      default:
        setFeedback(`Unknown command: "${text}". Try "fetch projects", "export [name] to node", or "search [term]"`)
    }
  }, [projects, loadProjects, router])

  const handleExport = useCallback((project: MendixProject) => {
    router.push(`/export/${project.projectId}`)
  }, [router])

  const gitProjects = filtered.filter(p => p.repositoryType === 'git').length

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-6 h-6 text-indigo-400" />
            <div>
              <h1 className="text-lg font-semibold">mendix-to-node</h1>
              <p className="text-xs text-slate-400">Your Mendix projects</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {projects.length > 0 && (
              <span className="text-xs text-slate-400">
                {projects.length} projects · {gitProjects} exportable
              </span>
            )}
            <Link
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 text-xs rounded-lg hover:bg-slate-600 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Voice Command Bar */}
        <VoiceCommandBar
          onCommand={handleCommand}
          feedback={feedback}
          disabled={loading}
        />

        {/* No settings warning */}
        {!hasSettings && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium text-amber-800">Credentials required.</span>{' '}
              <Link href="/" className="text-indigo-600 hover:underline">Configure settings</Link> to load projects.
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium text-red-800">Error:</span> {error}
              {errorHint && <div className="mt-1 text-xs text-red-600">{errorHint}</div>}
            </div>
          </div>
        )}

        {/* Loading progress */}
        {loading && (
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              <span className="font-medium">{loadingProgress.stage}</span>
              {loadingProgress.detail && <span className="text-slate-400">— {loadingProgress.detail}</span>}
            </div>
            {loadingProgress.total > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>{loadingProgress.count} of {loadingProgress.total}</span>
                  <span>{Math.round((loadingProgress.count / loadingProgress.total) * 100)}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${(loadingProgress.count / loadingProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && !error && (
          <div className="bg-white border border-slate-200 rounded-lg py-16 text-center">
            <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm mb-4">No projects loaded yet</p>
            <button
              onClick={loadProjects}
              disabled={!hasSettings}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
            >
              <RefreshCw className="w-4 h-4" />
              Load Projects
            </button>
            <p className="mt-3 text-xs text-slate-400">
              Or type <code className="bg-slate-100 px-1 rounded">fetch projects</code> in the command bar above
            </p>
          </div>
        )}

        {/* Search bar + projects table */}
        {projects.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {/* Table controls */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={loadProjects}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {filtered.length} / {projects.length}
              </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Project', 'Account', 'Owner', 'Type', 'Last Updated', 'Branch', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(project => (
                    <ProjectCard
                      key={project.projectId}
                      project={project}
                      onExport={handleExport}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                        No projects match your search
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
