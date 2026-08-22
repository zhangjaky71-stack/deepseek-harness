import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const builtPath = join(packageDir, 'lib/index.js')
const built = existsSync(builtPath)

describe.skipIf(!built)('canvas-run-admission built LIB', () => {
  it('loads under plain Node and releases a built concurrency lease', async () => {
    const script = `
      const admission = await import(${JSON.stringify(pathToFileURL(builtPath).href)})
      const limiter = new admission.CanvasRunConcurrencyLimiter({
        maxGlobalActive: 1,
        maxPerSessionActive: 1,
        maxPerProviderActive: 1,
        queueCapacity: 0,
        queueTimeoutMs: 10,
      })
      const lease = await limiter.acquire('built-session', [])
      lease.release()
      const second = await limiter.acquire('built-session', [])
      second.release()
      console.log(JSON.stringify({ loaded: typeof admission.admitCanvasRun === 'function' }))
    `
    const result = await runNode(script)
    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0)
    expect(JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}')).toEqual({ loaded: true })
  })
})

function runNode(script: string): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolveRun) => {
    execFile(process.execPath, ['--input-type=module', '-e', script], {
      cwd: packageDir,
      encoding: 'utf8',
      timeout: 30_000,
    }, (error, stdout, stderr) => {
      resolveRun({
        exitCode: error === null ? 0 : typeof error.code === 'number' ? error.code : null,
        stdout,
        stderr,
      })
    })
  })
}
