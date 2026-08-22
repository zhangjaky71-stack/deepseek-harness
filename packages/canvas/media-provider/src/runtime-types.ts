/** Types-only semantic Provider runtime, operation, and output-materialization contracts. */

import type {
  CanvasImageAssetRef,
  CanvasJsonValue,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/types'
import type {
  MediaNodeExecutionFingerprint,
  MediaNodeExecutionOutput,
  MediaNodeExecutionValue,
} from '@deepseek-ai/dsh-media-workflow/engine'
import type { MediaModelId, MediaProviderId } from './types.ts'

/** Stable Provider runtime failures; messages must stay provider-response/secret free. */
export type MediaProviderErrorCode =
  | 'MEDIA_PROVIDER_INVALID_REGISTRATION'
  | 'MEDIA_PROVIDER_DUPLICATE'
  | 'MEDIA_PROVIDER_NOT_FOUND'
  | 'MEDIA_PROVIDER_EXECUTION_IDENTITY_REQUIRED'
  | 'MEDIA_PROVIDER_MODEL_NOT_FOUND'
  | 'MEDIA_PROVIDER_INVALID_OPERATION'
  | 'MEDIA_PROVIDER_INVALID_RESULT'
  | 'MEDIA_PROVIDER_RATE_LIMIT'
  | 'MEDIA_PROVIDER_SERVER_ERROR'
  | 'MEDIA_PROVIDER_REJECTED'
  | 'MEDIA_PROVIDER_TIMEOUT'
  | 'MEDIA_PROVIDER_ABORTED'
  | 'MEDIA_PROVIDER_FAILURE'

/** Semantic data common to every Provider-backed media request. */
export interface MediaProviderRequestBase {
  readonly providerId: MediaProviderId
  readonly modelId: MediaModelId
  readonly executionIdentityKey: string
  readonly nodeType: string
  readonly nodeVersion: number
  /** Normalized semantic workflow config. It is not a Provider wire payload. */
  readonly config: Readonly<Record<string, CanvasJsonValue>>
}

export interface MediaProviderTextToImageRequest extends MediaProviderRequestBase {
  readonly capability: 'text-to-image'
  readonly prompt: string
  readonly count: number
  readonly references: readonly CanvasImageAssetRef[]
}

export interface MediaProviderImageEditRequest extends MediaProviderRequestBase {
  readonly capability: 'image-edit'
  readonly image: CanvasImageAssetRef
  readonly prompt: string
  readonly mask?: CanvasImageAssetRef
}

export interface MediaProviderTextToVideoRequest extends MediaProviderRequestBase {
  readonly capability: 'text-to-video'
  readonly prompt: string
}

export interface MediaProviderImageToVideoRequest extends MediaProviderRequestBase {
  readonly capability: 'image-to-video'
  readonly image: CanvasImageAssetRef
  readonly prompt?: string
}

/** Provider-neutral request vocabulary used by the built-in ProviderExecutor bindings. */
export type MediaProviderRequest =
  | MediaProviderTextToImageRequest
  | MediaProviderImageEditRequest
  | MediaProviderTextToVideoRequest
  | MediaProviderImageToVideoRequest

/** Host-only Provider output before N17/N21 durable asset materialization. */
export interface MediaProviderMediaOutput {
  readonly kind: 'image' | 'video'
  readonly mediaType: string
  readonly data: Uint8Array
  /** Optional safe opaque Provider output id; never a bearer URL/path. */
  readonly providerOutputId?: string
}

/** One completed Provider operation. Bytes remain Host-local until an output materializer stores them. */
export interface MediaProviderCompletion {
  readonly outputs: readonly MediaProviderMediaOutput[]
  /** Optional safe opaque request id for provenance/diagnostics. */
  readonly providerRequestId?: string
}

export type MediaProviderAsyncMode = 'polling' | 'callback'

/** Serializable async Provider task identity. N16/N22 may retain this for resume/reconciliation. */
export interface MediaProviderOperationHandle {
  readonly providerId: MediaProviderId
  readonly mode: MediaProviderAsyncMode
  readonly providerTaskId: string
}

/** Adapter start result: immediate completion or a resumable async task. */
export type MediaProviderStartResult =
  | { readonly mode: 'inline'; readonly completion: MediaProviderCompletion }
  | { readonly mode: MediaProviderAsyncMode; readonly providerTaskId: string }

/** Adapter resume result. Pending operations must provide a finite positive retry delay. */
export type MediaProviderResumeResult =
  | { readonly status: 'pending'; readonly retryAfterMs: number }
  | { readonly status: 'completed'; readonly completion: MediaProviderCompletion }

/** Provider adapter. Credentials/configuration stay inside the adapter/deployment layer, never in the semantic request. */
export interface MediaProvider {
  start(request: MediaProviderRequest, signal?: AbortSignal): Promise<MediaProviderStartResult> | MediaProviderStartResult
  resume(handle: MediaProviderOperationHandle, signal?: AbortSignal): Promise<MediaProviderResumeResult> | MediaProviderResumeResult
  cancel(handle: MediaProviderOperationHandle, signal?: AbortSignal): Promise<void> | void
}

/** Runtime Provider registration lifecycle fact. */
export type MediaProviderRuntimeChange =
  | { readonly kind: 'registered'; readonly providerId: MediaProviderId }
  | { readonly kind: 'unregistered'; readonly providerId: MediaProviderId }

/** Completed operation plus safe task metadata retained by the generic executor. */
export interface MediaProviderRunResult {
  readonly completion: MediaProviderCompletion
  readonly mode: 'inline' | MediaProviderAsyncMode
  readonly providerTaskId?: string
}

/** Provenance available while converting Provider bytes into a stable N12 asset value. */
export interface MediaProviderMaterializationContext {
  readonly providerId: MediaProviderId
  readonly modelId: MediaModelId
  readonly executionIdentityKey: string
  readonly nodeId: WorkflowNodeId
  readonly fingerprint: MediaNodeExecutionFingerprint
  readonly outputIndex: number
  readonly operationMode: 'inline' | MediaProviderAsyncMode
  readonly providerTaskId?: string
  readonly providerRequestId?: string
}

/** Single stable image/video value produced after the N17/N21 storage boundary. */
export interface MediaProviderMaterializedOutput {
  readonly value: Extract<MediaNodeExecutionValue, { readonly kind: 'image' | 'video' }>
  readonly fingerprint: string
}

/**
 * Byte-to-asset seam. N14 tests use an in-memory implementation; N17/N21 will durably save bytes before returning refs.
 */
export interface MediaProviderOutputMaterializer {
  materialize(
    output: MediaProviderMediaOutput,
    context: MediaProviderMaterializationContext,
  ): Promise<MediaProviderMaterializedOutput> | MediaProviderMaterializedOutput
}

/** Inputs available to one semantic node binding after N13 model identity lookup. */
export interface MediaProviderNodeBindingContext {
  readonly providerId: MediaProviderId
  readonly modelId: MediaModelId
  readonly executionIdentityKey: string
  readonly nodeId: WorkflowNodeId
  readonly nodeType: string
  readonly nodeVersion: number
  readonly config: Readonly<Record<string, CanvasJsonValue>>
  readonly inputs: Readonly<Record<string, readonly MediaNodeExecutionOutput[]>>
  readonly fingerprint: MediaNodeExecutionFingerprint
}
