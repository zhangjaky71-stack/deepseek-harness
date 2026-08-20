/** Types-only contracts for media workflow validation, planning, and fingerprints. */

import type {
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
  | { readonly mode: 'downstream'; readonly nodeIds: readonly WorkflowNodeId[] }
  | { readonly mode: 'from-node'; readonly nodeId: WorkflowNodeId }

/** Edge crossing from an unscheduled upstream producer into a partial execution scope. */
export interface MediaWorkflowBoundaryInput {
  readonly edgeId: WorkflowEdgeId
  readonly sourceNodeId: WorkflowNodeId
  readonly sourcePort: string
  readonly targetNodeId: WorkflowNodeId
  readonly targetPort: string
}

/** Static execution plan. Cache/output availability is resolved by the later Run layer. */
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

/** Fingerprint result; deterministic metadata decides whether later layers may cache it. */
export interface MediaNodeExecutionFingerprint {
  readonly algorithm: 'sha256'
  readonly value: string
  readonly cacheable: boolean
  readonly nodeType: MediaNodeDefinition['type']
  readonly nodeVersion: number
}

/** Minimal validated workflow bundle reused by planner helpers. */
export interface ValidatedMediaWorkflow {
  readonly workflow: MediaWorkflow
  readonly definitions: ReadonlyMap<WorkflowNodeId, MediaNodeDefinition>
  readonly topologicalNodeIds: readonly WorkflowNodeId[]
}
