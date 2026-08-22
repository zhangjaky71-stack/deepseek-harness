import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { MediaProviderId } from '../src/brand.ts'
import MediaModelRegistry from '../src/model-registry.ts'
import {
  MediaProviderError,
  MediaProviderRuntimeRegistry,
  normalizeMediaProviderError,
  runMediaProviderOperation,
} from '../src/provider-runtime.ts'
import type {
  MediaProvider,
  MediaProviderOperationHandle,
  MediaProviderRequest,
} from '../src/runtime-types.ts'
import { model, provider } from './model-fixture.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.dispose()
})

const request = (providerId = MediaProviderId('runtime-provider')): MediaProviderRequest => ({
  providerId,
  modelId: model(providerId, 'runtime-model').id,
  executionIdentityKey: `${providerId}/runtime-model@v1`,
  nodeType: 'image.generate',
  nodeVersion: 1,
  config: { count: 1 },
  capability: 'text-to-image',
  prompt: 'hello',
  count: 1,
  references: [],
})

async function harness(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(MediaModelRegistry)
  await ctx.plugin(MediaProviderRuntimeRegistry)
  return ctx
}

function inlineProvider(data = new Uint8Array([1, 2, 3])): MediaProvider {
  return {
    start() {
      return {
        mode: 'inline',
        completion: {
          outputs: [{ kind: 'image', mediaType: 'image/png', data, providerOutputId: 'out-1' }],
          providerRequestId: 'req-1',
        },
      }
    },
    resume() {
      throw new Error('inline provider must not resume')
    },
    cancel() {},
  }
}

describe('MediaProviderRuntimeRegistry', () => {
  it('requires a catalog descriptor before runtime registration', async () => {
    const ctx = await harness()
    const providerId = MediaProviderId('orphan-runtime')
    expect(() => ctx.mediaProviders.register(providerId, inlineProvider())).toThrow(
      expect.objectContaining<Partial<MediaProviderError>>({ code: 'MEDIA_PROVIDER_INVALID_REGISTRATION' }),
    )
    expect(ctx.mediaProviders.list()).toEqual([])
  })

  it('registers on the owning fiber, rejects duplicates, and unregisters on disposal', async () => {
    const ctx = await harness()
    const descriptor = provider('fiber-provider')
    ctx.mediaModels.register(descriptor, [model(descriptor.id, 'fiber-model')])
    const changes: string[] = []
    ctx.mediaProviders.onChange(change => { changes.push(`${change.kind}:${change.providerId}`) })

    const runtime = inlineProvider()
    const fiber = ctx.plugin({
      inject: ['mediaProviders'],
      apply(pluginCtx: Context) {
        pluginCtx.mediaProviders.register(descriptor.id, runtime)
      },
    })
    await fiber.await()
    expect(ctx.mediaProviders.get(descriptor.id)).toBe(runtime)
    expect(ctx.mediaProviders.list()).toEqual([descriptor.id])
    expect(() => ctx.mediaProviders.register(descriptor.id, inlineProvider())).toThrow(
      expect.objectContaining<Partial<MediaProviderError>>({ code: 'MEDIA_PROVIDER_DUPLICATE' }),
    )

    await fiber.dispose()
    expect(ctx.mediaProviders.get(descriptor.id)).toBeUndefined()
    expect(changes).toEqual([
      `registered:${descriptor.id}`,
      `unregistered:${descriptor.id}`,
    ])
  })

  it('contains observer failures after commit so later observers still run', async () => {
    const ctx = await harness()
    const descriptor = provider('observer-provider')
    ctx.mediaModels.register(descriptor, [model(descriptor.id, 'observer-model')])
    const later = vi.fn()
    ctx.mediaProviders.onChange(() => { throw new Error('observer boom') })
    ctx.mediaProviders.onChange(later)

    expect(() => ctx.mediaProviders.register(descriptor.id, inlineProvider())).not.toThrow()
    expect(ctx.mediaProviders.get(descriptor.id)).toBeDefined()
    expect(later).toHaveBeenCalledWith({ kind: 'registered', providerId: descriptor.id })
  })
})

describe('media Provider operation driver', () => {
  it('detaches inline completion bytes and retains only safe opaque metadata', async () => {
    const data = new Uint8Array([1, 2, 3])
    const result = await runMediaProviderOperation(inlineProvider(data), request())
    data[0] = 9
    expect(result).toMatchObject({ mode: 'inline' })
    expect(result.completion.providerRequestId).toBe('req-1')
    expect([...result.completion.outputs[0]!.data]).toEqual([1, 2, 3])
  })

  it('resumes a polling operation until completion', async () => {
    const providerId = MediaProviderId('runtime-provider')
    let resumes = 0
    const providerRuntime: MediaProvider = {
      start() {
        return { mode: 'polling', providerTaskId: 'task-1' }
      },
      resume() {
        resumes += 1
        if (resumes === 1) return { status: 'pending', retryAfterMs: 1 }
        return {
          status: 'completed',
          completion: { outputs: [{ kind: 'image', mediaType: 'image/png', data: new Uint8Array([4]) }] },
        }
      },
      cancel() {},
    }
    const result = await runMediaProviderOperation(providerRuntime, request(providerId))
    expect(resumes).toBe(2)
    expect(result).toMatchObject({ mode: 'polling', providerTaskId: 'task-1' })
  })

  it('requests Provider cancellation when an async operation is aborted', async () => {
    const controller = new AbortController()
    const cancelled: MediaProviderOperationHandle[] = []
    const providerRuntime: MediaProvider = {
      start() {
        return { mode: 'callback', providerTaskId: 'task-cancel' }
      },
      async resume(_handle, signal) {
        controller.abort()
        await new Promise(resolve => setTimeout(resolve, 0))
        if (signal?.aborted === true) throw new Error('sdk abort')
        return { status: 'pending', retryAfterMs: 1 }
      },
      cancel(handle) {
        cancelled.push(handle)
      },
    }

    await expect(runMediaProviderOperation(providerRuntime, request(), controller.signal)).rejects.toMatchObject({
      code: 'MEDIA_PROVIDER_ABORTED',
    })
    expect(cancelled).toEqual([{
      providerId: MediaProviderId('runtime-provider'),
      mode: 'callback',
      providerTaskId: 'task-cancel',
    }])
  })

  it('normalizes 429 and 5xx errors without copying raw Provider response text', () => {
    const providerId = MediaProviderId('runtime-provider')
    const rateLimit = normalizeMediaProviderError({ status: 429, retryAfterMs: 250, rawResponse: 'TOP-SECRET' }, providerId)
    expect(rateLimit).toMatchObject({ code: 'MEDIA_PROVIDER_RATE_LIMIT', status: 429, retryAfterMs: 250, providerId })
    expect(rateLimit.message).not.toContain('TOP-SECRET')

    const server = normalizeMediaProviderError({ status: 503, body: 'PRIVATE-PAYLOAD' }, providerId)
    expect(server).toMatchObject({ code: 'MEDIA_PROVIDER_SERVER_ERROR', status: 503, providerId })
    expect(server.message).not.toContain('PRIVATE-PAYLOAD')
  })

  it('rejects malformed Provider completion before downstream materialization', async () => {
    const bad: MediaProvider = {
      start() {
        return { mode: 'inline', completion: { outputs: [] } }
      },
      resume() {
        throw new Error('not reached')
      },
      cancel() {},
    }
    await expect(runMediaProviderOperation(bad, request())).rejects.toMatchObject({
      code: 'MEDIA_PROVIDER_INVALID_RESULT',
    })
  })
})
