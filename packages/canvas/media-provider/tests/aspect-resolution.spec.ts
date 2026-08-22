import { describe, expect, it } from 'vitest'
import { matchMediaModelRequirements, MediaModelResolutionError } from '../src/resolver.ts'
import { capabilities, model } from './model-fixture.ts'

describe('derived media aspect requirements', () => {
  it('derives aspect ratio from width and height when the caller omits an explicit ratio', () => {
    const candidate = model(undefined, 'portrait', {
      capabilities: capabilities({ aspectRatios: ['9:16'] }),
    })
    expect(matchMediaModelRequirements(candidate, {
      capability: 'text-to-image',
      width: 1080,
      height: 1920,
    })).toEqual([])
    expect(matchMediaModelRequirements(candidate, {
      capability: 'text-to-image',
      width: 1024,
      height: 1024,
    }).map(item => item.code)).toEqual(['MEDIA_MODEL_ASPECT_RATIO_UNSUPPORTED'])
  })

  it('rejects an explicit aspect ratio that conflicts with width and height', () => {
    expect(() => matchMediaModelRequirements(model(), {
      capability: 'text-to-image',
      width: 1080,
      height: 1920,
      aspectRatio: '1:1',
    })).toThrow(expect.objectContaining<Partial<MediaModelResolutionError>>({
      code: 'MEDIA_MODEL_INVALID_REQUIREMENTS',
    }))
  })
})
