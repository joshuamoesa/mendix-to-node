import { NextRequest } from 'next/server'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { createConnection } from 'net'
import { runningApps } from '@/lib/launchStore'

interface GeneratedFile {
  path: string
  content: string
}

const BASE_DIR = '/tmp/mendix-launched'
const PORT = 3001

function send(controller: ReadableStreamDefaultController, data: object) {
  const line = `data: ${JSON.stringify(data)}\n\n`
  controller.enqueue(new TextEncoder().encode(line))
}

function spawnAsync(
  cmd: string,
  args: string[],
  cwd: string,
  onLine: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: true })
    const errorLines: string[] = []

    child.stdout?.on('data', (d: Buffer) => {
      d.toString().split('\n').filter(Boolean).forEach(onLine)
    })
    child.stderr?.on('data', (d: Buffer) => {
      const lines = d.toString().split('\n').filter(Boolean)
      lines.forEach(l => {
        onLine(l)
        errorLines.push(l)
      })
    })
    child.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve()
      } else {
        const detail = errorLines.slice(-3).join(' | ')
        reject(new Error(`${cmd} failed (exit ${code})${detail ? ': ' + detail : ''}`))
      }
    })
    child.on('error', reject)
  })
}

export async function POST(req: NextRequest) {
  const { projectId, files } = await req.json() as { projectId: string; files: GeneratedFile[] }

  if (!projectId || !files) {
    return new Response(JSON.stringify({ error: 'projectId and files are required' }), { status: 400 })
  }

  const cwd = join(BASE_DIR, projectId)

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Stage 1: Write files ────────────────────────────────────────────
        send(controller, { type: 'progress', stage: 'Writing files', detail: `${files.length} files → ${cwd}` })

        mkdirSync(cwd, { recursive: true })

        for (const file of files) {
          const fullPath = join(cwd, file.path)
          const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))
          mkdirSync(dir, { recursive: true })
          writeFileSync(fullPath, file.content, 'utf8')
        }

        // Write .env with SQLite connection string
        writeFileSync(join(cwd, '.env'), `DATABASE_URL=file:./dev.db\nPORT=${PORT}\n`, 'utf8')

        // ── Stage 2: npm install ────────────────────────────────────────────
        send(controller, { type: 'progress', stage: 'Installing dependencies', detail: 'npm install' })

        await spawnAsync('npm', ['install'], cwd, (line) => {
          send(controller, { type: 'progress', stage: 'Installing dependencies', detail: line })
        })

        // ── Stage 3: prisma generate ────────────────────────────────────────
        send(controller, { type: 'progress', stage: 'Generating Prisma client', detail: 'npx prisma generate' })

        await spawnAsync('npx', ['prisma', 'generate'], cwd, (line) => {
          send(controller, { type: 'progress', stage: 'Generating Prisma client', detail: line })
        })

        // ── Stage 4: prisma db push ─────────────────────────────────────────
        send(controller, { type: 'progress', stage: 'Setting up database', detail: 'npx prisma db push' })

        await spawnAsync('npx', ['prisma', 'db', 'push', '--accept-data-loss'], cwd, (line) => {
          send(controller, { type: 'progress', stage: 'Setting up database', detail: line })
        })

        // ── Stage 5: Start app ──────────────────────────────────────────────
        send(controller, { type: 'progress', stage: 'Starting app', detail: 'ts-node src/app.ts' })

        // Kill the tracked process (if any)
        const prev = runningApps.get(projectId)
        if (prev) {
          try { prev.process.kill() } catch { /* already dead */ }
          runningApps.delete(projectId)
        }

        // Also forcefully free the port — handles server restarts that wipe runningApps
        await new Promise<void>(resolve => {
          const killer = spawn('sh', ['-c', `lsof -ti:${PORT} | xargs kill -9 2>/dev/null; true`], { shell: false })
          killer.on('close', () => resolve())
          killer.on('error', () => resolve())
        })

        // Brief pause to let the OS release the port
        await new Promise(resolve => setTimeout(resolve, 400))

        // Redirect ts-node output to a log file for diagnostics.
        // 'exec' replaces the shell so appProcess.kill() hits ts-node directly.
        // Explicitly set PORT and DATABASE_URL so inherited parent env vars (e.g.
        // Next.js sets PORT=3000) don't override what dotenv/config would load.
        const logPath = join(cwd, 'app.log')
        const appProcess = spawn(
          'sh',
          ['-c', `exec ./node_modules/.bin/ts-node --transpile-only src/app.ts >> app.log 2>&1`],
          {
            cwd,
            shell: false,
            env: { ...process.env, PORT: String(PORT), DATABASE_URL: 'file:./dev.db' },
          }
        )

        appProcess.on('error', (err) => {
          console.error(`[launch] App process error for ${projectId}:`, err.message)
        })

        // Track early exit so polling can fail fast
        let processExited = false
        let exitCode: number | null = null
        appProcess.on('exit', (code) => {
          processExited = true
          exitCode = code
        })

        runningApps.set(projectId, { process: appProcess, port: PORT })

        // Poll via TCP until the port is ready (up to 20 seconds)
        let ready = false
        for (let i = 0; i < 40; i++) {
          await new Promise(resolve => setTimeout(resolve, 500))

          // If process already exited, fail immediately
          if (processExited) break

          try {
            await new Promise<void>((res, rej) => {
              const sock = createConnection(PORT, '127.0.0.1')
              sock.once('connect', () => { sock.destroy(); res() })
              sock.once('error', rej)
              sock.setTimeout(300, () => { sock.destroy(); rej(new Error('timeout')) })
            })
            ready = true
            break
          } catch { /* not yet ready */ }
        }

        if (!ready) {
          // Surface the actual crash from app.log
          let logTail = ''
          try {
            const { readFileSync } = await import('fs')
            const log = readFileSync(logPath, 'utf8')
            logTail = log.split('\n').filter(Boolean).slice(-8).join(' | ')
          } catch { /* ignore */ }
          const reason = processExited
            ? `process exited with code ${exitCode}`
            : `port ${PORT} not ready after 20 s`
          throw new Error(`App failed to start — ${reason}${logTail ? ': ' + logTail : ''}`)
        }

        send(controller, { type: 'ready', port: PORT })
        controller.close()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        send(controller, { type: 'error', error: message })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  })
}
