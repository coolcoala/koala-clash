import { createReadStream, createWriteStream } from 'fs'
import { FileHandle, open, readdir, rename, rm, stat, utimes } from 'fs/promises'
import path from 'path'
import { Writable } from 'stream'
import { pipeline } from 'stream/promises'
import { createGzip } from 'zlib'
import { getAppConfig } from '../config'
import { logDir, logPath } from './dirs'

// Small enough to attach to a GitHub issue
const MAX_LOG_SIZE = 20 * 1024 * 1024
// The oldest part of a day is dropped beyond this, so a core flooding its output stays bounded
const MAX_LOG_BACKUPS = 4

let cleaning: Promise<void> | null = null

// 2026-10-9.log, then its rotated parts 2026-10-9.1.log, 2026-10-9.2.log...
function logPart(file: string, index: number): string {
  return index ? file.replace(/\.log$/, `.${index}.log`) : file
}

// Follows the date and splits by size, as the core may run for weeks without a restart
export class RotatingLog extends Writable {
  private handle: FileHandle | null = null
  private file = ''
  private size = 0

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void): void {
    this.append(chunk).then(callback)
  }

  _writev(chunks: { chunk: Buffer }[], callback: () => void): void {
    this.append(Buffer.concat(chunks.map(({ chunk }) => chunk))).then(callback)
  }

  _final(callback: () => void): void {
    this.close().then(callback)
  }

  private async append(chunk: Buffer): Promise<void> {
    try {
      const file = logPath()
      if (file !== this.file) {
        const rollover = this.file !== ''
        await this.open(file)
        // The previous day is finished and can be archived
        if (rollover) cleanupLogs().catch(() => {})
      } else if (this.size > 0 && this.size + chunk.length > MAX_LOG_SIZE) {
        await this.rotate()
      }
      await this.handle!.write(chunk)
      this.size += chunk.length
    } catch {
      // Logging is best effort, a full disk must not stall the core; the next write reopens the file
      await this.close()
      this.file = ''
    }
  }

  private async open(file: string): Promise<void> {
    await this.close()
    this.handle = await open(file, 'a')
    this.file = file
    this.size = (await this.handle.stat()).size
  }

  private async rotate(): Promise<void> {
    await this.close()
    for (let i = MAX_LOG_BACKUPS; i > 0; i--) {
      // Parts that were never created are expected to be missing
      await rename(logPart(this.file, i - 1), logPart(this.file, i)).catch(() => {})
    }
    await this.open(this.file)
  }

  private async close(): Promise<void> {
    const handle = this.handle
    this.handle = null
    await handle?.close().catch(() => {})
  }
}

// Past days are no longer written to, and text logs shrink about tenfold
async function archiveLog(logFile: string): Promise<void> {
  const archive = `${logFile}.gz`
  const { atime, mtime, size } = await stat(logFile)
  try {
    // Logs from before the size cap could reach hundreds of gigabytes, only their tail is worth keeping
    const start = Math.max(0, size - 2 * MAX_LOG_SIZE)
    await pipeline(createReadStream(logFile, { start }), createGzip(), createWriteStream(archive))
    // The archive keeps the log's date so it expires on the same schedule
    await utimes(archive, atime, mtime)
  } catch (e) {
    // A half-written archive, e.g. on a full disk, would only eat the space that is left
    await rm(archive, { force: true })
    throw e
  }
  await rm(logFile)
}

// Aged by mtime since heap snapshots are named by timestamp rather than by date
async function expireLogs(): Promise<void> {
  const { maxLogDays = 7 } = await getAppConfig()
  // Today's log and its rotated parts may still be written to
  const today = `${path.basename(logPath(), '.log')}.`
  const logs = await readdir(logDir())
  for (const log of logs) {
    const logFile = path.join(logDir(), log)
    try {
      const { mtime } = await stat(logFile)
      if (Date.now() - mtime.getTime() > maxLogDays * 24 * 60 * 60 * 1000) {
        await rm(logFile)
      } else if (log.endsWith('.log') && !log.startsWith(today)) {
        await archiveLog(logFile)
      }
    } catch {
      // ignore
    }
  }
}

// Runs at startup and on each day rollover, which may overlap
export function cleanupLogs(): Promise<void> {
  cleaning ??= expireLogs().finally(() => {
    cleaning = null
  })
  return cleaning
}
