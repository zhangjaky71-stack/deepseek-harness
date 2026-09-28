import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const builtPath = join(packageDir, 'lib/index.js')
const mediaProviderDir = resolve(packageDir, '../media-provider')
const mediaProviderPath = join(mediaProviderDir, 'lib/index.js')
const runtimePath = join(mediaProviderDir, 'lib/runtime.js')
const built = existsSync(builtPath) && existsSync(mediaProviderPath) && existsSync(runtimePath)

describe.skipIf(!built)('media-provider-mock built LIB', () => {
  it('loads the built Mock plugin, executes one operation, and disposes both registrations', async () => {
    const script = `
      import { Context } from '@deepseek-ai/cordis'
      const media = await import(${JSON.stringify(pathToFileURL(mediaProviderPath).href)})
      const runtime = await import(${JSON.stringify(pathToFileURL(runtimePath).href)})
      const mock = await import(${JSON.stringify(pathToFileURL(builtPath).href)})
      const ctx = new Context()
      await ctx.plugin(media.default).await()
      await ctx.plugin(runtime.MediaProviderRuntimeRegistry).await()
      const fiber = ctx.plugin({ inject: [...mock.inject], apply: mock.apply })
      await fiber.await()
      const provider = ctx.mediaProviders.require(mock.MOCK_MEDIA_PROVIDER_ID)
      const result = await runtime.runMediaProviderOperation(provider, {
        providerId: mock.MOCK_MEDIA_PROVIDER_ID,
        modelId: mock.MOCK_MEDIA_MODEL_ID,
        executionIdentityKey: mock.MOCK_MEDIA_MODEL_DESCRIPTOR.executionIdentityKey,
        nodeType: 'image.generate',
        nodeVersion: 1,
        config: { count: 2 },
        capability: 'text-to-image',
        prompt: 'built mock',
        count: 2,
        references: [],
      })
      const beforeDispose = {
        catalog: ctx.mediaModels.getProvider(mock.MOCK_MEDIA_PROVIDER_ID)?.id,
        runtime: ctx.mediaProviders.list(),
      }
      await fiber.dispose()
      const afterDispose = {
        catalog: ctx.mediaModels.getProvider(mock.MOCK_MEDIA_PROVIDER_ID) ?? null,
        runtime: ctx.mediaProviders.list(),
      }
      console.log(JSON.stringify({
        mode: result.mode,
        outputs: result.completion.outputs.map(output => output.kind),
        beforeDispose,
        afterDispose,
      }))
      await ctx.fiber.dispose()
    `
    const result = await runNode(script)
    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0)
    expect(JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}')).toEqual({
      mode: 'inline',
      outputs: ['image', 'image'],
      beforeDispose: { catalog: 'mock-media', runtime: ['mock-media'] },
      afterDispose: { catalog: null, runtime: [] },
    })
  })
})

function runNode(script: string): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  return new Promise(resolveRun => {
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
