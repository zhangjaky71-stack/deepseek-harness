/** Types-only media Provider/model descriptors and requirement-resolution contracts. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { MediaNodeExecutionIdentity } from '@deepseek-ai/dsh-media-workflow/engine'
import type { MediaCapability } from '@deepseek-ai/dsh-media-workflow/types'

/** Opaque deployment Provider identity. */
export type MediaProviderId = Branded<'MediaProviderId'>
/** Opaque Provider-local model identity. */
export type MediaModelId = Branded<'MediaModelId'>

/** Exact registered model reference. */
export interface MediaModelRef {
  readonly providerId: MediaProviderId
  readonly modelId: MediaModelId
}

/** Provider display/availability metadata independent from credentials and network clients. */
export interface MediaProviderDescriptor {
  readonly id: MediaProviderId
  readonly displayName: string
  /** Disabled Providers remain discoverable but are never resolver candidates. */
  readonly enabled: boolean
}

/** Inclusive numeric support interval with an optional origin-relative step. */
export interface MediaNumericConstraint {
  readonly min: number
  readonly max: number
  readonly step?: number
}

/** Explicit dimension support. `null` means the model does not constrain that axis. */
export interface MediaDimensionConstraints {
  readonly width: MediaNumericConstraint | null
  readonly height: MediaNumericConstraint | null
}

/** Explicit duration support. */
export type MediaDurationSupport =
  | { readonly supported: false }
  | {
    readonly supported: true
    readonly minMs: number
    readonly maxMs: number
    readonly stepMs?: number
  }

/** Provider-neutral capabilities used by Agent/UI requirements and Host resolution. */
export interface MediaModelCapabilities {
  readonly operations: readonly MediaCapability[]
  /** `any` accepts every normalized ratio; an array is an exact allowlist such as `['9:16']`. */
  readonly aspectRatios: 'any' | readonly string[]
  readonly dimensions: MediaDimensionConstraints
  readonly duration: MediaDurationSupport
  readonly maxReferenceImages: number
  readonly supportsMask: boolean
  readonly supportsSeed: boolean
  readonly supportsAudio: boolean
}

/** One exact Provider model and the stable execution identity N12 fingerprints. */
export interface MediaModelDescriptor {
  readonly providerId: MediaProviderId
  readonly id: MediaModelId
  readonly displayName: string
  /** Disabled models remain in the catalog but are never selected. */
  readonly enabled: boolean
  /** Provider/model/version identity whose semantic change must invalidate N12 cache fingerprints. */
  readonly executionIdentityKey: string
  readonly capabilities: MediaModelCapabilities
}

/** Requirements that must all be satisfied by one resolved model. */
export interface MediaModelRequirements {
  readonly capability: MediaCapability
  readonly width?: number
  readonly height?: number
  readonly aspectRatio?: string
  readonly durationMs?: number
  readonly referenceImageCount?: number
  readonly requiresMask?: boolean
  readonly requiresSeed?: boolean
  readonly requiresAudio?: boolean
}

/** Explicit caller intent for exact or policy-selected model resolution. */
export type MediaModelSelection =
  | { readonly mode: 'auto' }
  | { readonly mode: 'strict'; readonly preferred: MediaModelRef }
  | { readonly mode: 'fallback'; readonly preferred: MediaModelRef }

/** Deployment-owned ordered candidates used only for auto/fallback resolution. */
export interface MediaModelRoutingPolicy {
  readonly candidateOrder: readonly MediaModelRef[]
}

/** One incompatibility reason produced by the pure matcher. */
export type MediaModelMismatchCode =
  | 'MEDIA_MODEL_CAPABILITY_UNSUPPORTED'
  | 'MEDIA_MODEL_WIDTH_UNSUPPORTED'
  | 'MEDIA_MODEL_HEIGHT_UNSUPPORTED'
  | 'MEDIA_MODEL_ASPECT_RATIO_UNSUPPORTED'
  | 'MEDIA_MODEL_DURATION_UNSUPPORTED'
  | 'MEDIA_MODEL_REFERENCE_COUNT_UNSUPPORTED'
  | 'MEDIA_MODEL_MASK_UNSUPPORTED'
  | 'MEDIA_MODEL_SEED_UNSUPPORTED'
  | 'MEDIA_MODEL_AUDIO_UNSUPPORTED'

/** Stable mismatch fact suitable for diagnostics without Provider payloads or credentials. */
export interface MediaModelMismatch {
  readonly code: MediaModelMismatchCode
  readonly message: string
}

/** Non-fatal resolver notice, currently emitted only when fallback changes an explicit preference. */
export interface MediaModelResolutionWarning {
  readonly code: 'MEDIA_MODEL_FALLBACK_USED'
  readonly message: string
  readonly preferred: MediaModelRef
  readonly resolved: MediaModelRef
  readonly preferredMismatches: readonly MediaModelMismatch[]
}

/** Stable resolver failures. */
export type MediaModelResolutionErrorCode =
  | 'MEDIA_MODEL_INVALID_DESCRIPTOR'
  | 'MEDIA_MODEL_DUPLICATE_PROVIDER'
  | 'MEDIA_MODEL_DUPLICATE_MODEL'
  | 'MEDIA_MODEL_DUPLICATE_EXECUTION_IDENTITY'
  | 'MEDIA_MODEL_INVALID_ROUTING_POLICY'
  | 'MEDIA_MODEL_UNKNOWN_PREFERRED'
  | 'MEDIA_MODEL_PREFERRED_DISABLED'
  | 'MEDIA_MODEL_PREFERRED_INCOMPATIBLE'
  | 'MEDIA_MODEL_NO_COMPATIBLE_MODEL'

/** Immutable model catalog view from one synchronous registry revision. */
export interface MediaModelRegistrySnapshot {
  readonly revision: number
  readonly providers: readonly MediaProviderDescriptor[]
  readonly models: readonly MediaModelDescriptor[]
}

/** Registration lifecycle fact with the resulting process-local registry revision. */
export type MediaModelRegistryChange =
  | {
    readonly kind: 'registered'
    readonly revision: number
    readonly provider: MediaProviderDescriptor
    readonly models: readonly MediaModelDescriptor[]
  }
  | {
    readonly kind: 'unregistered'
    readonly revision: number
    readonly provider: MediaProviderDescriptor
    readonly models: readonly MediaModelDescriptor[]
  }

/** Complete resolver request over one Registry snapshot. */
export interface MediaModelResolutionRequest {
  readonly requirements: MediaModelRequirements
  readonly selection: MediaModelSelection
  readonly routing: MediaModelRoutingPolicy
}

/** Concrete provider/model result plus the opaque identity consumed by N12. */
export interface MediaModelResolution {
  readonly provider: MediaProviderDescriptor
  readonly model: MediaModelDescriptor
  readonly executionIdentity: MediaNodeExecutionIdentity
  readonly warnings: readonly MediaModelResolutionWarning[]
}
