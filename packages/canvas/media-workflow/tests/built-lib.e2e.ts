import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const registryPath = join(packageDir, 'lib/index.js')
const builtinsPath = join(packageDir, 'lib/builtins.js')

const built = existsSync(registryPath) && existsSync(builtinsPath)

describe.skipIf(!built)('media workflow built LIB composition', () => {
  it('registers, unloads, and re-registers the built-in catalog on real Cordis fibers', async () => {
    const script = `
      import { Context } from '@deepseek-ai/cordis'
      const registry = await import(${JSON.stringify(pathToFileURL(registryPath).href)})
      const builtins = await import(${JSON.stringify(pathToFileURL(builtinsPath).href)})
      const ctx = new Context()
      const registryFiber = ctx.plugin(registry.default)
      await registryFiber.await()
      const first = ctx.plugin({ inject: [...builtins.inject], apply: builtins.apply })
      await first.await()
      const firstTypes = ctx.mediaNodes.list().map(item => item.type).sort()
      await first.dispose()
      const afterDispose = ctx.mediaNodes.list().length
      const second = ctx.plugin({ inject: [...builtins.inject], apply: builtins.apply })
      await second.await()
      const secondTypes = ctx.mediaNodes.list().map(item => item.type).sort()
      await ctx.fiber.dispose()
      console.log(JSON.stringify({ firstTypes, afterDispose, secondTypes }))
    `
    const result = await runNode(script)
    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0)
    const output = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}') as {
      firstTypes: string[]
      afterDispose: number
      secondTypes: string[]
    }
    expect(output.firstTypes).toEqual([
      'asset.input',
      'image.edit',
      'image.generate',
      'output',
      'prompt',
      'video.generate',
      'video.image-to-video',
    ])
    expect(output.afterDispose).toBe(0)
    expect(output.secondTypes).toEqual(output.firstTypes)
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
