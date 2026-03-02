import { ChildProcess } from 'child_process'

export interface RunningApp {
  process: ChildProcess
  port: number
}

// Module-level map shared between all API route handlers in the same Node.js process
export const runningApps = new Map<string, RunningApp>()
