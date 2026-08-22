/** Fault-injectable Mock Media Provider for ProviderExecutor and full-DAG tests. */

import type { Context } from '@deepseek-ai/cordis'
import {
  MediaModelId,
  MediaProviderId,
  type MediaModelDescriptor,
  type MediaProviderDescriptor,
} from '@deepseek-ai/dsh-media-provider'
import {
  MediaProviderError,
  type MediaProvider,
  type MediaProviderCompletion,
  type MediaProviderOperationHandle,
  type MediaProviderRequest,
  type MediaProviderResumeResult,
  type MediaProviderStartResult,
} from '@deepseek-ai/dsh-media-provider/runtime'

/** Stable Mock Provider/catalog identities used by integration fixtures. */
export const MOCK_MEDIA_PROVIDER_ID = MediaProviderId('mock-media')
export const MOCK_MEDIA_MODEL_ID = MediaModelId('mock-universal-v1')

export const MOCK_MEDIA_PROVIDER_DESCRIPTOR: MediaProviderDescriptor = Object.freeze({
  id: MOCK_MEDIA_PROVIDER_ID,
  displayName: 'Mock Media Provider',
  enabled: true,
})

export const MOCK_MEDIA_MODEL_DESCRIPTOR: MediaModelDescriptor = Object.freeze({
  providerId: MOCK_MEDIA_PROVIDER_ID,
  id: MOCK_MEDIA_MODEL_ID,
  displayName: 'Mock Universal Media v1',
  enabled: true,
  executionIdentityKey: 'mock-media/mock-universal-v1@1',
  capabilities: Object.freeze({
    operations: Object.freeze(['text-to-image', 'image-edit', 'text-to-video', 'image-to-video']),
    aspectRatios: 'any',
    dimensions: Object.freeze({ width: null, height: null }),
    duration: Object.freeze({ supported: true, minMs: 1000, maxMs: 60000, stepMs: 1000 }),
    maxReferenceImages: 8,
    supportsMask: true,
    supportsSeed: true,
    supportsAudio: true,
  }),
})

export type MockMediaFailure = 'rate-limit' | 'server-error' | 'rejected' | 'timeout'

/** One deterministic behavior consumed by the next Mock start call. */
export interface MockMediaProviderScenario {
  readonly mode?: 'inline' | 'polling' | 'callback'
  readonly pendingResumes?: number
  readonly retryAfterMs?: number
  readonly delayMs?: number
  readonly failure?: MockMediaFailure
  readonly failureAt?: 'start' | 'resume'
}

interface MockTask {
  readonly handle: MediaProviderOperationHandle
  readonly completion: MediaProviderCompletion
  readonly scenario: MockMediaProviderScenario
  pendingResumes: number
  failedOnResume: boolean
  cancelled: boolean
}

const encoder = new TextEncoder()

function abortError(): MediaProviderError {
  return new MediaProviderError(
    'MEDIA_PROVIDER_ABORTED',
    `Mock Media Provider operation was aborted`,
    { providerId: MOCK_MEDIA_PROVIDER_ID },
  )
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return signal?.aborted === true ? Promise.reject(abortError()) : Promise.resolve()
  if (signal?.aborted === true) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function failScenario(scenario: MockMediaProviderScenario): never {
  switch (scenario.failure) {
    case 'rate-limit':
      // Deliberately throw SDK-shaped metadata instead of MediaProviderError so N14 normalization is exercised.
      throw { status: 429, retryAfterMs: scenario.retryAfterMs ?? 1000, rawResponse: 'mock-secret-provider-body' }
    case 'server-error':
      throw { status: 503, rawResponse: 'mock-secret-provider-body' }
    case 'rejected':
      throw new MediaProviderError(
        'MEDIA_PROVIDER_REJECTED',
        'Mock Media Provider rejected the semantic request',
        { providerId: MOCK_MEDIA_PROVIDER_ID },
      )
    case 'timeout':
      throw new MediaProviderError(
        'MEDIA_PROVIDER_TIMEOUT',
        'Mock Media Provider timed out',
        { providerId: MOCK_MEDIA_PROVIDER_ID },
      )
    default:
      throw new MediaProviderError(
        'MEDIA_PROVIDER_FAILURE',
        'Mock Media Provider was configured with an unknown failure',
        { providerId: MOCK_MEDIA_PROVIDER_ID },
      )
  }
}

function outputKind(request: MediaProviderRequest): 'image' | 'video' {
  return request.capability === 'text-to-image' || request.capability === 'image-edit' ? 'image' : 'video'
}

function outputCount(request: MediaProviderRequest): number {
  return request.capability === 'text-to-image' ? request.count : 1
}

function completionFor(request: MediaProviderRequest, sequence: number): MediaProviderCompletion {
  const kind = outputKind(request)
  const outputs = Array.from({ length: outputCount(request) }, (_, index) => {
    const payload = JSON.stringify({
      provider: request.providerId,
      model: request.modelId,
      capability: request.capability,
      nodeType: request.nodeType,
      sequence,
      index,
    })
    return Object.freeze({
      kind,
      mediaType: kind === 'image' ? 'image/png' : 'video/mp4',
      data: encoder.encode(payload),
      providerOutputId: `mock-output-${sequence}-${index}`,
    })
  })
  return Object.freeze({
    outputs: Object.freeze(outputs),
    providerRequestId: `mock-request-${sequence}`,
  })
}

/**
 * In-memory Provider with queued behavior. It stores no credentials and emits no Provider URL/raw response.
 * Async tasks retain completion state so duplicate resume/completion delivery is idempotent.
 */
export class MockMediaProvider implements MediaProvider {
  private readonly scenarios: MockMediaProviderScenario[] = []
  private readonly tasks = new Map<string, MockTask>()
  private sequence = 0
  private cancelCalls = 0

  /** Queue behavior for subsequent `start()` calls. No scenario means inline success. */
  enqueue(...scenarios: readonly MockMediaProviderScenario[]): void {
    this.scenarios.push(...scenarios)
  }

  /** Number of Provider cancel calls observed by this instance. */
  get cancellationCount(): number {
    return this.cancelCalls
  }

  async start(request: MediaProviderRequest, signal?: AbortSignal): Promise<MediaProviderStartResult> {
    const scenario = this.scenarios.shift() ?? {}
    await wait(scenario.delayMs ?? 0, signal)
    if (scenario.failure !== undefined && (scenario.failureAt ?? 'start') === 'start') failScenario(scenario)

    this.sequence += 1
    const completion = completionFor(request, this.sequence)
    const mode = scenario.mode ?? 'inline'
    if (mode === 'inline') return Object.freeze({ mode: 'inline', completion })

    const providerTaskId = `mock-task-${this.sequence}`
    const handle: MediaProviderOperationHandle = Object.freeze({
      providerId: MOCK_MEDIA_PROVIDER_ID,
      mode,
      providerTaskId,
    })
    this.tasks.set(providerTaskId, {
      handle,
      completion,
      scenario,
      pendingResumes: scenario.pendingResumes ?? 0,
      failedOnResume: false,
      cancelled: false,
    })
    return Object.freeze({ mode, providerTaskId })
  }

  async resume(handle: MediaProviderOperationHandle, signal?: AbortSignal): Promise<MediaProviderResumeResult> {
    if (signal?.aborted === true) throw abortError()
    const task = this.tasks.get(handle.providerTaskId)
    if (task === undefined || task.handle.providerId !== handle.providerId || task.handle.mode !== handle.mode) {
      throw new MediaProviderError(
        'MEDIA_PROVIDER_INVALID_OPERATION',
        'Mock Media Provider received an unknown operation handle',
        { providerId: MOCK_MEDIA_PROVIDER_ID },
      )
    }
    await wait(task.scenario.delayMs ?? 0, signal)
    if (task.cancelled) throw abortError()
    if (task.scenario.failure !== undefined
      && task.scenario.failureAt === 'resume'
      && !task.failedOnResume) {
      task.failedOnResume = true
      failScenario(task.scenario)
    }
    if (task.pendingResumes > 0) {
      task.pendingResumes -= 1
      return Object.freeze({
        status: 'pending',
        retryAfterMs: task.scenario.retryAfterMs ?? 1,
      })
    }
    // Returning the same immutable completion on every later resume makes duplicate completion delivery idempotent.
    return Object.freeze({ status: 'completed', completion: task.completion })
  }

  cancel(handle: MediaProviderOperationHandle): void {
    const task = this.tasks.get(handle.providerTaskId)
    if (task === undefined) return
    task.cancelled = true
    this.cancelCalls += 1
  }
}

/** Cordis function-plugin name. */
export const name = 'media-provider-mock'
/** Mock registers catalog metadata first, then the runtime adapter, on one owning fiber. */
export const inject = ['mediaModels', 'mediaProviders']

/** Register the default successful Mock Provider and universal model. */
export function apply(ctx: Context): void {
  const provider = new MockMediaProvider()
  ctx.mediaModels.register(MOCK_MEDIA_PROVIDER_DESCRIPTOR, [MOCK_MEDIA_MODEL_DESCRIPTOR])
  ctx.mediaProviders.register(MOCK_MEDIA_PROVIDER_ID, provider)
}
