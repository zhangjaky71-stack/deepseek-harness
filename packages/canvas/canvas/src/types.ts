/**
 * Pure Canvas domain vocabulary shared by Host, future Remote contracts, Agent tools, and UI adapters.
 * Runtime construction and validation live in `./domain.ts`.
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
