/** Effect-scoped Provider runtime routing and normalized operation lifecycle. */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { MediaProviderId } from './types.ts'
import type {
  MediaProvider,
  MediaProviderCompletion,
  MediaProviderErrorCode,
  MediaProviderMediaOutput,
  MediaProviderOperationHandle,
  MediaProviderRequest,
  MediaProviderResumeResult,
  MediaProviderRunResult,
  MediaProviderRuntimeChange,
  MediaProviderStartResult,
} from './runtime-types.ts'
import type {} from './model-registry.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mediaProviders: MediaProviderRuntimeRegistry
  }
}

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~=-]*$/
const MAX_PROVIDER_ID_LENGTH = 256
const MAX_OPAQUE_ID_LENGTH = 512
const MAX_MEDIA_TYPE_LENGTH = 128

/** Safe Provider runtime error metadata. `cause` stays process-local and is never a Provider payload contract. */
export interface MediaProviderErrorOptions extends ErrorOptions {
  readonly providerId?: MediaProviderId
  readonly status?: number
  readonly retryAfterMs?: number
}

/** Provider-neutral runtime failure used by adapters, routing, and ProviderExecutor. */
export class MediaProviderError extends Error {
  override readonly name = 'MediaProviderError'
  readonly code: MediaProviderErrorCode
  readonly providerId?: MediaProviderId
  readonly status?: number
  readonly retryAfterMs?: number

  constructor(code: MediaProviderErrorCode, message: string, options: MediaProviderErrorOptions = {}) {
    super(message, options)
    this.code = code
    if (options.providerId !== undefined) this.providerId = options.providerId
    if (options.status !== undefined) this.status = options.status
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs
  }
}

function validStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined
}

function validRetryAfter(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/** Normalize an arbitrary adapter/SDK error without copying Provider response text or secrets into the public message. */
export function normalizeMediaProviderError(error: unknown, providerId: MediaProviderId): MediaProviderError {
  if (error instanceof MediaProviderError) return error
  const record = error !== null && typeof error === 'object' ? error as Record<string, unknown> : undefined
  const status = validStatus(record?.status)
  const retryAfterMs = validRetryAfter(record?.retryAfterMs)
  if (status === 429) {
    return new MediaProviderError(
      'MEDIA_PROVIDER_RATE_LIMIT',
      `Media Provider ${providerId} rate limited the operation`,
      { providerId, status, ...(retryAfterMs === undefined ? {} : { retryAfterMs }), cause: error },
    )
  }
  if (status !== undefined && status >= 500) {
    return new MediaProviderError(
      'MEDIA_PROVIDER_SERVER_ERROR',
      `Media Provider ${providerId} failed with a server error`,
      { providerId, status, ...(retryAfterMs === undefined ? {} : { retryAfterMs }), cause: error },
    )
  }
  return new MediaProviderError(
    'MEDIA_PROVIDER_FAILURE',
    `Media Provider ${providerId} operation failed`,
    { providerId, ...(status === undefined ? {} : { status }), ...(retryAfterMs === undefined ? {} : { retryAfterMs }), cause: error },
  )
}

function assertProviderId(providerId: MediaProviderId): void {
  if (providerId.length < 1 || providerId.length > MAX_PROVIDER_ID_LENGTH || !PROVIDER_ID_PATTERN.test(providerId)) {
    throw new MediaProviderError(
      'MEDIA_PROVIDER_INVALID_REGISTRATION',
      `Media Provider id must be 1-${MAX_PROVIDER_ID_LENGTH} safe identifier characters`,
      { providerId },
    )
  }
}

function assertOpaqueId(value: string, label: string, providerId: MediaProviderId): void {
  if (value.length < 1 || value.length > MAX_OPAQUE_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new MediaProviderError(
      'MEDIA_PROVIDER_INVALID_OPERATION',
      `${label} must be non-empty, control-free, and at most ${MAX_OPAQUE_ID_LENGTH} characters`,
      { providerId },
    )
  }
}

function snapshotOutput(output: MediaProviderMediaOutput, providerId: MediaProviderId): MediaProviderMediaOutput {
  if ((output.kind !== 'image' && output.kind !== 'video')
    || typeof output.mediaType !== 'string'
    || output.mediaType.length < 1
    || output.mediaType.length > MAX_MEDIA_TYPE_LENGTH
    || /[\u0000-\u001f\u007f]/.test(output.mediaType)
    || !(output.data instanceof Uint8Array)
    || output.data.byteLength === 0) {
    throw new MediaProviderError(
      'MEDIA_PROVIDER_INVALID_RESULT',
      `Media Provider ${providerId} returned invalid media output metadata or bytes`,
      { providerId },
    )
  }
  if (output.providerOutputId !== undefined) {
    assertOpaqueId(output.providerOutputId, 'providerOutputId', providerId)
  }
  return Object.freeze({
    kind: output.kind,
    mediaType: output.mediaType,
    data: new Uint8Array(output.data),
    ...(output.providerOutputId === undefined ? {} : { providerOutputId: output.providerOutputId }),
  })
}

function snapshotCompletion(completion: MediaProviderCompletion, providerId: MediaProviderId): MediaProviderCompletion {
  if (!Array.isArray(completion.outputs) || completion.outputs.length === 0) {
    throw new MediaProviderError(
      'MEDIA_PROVIDER_INVALID_RESULT',
      `Media Provider ${providerId} returned no media outputs`,
      { providerId },
    )
  }
  if (completion.providerRequestId !== undefined) {
    assertOpaqueId(completion.providerRequestId, 'providerRequestId', providerId)
  }
  return Object.freeze({
    outputs: Object.freeze(completion.outputs.map(output => snapshotOutput(output, providerId))),
    ...(completion.providerRequestId === undefined ? {} : { providerRequestId: completion.providerRequestId }),
  })
}

function snapshotStart(result: MediaProviderStartResult, providerId: MediaProviderId): MediaProviderStartResult {
  if (result.mode === 'inline') {
    return Object.freeze({ mode: 'inline', completion: snapshotCompletion(result.completion, providerId) })
  }
  if (result.mode !== 'polling' && result.mode !== 'callback') {
    throw new MediaProviderError('MEDIA_PROVIDER_INVALID_OPERATION', `Media Provider ${providerId} returned an invalid operation mode`, { providerId })
  }
  assertOpaqueId(result.providerTaskId, 'providerTaskId', providerId)
  return Object.freeze({ mode: result.mode, providerTaskId: result.providerTaskId })
}

function snapshotResume(result: MediaProviderResumeResult, providerId: MediaProviderId): MediaProviderResumeResult {
  if (result.status === 'completed') {
    return Object.freeze({ status: 'completed', completion: snapshotCompletion(result.completion, providerId) })
  }
  if (result.status !== 'pending' || !Number.isFinite(result.retryAfterMs) || result.retryAfterMs <= 0) {
    throw new MediaProviderError(
      'MEDIA_PROVIDER_INVALID_OPERATION',
      `Media Provider ${providerId} returned an invalid pending operation update`,
      { providerId },
    )
  }
  return Object.freeze({ status: 'pending', retryAfterMs: result.retryAfterMs })
}

function aborted(providerId: MediaProviderId): MediaProviderError {
  return new MediaProviderError('MEDIA_PROVIDER_ABORTED', `Media Provider ${providerId} operation was aborted`, { providerId })
}

function throwIfAborted(signal: AbortSignal | undefined, providerId: MediaProviderId): void {
  if (signal?.aborted === true) throw aborted(providerId)
}

async function adapterCall<T>(
  providerId: MediaProviderId,
  signal: AbortSignal | undefined,
  call: () => Promise<T> | T,
): Promise<T> {
  throwIfAborted(signal, providerId)
  try {
    const value = await call()
    throwIfAborted(signal, providerId)
    return value
  } catch (error) {
    if (signal?.aborted === true) throw aborted(providerId)
    throw normalizeMediaProviderError(error, providerId)
  }
}

function wait(ms: number, signal: AbortSignal | undefined, providerId: MediaProviderId): Promise<void> {
  if (signal?.aborted === true) return Promise.reject(aborted(providerId))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(aborted(providerId))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Exact Provider-id runtime registry. N13 chooses the model; this registry only routes the resolved Provider. */
export class MediaProviderRuntimeRegistry extends Service {
  static inject = ['mediaModels']

  private readonly providers = new Map<MediaProviderId, MediaProvider>()
  private readonly listeners = new Set<(change: MediaProviderRuntimeChange) => void>()

  constructor(ctx: Context) {
    super(ctx, 'mediaProviders')
  }

  /** Register one runtime adapter on the caller fiber after its N13 Provider descriptor exists. */
  register(providerId: MediaProviderId, provider: MediaProvider): () => void {
    assertProviderId(providerId)
    if (this.ctx.mediaModels.getProvider(providerId) === undefined) {
      throw new MediaProviderError(
        'MEDIA_PROVIDER_INVALID_REGISTRATION',
        `Media Provider ${providerId} must exist in the model catalog before its runtime adapter is registered`,
        { providerId },
      )
    }
    const disposeEffect = this.ctx.effect(() => {
      if (this.providers.has(providerId)) {
        throw new MediaProviderError(
          'MEDIA_PROVIDER_DUPLICATE',
          `Media Provider ${providerId} already has a runtime adapter`,
          { providerId },
        )
      }
      this.providers.set(providerId, provider)
      this.emit(Object.freeze({ kind: 'registered', providerId }))
      return () => {
        if (this.providers.get(providerId) !== provider) return
        this.providers.delete(providerId)
        this.emit(Object.freeze({ kind: 'unregistered', providerId }))
      }
    }, `mediaProviders.register(${JSON.stringify(providerId)})`)
    return () => { void disposeEffect() }
  }

  /** Resolve an exact runtime adapter without fallback. */
  get(providerId: MediaProviderId): MediaProvider | undefined {
    return this.providers.get(providerId)
  }

  /** Require an exact runtime adapter selected by N13. */
  require(providerId: MediaProviderId): MediaProvider {
    const provider = this.providers.get(providerId)
    if (provider !== undefined) return provider
    throw new MediaProviderError(
      'MEDIA_PROVIDER_NOT_FOUND',
      `Media Provider ${providerId} has no registered runtime adapter`,
      { providerId },
    )
  }

  /** List currently registered runtime Provider ids in stable order. */
  list(): readonly MediaProviderId[] {
    return Object.freeze([...this.providers.keys()].sort((left, right) => left.localeCompare(right)))
  }

  /** Subscribe on the caller effect lifetime. */
  onChange(listener: (change: MediaProviderRuntimeChange) => void): () => void {
    const disposeEffect = this.ctx.effect(() => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    }, 'mediaProviders.onChange()')
    return () => { void disposeEffect() }
  }

  /** Runtime topology notifications are post-commit and non-vetoing. */
  private emit(change: MediaProviderRuntimeChange): void {
    for (const listener of this.listeners) {
      try {
        listener(change)
      } catch (error) {
        this.ctx.logger.warn('mediaProviders: a runtime registry listener failed')
        this.ctx.logger.warn(error)
      }
    }
  }
}

/** Resume/cancel one async operation until it completes. The handle itself is serializable for N16/N22. */
export async function runMediaProviderOperation(
  provider: MediaProvider,
  request: MediaProviderRequest,
  signal?: AbortSignal,
): Promise<MediaProviderRunResult> {
  const providerId = request.providerId
  const start = snapshotStart(
    await adapterCall(providerId, signal, () => provider.start(request, signal)),
    providerId,
  )
  if (start.mode === 'inline') {
    return Object.freeze({ completion: start.completion, mode: 'inline' })
  }

  const handle: MediaProviderOperationHandle = Object.freeze({
    providerId,
    mode: start.mode,
    providerTaskId: start.providerTaskId,
  })
  let cancelPromise: Promise<void> | undefined
  const requestCancel = () => {
    cancelPromise ??= Promise.resolve(provider.cancel(handle)).catch((): void => {})
  }
  signal?.addEventListener('abort', requestCancel, { once: true })
  try {
    while (true) {
      if (signal?.aborted === true) {
        requestCancel()
        await cancelPromise
        throw aborted(providerId)
      }
      const update = snapshotResume(
        await adapterCall(providerId, signal, () => provider.resume(handle, signal)),
        providerId,
      )
      if (update.status === 'completed') {
        return Object.freeze({
          completion: update.completion,
          mode: handle.mode,
          providerTaskId: handle.providerTaskId,
        })
      }
      await wait(update.retryAfterMs, signal, providerId)
    }
  } catch (error) {
    if (signal?.aborted === true) {
      requestCancel()
      await cancelPromise
    }
    throw error
  } finally {
    signal?.removeEventListener('abort', requestCancel)
  }
}

/** Explicit Provider cancellation seam for N16/N22 reconciliation paths. */
export async function cancelMediaProviderOperation(
  provider: MediaProvider,
  handle: MediaProviderOperationHandle,
  signal?: AbortSignal,
): Promise<void> {
  await adapterCall(handle.providerId, signal, () => provider.cancel(handle, signal))
}

export default MediaProviderRuntimeRegistry
