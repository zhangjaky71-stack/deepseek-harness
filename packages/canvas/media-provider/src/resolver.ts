/** Pure media-model requirement matching and strict/fallback resolution. */

import type {
  MediaModelDescriptor,
  MediaModelMismatch,
  MediaModelPolicyResolutionRequest,
  MediaModelRef,
  MediaModelRegistrySnapshot,
  MediaModelResolution,
  MediaModelResolutionErrorCode,
  MediaModelResolutionRequest,
  MediaModelRequirements,
  MediaNumericConstraint,
  MediaProviderDescriptor,
} from './types.ts'

/** Stable media-model registry/resolution failure. */
export class MediaModelResolutionError extends Error {
  /**
   * @param code - machine-readable model registry/resolution failure.
   * @param message - direct provider-neutral diagnostic.
   * @param mismatches - optional requirement mismatches for an incompatible preferred model.
   */
  constructor(
    readonly code: MediaModelResolutionErrorCode,
    message: string,
    readonly mismatches: readonly MediaModelMismatch[] = [],
  ) {
    super(message)
    this.name = 'MediaModelResolutionError'
  }
}

const RATIO_PATTERN = /^([1-9]\d*):([1-9]\d*)$/

function gcd(left: number, right: number): number {
  let a = left
  let b = right
  while (b !== 0) {
    const next = a % b
    a = b
    b = next
  }
  return a
}

function normalizeAspectRatio(value: string, code: MediaModelResolutionErrorCode): string {
  const match = RATIO_PATTERN.exec(value)
  if (match === null) {
    throw new MediaModelResolutionError(code, `invalid media aspect ratio ${JSON.stringify(value)}`)
  }
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new MediaModelResolutionError(code, `media aspect ratio ${JSON.stringify(value)} exceeds safe integer bounds`)
  }
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

/** Normalize a descriptor aspect ratio to lowest positive integer terms. */
export function normalizeMediaAspectRatio(value: string): string {
  return normalizeAspectRatio(value, 'MEDIA_MODEL_INVALID_DESCRIPTOR')
}

function assertPositiveRequirement(value: number | undefined, label: string): void {
  if (value === undefined) return
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_REQUIREMENTS', `${label} must be a positive safe integer`)
  }
}

/** Validate scalar requirement values before matching any model. */
export function assertMediaModelRequirements(requirements: MediaModelRequirements): void {
  assertPositiveRequirement(requirements.width, 'requirements.width')
  assertPositiveRequirement(requirements.height, 'requirements.height')
  assertPositiveRequirement(requirements.durationMs, 'requirements.durationMs')
  if (requirements.referenceImageCount !== undefined
    && (!Number.isSafeInteger(requirements.referenceImageCount) || requirements.referenceImageCount < 0)) {
    throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_REQUIREMENTS', 'requirements.referenceImageCount must be a non-negative safe integer')
  }
  if (requirements.aspectRatio !== undefined) {
    normalizeAspectRatio(requirements.aspectRatio, 'MEDIA_MODEL_INVALID_REQUIREMENTS')
  }
}

function modelKey(ref: MediaModelRef): string {
  return `${ref.providerId}\u0000${ref.modelId}`
}

function inConstraint(value: number, constraint: MediaNumericConstraint | null): boolean {
  if (constraint === null) return true
  if (value < constraint.min || value > constraint.max) return false
  if (constraint.step === undefined) return true
  return (value - constraint.min) % constraint.step === 0
}

function mismatch(code: MediaModelMismatch['code'], message: string): MediaModelMismatch {
  return Object.freeze({ code, message })
}

/**
 * Return every requirement the model cannot satisfy.
 * Availability (`provider.enabled`/`model.enabled`) is intentionally evaluated by the resolver, not by this matcher.
 */
export function matchMediaModelRequirements(
  model: MediaModelDescriptor,
  requirements: MediaModelRequirements,
): readonly MediaModelMismatch[] {
  assertMediaModelRequirements(requirements)
  const failures: MediaModelMismatch[] = []
  const capabilities = model.capabilities
  if (!capabilities.operations.includes(requirements.capability)) {
    failures.push(mismatch('MEDIA_MODEL_CAPABILITY_UNSUPPORTED', `${model.providerId}/${model.id} does not support ${requirements.capability}`))
  }
  if (requirements.width !== undefined && !inConstraint(requirements.width, capabilities.dimensions.width)) {
    failures.push(mismatch('MEDIA_MODEL_WIDTH_UNSUPPORTED', `${model.providerId}/${model.id} does not support width ${requirements.width}`))
  }
  if (requirements.height !== undefined && !inConstraint(requirements.height, capabilities.dimensions.height)) {
    failures.push(mismatch('MEDIA_MODEL_HEIGHT_UNSUPPORTED', `${model.providerId}/${model.id} does not support height ${requirements.height}`))
  }
  if (requirements.aspectRatio !== undefined && capabilities.aspectRatios !== 'any') {
    const ratio = normalizeAspectRatio(requirements.aspectRatio, 'MEDIA_MODEL_INVALID_REQUIREMENTS')
    if (!capabilities.aspectRatios.includes(ratio)) {
      failures.push(mismatch('MEDIA_MODEL_ASPECT_RATIO_UNSUPPORTED', `${model.providerId}/${model.id} does not support aspect ratio ${ratio}`))
    }
  }
  if (requirements.durationMs !== undefined) {
    const duration = capabilities.duration
    if (!duration.supported
      || requirements.durationMs < duration.minMs
      || requirements.durationMs > duration.maxMs
      || (duration.stepMs !== undefined && (requirements.durationMs - duration.minMs) % duration.stepMs !== 0)) {
      failures.push(mismatch('MEDIA_MODEL_DURATION_UNSUPPORTED', `${model.providerId}/${model.id} does not support duration ${requirements.durationMs}ms`))
    }
  }
  if (requirements.referenceImageCount !== undefined
    && requirements.referenceImageCount > capabilities.maxReferenceImages) {
    failures.push(mismatch('MEDIA_MODEL_REFERENCE_COUNT_UNSUPPORTED', `${model.providerId}/${model.id} accepts at most ${capabilities.maxReferenceImages} reference images`))
  }
  if (requirements.requiresMask === true && !capabilities.supportsMask) {
    failures.push(mismatch('MEDIA_MODEL_MASK_UNSUPPORTED', `${model.providerId}/${model.id} does not support masks`))
  }
  if (requirements.requiresSeed === true && !capabilities.supportsSeed) {
    failures.push(mismatch('MEDIA_MODEL_SEED_UNSUPPORTED', `${model.providerId}/${model.id} does not support seeds`))
  }
  if (requirements.requiresAudio === true && !capabilities.supportsAudio) {
    failures.push(mismatch('MEDIA_MODEL_AUDIO_UNSUPPORTED', `${model.providerId}/${model.id} does not support audio`))
  }
  return Object.freeze(failures)
}

interface CatalogIndex {
  readonly providers: ReadonlyMap<string, MediaProviderDescriptor>
  readonly models: ReadonlyMap<string, MediaModelDescriptor>
}

function indexSnapshot(snapshot: MediaModelRegistrySnapshot): CatalogIndex {
  return {
    providers: new Map(snapshot.providers.map(provider => [provider.id, provider])),
    models: new Map(snapshot.models.map(model => [modelKey({ providerId: model.providerId, modelId: model.id }), model])),
  }
}

function refText(ref: MediaModelRef): string {
  return `${ref.providerId}/${ref.modelId}`
}

function available(index: CatalogIndex, model: MediaModelDescriptor): MediaProviderDescriptor | undefined {
  const provider = index.providers.get(model.providerId)
  if (provider?.enabled !== true || !model.enabled) return undefined
  return provider
}

function resolveExact(
  index: CatalogIndex,
  ref: MediaModelRef,
): { readonly provider: MediaProviderDescriptor; readonly model: MediaModelDescriptor } | undefined {
  const model = index.models.get(modelKey(ref))
  if (model === undefined) return undefined
  const provider = index.providers.get(model.providerId)
  if (provider === undefined) return undefined
  return { provider, model }
}

function validateCandidateOrder(index: CatalogIndex, request: MediaModelPolicyResolutionRequest): readonly MediaModelRef[] {
  const seen = new Set<string>()
  for (const ref of request.routing.candidateOrder) {
    const key = modelKey(ref)
    if (seen.has(key)) {
      throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_ROUTING_POLICY', `routing policy contains duplicate model ${refText(ref)}`)
    }
    seen.add(key)
    if (!index.models.has(key)) {
      throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_ROUTING_POLICY', `routing policy references unknown model ${refText(ref)}`)
    }
  }
  return request.routing.candidateOrder
}

function compatibleCandidate(
  index: CatalogIndex,
  request: MediaModelPolicyResolutionRequest,
): { readonly provider: MediaProviderDescriptor; readonly model: MediaModelDescriptor } | undefined {
  for (const ref of validateCandidateOrder(index, request)) {
    const exact = resolveExact(index, ref)!
    if (available(index, exact.model) === undefined) continue
    if (matchMediaModelRequirements(exact.model, request.requirements).length !== 0) continue
    return exact
  }
  return undefined
}

function resolution(
  provider: MediaProviderDescriptor,
  model: MediaModelDescriptor,
  warnings: MediaModelResolution['warnings'] = [],
): MediaModelResolution {
  return Object.freeze({
    provider,
    model,
    executionIdentity: Object.freeze({ key: model.executionIdentityKey }),
    warnings: Object.freeze([...warnings]),
  })
}

/**
 * Resolve one exact or policy-selected model without Provider I/O.
 * Strict preference never falls back. Auto/fallback walk only the caller's explicit ordered candidate policy.
 */
export function resolveMediaModel(
  snapshot: MediaModelRegistrySnapshot,
  request: MediaModelResolutionRequest,
): MediaModelResolution {
  assertMediaModelRequirements(request.requirements)
  const index = indexSnapshot(snapshot)
  if (request.selection.mode === 'strict') {
    const exact = resolveExact(index, request.selection.preferred)
    if (exact === undefined) {
      throw new MediaModelResolutionError('MEDIA_MODEL_UNKNOWN_PREFERRED', `preferred media model ${refText(request.selection.preferred)} is not registered`)
    }
    if (available(index, exact.model) === undefined) {
      throw new MediaModelResolutionError('MEDIA_MODEL_PREFERRED_DISABLED', `preferred media model ${refText(request.selection.preferred)} is disabled`)
    }
    const mismatches = matchMediaModelRequirements(exact.model, request.requirements)
    if (mismatches.length !== 0) {
      throw new MediaModelResolutionError('MEDIA_MODEL_PREFERRED_INCOMPATIBLE', `preferred media model ${refText(request.selection.preferred)} does not satisfy the requirements`, mismatches)
    }
    return resolution(exact.provider, exact.model)
  }

  if (request.selection.mode === 'fallback') {
    const preferred = resolveExact(index, request.selection.preferred)
    if (preferred !== undefined && available(index, preferred.model) !== undefined) {
      const mismatches = matchMediaModelRequirements(preferred.model, request.requirements)
      if (mismatches.length === 0) return resolution(preferred.provider, preferred.model)
    }
    const candidate = compatibleCandidate(index, request)
    if (candidate === undefined) {
      throw new MediaModelResolutionError('MEDIA_MODEL_NO_COMPATIBLE_MODEL', 'no enabled routing candidate satisfies the media requirements')
    }
    const preferredMismatches = preferred === undefined
      ? []
      : matchMediaModelRequirements(preferred.model, request.requirements)
    return resolution(candidate.provider, candidate.model, [{
      code: 'MEDIA_MODEL_FALLBACK_USED',
      message: `preferred media model ${refText(request.selection.preferred)} was replaced by ${candidate.provider.id}/${candidate.model.id}`,
      preferred: request.selection.preferred,
      resolved: { providerId: candidate.provider.id, modelId: candidate.model.id },
      preferredMismatches,
    }])
  }

  const candidate = compatibleCandidate(index, request)
  if (candidate === undefined) {
    throw new MediaModelResolutionError('MEDIA_MODEL_NO_COMPATIBLE_MODEL', 'no enabled routing candidate satisfies the media requirements')
  }
  return resolution(candidate.provider, candidate.model)
}
