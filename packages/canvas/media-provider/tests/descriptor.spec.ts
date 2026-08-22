import { describe, expect, it } from 'vitest'
import { MediaModelId, MediaProviderId } from '../src/brand.ts'
import { assertMediaProviderDescriptor, normalizeMediaModelDescriptor } from '../src/model-registry.ts'
import { MediaModelResolutionError } from '../src/resolver.ts'
import { capabilities, model, provider } from './model-fixture.ts'

const invalidDescriptor = { code: 'MEDIA_MODEL_INVALID_DESCRIPTOR' } as const

function expectInvalid(run: () => unknown): void {
  expect(run).toThrow(expect.objectContaining<Partial<MediaModelResolutionError>>(invalidDescriptor))
}

describe('media model descriptor validation', () => {
  it('brands ids without changing runtime values', () => {
    expect(MediaProviderId('p')).toBe('p')
    expect(MediaModelId('m')).toBe('m')
  })

  it('rejects invalid Provider identity and display metadata', () => {
    expectInvalid(() => assertMediaProviderDescriptor({ ...provider(), id: MediaProviderId('bad id') }))
    expectInvalid(() => assertMediaProviderDescriptor({ ...provider(), displayName: '   ' }))
    expectInvalid(() => assertMediaProviderDescriptor({ ...provider(), id: MediaProviderId('x'.repeat(257)) }))
  })

  it('rejects invalid model identity, ownership, display, and execution identity metadata', () => {
    const p = provider()
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'bad id')))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(MediaProviderId('other'))))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'm', { displayName: '' })))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'm', { executionIdentityKey: ' ' })))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'm', { executionIdentityKey: 'bad\nkey' })))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'm', { executionIdentityKey: 'x'.repeat(513) })))
  })

  it('rejects empty/duplicate operations and invalid dimension constraints', () => {
    const p = provider()
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'empty-ops', {
      capabilities: capabilities({ operations: [] }),
    })))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'duplicate-ops', {
      capabilities: capabilities({ operations: ['text-to-image', 'text-to-image'] }),
    })))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'bad-width', {
      capabilities: capabilities({ dimensions: { width: { min: 0, max: 10 }, height: null } }),
    })))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'bad-height', {
      capabilities: capabilities({ dimensions: { width: null, height: { min: 10, max: 5 } } }),
    })))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'bad-step', {
      capabilities: capabilities({ dimensions: { width: { min: 1, max: 10, step: 0 }, height: null } }),
    })))
  })

  it('rejects invalid duration and reference-count metadata', () => {
    const p = provider()
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'bad-duration', {
      capabilities: capabilities({ duration: { supported: true, minMs: 0, maxMs: 1000 } }),
    })))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'reversed-duration', {
      capabilities: capabilities({ duration: { supported: true, minMs: 2000, maxMs: 1000 } }),
    })))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'bad-duration-step', {
      capabilities: capabilities({ duration: { supported: true, minMs: 1000, maxMs: 2000, stepMs: 0 } }),
    })))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'bad-refs', {
      capabilities: capabilities({ maxReferenceImages: -1 }),
    })))
  })

  it('normalizes and freezes aspect ratios while rejecting empty or equivalent duplicates', () => {
    const p = provider()
    const normalized = normalizeMediaModelDescriptor(p, model(p.id, 'ratio', {
      capabilities: capabilities({ aspectRatios: ['18:32', '1:1'] }),
    }))
    expect(normalized.capabilities.aspectRatios).toEqual(['9:16', '1:1'])
    expect(Object.isFrozen(normalized)).toBe(true)
    expect(Object.isFrozen(normalized.capabilities)).toBe(true)
    expect(Object.isFrozen(normalized.capabilities.aspectRatios)).toBe(true)

    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'empty-ratios', {
      capabilities: capabilities({ aspectRatios: [] }),
    })))
    expectInvalid(() => normalizeMediaModelDescriptor(p, model(p.id, 'duplicate-ratios', {
      capabilities: capabilities({ aspectRatios: ['9:16', '18:32'] }),
    })))
  })
})
