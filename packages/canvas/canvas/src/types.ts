/**
 * Pure Canvas domain vocabulary shared by Host, future Remote contracts, Agent tools, and UI adapters.
 * Runtime construction and validation live in `./domain.ts`; durable decode/migration lives in `./migration.ts`.
 *
 * @module @deepseek-ai/dsh-canvas/types
 */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Identifies the current Canvas document within one session. */
export type CanvasId = Branded<'CanvasId'>
/** Identifies one semantic media workflow across revisions. */
export type MediaWorkflowId = Branded<'MediaWorkflowId'>
/** Identifies one workflow node. */
export type WorkflowNodeId = Branded<'WorkflowNodeId'>
/** Identifies one workflow edge. */
export type WorkflowEdgeId = Branded<'WorkflowEdgeId'>
/** Identifies one execution of a fixed workflow revision. */
export type CanvasRunId = Branded<'CanvasRunId'>
/** Identifies one user-facing workflow variant. */
export type CanvasVariantId = Branded<'CanvasVariantId'>
/** Identifies one durable video object without exposing a filesystem path or bearer URL. */
export type VideoAssetId = Branded<'VideoAssetId'>

/** JSON-safe primitive stored inside semantic workflow configuration. */
export type CanvasJsonPrimitive = null | boolean | number | string
/** JSON-safe value stored inside semantic workflow configuration. */
export type CanvasJsonValue = CanvasJsonPrimitive | readonly CanvasJsonValue[] | { readonly [key: string]: CanvasJsonValue }

/** Media values that a node port may accept or produce. */
export type MediaPortType = 'text' | 'image' | 'video' | 'image-list' | 'video-list' | 'mask'

/** Semantic node kinds available to the initial media workflow vocabulary. */
export type MediaWorkflowNodeType =
  | 'asset.input'
  | 'prompt'
  | 'image.generate'
  | 'image.edit'
  | 'video.generate'
  | 'video.image-to-video'
  | 'output'

/** One semantic workflow node; renderer and provider-specific fields do not belong here. */
export interface MediaWorkflowNode {
  readonly id: WorkflowNodeId
  readonly type: MediaWorkflowNodeType
  readonly nodeVersion?: number
  readonly name?: string
  readonly config: Readonly<Record<string, CanvasJsonValue>>
}

/** Directed connection between named semantic node ports. */
export interface MediaWorkflowEdge {
  readonly id: WorkflowEdgeId
  readonly sourceNodeId: WorkflowNodeId
  readonly sourcePort: string
  readonly targetNodeId: WorkflowNodeId
  readonly targetPort: string
}

/** Complete semantic DAG definition. UI layout is intentionally separate. */
export interface MediaWorkflow {
  readonly id: MediaWorkflowId
  readonly schemaVersion: number
  readonly name: string
  readonly nodes: readonly MediaWorkflowNode[]
  readonly edges: readonly MediaWorkflowEdge[]
  readonly outputNodeIds: readonly WorkflowNodeId[]
}

/** Persisted editor layout kept independent from semantic workflow revisioning. */
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
}

/** Durable reference for one generated or imported video. */
export interface VideoAssetRef {
  readonly assetId: VideoAssetId
  readonly mediaType: string
  readonly bytes: number
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
}

/** Durable image result backed by the existing attachment capability. */
export interface CanvasImageAssetRef {
  readonly kind: 'image'
  readonly image: Readonly<ImageAttachmentRef>
}

/** Durable video result backed by the future media-asset capability. */
export interface CanvasVideoAssetRef {
  readonly kind: 'video'
  readonly video: VideoAssetRef
}

/** Durable media reference stored by Canvas; binary payloads never appear here. */
export type CanvasAssetRef = CanvasImageAssetRef | CanvasVideoAssetRef

/** High-level error classes rendered differently by future consumers. */
export type CanvasErrorCategory = 'validation' | 'conflict' | 'permission' | 'provider' | 'infrastructure' | 'interrupted' | 'quota'

/** Stable errors currently owned by the pure Canvas domain. */
export type CanvasErrorCode =
  | 'CANVAS_INVALID_ID'
  | 'CANVAS_INVALID_REVISION'
  | 'CANVAS_INVALID_TIMESTAMP'
  | 'CANVAS_INVALID_JSON_VALUE'
  | 'CANVAS_INVALID_WORKFLOW'
  | 'CANVAS_INVALID_ASSET'
  | 'CANVAS_INVALID_RUN'
  | 'CANVAS_INVALID_OUTPUT'

/** Stable service failures rejected before a Canvas mutation commits. */
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
  | 'CANVAS_INVALID_ACCESS_CONTEXT'
  | 'CANVAS_SENSITIVE_DATA'

/** Wire-safe error detail attached to a failed or interrupted run. */
export interface CanvasRunError {
  readonly category: CanvasErrorCategory
  readonly code: string
  readonly message: string
}

/** Lifecycle of one execution of an immutable workflow revision. */
export type CanvasRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'

/** Durable lifecycle summary for one current or most-recent run. */
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

/** Bounded history DTO derived from Session history; it is never a second authority. */
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

/** Current user-facing output. A previous successful output may remain while a later run fails. */
export interface CanvasOutput {
  readonly runId: CanvasRunId
  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number
  readonly assets: readonly CanvasAssetRef[]
  readonly primaryAssetIndex: number
}

/** Complete current Canvas state. Session events later carry this value whole after every mutation. */
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

/** Version of the durable `canvas/change` envelope. */
export type CanvasChangeVersion = 1

/** Stable migration/decode failure reasons at durable Canvas boundaries. */
export type CanvasMigrationErrorCode =
  | 'CANVAS_MIGRATION_INVALID_VALUE'
  | 'CANVAS_UNSUPPORTED_SCHEMA_VERSION'
  | 'CANVAS_UNSUPPORTED_FUTURE_SCHEMA'
  | 'CANVAS_UNSUPPORTED_NODE_VERSION'
  | 'CANVAS_UNSUPPORTED_FUTURE_NODE_VERSION'

/** Non-fatal compatibility information surfaced while reading historical Canvas data. */
export interface CanvasMigrationNotice {
  readonly code: 'CANVAS_DEPRECATED_NODE'
  readonly lifecycle: 'deprecated'
  readonly nodeId: WorkflowNodeId
  readonly fromType: string
  readonly toType: MediaWorkflowNodeType
}

/** Result of migration before or after current-domain invariant validation. */
export interface CanvasMigrationResult<T> {
  readonly value: T
  readonly notices: readonly CanvasMigrationNotice[]
}

/** Host permissions consumed by CanvasService and later Remote/Tool/History/Asset routes. */
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

/** Human, Agent, and Host-system identities recognized by Canvas authorization/audit. */
export type CanvasActorKind = 'human' | 'agent' | 'system'

/** Durable-safe Canvas actor identity. Provider credentials and request headers never belong here. */
export type CanvasActor =
  | { readonly kind: 'human'; readonly id: string }
  | { readonly kind: 'agent'; readonly id: string }
  | { readonly kind: 'system'; readonly id: string }

/** Known Host entry points that may request Canvas permissions. */
export type CanvasRequestSource = 'host' | 'browser-remote' | 'agent-tool' | 'system-reconciler' | 'asset-route'

/** Request-scoped actor/source metadata sampled by the Host caller. */
export interface CanvasAccessContext {
  readonly actor: CanvasActor
  readonly source: CanvasRequestSource
  readonly requestId?: string
  readonly correlationId?: string
}

/** Complete authorization request evaluated only on the Host. */
export interface CanvasAuthorizationRequest extends CanvasAccessContext {
  readonly permission: CanvasPermission
  readonly sessionId: string
  readonly canvasId?: CanvasId
}

/** Stable authorization result; deny reasons never contain credentials or arbitrary caller payloads. */
export type CanvasAuthorizationDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'actor-kind-not-allowed' }

/** Single-user default policy with optional permission-specific actor-kind overrides. */
export interface CanvasAuthorizationConfig {
  readonly defaultActors?: readonly CanvasActorKind[]
  readonly permissions?: Partial<Record<CanvasPermission, readonly CanvasActorKind[]>>
}

/** CanvasService configuration used when no external `canvasAuthorization` Cordis service is mounted. */
export interface CanvasServiceConfig {
  readonly authorization?: CanvasAuthorizationConfig
}

/** Compare-and-set identity for one current semantic workflow revision. */
export interface WorkflowRef {
  readonly canvasId: CanvasId
  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number
}

/** Atomic semantic operation applied in-order to one detached workflow draft. */
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

/** Host request for the first/current Canvas and its initial workflow. */
export interface CreateCanvasRequest {
  readonly workflow: MediaWorkflow
  readonly currentVariantId?: CanvasVariantId
}

/** Select one already-durable output candidate by its current run identity. */
export interface SelectCanvasOutputRequest {
  readonly runId: CanvasRunId
  readonly assetIndex: number
}

/** Input for constructing a fresh Canvas before any run lifecycle exists. */
export interface CreateCanvasSnapshotInput {
  readonly id: CanvasId
  readonly createdAt: number
  readonly workflow?: MediaWorkflow | null
  readonly currentVariantId?: CanvasVariantId
}

/** Input for constructing a workflow at the current schema version. */
export interface CreateMediaWorkflowInput {
  readonly id: MediaWorkflowId
  readonly name: string
  readonly nodes?: readonly MediaWorkflowNode[]
  readonly edges?: readonly MediaWorkflowEdge[]
  readonly outputNodeIds?: readonly WorkflowNodeId[]
}

/** Presentation-level state derived only from the durable Canvas snapshot. */
export type CanvasProductState = 'EMPTY' | 'READY' | 'DIRTY_READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED'
