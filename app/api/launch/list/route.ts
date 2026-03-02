import { NextResponse } from 'next/server'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { runningApps } from '@/lib/launchStore'

const BASE_DIR = '/tmp/mendix-launched'

function dirSizeKb(dir: string): number {
  let total = 0
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        total += dirSizeKb(full)
      } else {
        try {
          total += statSync(full).size
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
  return Math.round(total / 1024)
}

export async function GET() {
  if (!existsSync(BASE_DIR)) {
    return NextResponse.json([])
  }

  let entries: string[]
  try {
    entries = readdirSync(BASE_DIR)
  } catch {
    return NextResponse.json([])
  }

  const apps = entries.map(projectId => {
    const appDir = join(BASE_DIR, projectId)
    const running = runningApps.has(projectId)
    const port = running ? runningApps.get(projectId)!.port : null
    const sizeKb = dirSizeKb(appDir)

    return { projectId, running, port, sizeKb }
  })

  return NextResponse.json(apps)
}
