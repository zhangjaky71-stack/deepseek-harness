/** Static execution-scope planner for full and partial media DAG runs. */

import type { WorkflowNodeId } from '@deepseek-ai/dsh-canvas/types'
import type {
  MediaWorkflowBoundaryInput,
  MediaWorkflowDiagnostic,
  MediaWorkflowExecutionPlan,
  MediaWorkflowExecutionSelection,
  ValidatedMediaWorkflow,
} from './engine-types.ts'
import { MediaWorkflowValidationError } from './validator.ts'

function nodeSet(workflow: ValidatedMediaWorkflow): Set<WorkflowNodeId> {
  return new Set(workflow.workflow.nodes.map(node => node.id))
}

function assertTargets(
  workflow: ValidatedMediaWorkflow,
  selection: MediaWorkflowExecutionSelection,
): readonly WorkflowNodeId[] {
  const existing = nodeSet(workflow)
  const requested = selection.mode === 'all'
    ? workflow.workflow.outputNodeIds
    : selection.mode === 'from-node'
      ? [selection.nodeId]
      : selection.nodeIds
  const unique = [...new Set(requested)]
  const diagnostics: MediaWorkflowDiagnostic[] = []
  if (selection.mode !== 'all' && unique.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'MEDIA_WORKFLOW_INVALID_PARTIAL_TARGET',
      message: `Partial execution mode ${selection.mode} requires at least one target node`,
    })
  }
  for (const nodeId of unique) {
    if (existing.has(nodeId)) continue
    diagnostics.push({
      severity: 'error',
      code: 'MEDIA_WORKFLOW_INVALID_PARTIAL_TARGET',
      message: `Partial execution target ${nodeId} does not exist`,
      nodeId,
    })
  }
  if (diagnostics.length > 0) throw new MediaWorkflowValidationError(diagnostics)
  return unique
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
  return { upstream, downstream }
}

function closure(
  roots: readonly WorkflowNodeId[],
  next: ReadonlyMap<WorkflowNodeId, readonly WorkflowNodeId[]>,
): Set<WorkflowNodeId> {
  const result = new Set<WorkflowNodeId>()
  const stack = [...roots]
  while (stack.length > 0) {
    const nodeId = stack.pop()!
    if (result.has(nodeId)) continue
    result.add(nodeId)
    for (const adjacent of next.get(nodeId) ?? []) stack.push(adjacent)
  }
  return result
}

function scheduledSet(
  workflow: ValidatedMediaWorkflow,
  selection: MediaWorkflowExecutionSelection,
  targets: readonly WorkflowNodeId[],
): Set<WorkflowNodeId> {
  if (selection.mode === 'all') return new Set(workflow.workflow.nodes.map(node => node.id))
  const { upstream, downstream } = adjacency(workflow)
  if (selection.mode === 'selected') return closure(targets, upstream)
  return closure(targets, downstream)
}

function boundaries(
  workflow: ValidatedMediaWorkflow,
  scheduled: ReadonlySet<WorkflowNodeId>,
): readonly MediaWorkflowBoundaryInput[] {
  return workflow.workflow.edges
    .filter(edge => scheduled.has(edge.targetNodeId) && !scheduled.has(edge.sourceNodeId))
    .map(edge => ({
      edgeId: edge.id,
      sourceNodeId: edge.sourceNodeId,
      sourcePort: edge.sourcePort,
      targetNodeId: edge.targetNodeId,
      targetPort: edge.targetPort,
    }))
}

/**
 * Produce a deterministic static execution scope over an already validated DAG.
 * @param workflow - validated workflow and topology.
 * @param selection - full or partial execution request.
 * @returns topologically ordered scheduled nodes and unresolved upstream boundary inputs.
 * @throws MediaWorkflowValidationError when partial targets are empty or absent.
 */
export function planMediaWorkflowExecution(
  workflow: ValidatedMediaWorkflow,
  selection: MediaWorkflowExecutionSelection = { mode: 'all' },
): MediaWorkflowExecutionPlan {
  const targets = assertTargets(workflow, selection)
  const scheduled = scheduledSet(workflow, selection, targets)
  const scheduledNodeIds = workflow.topologicalNodeIds.filter(nodeId => scheduled.has(nodeId))
  return {
    workflowId: workflow.workflow.id,
    selection,
    scheduledNodeIds,
    targetNodeIds: targets,
    boundaryInputs: boundaries(workflow, scheduled),
  }
}
