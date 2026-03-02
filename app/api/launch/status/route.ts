import { NextRequest, NextResponse } from 'next/server'
import { runningApps } from '@/lib/launchStore'

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const app = runningApps.get(projectId)
  if (app) {
    return NextResponse.json({ running: true, port: app.port })
  }

  return NextResponse.json({ running: false, port: null })
}
