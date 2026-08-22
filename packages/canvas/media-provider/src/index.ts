/**
 * Media Provider/model capability catalog, pure requirement resolver, and Provider runtime adapter seam.
 * N14 adds runtime routing/execution while credentials and concrete cloud APIs remain adapter-owned.
 *
 * @module @deepseek-ai/dsh-media-provider
 */

export type * from './types.ts'
export { MediaProviderId, MediaModelId } from './brand.ts'
export {
  MediaModelResolutionError,
  assertMediaModelRequirements,
  matchMediaModelRequirements,
  normalizeMediaAspectRatio,
  resolveMediaModel,
} from './resolver.ts'
export {
  MediaModelRegistry,
  assertMediaProviderDescriptor,
  normalizeMediaModelDescriptor,
} from './model-registry.ts'
export * from './runtime.ts'
export { default } from './model-registry.ts'
