import { NextRequest, NextResponse } from 'next/server'
import { runningApps } from '@/lib/launchStore'

export async function POST(req: NextRequest) {
  const { projectId } = await req.json() as { projectId: string }

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const app = runningApps.get(projectId)
  if (app) {
    try {
      app.process.kill('SIGTERM')
    } catch {
      // process may have already exited
    }
    runningApps.delete(projectId)
  }

  return NextResponse.json({ stopped: true })
}
