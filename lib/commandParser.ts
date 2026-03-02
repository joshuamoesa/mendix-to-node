import { MendixProject } from './types'

export type CommandType =
  | 'fetchProjects'
  | 'exportProject'
  | 'openApp'
  | 'search'
  | 'clear'
  | 'unknown'

export interface ParsedCommand {
  type: CommandType
  projectId?: string
  projectName?: string
  searchTerm?: string
  suggestions?: Array<{ name: string; projectId: string; score: number }>
  raw: string
}

// Simple Levenshtein distance
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  // Exact match
  if (t === q) return 1.0

  // Contains match
  if (t.includes(q)) return 0.9

  // Token overlap
  const qTokens = q.split(/\s+/)
  const tTokens = t.split(/\s+/)
  const overlap = qTokens.filter(qt => tTokens.some(tt => tt.includes(qt) || qt.includes(tt))).length
  if (overlap > 0) return 0.5 + (overlap / Math.max(qTokens.length, tTokens.length)) * 0.3

  // Levenshtein-based score
  const dist = levenshtein(q, t)
  const maxLen = Math.max(q.length, t.length)
  return maxLen > 0 ? Math.max(0, 1 - dist / maxLen) : 0
}

function findProject(
  nameQuery: string,
  projects: MendixProject[]
): { matched: MendixProject | null; suggestions: Array<{ name: string; projectId: string; score: number }> } {
  const THRESHOLD = 0.35

  const scored = projects.map(p => ({
    project: p,
    score: fuzzyScore(nameQuery, p.name)
  }))

  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (best && best.score >= THRESHOLD) {
    return {
      matched: best.project,
      suggestions: scored.slice(0, 3).map(s => ({
        name: s.project.name,
        projectId: s.project.projectId,
        score: s.score
      }))
    }
  }

  return {
    matched: null,
    suggestions: scored.slice(0, 3).map(s => ({
      name: s.project.name,
      projectId: s.project.projectId,
      score: s.score
    }))
  }
}

export function parseCommand(text: string, projects: MendixProject[]): ParsedCommand {
  const raw = text.trim()
  const lower = raw.toLowerCase()

  // "fetch projects" / "load" / "load projects"
  if (/^(fetch|load)(\s+projects?)?$/.test(lower)) {
    return { type: 'fetchProjects', raw }
  }

  // "clear" / "clear search"
  if (/^clear(\s+search)?$/.test(lower)) {
    return { type: 'clear', raw }
  }

  // "search [term]"
  const searchMatch = lower.match(/^search\s+(.+)$/)
  if (searchMatch) {
    return { type: 'search', searchTerm: searchMatch[1], raw }
  }

  // "export [name] to node" / "convert [name]" / "export [name]"
  const exportPatterns = [
    /^(?:export|convert)\s+(.+?)\s+to\s+node(?:\.?js)?$/i,
    /^export\s+(.+)$/i,
    /^convert\s+(.+)$/i,
  ]

  for (const pattern of exportPatterns) {
    const match = raw.match(pattern)
    if (match) {
      const nameQuery = match[1].trim()
      const { matched, suggestions } = findProject(nameQuery, projects)

      if (matched) {
        return {
          type: 'exportProject',
          projectId: matched.projectId,
          projectName: matched.name,
          suggestions,
          raw
        }
      } else {
        return {
          type: 'exportProject',
          projectId: undefined,
          projectName: nameQuery,
          suggestions,
          raw
        }
      }
    }
  }

  // "open [name]" / "view [name]" / "show [name]"
  const openPatterns = [
    /^(?:open|view|show)\s+(.+)$/i,
  ]

  for (const pattern of openPatterns) {
    const match = raw.match(pattern)
    if (match) {
      const nameQuery = match[1].trim()
      const { matched, suggestions } = findProject(nameQuery, projects)

      if (matched) {
        return {
          type: 'openApp',
          projectId: matched.projectId,
          projectName: matched.name,
          suggestions,
          raw
        }
      } else {
        return {
          type: 'openApp',
          projectId: undefined,
          projectName: nameQuery,
          suggestions,
          raw
        }
      }
    }
  }

  return { type: 'unknown', raw }
}
