'use client'

import { ExternalLink, ArrowRight, GitBranch, Calendar, User, Building } from 'lucide-react'
import { MendixProject } from '@/lib/types'

interface ProjectCardProps {
  project: MendixProject
  onExport: (project: MendixProject) => void
}

export default function ProjectCard({ project, onExport }: ProjectCardProps) {
  const isGit = project.repositoryType === 'git'
  const lastUpdated = project.lastUpdated
    ? new Date(project.lastUpdated).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'N/A'

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      {/* Project name */}
      <td className="px-4 py-3">
        <div className="font-medium text-slate-800 text-sm">{project.name}</div>
        {project.description && (
          <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{project.description}</div>
        )}
      </td>

      {/* Account */}
      <td className="px-4 py-3 text-sm text-slate-600">
        <div className="flex items-center gap-1">
          <Building className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <span className="truncate max-w-[150px]">{project.account}</span>
        </div>
      </td>

      {/* Owner */}
      <td className="px-4 py-3 text-sm text-slate-600">
        <div className="flex items-center gap-1">
          <User className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <span className="truncate max-w-[120px]">{project.owner}</span>
        </div>
      </td>

      {/* Repo type badge */}
      <td className="px-4 py-3">
        <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded uppercase ${
          isGit
            ? 'bg-indigo-100 text-indigo-700'
            : project.repositoryType === 'svn'
            ? 'bg-orange-100 text-orange-700'
            : 'bg-slate-100 text-slate-500'
        }`}>
          {project.repositoryType}
        </span>
      </td>

      {/* Last updated */}
      <td className="px-4 py-3 text-sm text-slate-500">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3 text-slate-400 flex-shrink-0" />
          {lastUpdated}
        </div>
      </td>

      {/* Branch */}
      <td className="px-4 py-3 text-sm text-slate-500">
        <div className="flex items-center gap-1">
          <GitBranch className="w-3 h-3 text-slate-400 flex-shrink-0" />
          {project.defaultBranch}
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-100 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
          {isGit && (
            <button
              onClick={() => onExport(project)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            >
              <ArrowRight className="w-3 h-3" />
              Export to Node.js
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
