import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { MediaModelId, MediaProviderId } from '../src/brand.ts'
import { MediaModelResolutionError } from '../src/resolver.ts'
import { disposeContexts, model, provider, ref, registryHarness } from './model-fixture.ts'

afterEach(disposeContexts)

describe('MediaModelRegistry', () => {
  it('registers one Provider and its models atomically with stable ordering and normalized ratios', async () => {
    const ctx = await registryHarness()
    const p = provider('provider-b')
    ctx.mediaModels.register(p, [
      model(p.id, 'z-model', { capabilities: { ...model(p.id).capabilities, aspectRatios: ['18:32'] } }),
      model(p.id, 'a-model'),
    ])
    expect(ctx.mediaModels.snapshot().revision).toBe(1)
    expect(ctx.mediaModels.listProviders().map(item => item.id)).toEqual([p.id])
    expect(ctx.mediaModels.listModels().map(item => item.id)).toEqual([
      MediaModelId('a-model'),
      MediaModelId('z-model'),
    ])
    expect(ctx.mediaModels.getProvider(p.id)).toMatchObject({ displayName: 'Provider provider-b' })
    expect(ctx.mediaModels.getModel(ref('provider-b', 'z-model'))?.capabilities.aspectRatios).toEqual(['9:16'])
  })

  it('unregisters exactly the owned catalog on fiber disposal and emits monotonic revisions', async () => {
    const ctx = await registryHarness()
    const changes: Array<{ kind: string; revision: number }> = []
    ctx.mediaModels.onChange(change => { changes.push({ kind: change.kind, revision: change.revision }) })
    const p = provider('plugin-provider')
    const fiber = ctx.plugin({
      inject: ['mediaModels'],
      apply(pluginCtx: Context) {
        pluginCtx.mediaModels.register(p, [model(p.id, 'plugin-model')])
      },
    })
    await fiber.await()
    expect(ctx.mediaModels.snapshot().revision).toBe(1)
    await fiber.dispose()
    expect(ctx.mediaModels.snapshot()).toEqual({ revision: 2, providers: [], models: [] })
    expect(changes).toEqual([
      { kind: 'registered', revision: 1 },
      { kind: 'unregistered', revision: 2 },
    ])
  })

  it('rejects a duplicate Provider without mutating the existing catalog', async () => {
    const ctx = await registryHarness()
    const first = provider('same')
    ctx.mediaModels.register(first, [model(first.id, 'one')])
    expect(() => ctx.mediaModels.register(provider('same'), [model(MediaProviderId('same'), 'two')])).toThrow(
      expect.objectContaining<Partial<MediaModelResolutionError>>({ code: 'MEDIA_MODEL_DUPLICATE_PROVIDER' }),
    )
    expect(ctx.mediaModels.snapshot()).toMatchObject({ revision: 1, models: [{ id: MediaModelId('one') }] })
  })

  it('rejects duplicate models and execution identities within one candidate registration before commit', async () => {
    const ctx = await registryHarness()
    const p = provider('local-duplicates')
    const first = model(p.id, 'one')
    expect(() => ctx.mediaModels.register(p, [first, { ...first }])).toThrow(
      expect.objectContaining<Partial<MediaModelResolutionError>>({ code: 'MEDIA_MODEL_DUPLICATE_MODEL' }),
    )
    expect(ctx.mediaModels.snapshot()).toEqual({ revision: 0, providers: [], models: [] })

    const second = model(p.id, 'two', { executionIdentityKey: first.executionIdentityKey })
    expect(() => ctx.mediaModels.register(p, [first, second])).toThrow(
      expect.objectContaining<Partial<MediaModelResolutionError>>({ code: 'MEDIA_MODEL_DUPLICATE_EXECUTION_IDENTITY' }),
    )
    expect(ctx.mediaModels.snapshot().revision).toBe(0)
  })

  it('rejects an execution identity already owned by another Provider without partial commit', async () => {
    const ctx = await registryHarness()
    const firstProvider = provider('first')
    const firstModel = model(firstProvider.id, 'model')
    ctx.mediaModels.register(firstProvider, [firstModel])

    const secondProvider = provider('second')
    expect(() => ctx.mediaModels.register(secondProvider, [
      model(secondProvider.id, 'model', { executionIdentityKey: firstModel.executionIdentityKey }),
    ])).toThrow(
      expect.objectContaining<Partial<MediaModelResolutionError>>({ code: 'MEDIA_MODEL_DUPLICATE_EXECUTION_IDENTITY' }),
    )
    expect(ctx.mediaModels.listProviders().map(item => item.id)).toEqual([firstProvider.id])
    expect(ctx.mediaModels.snapshot().revision).toBe(1)
  })

  it('disposes change listeners independently from Provider registrations', async () => {
    const ctx = await registryHarness()
    let calls = 0
    const dispose = ctx.mediaModels.onChange(() => { calls += 1 })
    dispose()
    const p = provider('quiet')
    ctx.mediaModels.register(p, [])
    expect(calls).toBe(0)
  })
})
