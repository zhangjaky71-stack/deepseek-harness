/** Deterministic execution-scope scheduler for full and partial media DAG runs. */

import type { WorkflowNodeId } from '@deepseek-ai/dsh-canvas/types'
import type {
  MediaWorkflowBoundaryInput,
  MediaWorkflowDiagnostic,
  MediaWorkflowExecutionPlan,
  MediaWorkflowExecutionSelection,
  ValidatedMediaWorkflow,
} from './engine-types.ts'
import { MediaWorkflowValidationError } from './validate.ts'

function requestedNodes(workflow: ValidatedMediaWorkflow, selection: MediaWorkflowExecutionSelection): readonly WorkflowNodeId[] {
  if (selection.mode === 'all') return workflow.workflow.outputNodeIds
  if (selection.mode === 'from-node') return [selection.nodeId]
  return selection.nodeIds
}

function assertTargets(workflow: ValidatedMediaWorkflow, selection: MediaWorkflowExecutionSelection): readonly WorkflowNodeId[] {
  const requested = requestedNodes(workflow, selection)
  const unique = [...new Set(requested)].sort((left, right) => left.localeCompare(right))
  const diagnostics: MediaWorkflowDiagnostic[] = []
  if (selection.mode !== 'all' && unique.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'MEDIA_WORKFLOW_INVALID_PARTIAL_TARGET',
      message: `Partial execution mode ${selection.mode} requires at least one node`,
    })
  }
  const existing = new Set(workflow.workflow.nodes.map(node => node.id))
  for (const nodeId of unique) {
    if (existing.has(nodeId)) continue
    diagnostics.push({
      severity: 'error',
      code: 'MEDIA_WORKFLOW_INVALID_PARTIAL_TARGET',
      message: `Partial execution node ${nodeId} does not exist`,
      nodeId,
    })
  }
  if (diagnostics.length > 0) throw new MediaWorkflowValidationError(diagnostics)
  return Object.freeze(unique)
}

function adjacency(workflow: ValidatedMediaWorkflow): {
  readonly upstream: ReadonlyMap<WorkflowNodeId, readonly WorkflowNodeId[]>
  readonly downstream: ReadonlyMap<WorkflowNodeId, readonly WorkflowNodeId[]>
} {
  const upstream = new Map<WorkflowNodeId, WorkflowNodeId[]>()
  const downstream = new Map<WorkflowNodeId, WorkflowNodeId[]>()
  for (const edge of workflow.workflow.edges) {
    const sources = upstream.get(edge.targetNodeId) ?? []
    sources.push(edge.sourceNodeId)
    upstream.set(edge.targetNodeId, sources)
    const targets = downstream.get(edge.sourceNodeId) ?? []
    targets.push(edge.targetNodeId)
    downstream.set(edge.sourceNodeId, targets)
  }
  for (const values of upstream.values()) values.sort((left, right) => left.localeCompare(right))
  for (const values of downstream.values()) values.sort((left, right) => left.localeCompare(right))
  return { upstream, downstream }
}

function closure(roots: readonly WorkflowNodeId[], next: ReadonlyMap<WorkflowNodeId, readonly WorkflowNodeId[]>): Set<WorkflowNodeId> {
  const result = new Set<WorkflowNodeId>()
  const stack = [...roots].sort((left, right) => right.localeCompare(left))
  while (stack.length > 0) {
    const nodeId = stack.pop()!
    if (result.has(nodeId)) continue
    result.add(nodeId)
    const adjacent = next.get(nodeId) ?? []
    for (let index = adjacent.length - 1; index >= 0; index -= 1) stack.push(adjacent[index]!)
  }
  return result
}

function scheduledSet(
  workflow: ValidatedMediaWorkflow,
  selection: MediaWorkflowExecutionSelection,
  roots: readonly WorkflowNodeId[],
): Set<WorkflowNodeId> {
  if (selection.mode === 'all') return new Set(workflow.workflow.nodes.map(node => node.id))
  const graph = adjacency(workflow)
  if (selection.mode === 'selected') return closure(roots, graph.upstream)
  const descendants = closure(roots, graph.downstream)
  if (selection.mode === 'downstream') {
    for (const root of roots) descendants.delete(root)
  }
  return descendants
}

function assertPartialSupport(
  workflow: ValidatedMediaWorkflow,
  selection: MediaWorkflowExecutionSelection,
  scheduled: ReadonlySet<WorkflowNodeId>,
): void {
  if (selection.mode === 'all') return
  const diagnostics: MediaWorkflowDiagnostic[] = []
  for (const nodeId of scheduled) {
    const definition = workflow.definitions.get(nodeId)
    if (definition?.execution.supportsPartialRun !== false) continue
    diagnostics.push({
      severity: 'error',
      code: 'MEDIA_WORKFLOW_PARTIAL_RUN_UNSUPPORTED',
      message: `Node ${nodeId} does not support partial execution`,
      nodeId,
    })
  }
  if (diagnostics.length > 0) throw new MediaWorkflowValidationError(diagnostics)
}

function boundaries(workflow: ValidatedMediaWorkflow, scheduled: ReadonlySet<WorkflowNodeId>): readonly MediaWorkflowBoundaryInput[] {
  return Object.freeze(workflow.workflow.edges
    .filter(edge => scheduled.has(edge.targetNodeId) && !scheduled.has(edge.sourceNodeId))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(edge => Object.freeze({
      edgeId: edge.id,
      sourceNodeId: edge.sourceNodeId,
      sourcePort: edge.sourcePort,
      targetNodeId: edge.targetNodeId,
      targetPort: edge.targetPort,
    })))
}

/**
 * Produce a deterministic execution scope over an already validated DAG.
 * @param workflow - validated workflow and topology.
 * @param selection - full or partial execution request.
 * @returns topologically ordered scheduled nodes plus explicit unscheduled-upstream boundaries.
 * @throws MediaWorkflowValidationError when targets are invalid or a scheduled definition forbids partial execution.
 */
export function planMediaWorkflowExecution(
  workflow: ValidatedMediaWorkflow,
  selection: MediaWorkflowExecutionSelection = { mode: 'all' },
): MediaWorkflowExecutionPlan {
  const roots = assertTargets(workflow, selection)
  const scheduled = scheduledSet(workflow, selection, roots)
  assertPartialSupport(workflow, selection, scheduled)
  return Object.freeze({
    workflowId: workflow.workflow.id,
    selection,
    scheduledNodeIds: Object.freeze(workflow.topologicalNodeIds.filter(nodeId => scheduled.has(nodeId))),
    targetNodeIds: roots,
    boundaryInputs: boundaries(workflow, scheduled),
  })
}
