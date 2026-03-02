import { NextRequest, NextResponse } from 'next/server'
import { rmSync, existsSync } from 'fs'
import { join } from 'path'
import { runningApps } from '@/lib/launchStore'

const BASE_DIR = '/tmp/mendix-launched'

export async function DELETE(req: NextRequest) {
  const { projectId } = await req.json() as { projectId: string }

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  // Kill running process first
  const app = runningApps.get(projectId)
  if (app) {
    try {
      app.process.kill('SIGTERM')
    } catch { /* already gone */ }
    runningApps.delete(projectId)
  }

  // Remove files
  const appDir = join(BASE_DIR, projectId)
  if (existsSync(appDir)) {
    rmSync(appDir, { recursive: true, force: true })
  }

  return NextResponse.json({ deleted: true })
}
