/**
 * Pure Canvas domain vocabulary shared by Host, future Remote contracts, Agent tools, and UI adapters.
 * Runtime construction and validation live in `./domain.ts`; durable decode/migration lives in `./migration.ts`.
 *
 * @module @deepseek-ai/dsh-canvas/types
 */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { Branded } from '@deepseek-ai/dsh-brand'

export type CanvasId = Branded<'CanvasId'>
export type MediaWorkflowId = Branded<'MediaWorkflowId'>
export type WorkflowNodeId = Branded<'WorkflowNodeId'>
export type WorkflowEdgeId = Branded<'WorkflowEdgeId'>
export type CanvasRunId = Branded<'CanvasRunId'>
export type CanvasVariantId = Branded<'CanvasVariantId'>
export type VideoAssetId = Branded<'VideoAssetId'>

export type CanvasJsonPrimitive = null | boolean | number | string
export type CanvasJsonValue = CanvasJsonPrimitive | readonly CanvasJsonValue[] | { readonly [key: string]: CanvasJsonValue }
export type MediaPortType = 'text' | 'image' | 'video' | 'image-list' | 'video-list' | 'mask'

export interface MediaWorkflowNodeTypeMap {
  'asset.input': true
  'prompt': true
  'image.generate': true
  'image.edit': true
  'video.generate': true
  'video.image-to-video': true
  'output': true
}

export type KnownMediaWorkflowNodeType = keyof MediaWorkflowNodeTypeMap
export type MediaWorkflowNodeType = string

export interface MediaWorkflowNode {
  readonly id: WorkflowNodeId
  readonly type: MediaWorkflowNodeType
  readonly nodeVersion?: number
  readonly name?: string
  readonly config: Readonly<Record<string, CanvasJsonValue>>
}

export interface MediaWorkflowEdge {
  readonly id: WorkflowEdgeId
  readonly sourceNodeId: WorkflowNodeId
  readonly sourcePort: string
  readonly targetNodeId: WorkflowNodeId
  readonly targetPort: string
}

export interface MediaWorkflow {
  readonly id: MediaWorkflowId
  readonly schemaVersion: number
  readonly name: string
  readonly nodes: readonly MediaWorkflowNode[]
  readonly edges: readonly MediaWorkflowEdge[]
  readonly outputNodeIds: readonly WorkflowNodeId[]
}

/**
 * Persisted editor layout independent from semantic workflow revisioning.
 * `canvasId`/`layoutRevision` are optional only for historical N05-v1 rows;
 * every current writer emits {@link CurrentCanvasLayoutSnapshot} and replay
 * normalizes legacy rows before exposing the current Projection.
 */
export interface CanvasLayoutSnapshot {
  readonly schemaVersion: number
  readonly workflowId: MediaWorkflowId
  readonly nodePositions: Readonly<Record<WorkflowNodeId, { readonly x: number; readonly y: number }>>
  readonly viewport?: {
    readonly x: number
    readonly y: number
    readonly zoom: number
  }
  readonly updatedAt: number
  readonly canvasId?: CanvasId
  readonly layoutRevision?: number
}

/** Current-generation layout identity used by Browser Projection and CAS writes. */
export interface CurrentCanvasLayoutSnapshot extends CanvasLayoutSnapshot {
  readonly canvasId: CanvasId
  readonly layoutRevision: number
}

export interface VideoAssetRef {
  readonly assetId: VideoAssetId
  readonly mediaType: string
  readonly bytes: number
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
}

export interface CanvasImageAssetRef {
  readonly kind: 'image'
  readonly image: Readonly<ImageAttachmentRef>
}

export interface CanvasVideoAssetRef {
  readonly kind: 'video'
  readonly video: VideoAssetRef
}

export type CanvasAssetRef = CanvasImageAssetRef | CanvasVideoAssetRef
export type CanvasErrorCategory = 'validation' | 'conflict' | 'permission' | 'provider' | 'infrastructure' | 'interrupted' | 'quota'

export type CanvasErrorCode =
  | 'CANVAS_INVALID_ID'
  | 'CANVAS_INVALID_REVISION'
  | 'CANVAS_INVALID_TIMESTAMP'
  | 'CANVAS_INVALID_JSON_VALUE'
  | 'CANVAS_INVALID_WORKFLOW'
  | 'CANVAS_INVALID_ASSET'
  | 'CANVAS_INVALID_RUN'
  | 'CANVAS_INVALID_OUTPUT'

export type CanvasServiceErrorCode =
  | 'CANVAS_AGENT_NOT_LIVE'
  | 'CANVAS_NOT_FOUND'
  | 'CANVAS_ALREADY_EXISTS'
  | 'CANVAS_STALE_WORKFLOW_REVISION'
  | 'CANVAS_WORKFLOW_ID_MISMATCH'
  | 'CANVAS_INVALID_EDIT'
  | 'CANVAS_OUTPUT_NOT_FOUND'
  | 'CANVAS_INVALID_OUTPUT_SELECTION'
  | 'CANVAS_PERMISSION_DENIED'
  | 'CANVAS_AUTHORIZATION_FAILED'
  | 'CANVAS_INVALID_ACCESS_CONTEXT'
  | 'CANVAS_SENSITIVE_DATA'

export interface CanvasRunError {
  readonly category: CanvasErrorCategory
  readonly code: string
  readonly message: string
}

export type CanvasRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'

export interface CanvasRunSnapshot {
  readonly id: CanvasRunId
  readonly status: CanvasRunStatus
  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number
  readonly activeNodeId?: WorkflowNodeId
  readonly startedAt: number
  readonly finishedAt?: number
  readonly error?: CanvasRunError
}

export interface CanvasRunHistoryEntry {
  readonly runId: CanvasRunId
  readonly variantId?: CanvasVariantId
  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number
  readonly status: CanvasRunStatus
  readonly outputs: readonly CanvasAssetRef[]
  readonly startedAt: number
  readonly finishedAt?: number
  readonly promptSummary?: string
}

export interface CanvasOutput {
  readonly runId: CanvasRunId
  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number
  readonly assets: readonly CanvasAssetRef[]
  readonly primaryAssetIndex: number
}

export interface CanvasSnapshot {
  readonly schemaVersion: number
  readonly id: CanvasId
  readonly workflowRevision: number
  readonly runRevision: number
  readonly workflow: MediaWorkflow | null
  readonly currentVariantId?: CanvasVariantId
  readonly run: CanvasRunSnapshot | null
  readonly output: CanvasOutput | null
  readonly createdAt: number
  readonly updatedAt: number
}

export type CanvasChangeVersion = 1

export type CanvasMigrationErrorCode =
  | 'CANVAS_MIGRATION_INVALID_VALUE'
  | 'CANVAS_UNSUPPORTED_SCHEMA_VERSION'
  | 'CANVAS_UNSUPPORTED_FUTURE_SCHEMA'
  | 'CANVAS_UNSUPPORTED_NODE_VERSION'
  | 'CANVAS_UNSUPPORTED_FUTURE_NODE_VERSION'

export interface CanvasMigrationNotice {
  readonly code: 'CANVAS_DEPRECATED_NODE'
  readonly lifecycle: 'deprecated'
  readonly nodeId: WorkflowNodeId
  readonly fromType: string
  readonly toType: MediaWorkflowNodeType
}

export interface CanvasMigrationResult<T> {
  readonly value: T
  readonly notices: readonly CanvasMigrationNotice[]
}

export type CanvasPermission =
  | 'canvas.read'
  | 'canvas.edit'
  | 'canvas.run'
  | 'canvas.cancel'
  | 'canvas.history.read'
  | 'canvas.asset.read'
  | 'canvas.asset.export'
  | 'canvas.asset.delete'
  | 'canvas.workflow.restore'
  | 'canvas.variant.create'
  | 'canvas.layout.write'

export type CanvasActorKind = 'human' | 'agent' | 'system'
export type CanvasActor =
  | { readonly kind: 'human'; readonly id: string }
  | { readonly kind: 'agent'; readonly id: string }
  | { readonly kind: 'system'; readonly id: string }

export type CanvasRequestSource = 'host' | 'browser-remote' | 'agent-tool' | 'system-reconciler' | 'asset-route'

export interface CanvasAccessContext {
  readonly actor: CanvasActor
  readonly source: CanvasRequestSource
  readonly requestId?: string
  readonly correlationId?: string
}

export type CanvasAuthorizationResource =
  | { readonly kind: 'session' }
  | { readonly kind: 'canvas'; readonly canvasId: CanvasId }
  | { readonly kind: 'workflow'; readonly canvasId: CanvasId; readonly workflowId: MediaWorkflowId }
  | { readonly kind: 'run'; readonly canvasId: CanvasId; readonly runId: CanvasRunId }
  | { readonly kind: 'asset'; readonly canvasId: CanvasId; readonly assetId: string }
  | { readonly kind: 'variant'; readonly canvasId: CanvasId; readonly variantId: CanvasVariantId }
  | { readonly kind: 'layout'; readonly canvasId: CanvasId; readonly workflowId: MediaWorkflowId }

export interface CanvasAuthorizationRequest extends CanvasAccessContext {
  readonly permission: CanvasPermission
  readonly sessionId: string
  readonly resource: CanvasAuthorizationResource
}

export type CanvasAuthorizationDecision =
  | { readonly allowed: true }
  | {
    readonly allowed: false
    readonly reason: 'denied' | 'policy-unavailable'
    readonly policyCode?: string
  }

export interface CanvasAuthorizationConfig {
  readonly defaultActors?: readonly CanvasActorKind[]
  readonly permissions?: Partial<Record<CanvasPermission, readonly CanvasActorKind[]>>
}

export type CanvasAuthorizationMode = 'single-user-fallback' | 'required-external'

export interface CanvasServiceConfig {
  readonly authorization?: CanvasAuthorizationConfig
  readonly authorizationMode?: CanvasAuthorizationMode
}

export interface WorkflowRef {
  readonly canvasId: CanvasId
  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number
}

export type WorkflowEditOperation =
  | { readonly op: 'add-node'; readonly node: MediaWorkflowNode }
  | { readonly op: 'remove-node'; readonly nodeId: WorkflowNodeId }
  | {
    readonly op: 'replace-node-config'
    readonly nodeId: WorkflowNodeId
    readonly config: Readonly<Record<string, CanvasJsonValue>>
  }
  | { readonly op: 'rename-node'; readonly nodeId: WorkflowNodeId; readonly name: string }
  | { readonly op: 'connect'; readonly edge: MediaWorkflowEdge }
  | { readonly op: 'disconnect'; readonly edgeId: WorkflowEdgeId }
  | { readonly op: 'set-output-nodes'; readonly nodeIds: readonly WorkflowNodeId[] }
  | { readonly op: 'rename-workflow'; readonly name: string }

export interface CreateCanvasRequest {
  readonly workflow: MediaWorkflow
  readonly currentVariantId?: CanvasVariantId
}

export interface SelectCanvasOutputRequest {
  readonly runId: CanvasRunId
  readonly assetIndex: number
}

export interface CreateCanvasSnapshotInput {
  readonly id: CanvasId
  readonly createdAt: number
  readonly workflow?: MediaWorkflow | null
  readonly currentVariantId?: CanvasVariantId
}

export interface CreateMediaWorkflowInput {
  readonly id: MediaWorkflowId
  readonly name: string
  readonly nodes?: readonly MediaWorkflowNode[]
  readonly edges?: readonly MediaWorkflowEdge[]
  readonly outputNodeIds?: readonly WorkflowNodeId[]
}

export type CanvasProductState = 'EMPTY' | 'READY' | 'DIRTY_READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED'
