import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const builtPath = join(packageDir, 'lib/index.js')
const built = existsSync(builtPath)

describe.skipIf(!built)('media-provider built LIB', () => {
  it('registers a built Provider/model catalog and resolves an exact model under plain Node', async () => {
    const script = `
      import { Context } from '@deepseek-ai/cordis'
      const media = await import(${JSON.stringify(pathToFileURL(builtPath).href)})
      const ctx = new Context()
      const fiber = ctx.plugin(media.default)
      await fiber.await()
      const providerId = media.MediaProviderId('built-provider')
      const modelId = media.MediaModelId('built-model')
      ctx.mediaModels.register({ id: providerId, displayName: 'Built Provider', enabled: true }, [{
        providerId,
        id: modelId,
        displayName: 'Built Model',
        enabled: true,
        executionIdentityKey: 'built-provider/built-model@1',
        capabilities: {
          operations: ['text-to-image'],
          aspectRatios: ['9:16'],
          dimensions: { width: null, height: null },
          duration: { supported: false },
          maxReferenceImages: 0,
          supportsMask: false,
          supportsSeed: false,
          supportsAudio: false,
        },
      }])
      const result = ctx.mediaModels.resolve({
        requirements: { capability: 'text-to-image', aspectRatio: '18:32' },
        selection: { mode: 'strict', preferred: { providerId, modelId } },
      })
      console.log(JSON.stringify({
        provider: result.provider.id,
        model: result.model.id,
        executionIdentity: result.executionIdentity.key,
        ratio: result.model.capabilities.aspectRatios[0],
      }))
      await ctx.fiber.dispose()
    `
    const result = await runNode(script)
    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0)
    expect(JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}')).toEqual({
      provider: 'built-provider',
      model: 'built-model',
      executionIdentity: 'built-provider/built-model@1',
      ratio: '9:16',
    })
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
