import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const builtPath = join(packageDir, 'lib/index.js')
const runtimePath = join(packageDir, 'lib/runtime.js')
const built = existsSync(builtPath) && existsSync(runtimePath)

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
      const executionIdentityKey = 'built-provider/built-model@1'
      ctx.mediaModels.register({ id: providerId, displayName: 'Built Provider', enabled: true }, [{
        providerId,
        id: modelId,
        displayName: 'Built Model',
        enabled: true,
        executionIdentityKey,
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
        reverseLookup: ctx.mediaModels.getModelByExecutionIdentity(executionIdentityKey)?.id,
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
      reverseLookup: 'built-model',
      ratio: '9:16',
    })
  })

  it('loads the published runtime subpath and drives a built inline Provider under plain Node', async () => {
    const script = `
      import { Context } from '@deepseek-ai/cordis'
      const media = await import(${JSON.stringify(pathToFileURL(builtPath).href)})
      const runtime = await import(${JSON.stringify(pathToFileURL(runtimePath).href)})
      const ctx = new Context()
      await ctx.plugin(media.default).await()
      const providerId = media.MediaProviderId('built-runtime-provider')
      const modelId = media.MediaModelId('built-runtime-model')
      const executionIdentityKey = 'built-runtime-provider/built-runtime-model@1'
      ctx.mediaModels.register({ id: providerId, displayName: 'Built Runtime Provider', enabled: true }, [{
        providerId,
        id: modelId,
        displayName: 'Built Runtime Model',
        enabled: true,
        executionIdentityKey,
        capabilities: {
          operations: ['text-to-image'],
          aspectRatios: 'any',
          dimensions: { width: null, height: null },
          duration: { supported: false },
          maxReferenceImages: 0,
          supportsMask: false,
          supportsSeed: false,
          supportsAudio: false,
        },
      }])
      await ctx.plugin(runtime.MediaProviderRuntimeRegistry).await()
      const provider = {
        start() {
          return {
            mode: 'inline',
            completion: {
              providerRequestId: 'built-request',
              outputs: [{ kind: 'image', mediaType: 'image/png', data: new Uint8Array([1, 2, 3]) }],
            },
          }
        },
        resume() { throw new Error('inline provider must not resume') },
        cancel() {},
      }
      const dispose = ctx.mediaProviders.register(providerId, provider)
      const result = await runtime.runMediaProviderOperation(provider, {
        providerId,
        modelId,
        executionIdentityKey,
        nodeType: 'image.generate',
        nodeVersion: 1,
        config: { count: 1 },
        capability: 'text-to-image',
        prompt: 'built runtime',
        count: 1,
        references: [],
      })
      const beforeDispose = ctx.mediaProviders.list()
      dispose()
      const afterDispose = ctx.mediaProviders.list()
      console.log(JSON.stringify({
        mode: result.mode,
        bytes: [...result.completion.outputs[0].data],
        requestId: result.completion.providerRequestId,
        beforeDispose,
        afterDispose,
      }))
      await ctx.fiber.dispose()
    `
    const result = await runNode(script)
    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0)
    expect(JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}')).toEqual({
      mode: 'inline',
      bytes: [1, 2, 3],
      requestId: 'built-request',
      beforeDispose: ['built-runtime-provider'],
      afterDispose: [],
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
