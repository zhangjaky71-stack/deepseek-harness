/** Effect-scoped Provider/model catalog used by N13 requirement resolution. */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type {
  MediaModelDescriptor,
  MediaModelRef,
  MediaModelRegistryChange,
  MediaModelRegistrySnapshot,
  MediaModelResolution,
  MediaModelResolutionRequest,
  MediaNumericConstraint,
  MediaProviderDescriptor,
} from './types.ts'
import { MediaModelResolutionError, normalizeMediaAspectRatio, resolveMediaModel } from './resolver.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mediaModels: MediaModelRegistry
  }
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~=-]*$/
const MAX_ID_LENGTH = 256
const MAX_EXECUTION_KEY_LENGTH = 512

function modelKey(ref: MediaModelRef): string {
  return `${ref.providerId}\u0000${ref.modelId}`
}

function assertIdentifier(value: string, label: string): void {
  if (value.length < 1 || value.length > MAX_ID_LENGTH || !ID_PATTERN.test(value)) {
    throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_DESCRIPTOR', `${label} must be 1-${MAX_ID_LENGTH} safe identifier characters`)
  }
}

function assertDisplayName(value: string, label: string): void {
  if (value.trim() === '') {
    throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_DESCRIPTOR', `${label} must be non-empty`)
  }
}

function assertConstraint(constraint: MediaNumericConstraint | null, label: string): void {
  if (constraint === null) return
  if (!Number.isSafeInteger(constraint.min) || !Number.isSafeInteger(constraint.max)
    || constraint.min <= 0 || constraint.max < constraint.min) {
    throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_DESCRIPTOR', `${label} must use positive safe integer min/max with max >= min`)
  }
  if (constraint.step !== undefined
    && (!Number.isSafeInteger(constraint.step) || constraint.step <= 0)) {
    throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_DESCRIPTOR', `${label}.step must be a positive safe integer`)
  }
}

/** Validate one Provider descriptor independently from registry state. */
export function assertMediaProviderDescriptor(provider: MediaProviderDescriptor): void {
  assertIdentifier(provider.id, 'provider.id')
  assertDisplayName(provider.displayName, `provider ${provider.id} displayName`)
}

/**
 * Validate, canonicalize, detach, and freeze one model descriptor.
 * Aspect ratios are reduced to lowest integer terms so equivalent ratios share one catalog representation.
 */
export function normalizeMediaModelDescriptor(
  provider: MediaProviderDescriptor,
  model: MediaModelDescriptor,
): MediaModelDescriptor {
  assertIdentifier(model.id, `model id for provider ${provider.id}`)
  if (model.providerId !== provider.id) {
    throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_DESCRIPTOR', `model ${model.id} providerId must equal registered provider ${provider.id}`)
  }
  assertDisplayName(model.displayName, `model ${provider.id}/${model.id} displayName`)
  if (model.executionIdentityKey.trim() === ''
    || model.executionIdentityKey.length > MAX_EXECUTION_KEY_LENGTH
    || /[\u0000-\u001f\u007f]/.test(model.executionIdentityKey)) {
    throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_DESCRIPTOR', `model ${provider.id}/${model.id} executionIdentityKey must be non-empty, control-free, and at most ${MAX_EXECUTION_KEY_LENGTH} characters`)
  }
  if (model.capabilities.operations.length === 0
    || new Set(model.capabilities.operations).size !== model.capabilities.operations.length) {
    throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_DESCRIPTOR', `model ${provider.id}/${model.id} operations must be non-empty and unique`)
  }
  assertConstraint(model.capabilities.dimensions.width, `model ${provider.id}/${model.id} width constraint`)
  assertConstraint(model.capabilities.dimensions.height, `model ${provider.id}/${model.id} height constraint`)
  const duration = model.capabilities.duration
  if (duration.supported) {
    if (!Number.isSafeInteger(duration.minMs) || !Number.isSafeInteger(duration.maxMs)
      || duration.minMs <= 0 || duration.maxMs < duration.minMs) {
      throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_DESCRIPTOR', `model ${provider.id}/${model.id} duration must use positive safe integer min/max with max >= min`)
    }
    if (duration.stepMs !== undefined
      && (!Number.isSafeInteger(duration.stepMs) || duration.stepMs <= 0)) {
      throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_DESCRIPTOR', `model ${provider.id}/${model.id} duration.stepMs must be a positive safe integer`)
    }
  }
  if (!Number.isSafeInteger(model.capabilities.maxReferenceImages)
    || model.capabilities.maxReferenceImages < 0) {
    throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_DESCRIPTOR', `model ${provider.id}/${model.id} maxReferenceImages must be a non-negative safe integer`)
  }

  let aspectRatios: MediaModelDescriptor['capabilities']['aspectRatios'] = 'any'
  if (model.capabilities.aspectRatios !== 'any') {
    const normalized = model.capabilities.aspectRatios.map(normalizeMediaAspectRatio)
    if (normalized.length === 0 || new Set(normalized).size !== normalized.length) {
      throw new MediaModelResolutionError('MEDIA_MODEL_INVALID_DESCRIPTOR', `model ${provider.id}/${model.id} aspectRatios must be non-empty and unique after normalization`)
    }
    aspectRatios = Object.freeze(normalized)
  }

  return Object.freeze({
    ...model,
    capabilities: Object.freeze({
      ...model.capabilities,
      operations: Object.freeze([...model.capabilities.operations]),
      aspectRatios,
      dimensions: Object.freeze({
        width: model.capabilities.dimensions.width === null
          ? null
          : Object.freeze({ ...model.capabilities.dimensions.width }),
        height: model.capabilities.dimensions.height === null
          ? null
          : Object.freeze({ ...model.capabilities.dimensions.height }),
      }),
      duration: Object.freeze({ ...model.capabilities.duration }),
    }),
  })
}

/** Process-local model catalog. Provider plugins register one Provider and its model descriptors atomically. */
export class MediaModelRegistry extends Service {
  private readonly providers = new Map<string, MediaProviderDescriptor>()
  private readonly models = new Map<string, MediaModelDescriptor>()
  private readonly executionIdentities = new Map<string, string>()
  private readonly listeners = new Set<(change: MediaModelRegistryChange) => void>()
  private revision = 0

  /** Mount the Registry as `ctx.mediaModels`. */
  constructor(ctx: Context) {
    super(ctx, 'mediaModels')
  }

  /**
   * Register a Provider and all descriptors owned by the same plugin fiber.
   * Candidate validation is atomic: a bad/duplicate model commits nothing.
   */
  register(provider: MediaProviderDescriptor, models: readonly MediaModelDescriptor[]): () => void {
    assertMediaProviderDescriptor(provider)
    const stableProvider = Object.freeze({ ...provider })
    const stableModels = models.map(model => normalizeMediaModelDescriptor(stableProvider, model))
    const localModelKeys = new Set<string>()
    const localExecutionKeys = new Set<string>()
    for (const model of stableModels) {
      const key = modelKey({ providerId: model.providerId, modelId: model.id })
      if (localModelKeys.has(key)) {
        throw new MediaModelResolutionError('MEDIA_MODEL_DUPLICATE_MODEL', `registration contains duplicate media model ${model.providerId}/${model.id}`)
      }
      if (localExecutionKeys.has(model.executionIdentityKey)) {
        throw new MediaModelResolutionError('MEDIA_MODEL_DUPLICATE_EXECUTION_IDENTITY', `registration contains duplicate execution identity ${JSON.stringify(model.executionIdentityKey)}`)
      }
      localModelKeys.add(key)
      localExecutionKeys.add(model.executionIdentityKey)
    }

    const disposeEffect = this.ctx.effect(() => {
      if (this.providers.has(stableProvider.id)) {
        throw new MediaModelResolutionError('MEDIA_MODEL_DUPLICATE_PROVIDER', `media Provider ${stableProvider.id} is already registered`)
      }
      for (const model of stableModels) {
        const key = modelKey({ providerId: model.providerId, modelId: model.id })
        if (this.models.has(key)) {
          throw new MediaModelResolutionError('MEDIA_MODEL_DUPLICATE_MODEL', `media model ${model.providerId}/${model.id} is already registered`)
        }
        if (this.executionIdentities.has(model.executionIdentityKey)) {
          throw new MediaModelResolutionError('MEDIA_MODEL_DUPLICATE_EXECUTION_IDENTITY', `execution identity ${JSON.stringify(model.executionIdentityKey)} is already registered`)
        }
      }

      this.providers.set(stableProvider.id, stableProvider)
      for (const model of stableModels) {
        const key = modelKey({ providerId: model.providerId, modelId: model.id })
        this.models.set(key, model)
        this.executionIdentities.set(model.executionIdentityKey, key)
      }
      this.revision += 1
      this.emit({
        kind: 'registered',
        revision: this.revision,
        provider: stableProvider,
        models: Object.freeze([...stableModels]),
      })

      return () => {
        if (this.providers.get(stableProvider.id) !== stableProvider) return
        this.providers.delete(stableProvider.id)
        for (const model of stableModels) {
          const key = modelKey({ providerId: model.providerId, modelId: model.id })
          if (this.models.get(key) === model) this.models.delete(key)
          if (this.executionIdentities.get(model.executionIdentityKey) === key) {
            this.executionIdentities.delete(model.executionIdentityKey)
          }
        }
        this.revision += 1
        this.emit({
          kind: 'unregistered',
          revision: this.revision,
          provider: stableProvider,
          models: Object.freeze([...stableModels]),
        })
      }
    }, `mediaModels.register(${JSON.stringify(stableProvider.id)})`)
    return () => { void disposeEffect() }
  }

  /** Resolve one Provider descriptor. */
  getProvider(providerId: MediaProviderDescriptor['id']): MediaProviderDescriptor | undefined {
    return this.providers.get(providerId)
  }

  /** Resolve one exact Provider/model descriptor. */
  getModel(ref: MediaModelRef): MediaModelDescriptor | undefined {
    return this.models.get(modelKey(ref))
  }

  /** List Providers in stable id order. */
  listProviders(): readonly MediaProviderDescriptor[] {
    return Object.freeze([...this.providers.values()].sort((left, right) => left.id.localeCompare(right.id)))
  }

  /** List models in stable Provider/model id order. */
  listModels(): readonly MediaModelDescriptor[] {
    return Object.freeze([...this.models.values()].sort((left, right) =>
      left.providerId.localeCompare(right.providerId) || left.id.localeCompare(right.id)))
  }

  /** Return one atomic process-local catalog snapshot. */
  snapshot(): MediaModelRegistrySnapshot {
    return Object.freeze({
      revision: this.revision,
      providers: this.listProviders(),
      models: this.listModels(),
    })
  }

  /** Resolve one strict/auto/fallback request against the current catalog snapshot. */
  resolve(request: MediaModelResolutionRequest): MediaModelResolution {
    return resolveMediaModel(this.snapshot(), request)
  }

  /** Subscribe on the caller plugin's effect lifetime. */
  onChange(listener: (change: MediaModelRegistryChange) => void): () => void {
    const disposeEffect = this.ctx.effect(() => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    }, 'mediaModels.onChange()')
    return () => { void disposeEffect() }
  }

  /** Notify observers after commit; observer failure is diagnostic and never vetoes catalog state. */
  private emit(change: MediaModelRegistryChange): void {
    for (const listener of this.listeners) {
      try {
        listener(change)
      } catch (error) {
        this.ctx.logger.warn('mediaModels: a registry change listener failed')
        this.ctx.logger.warn(error)
      }
    }
  }
}

export default MediaModelRegistry
