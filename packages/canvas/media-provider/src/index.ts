/**
 * Media Provider/model capability catalog and pure requirement resolver.
 * Provider network adapters arrive in N14; N13 owns only descriptors, availability, and model selection.
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
export { default } from './model-registry.ts'
