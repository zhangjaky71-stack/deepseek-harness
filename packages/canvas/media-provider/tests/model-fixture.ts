import { Context } from '@deepseek-ai/cordis'
import { MediaModelId, MediaProviderId } from '../src/brand.ts'
import MediaModelRegistry from '../src/model-registry.ts'
import type {
  MediaModelCapabilities,
  MediaModelDescriptor,
  MediaModelRef,
  MediaProviderDescriptor,
} from '../src/types.ts'

const contexts: Context[] = []

export async function disposeContexts(): Promise<void> {
  while (contexts.length > 0) await contexts.pop()!.dispose()
}

export function provider(id = 'provider-a', enabled = true): MediaProviderDescriptor {
  return {
    id: MediaProviderId(id),
    displayName: `Provider ${id}`,
    enabled,
  }
}

export function capabilities(overrides: Partial<MediaModelCapabilities> = {}): MediaModelCapabilities {
  return {
    operations: ['text-to-image'],
    aspectRatios: 'any',
    dimensions: { width: null, height: null },
    duration: { supported: false },
    maxReferenceImages: 0,
    supportsMask: false,
    supportsSeed: false,
    supportsAudio: false,
    ...overrides,
  }
}

export function model(
  providerId = MediaProviderId('provider-a'),
  id = 'model-a',
  overrides: Partial<MediaModelDescriptor> = {},
): MediaModelDescriptor {
  return {
    providerId,
    id: MediaModelId(id),
    displayName: `Model ${id}`,
    enabled: true,
    executionIdentityKey: `${providerId}/${id}@v1`,
    capabilities: capabilities(),
    ...overrides,
  }
}

export function ref(providerId = 'provider-a', modelId = 'model-a'): MediaModelRef {
  return { providerId: MediaProviderId(providerId), modelId: MediaModelId(modelId) }
}

export async function registryHarness(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(MediaModelRegistry)
  return ctx
}
