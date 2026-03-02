'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, RefreshCw, AlertCircle, CheckCircle, Play, Square, ExternalLink } from 'lucide-react'
import Link from 'next/link'

import { MendixAppModel, GeneratedFile, FileGroup } from '@/lib/types'
import { generatePrismaSchema } from '@/lib/generators/prismaGenerator'
import { generateTypes } from '@/lib/generators/typesGenerator'
import { generateMicroflowServices } from '@/lib/generators/microflowGenerator'
import { generatePages, generateEntityRoutes } from '@/lib/generators/pageGenerator'
import { generateLayout } from '@/lib/generators/layoutGenerator'
import { generateAppEntry, generateDbSingleton } from '@/lib/generators/appGenerator'
import {
  generatePackageJson,
  generateTsConfig,
  generateEnvExample,
  generateReadme
} from '@/lib/generators/packageJsonGenerator'

// ─── Code generation orchestrator ────────────────────────────────────────────

function generateAllFiles(model: MendixAppModel): GeneratedFile[] {
  const files: GeneratedFile[] = []

  files.push(generatePrismaSchema(model.entities))
  files.push(generateTypes(model.entities))
  files.push(...generateMicroflowServices(model.microflows))
  files.push(...generatePages(model.pages))
  files.push(...generateEntityRoutes(model.entities.filter(e => !e.isSystemEntity)))
  files.push(generateLayout(model.pages, model.projectName))
  files.push(generateAppEntry(model.entities, model.pages))
  files.push(generateDbSingleton())
  files.push(generatePackageJson(model.projectName))
  files.push(generateTsConfig())
  files.push(generateEnvExample())
  files.push(generateReadme(model.projectName, model.stats))

  return files
}

function groupFiles(files: GeneratedFile[]): FileGroup[] {
  const categories: FileGroup['category'][] = ['data', 'logic', 'pages', 'routes', 'config']
  const labels: Record<FileGroup['category'], string> = {
    data: 'Data',
    logic: 'Logic',
    pages: 'Pages',
    routes: 'Routes',
    config: 'Config'
  }

  return categories
    .map(cat => ({
      label: labels[cat],
      category: cat,
      files: files.filter(f => f.category === cat)
    }))
    .filter(g => g.files.length > 0)
}

// ─── ZIP download (uses jszip loaded via dynamic import) ────────────────────

async function downloadZip(files: GeneratedFile[], projectName: string) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  for (const file of files) {
    zip.file(file.path, file.content)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}-node.zip`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Progress message types ───────────────────────────────────────────────────

interface ProgressMessage {
  stage: string
  detail: string
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExportPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [messages, setMessages] = useState<ProgressMessage[]>([])
  const [model, setModel] = useState<MendixAppModel | null>(null)
  const [files, setFiles] = useState<GeneratedFile[]>([])
  const [groups, setGroups] = useState<FileGroup[]>([])
  const [activeGroup, setActiveGroup] = useState<string>('data')
  const [activeFile, setActiveFile] = useState<GeneratedFile | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Launch state
  const [launchStatus, setLaunchStatus] = useState<'idle' | 'launching' | 'running' | 'stopped' | 'error'>('idle')
  const [launchMessages, setLaunchMessages] = useState<string[]>([])
  const [launchPort, setLaunchPort] = useState<number | null>(null)

  const startExport = useCallback(async () => {
    const stored = localStorage.getItem('mendixToNodeSettings')
    if (!stored) {
      setError('No credentials found. Please configure settings first.')
      setStatus('error')
      return
    }

    let settings: { apiKey: string; userId: string }
    try {
      settings = JSON.parse(stored)
    } catch {
      setError('Invalid settings. Please re-save your credentials.')
      setStatus('error')
      return
    }

    setStatus('loading')
    setMessages([])
    setError(null)
    setModel(null)
    setFiles([])

    try {
      const response = await fetch('/api/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: settings.apiKey,
          userId: settings.userId,
          projectId,
          branch: 'main'
        })
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Failed to read model')
        setStatus('error')
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

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
              setMessages(prev => [...prev, { stage: data.stage, detail: data.detail || '' }])
            } else if (data.type === 'model') {
              const appModel: MendixAppModel = {
                ...data.model,
                projectName: data.model.projectName || projectId
              }
              setModel(appModel)
              const generated = generateAllFiles(appModel)
              setFiles(generated)
              const grouped = groupFiles(generated)
              setGroups(grouped)
              if (grouped.length > 0) {
                setActiveGroup(grouped[0].category)
                if (grouped[0].files.length > 0) {
                  setActiveFile(grouped[0].files[0])
                }
              }
            } else if (data.type === 'complete') {
              setStatus('ready')
            } else if (data.type === 'error') {
              setError(data.error)
              setStatus('error')
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Export failed')
      setStatus('error')
    }
  }, [projectId])

  useEffect(() => {
    startExport()
  }, [startExport])

  // Restore launch state on mount (in case user navigated away and back)
  useEffect(() => {
    fetch(`/api/launch/status?projectId=${encodeURIComponent(projectId)}`)
      .then(r => r.json())
      .then((data: { running: boolean; port: number | null }) => {
        if (data.running && data.port) {
          setLaunchStatus('running')
          setLaunchPort(data.port)
        }
      })
      .catch(() => { /* non-critical */ })
  }, [projectId])

  const handleLaunch = useCallback(async () => {
    if (!files.length) return
    setLaunchStatus('launching')
    setLaunchMessages([])

    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, files })
      })

      if (!response.ok) {
        const data = await response.json()
        setLaunchMessages([data.error || 'Launch failed'])
        setLaunchStatus('error')
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

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
              const detail = data.detail ? `${data.stage}: ${data.detail}` : data.stage
              setLaunchMessages(prev => [...prev, detail])
            } else if (data.type === 'ready') {
              setLaunchStatus('running')
              setLaunchPort(data.port)
            } else if (data.type === 'error') {
              setLaunchMessages(prev => [...prev, `Error: ${data.error}`])
              setLaunchStatus('error')
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      setLaunchMessages([err instanceof Error ? err.message : 'Launch failed'])
      setLaunchStatus('error')
    }
  }, [projectId, files])

  const handleStop = useCallback(async () => {
    await fetch('/api/launch/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    })
    setLaunchStatus('stopped')
    setLaunchPort(null)
  }, [projectId])

  const handleGroupClick = (group: FileGroup) => {
    setActiveGroup(group.category)
    if (group.files.length > 0) setActiveFile(group.files[0])
  }

  const handleFileClick = (file: GeneratedFile) => {
    setActiveFile(file)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/projects')}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Projects
          </button>
          <div className="h-4 border-l border-slate-700" />
          <div>
            <h1 className="text-sm font-semibold text-slate-200">Export to Node.js</h1>
            <p className="text-xs text-slate-500 font-mono">{projectId}</p>
          </div>
        </div>

        {status === 'ready' && model && (
          <div className="flex items-center gap-4">
            {/* Summary */}
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>{model.stats.entityCount} entities</span>
              <span className="text-slate-700">·</span>
              <span>{model.stats.microflowCount} microflows</span>
              <span className="text-slate-700">·</span>
              <span>{model.stats.pageCount} pages</span>
            </div>
            {/* Download button */}
            <button
              onClick={() => downloadZip(files, model.projectName)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-200 text-sm rounded-lg hover:bg-slate-600 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download ZIP
            </button>
            {/* Launch / Open / Stop */}
            {launchStatus === 'running' && launchPort ? (
              <>
                <a
                  href={`http://localhost:${launchPort}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open App →
                </a>
                <button
                  onClick={handleStop}
                  className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm rounded-lg hover:bg-red-800 transition-colors"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </button>
              </>
            ) : (
              <button
                onClick={handleLaunch}
                disabled={launchStatus === 'launching'}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {launchStatus === 'launching' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {launchStatus === 'launching' ? 'Launching...' : launchStatus === 'stopped' ? 'Relaunch' : 'Launch App'}
              </button>
            )}
          </div>
        )}
      </header>

      {/* Launch progress panel */}
      {launchStatus === 'launching' && launchMessages.length > 0 && (
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800">
          <div className="max-w-xl space-y-1">
            {launchMessages.slice(-8).map((msg, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                <span className="text-slate-400 font-mono truncate">{msg}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Setting up app...</span>
            </div>
          </div>
        </div>
      )}

      {/* Launch error panel */}
      {launchStatus === 'error' && launchMessages.length > 0 && (
        <div className="px-6 py-3 bg-red-950 border-b border-red-900">
          <p className="text-xs text-red-400 font-mono">{launchMessages[launchMessages.length - 1]}</p>
        </div>
      )}

      {/* Loading state */}
      {status === 'loading' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mb-6" />
          <h2 className="text-lg font-medium text-slate-300 mb-6">Reading Mendix model...</h2>
          <div className="w-full max-w-md space-y-2">
            {messages.map((msg, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-slate-300">{msg.stage}</span>
                  {msg.detail && <span className="text-slate-500 ml-2">— {msg.detail}</span>}
                </div>
              </div>
            ))}
            {messages.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </div>
            )}
          </div>
          <p className="mt-8 text-xs text-slate-600 text-center max-w-sm">
            Creating a working copy takes 30–120 seconds. The connection will stay open until complete.
          </p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <AlertCircle className="w-10 h-10 text-red-400 mb-4" />
          <h2 className="text-lg font-medium text-slate-300 mb-2">Export failed</h2>
          <p className="text-sm text-red-400 mb-6 max-w-md text-center">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={startExport}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
            <Link
              href="/projects"
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Projects
            </Link>
          </div>
        </div>
      )}

      {/* Ready state — tabbed code viewer */}
      {status === 'ready' && model && groups.length > 0 && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar: category tabs + file list */}
          <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden">
            {/* Category tabs */}
            <div className="flex flex-col border-b border-slate-800">
              {groups.map(group => (
                <button
                  key={group.category}
                  onClick={() => handleGroupClick(group)}
                  className={`px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                    activeGroup === group.category
                      ? 'bg-slate-800 text-indigo-400 border-l-2 border-indigo-500'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {group.label}
                  <span className="ml-1.5 text-xs text-slate-600">({group.files.length})</span>
                </button>
              ))}
            </div>

            {/* File list for active category */}
            <div className="flex-1 overflow-y-auto py-2">
              {groups
                .find(g => g.category === activeGroup)
                ?.files.map(file => (
                  <button
                    key={file.path}
                    onClick={() => handleFileClick(file)}
                    className={`w-full px-4 py-1.5 text-left text-xs font-mono transition-colors ${
                      activeFile?.path === file.path
                        ? 'bg-slate-800 text-green-300'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {file.path.split('/').pop()}
                    <div className="text-slate-700 text-[10px] truncate">{file.path}</div>
                  </button>
                ))}
            </div>
          </aside>

          {/* Code viewer */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {activeFile && (
              <>
                {/* File path bar */}
                <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">{activeFile.path}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeFile.content)
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                {/* Code */}
                <div className="flex-1 overflow-auto">
                  <pre className="p-4 text-xs font-mono text-green-300 leading-relaxed whitespace-pre">
                    {activeFile.content}
                  </pre>
                </div>
              </>
            )}
          </main>
        </div>
      )}
    </div>
  )
}
