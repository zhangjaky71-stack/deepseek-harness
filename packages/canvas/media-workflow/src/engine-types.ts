/** Types-only contracts for media workflow validation, planning, execution, and caching. */

import type {
  CanvasImageAssetRef,
  CanvasVideoAssetRef,
  MediaWorkflow,
  MediaWorkflowId,
  WorkflowEdgeId,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/types'
import type { MediaNodeDefinition } from './types.ts'

/** Static validation severity. */
export type MediaWorkflowDiagnosticSeverity = 'error' | 'warning'

/** Stable validation/planning diagnostic codes. */
export type MediaWorkflowDiagnosticCode =
  | 'MEDIA_WORKFLOW_DUPLICATE_NODE_ID'
  | 'MEDIA_WORKFLOW_DUPLICATE_EDGE_ID'
  | 'MEDIA_WORKFLOW_UNKNOWN_SOURCE_NODE'
  | 'MEDIA_WORKFLOW_UNKNOWN_TARGET_NODE'
  | 'MEDIA_WORKFLOW_UNKNOWN_NODE_DEFINITION'
  | 'MEDIA_WORKFLOW_INVALID_NODE_CONFIG'
  | 'MEDIA_WORKFLOW_NODE_NOT_EXECUTABLE'
  | 'MEDIA_WORKFLOW_UNKNOWN_SOURCE_PORT'
  | 'MEDIA_WORKFLOW_UNKNOWN_TARGET_PORT'
  | 'MEDIA_WORKFLOW_PORT_TYPE_MISMATCH'
  | 'MEDIA_WORKFLOW_INPUT_MULTIPLICITY'
  | 'MEDIA_WORKFLOW_MISSING_REQUIRED_INPUT'
  | 'MEDIA_WORKFLOW_CYCLE'
  | 'MEDIA_WORKFLOW_NO_OUTPUT'
  | 'MEDIA_WORKFLOW_UNREACHABLE_NODE'
  | 'MEDIA_WORKFLOW_INVALID_PARTIAL_TARGET'
  | 'MEDIA_WORKFLOW_PARTIAL_RUN_UNSUPPORTED'

/** One stable workflow diagnostic. */
export interface MediaWorkflowDiagnostic {
  readonly severity: MediaWorkflowDiagnosticSeverity
  readonly code: MediaWorkflowDiagnosticCode
  readonly message: string
  readonly nodeId?: WorkflowNodeId
  readonly edgeId?: WorkflowEdgeId
  readonly port?: string
}

/** Successful static validation result plus deterministic topology. */
export interface MediaWorkflowValidationResult {
  readonly valid: boolean
  readonly diagnostics: readonly MediaWorkflowDiagnostic[]
  readonly topologicalNodeIds: readonly WorkflowNodeId[]
}

/** Partial execution selection. */
export type MediaWorkflowExecutionSelection =
  | { readonly mode: 'all' }
  | { readonly mode: 'selected'; readonly nodeIds: readonly WorkflowNodeId[] }
  | { readonly mode: 'from-node'; readonly nodeId: WorkflowNodeId }
  | { readonly mode: 'downstream'; readonly nodeIds: readonly WorkflowNodeId[] }

/** Edge crossing from an unscheduled upstream producer into a partial execution scope. */
export interface MediaWorkflowBoundaryInput {
  readonly edgeId: WorkflowEdgeId
  readonly sourceNodeId: WorkflowNodeId
  readonly sourcePort: string
  readonly targetNodeId: WorkflowNodeId
  readonly targetPort: string
}

/** Static execution plan. */
export interface MediaWorkflowExecutionPlan {
  readonly workflowId: MediaWorkflowId
  readonly selection: MediaWorkflowExecutionSelection
  readonly scheduledNodeIds: readonly WorkflowNodeId[]
  readonly targetNodeIds: readonly WorkflowNodeId[]
  readonly boundaryInputs: readonly MediaWorkflowBoundaryInput[]
}

/** Stable input contribution to a node-execution fingerprint. */
export interface MediaNodeFingerprintInput {
  readonly port: string
  readonly fingerprint: string
}

/** Fingerprint result; deterministic metadata decides whether automatic cache reuse is allowed. */
export interface MediaNodeExecutionFingerprint {
  readonly algorithm: 'sha256'
  readonly value: string
  readonly cacheable: boolean
  readonly nodeType: MediaNodeDefinition['type']
  readonly nodeVersion: number
  readonly modelKey?: string
}

/** Runtime value carried over a semantic media port. */
export type MediaNodeExecutionValue =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'image'; readonly asset: CanvasImageAssetRef }
  | { readonly kind: 'video'; readonly asset: CanvasVideoAssetRef }
  | { readonly kind: 'image-list'; readonly assets: readonly CanvasImageAssetRef[] }
  | { readonly kind: 'video-list'; readonly assets: readonly CanvasVideoAssetRef[] }
  | { readonly kind: 'mask'; readonly asset: CanvasImageAssetRef }

/** One executor output plus a stable content/provenance fingerprint supplied by the producer. */
export interface MediaNodeExecutionOutput {
  readonly value: MediaNodeExecutionValue
  readonly fingerprint: string
}

/** Inputs grouped by target port; multiplicity remains explicit. */
export type MediaNodeExecutionInputs = Readonly<Record<string, readonly MediaNodeExecutionOutput[]>>

/** Executor result before the engine validates output ports. */
export interface MediaNodeExecutorResult {
  readonly outputs: Readonly<Record<string, MediaNodeExecutionOutput>>
}

/** One immutable node-execution call. */
export interface MediaNodeExecutorContext {
  readonly workflow: MediaWorkflow
  readonly nodeId: WorkflowNodeId
  readonly definition: MediaNodeDefinition
  readonly inputs: MediaNodeExecutionInputs
  readonly fingerprint: MediaNodeExecutionFingerprint
  readonly modelKey?: string
  readonly signal?: AbortSignal
}

/** Provider-neutral node executor. */
export interface MediaNodeExecutor {
  execute(context: MediaNodeExecutorContext): Promise<MediaNodeExecutorResult> | MediaNodeExecutorResult
}

/** Cache seam for deterministic node results. */
export interface MediaNodeExecutionCache {
  get(fingerprint: MediaNodeExecutionFingerprint): Promise<MediaNodeExecutorResult | undefined> | MediaNodeExecutorResult | undefined
  set(fingerprint: MediaNodeExecutionFingerprint, result: MediaNodeExecutorResult): Promise<void> | void
}

/** Immutable semantic workflow captured before a run starts. */
export interface MediaWorkflowRunSnapshot {
  readonly workflow: MediaWorkflow
}

/** Minimal validated workflow bundle reused by scheduler helpers. */
export interface ValidatedMediaWorkflow {
  readonly workflow: MediaWorkflow
  readonly definitions: ReadonlyMap<WorkflowNodeId, MediaNodeDefinition>
  readonly topologicalNodeIds: readonly WorkflowNodeId[]
}

/** Stable execution failures owned by the media DAG engine. */
export type MediaWorkflowExecutionErrorCode =
  | 'MEDIA_WORKFLOW_EXECUTOR_NOT_FOUND'
  | 'MEDIA_WORKFLOW_BOUNDARY_INPUT_MISSING'
  | 'MEDIA_WORKFLOW_OUTPUT_VALUE_MISSING'
  | 'MEDIA_WORKFLOW_INVALID_EXECUTOR_OUTPUT'
  | 'MEDIA_WORKFLOW_ABORTED'

/** Input for one full or partial DAG execution. */
export interface MediaWorkflowRunRequest {
  readonly workflow: MediaWorkflow
  readonly selection?: MediaWorkflowExecutionSelection
  readonly boundaryInputs?: ReadonlyMap<WorkflowEdgeId, MediaNodeExecutionOutput>
  readonly signal?: AbortSignal
  readonly resolveModelKey?: (nodeId: WorkflowNodeId, definition: MediaNodeDefinition) => string | undefined
}

/** Result of one scheduled node. */
export interface MediaWorkflowNodeRunResult {
  readonly nodeId: WorkflowNodeId
  readonly fingerprint: MediaNodeExecutionFingerprint
  readonly outputs: Readonly<Record<string, MediaNodeExecutionOutput>>
  readonly cacheHit: boolean
}

/** Completed engine result. Durable run state is owned by later Canvas run layers. */
export interface MediaWorkflowRunResult {
  readonly snapshot: MediaWorkflowRunSnapshot
  readonly plan: MediaWorkflowExecutionPlan
  readonly nodes: ReadonlyMap<WorkflowNodeId, MediaWorkflowNodeRunResult>
}
