/** Types-only media workflow node-definition vocabulary. */

import type {
  CanvasFeatureName,
  CanvasJsonValue,
  MediaPortType,
  MediaWorkflowNode,
  MediaWorkflowNodeType,
} from '@deepseek-ai/dsh-canvas/types'
import type { ZodType } from 'zod'

/** Provider/model semantic capability required to execute one node kind. */
export type MediaCapability =
  | 'text-to-image'
  | 'image-to-image'
  | 'image-edit'
  | 'text-to-video'
  | 'image-to-video'
  | 'upscale'

/** Stable input/output port descriptor shared by Validator, Editor, Agent summary, and Executor. */
export interface MediaNodePortDefinition {
  readonly name: string
  readonly type: MediaPortType
  readonly required: boolean
  readonly multiple?: boolean
  readonly description?: string
}

/** Replacement target for a deprecated node definition. */
export interface MediaNodeReplacement {
  readonly type: MediaWorkflowNodeType
  readonly version: number
}

/** Intrinsic node lifecycle; deployment feature state is resolved separately. */
export interface MediaNodeLifecycle {
  readonly deprecated: boolean
  readonly creatable: boolean
  readonly executable: boolean
  readonly replacement?: MediaNodeReplacement
}

/** Execution metadata that is stable across Provider implementations. */
export interface MediaNodeExecutionDefinition {
  readonly capability?: MediaCapability
  /** Optional deployment feature that must be enabled in addition to intrinsic lifecycle. */
  readonly feature?: CanvasFeatureName
  readonly deterministic: boolean
  readonly supportsPartialRun: boolean
}

/** Stable, serializable UI metadata. Never place React components or browser-only callbacks here. */
export interface MediaNodeUiDefinition {
  readonly category: string
  readonly icon: string
  readonly inspectorKind: string
  readonly description?: string
}

/** JSON-object config shape owned by semantic workflow nodes. */
export type MediaNodeConfig = Readonly<Record<string, CanvasJsonValue>>

/** One versioned semantic node definition. */
export interface MediaNodeDefinition {
  readonly type: MediaWorkflowNodeType
  readonly version: number
  readonly displayName: string
  readonly inputs: readonly MediaNodePortDefinition[]
  readonly outputs: readonly MediaNodePortDefinition[]
  readonly configSchema: ZodType<MediaNodeConfig>
  readonly defaultConfig: MediaNodeConfig
  readonly execution: MediaNodeExecutionDefinition
  readonly lifecycle: MediaNodeLifecycle
  readonly ui: MediaNodeUiDefinition
}

/** Stable lookup key used internally and in diagnostics. */
export interface MediaNodeDefinitionRef {
  readonly type: MediaWorkflowNodeType
  readonly version: number
}

/** Registration lifecycle notification. */
export type MediaNodeRegistryChange =
  | { readonly kind: 'registered'; readonly definition: MediaNodeDefinition }
  | { readonly kind: 'unregistered'; readonly definition: MediaNodeDefinition }

/** Stable registry failures. */
export type MediaNodeRegistryErrorCode =
  | 'MEDIA_NODE_INVALID_DEFINITION'
  | 'MEDIA_NODE_DUPLICATE_DEFINITION'
  | 'MEDIA_NODE_UNKNOWN_DEFINITION'
  | 'MEDIA_NODE_NOT_CREATABLE'
  | 'MEDIA_NODE_NOT_EXECUTABLE'
  | 'MEDIA_NODE_INVALID_CONFIG'

/** Node-like value accepted by config/lifecycle helpers. */
export type MediaNodeLike = Pick<MediaWorkflowNode, 'type' | 'nodeVersion' | 'config'>
