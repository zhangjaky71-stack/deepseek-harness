import { afterEach, describe, expect, it } from 'vitest'
import { MediaModelResolutionError, resolveMediaModel } from '../src/resolver.ts'
import { capabilities, disposeContexts, model, provider, ref, registryHarness } from './model-fixture.ts'

afterEach(disposeContexts)

describe('media model resolution', () => {
  it('resolves an explicit compatible strict preference and returns the N12 execution identity', async () => {
    const ctx = await registryHarness()
    const p = provider('strict')
    const m = model(p.id, 'image', { executionIdentityKey: 'strict/image@2026-08-22' })
    ctx.mediaModels.register(p, [m])
    const result = ctx.mediaModels.resolve({
      requirements: { capability: 'text-to-image' },
      selection: { mode: 'strict', preferred: ref('strict', 'image') },
    })
    expect(result.model.id).toBe(m.id)
    expect(result.provider.id).toBe(p.id)
    expect(result.executionIdentity).toEqual({ key: 'strict/image@2026-08-22' })
    expect(result.warnings).toEqual([])
  })

  it('strict mode fails unknown, disabled, and incompatible preferences without consulting alternatives', async () => {
    const ctx = await registryHarness()
    const enabled = provider('strict-errors')
    ctx.mediaModels.register(enabled, [
      model(enabled.id, 'disabled', { enabled: false }),
      model(enabled.id, 'image'),
    ])
    const disabledProvider = provider('disabled-provider', false)
    ctx.mediaModels.register(disabledProvider, [model(disabledProvider.id, 'image')])

    expect(() => ctx.mediaModels.resolve({
      requirements: { capability: 'text-to-image' },
      selection: { mode: 'strict', preferred: ref('strict-errors', 'missing') },
    })).toThrow(expect.objectContaining<Partial<MediaModelResolutionError>>({ code: 'MEDIA_MODEL_UNKNOWN_PREFERRED' }))

    for (const preferred of [ref('strict-errors', 'disabled'), ref('disabled-provider', 'image')]) {
      expect(() => ctx.mediaModels.resolve({
        requirements: { capability: 'text-to-image' },
        selection: { mode: 'strict', preferred },
      })).toThrow(expect.objectContaining<Partial<MediaModelResolutionError>>({ code: 'MEDIA_MODEL_PREFERRED_DISABLED' }))
    }

    expect(() => ctx.mediaModels.resolve({
      requirements: { capability: 'text-to-video' },
      selection: { mode: 'strict', preferred: ref('strict-errors', 'image') },
    })).toThrow(expect.objectContaining<Partial<MediaModelResolutionError>>({
      code: 'MEDIA_MODEL_PREFERRED_INCOMPATIBLE',
      mismatches: [expect.objectContaining({ code: 'MEDIA_MODEL_CAPABILITY_UNSUPPORTED' })],
    }))
  })

  it('auto mode selects the first enabled compatible model in explicit routing order', async () => {
    const ctx = await registryHarness()
    const disabledProvider = provider('off-provider', false)
    ctx.mediaModels.register(disabledProvider, [model(disabledProvider.id, 'video', {
      capabilities: capabilities({ operations: ['text-to-video'] }),
    })])
    const p = provider('auto')
    ctx.mediaModels.register(p, [
      model(p.id, 'disabled-video', {
        enabled: false,
        capabilities: capabilities({ operations: ['text-to-video'] }),
      }),
      model(p.id, 'image-only'),
      model(p.id, 'video', {
        capabilities: capabilities({ operations: ['text-to-video'], aspectRatios: ['9:16'] }),
      }),
    ])

    const result = ctx.mediaModels.resolve({
      requirements: { capability: 'text-to-video', aspectRatio: '9:16' },
      selection: { mode: 'auto' },
      routing: { candidateOrder: [
        ref('off-provider', 'video'),
        ref('auto', 'disabled-video'),
        ref('auto', 'image-only'),
        ref('auto', 'video'),
      ] },
    })
    expect(result.model.id).toBe(ref('auto', 'video').modelId)
    expect(result.warnings).toEqual([])
  })

  it('fallback preserves a compatible preference without emitting a warning', async () => {
    const ctx = await registryHarness()
    const p = provider('fallback-ok')
    ctx.mediaModels.register(p, [model(p.id, 'preferred'), model(p.id, 'other')])
    const result = ctx.mediaModels.resolve({
      requirements: { capability: 'text-to-image' },
      selection: { mode: 'fallback', preferred: ref('fallback-ok', 'preferred') },
      routing: { candidateOrder: [ref('fallback-ok', 'other')] },
    })
    expect(result.model.id).toBe(ref('fallback-ok', 'preferred').modelId)
    expect(result.warnings).toEqual([])
  })

  it('fallback replaces an incompatible explicit preference and reports the actual model/provider', async () => {
    const ctx = await registryHarness()
    const p = provider('fallback')
    ctx.mediaModels.register(p, [
      model(p.id, 'preferred'),
      model(p.id, 'video', { capabilities: capabilities({ operations: ['text-to-video'] }) }),
    ])
    const result = ctx.mediaModels.resolve({
      requirements: { capability: 'text-to-video' },
      selection: { mode: 'fallback', preferred: ref('fallback', 'preferred') },
      routing: { candidateOrder: [ref('fallback', 'video')] },
    })
    expect(result.model.id).toBe(ref('fallback', 'video').modelId)
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'MEDIA_MODEL_FALLBACK_USED',
        preferred: ref('fallback', 'preferred'),
        resolved: ref('fallback', 'video'),
        preferredMismatches: [expect.objectContaining({ code: 'MEDIA_MODEL_CAPABILITY_UNSUPPORTED' })],
      }),
    ])
  })

  it('fallback can recover from unknown or disabled preferences without treating them as compatible', async () => {
    const ctx = await registryHarness()
    const p = provider('fallback-missing')
    ctx.mediaModels.register(p, [
      model(p.id, 'disabled', { enabled: false }),
      model(p.id, 'usable'),
    ])
    for (const preferred of [ref('fallback-missing', 'missing'), ref('fallback-missing', 'disabled')]) {
      const result = ctx.mediaModels.resolve({
        requirements: { capability: 'text-to-image' },
        selection: { mode: 'fallback', preferred },
        routing: { candidateOrder: [ref('fallback-missing', 'usable')] },
      })
      expect(result.model.id).toBe(ref('fallback-missing', 'usable').modelId)
      expect(result.warnings[0]).toMatchObject({ code: 'MEDIA_MODEL_FALLBACK_USED', preferred })
    }
  })

  it('rejects duplicate/unknown routing entries and empty/no-compatible policies', async () => {
    const ctx = await registryHarness()
    const p = provider('policy')
    ctx.mediaModels.register(p, [model(p.id, 'image')])

    expect(() => ctx.mediaModels.resolve({
      requirements: { capability: 'text-to-image' },
      selection: { mode: 'auto' },
      routing: { candidateOrder: [ref('policy', 'image'), ref('policy', 'image')] },
    })).toThrow(expect.objectContaining<Partial<MediaModelResolutionError>>({ code: 'MEDIA_MODEL_INVALID_ROUTING_POLICY' }))

    expect(() => ctx.mediaModels.resolve({
      requirements: { capability: 'text-to-image' },
      selection: { mode: 'auto' },
      routing: { candidateOrder: [ref('policy', 'missing')] },
    })).toThrow(expect.objectContaining<Partial<MediaModelResolutionError>>({ code: 'MEDIA_MODEL_INVALID_ROUTING_POLICY' }))

    for (const request of [
      {
        requirements: { capability: 'text-to-image' as const },
        selection: { mode: 'auto' as const },
        routing: { candidateOrder: [] },
      },
      {
        requirements: { capability: 'text-to-video' as const },
        selection: { mode: 'auto' as const },
        routing: { candidateOrder: [ref('policy', 'image')] },
      },
    ]) {
      expect(() => resolveMediaModel(ctx.mediaModels.snapshot(), request)).toThrow(
        expect.objectContaining<Partial<MediaModelResolutionError>>({ code: 'MEDIA_MODEL_NO_COMPATIBLE_MODEL' }),
      )
    }
  })
})
