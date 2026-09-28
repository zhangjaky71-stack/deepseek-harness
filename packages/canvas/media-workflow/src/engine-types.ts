/** Types-only contracts for media workflow validation, planning, execution, events, and caching. */

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
  | 'MEDIA_WORKFLOW_UNKNOWN_OUTPUT_NODE'
  | 'MEDIA_WORKFLOW_DUPLICATE_OUTPUT_NODE'
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

/** Full or partial execution selection. */
export type MediaWorkflowExecutionSelection =
  | { readonly mode: 'all' }
  | { readonly mode: 'selected'; readonly nodeIds: readonly WorkflowNodeId[] }
  | { readonly mode: 'from-node'; readonly nodeId: WorkflowNodeId }
  | { readonly mode: 'downstream'; readonly nodeIds: readonly WorkflowNodeId[] }

/** Edge crossing from an unscheduled producer into a scheduled partial scope. */
export interface MediaWorkflowBoundaryInput {
  readonly edgeId: WorkflowEdgeId
  readonly sourceNodeId: WorkflowNodeId
  readonly sourcePort: string
  readonly targetNodeId: WorkflowNodeId
  readonly targetPort: string
}

/** Deterministic static execution plan. */
export interface MediaWorkflowExecutionPlan {
  readonly workflowId: MediaWorkflowId
  readonly selection: MediaWorkflowExecutionSelection
  readonly scheduledNodeIds: readonly WorkflowNodeId[]
  readonly targetNodeIds: readonly WorkflowNodeId[]
  readonly boundaryInputs: readonly MediaWorkflowBoundaryInput[]
}

/** Resolved execution identity supplied by a later resolver or another caller; N12 never selects it. */
export interface MediaNodeExecutionIdentity {
  /** Canonical stable value included in the node fingerprint, for example a resolved provider/model key. */
  readonly key: string
}

/** One ordered upstream contribution to a node-execution fingerprint. */
export interface MediaNodeFingerprintInput {
  readonly edgeId: WorkflowEdgeId
  readonly sourceNodeId: WorkflowNodeId
  readonly sourcePort: string
  readonly targetPort: string
  readonly fingerprint: string
}

/** Stable execution fingerprint and automatic-cache eligibility. */
export interface MediaNodeExecutionFingerprint {
  readonly algorithm: 'sha256'
  readonly value: string
  readonly cacheable: boolean
  readonly nodeType: MediaNodeDefinition['type']
  readonly nodeVersion: number
  readonly executionIdentityKey?: string
}

/** Runtime value carried over a semantic media port. */
export type MediaNodeExecutionValue =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'image'; readonly asset: CanvasImageAssetRef }
  | { readonly kind: 'video'; readonly asset: CanvasVideoAssetRef }
  | { readonly kind: 'image-list'; readonly assets: readonly CanvasImageAssetRef[] }
  | { readonly kind: 'video-list'; readonly assets: readonly CanvasVideoAssetRef[] }
  | { readonly kind: 'mask'; readonly asset: CanvasImageAssetRef }

/** One executor output plus the producer's stable content/provenance fingerprint. */
export interface MediaNodeExecutionOutput {
  readonly value: MediaNodeExecutionValue
  readonly fingerprint: string
}

/** Inputs grouped by target port; values within each port are ordered by edge id. */
export type MediaNodeExecutionInputs = Readonly<Record<string, readonly MediaNodeExecutionOutput[]>>

/** Executor result before N12 validates output ports. */
export interface MediaNodeExecutorResult {
  readonly outputs: Readonly<Record<string, MediaNodeExecutionOutput>>
}

/** One immutable provider-neutral node execution call. */
export interface MediaNodeExecutorContext {
  readonly workflow: MediaWorkflow
  readonly nodeId: WorkflowNodeId
  readonly definition: MediaNodeDefinition
  readonly inputs: MediaNodeExecutionInputs
  readonly fingerprint: MediaNodeExecutionFingerprint
  readonly executionIdentity?: MediaNodeExecutionIdentity
  readonly signal?: AbortSignal
}

/** Provider-neutral node executor. */
export interface MediaNodeExecutor {
  /** Execute one exact node snapshot and return semantic outputs. */
  execute(context: MediaNodeExecutorContext): Promise<MediaNodeExecutorResult> | MediaNodeExecutorResult
}

/** Cache seam used only when the node definition declares deterministic execution. */
export interface MediaNodeExecutionCache {
  /** Read a prior result for one fingerprint. */
  get(fingerprint: MediaNodeExecutionFingerprint): Promise<MediaNodeExecutorResult | undefined> | MediaNodeExecutorResult | undefined
  /** Store a validated immutable result for one fingerprint. */
  set(fingerprint: MediaNodeExecutionFingerprint, result: MediaNodeExecutorResult): Promise<void> | void
}

/** Immutable semantic workflow captured before an engine run starts. */
export interface MediaWorkflowRunSnapshot {
  readonly workflow: MediaWorkflow
}

/** Validated workflow bundle reused by scheduler/engine helpers. */
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
  | 'MEDIA_WORKFLOW_INVALID_EXECUTION_IDENTITY'
  | 'MEDIA_WORKFLOW_ABORTED'

/** Provider-neutral runtime facts emitted by the engine; they are not Session events. */
export type WorkflowRuntimeEvent =
  | {
    readonly kind: 'node-started'
    readonly nodeId: WorkflowNodeId
    readonly fingerprint: MediaNodeExecutionFingerprint
  }
  | {
    readonly kind: 'node-cache-hit'
    readonly nodeId: WorkflowNodeId
    readonly fingerprint: MediaNodeExecutionFingerprint
  }
  | {
    readonly kind: 'node-completed'
    readonly nodeId: WorkflowNodeId
    readonly fingerprint: MediaNodeExecutionFingerprint
    readonly cacheHit: boolean
  }

/** Optional in-band runtime-event sink. N16 may adapt these facts into its own durable run lifecycle. */
export interface WorkflowEventSink {
  /** Publish one runtime fact; a rejection fails the current engine run. */
  publish(event: WorkflowRuntimeEvent): Promise<void> | void
}

/** Input for one full or partial DAG execution. */
export interface MediaWorkflowRunRequest {
  readonly workflow: MediaWorkflow
  readonly selection?: MediaWorkflowExecutionSelection
  readonly boundaryInputs?: ReadonlyMap<WorkflowEdgeId, MediaNodeExecutionOutput>
  readonly executionIdentities?: ReadonlyMap<WorkflowNodeId, MediaNodeExecutionIdentity>
  readonly eventSink?: WorkflowEventSink
  readonly signal?: AbortSignal
}

/** Result of one scheduled node. */
export interface MediaWorkflowNodeRunResult {
  readonly nodeId: WorkflowNodeId
  readonly fingerprint: MediaNodeExecutionFingerprint
  readonly outputs: Readonly<Record<string, MediaNodeExecutionOutput>>
  readonly cacheHit: boolean
}

/** Completed engine result. Durable Canvas Run/Job state remains owned by later layers. */
export interface MediaWorkflowRunResult {
  readonly snapshot: MediaWorkflowRunSnapshot
  readonly plan: MediaWorkflowExecutionPlan
  readonly nodes: ReadonlyMap<WorkflowNodeId, MediaWorkflowNodeRunResult>
}
