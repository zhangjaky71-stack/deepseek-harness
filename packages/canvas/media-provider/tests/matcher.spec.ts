import { describe, expect, it } from 'vitest'
import { MediaModelResolutionError, assertMediaModelRequirements, matchMediaModelRequirements, normalizeMediaAspectRatio } from '../src/resolver.ts'
import { capabilities, model } from './model-fixture.ts'

describe('media model requirement matching', () => {
  it('matches normalized 9:16, dimensions, duration, references, mask, seed, and audio together', () => {
    const candidate = model(undefined, 'video-pro', {
      capabilities: capabilities({
        operations: ['text-to-video', 'image-to-video'],
        aspectRatios: ['9:16'],
        dimensions: {
          width: { min: 512, max: 1024, step: 256 },
          height: { min: 1024, max: 2048, step: 512 },
        },
        duration: { supported: true, minMs: 2_000, maxMs: 6_000, stepMs: 2_000 },
        maxReferenceImages: 2,
        supportsMask: true,
        supportsSeed: true,
        supportsAudio: true,
      }),
    })
    expect(matchMediaModelRequirements(candidate, {
      capability: 'text-to-video',
      width: 768,
      height: 1536,
      aspectRatio: '18:32',
      durationMs: 4_000,
      referenceImageCount: 2,
      requiresMask: true,
      requiresSeed: true,
      requiresAudio: true,
    })).toEqual([])
    expect(normalizeMediaAspectRatio('18:32')).toBe('9:16')
  })

  it('reports every unsupported capability dimension and optional feature independently', () => {
    const candidate = model(undefined, 'restricted', {
      capabilities: capabilities({
        operations: ['text-to-image'],
        aspectRatios: ['1:1'],
        dimensions: {
          width: { min: 512, max: 1024, step: 256 },
          height: { min: 512, max: 1024, step: 256 },
        },
        duration: { supported: true, minMs: 1_000, maxMs: 5_000, stepMs: 1_000 },
        maxReferenceImages: 1,
      }),
    })
    expect(matchMediaModelRequirements(candidate, {
      capability: 'text-to-video',
      width: 900,
      height: 2000,
      aspectRatio: '9:16',
      durationMs: 2500,
      referenceImageCount: 2,
      requiresMask: true,
      requiresSeed: true,
      requiresAudio: true,
    }).map(item => item.code)).toEqual([
      'MEDIA_MODEL_CAPABILITY_UNSUPPORTED',
      'MEDIA_MODEL_WIDTH_UNSUPPORTED',
      'MEDIA_MODEL_HEIGHT_UNSUPPORTED',
      'MEDIA_MODEL_ASPECT_RATIO_UNSUPPORTED',
      'MEDIA_MODEL_DURATION_UNSUPPORTED',
      'MEDIA_MODEL_REFERENCE_COUNT_UNSUPPORTED',
      'MEDIA_MODEL_MASK_UNSUPPORTED',
      'MEDIA_MODEL_SEED_UNSUPPORTED',
      'MEDIA_MODEL_AUDIO_UNSUPPORTED',
    ])
  })

  it('treats unsupported duration as a mismatch and null dimensions as unconstrained', () => {
    const candidate = model()
    expect(matchMediaModelRequirements(candidate, {
      capability: 'text-to-image',
      width: 4096,
      height: 8192,
      durationMs: 1000,
    }).map(item => item.code)).toEqual(['MEDIA_MODEL_DURATION_UNSUPPORTED'])
  })

  it('rejects invalid requirement scalars and ratios before matching', () => {
    for (const requirements of [
      { capability: 'text-to-image' as const, width: 0 },
      { capability: 'text-to-image' as const, height: 1.5 },
      { capability: 'text-to-image' as const, durationMs: -1 },
      { capability: 'text-to-image' as const, referenceImageCount: -1 },
      { capability: 'text-to-image' as const, aspectRatio: 'wide' },
    ]) {
      expect(() => assertMediaModelRequirements(requirements)).toThrow(
        expect.objectContaining<Partial<MediaModelResolutionError>>({ code: 'MEDIA_MODEL_INVALID_REQUIREMENTS' }),
      )
    }
  })

  it('rejects invalid and unsafe descriptor aspect ratios', () => {
    expect(() => normalizeMediaAspectRatio('0:16')).toThrow(
      expect.objectContaining<Partial<MediaModelResolutionError>>({ code: 'MEDIA_MODEL_INVALID_DESCRIPTOR' }),
    )
    expect(() => normalizeMediaAspectRatio('999999999999999999999999:1')).toThrow(
      expect.objectContaining<Partial<MediaModelResolutionError>>({ code: 'MEDIA_MODEL_INVALID_DESCRIPTOR' }),
    )
  })
})
