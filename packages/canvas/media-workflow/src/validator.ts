/** Static media-workflow validation over the N10 definition registry. */

import type { MediaWorkflow, WorkflowNodeId } from '@deepseek-ai/dsh-canvas/types'
import type { MediaNodeDefinition } from './types.ts'
import type { MediaNodeRegistry } from './registry.ts'
import type {
  MediaWorkflowDiagnostic,
  MediaWorkflowValidationResult,
  ValidatedMediaWorkflow,
} from './engine-types.ts'

/** Stable validation rejection carrying the full diagnostic set. */
export class MediaWorkflowValidationError extends Error {
  /**
   * @param diagnostics - blocking diagnostics produced by static validation.
   */
  constructor(readonly diagnostics: readonly MediaWorkflowDiagnostic[]) {
    super(diagnostics.map(item => item.message).join('; ') || 'media workflow validation failed')
    this.name = 'MediaWorkflowValidationError'
  }
}

function definitionMap(
  workflow: MediaWorkflow,
  registry: MediaNodeRegistry,
  diagnostics: MediaWorkflowDiagnostic[],
): Map<WorkflowNodeId, MediaNodeDefinition> {
  const definitions = new Map<WorkflowNodeId, MediaNodeDefinition>()
  for (const node of workflow.nodes) {
    const definition = registry.resolveNode(node)
    if (definition === undefined) {
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_UNKNOWN_NODE_DEFINITION',
        message: `Node ${node.id} uses unregistered definition ${node.type}@${node.nodeVersion ?? 1}`,
        nodeId: node.id,
      })
      continue
    }
    definitions.set(node.id, definition)
    try {
      registry.parseConfig(node)
    } catch (error) {
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_INVALID_NODE_CONFIG',
        message: error instanceof Error ? error.message : `Node ${node.id} config is invalid`,
        nodeId: node.id,
      })
    }
    if (!definition.lifecycle.executable) {
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_NODE_NOT_EXECUTABLE',
        message: `Node ${node.id} definition ${definition.type}@${definition.version} is not executable`,
        nodeId: node.id,
      })
    }
  }
  return definitions
}

function topologicalOrder(
  workflow: MediaWorkflow,
  diagnostics: MediaWorkflowDiagnostic[],
): readonly WorkflowNodeId[] {
  const indegree = new Map(workflow.nodes.map(node => [node.id, 0] as const))
  const outgoing = new Map<WorkflowNodeId, WorkflowNodeId[]>()
  for (const edge of workflow.edges) {
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1)
    const targets = outgoing.get(edge.sourceNodeId) ?? []
    targets.push(edge.targetNodeId)
    outgoing.set(edge.sourceNodeId, targets)
  }
  const queue = workflow.nodes
    .map(node => node.id)
    .filter(nodeId => (indegree.get(nodeId) ?? 0) === 0)
  const order: WorkflowNodeId[] = []
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index]!
    order.push(nodeId)
    for (const target of outgoing.get(nodeId) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1
      indegree.set(target, next)
      if (next === 0) queue.push(target)
    }
  }
  if (order.length !== workflow.nodes.length) {
    const cyclic = workflow.nodes.map(node => node.id).filter(nodeId => (indegree.get(nodeId) ?? 0) > 0)
    diagnostics.push({
      severity: 'error',
      code: 'MEDIA_WORKFLOW_CYCLE',
      message: `Workflow contains a cycle involving ${cyclic.join(', ')}`,
      ...(cyclic[0] === undefined ? {} : { nodeId: cyclic[0] }),
    })
  }
  return order
}

function validatePorts(
  workflow: MediaWorkflow,
  definitions: ReadonlyMap<WorkflowNodeId, MediaNodeDefinition>,
  diagnostics: MediaWorkflowDiagnostic[],
): void {
  const incomingByPort = new Map<string, number>()
  for (const edge of workflow.edges) {
    const source = definitions.get(edge.sourceNodeId)
    const target = definitions.get(edge.targetNodeId)
    if (source === undefined || target === undefined) continue
    const sourcePort = source.outputs.find(port => port.name === edge.sourcePort)
    const targetPort = target.inputs.find(port => port.name === edge.targetPort)
    if (sourcePort === undefined) {
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_UNKNOWN_SOURCE_PORT',
        message: `Edge ${edge.id} references unknown source port ${edge.sourcePort} on ${edge.sourceNodeId}`,
        edgeId: edge.id,
        nodeId: edge.sourceNodeId,
        port: edge.sourcePort,
      })
    }
    if (targetPort === undefined) {
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_UNKNOWN_TARGET_PORT',
        message: `Edge ${edge.id} references unknown target port ${edge.targetPort} on ${edge.targetNodeId}`,
        edgeId: edge.id,
        nodeId: edge.targetNodeId,
        port: edge.targetPort,
      })
    }
    if (sourcePort !== undefined && targetPort !== undefined && sourcePort.type !== targetPort.type) {
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_PORT_TYPE_MISMATCH',
        message: `Edge ${edge.id} connects ${sourcePort.type} to ${targetPort.type}`,
        edgeId: edge.id,
        nodeId: edge.targetNodeId,
        port: edge.targetPort,
      })
    }
    if (targetPort !== undefined) {
      const key = `${edge.targetNodeId}\u0000${edge.targetPort}`
      const count = (incomingByPort.get(key) ?? 0) + 1
      incomingByPort.set(key, count)
      if (count > 1 && targetPort.multiple !== true) {
        diagnostics.push({
          severity: 'error',
          code: 'MEDIA_WORKFLOW_INPUT_MULTIPLICITY',
          message: `Node ${edge.targetNodeId} input ${edge.targetPort} accepts only one edge`,
          edgeId: edge.id,
          nodeId: edge.targetNodeId,
          port: edge.targetPort,
        })
      }
    }
  }

  for (const node of workflow.nodes) {
    const definition = definitions.get(node.id)
    if (definition === undefined) continue
    for (const input of definition.inputs) {
      if (!input.required) continue
      const key = `${node.id}\u0000${input.name}`
      if ((incomingByPort.get(key) ?? 0) > 0) continue
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_MISSING_REQUIRED_INPUT',
        message: `Node ${node.id} is missing required input ${input.name}`,
        nodeId: node.id,
        port: input.name,
      })
    }
  }
}

function warnUnreachable(workflow: MediaWorkflow, diagnostics: MediaWorkflowDiagnostic[]): void {
  if (workflow.outputNodeIds.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'MEDIA_WORKFLOW_NO_OUTPUT',
      message: 'Workflow must declare at least one output node before execution',
    })
    return
  }
  const upstream = new Map<WorkflowNodeId, WorkflowNodeId[]>()
  for (const edge of workflow.edges) {
    const sources = upstream.get(edge.targetNodeId) ?? []
    sources.push(edge.sourceNodeId)
    upstream.set(edge.targetNodeId, sources)
  }
  const reachable = new Set<WorkflowNodeId>()
  const stack = [...workflow.outputNodeIds]
  while (stack.length > 0) {
    const nodeId = stack.pop()!
    if (reachable.has(nodeId)) continue
    reachable.add(nodeId)
    for (const source of upstream.get(nodeId) ?? []) stack.push(source)
  }
  for (const node of workflow.nodes) {
    if (reachable.has(node.id)) continue
    diagnostics.push({
      severity: 'warning',
      code: 'MEDIA_WORKFLOW_UNREACHABLE_NODE',
      message: `Node ${node.id} does not contribute to a declared workflow output`,
      nodeId: node.id,
    })
  }
}

/**
 * Validate static workflow execution semantics using the active N10 registry.
 * @param workflow - current semantic workflow.
 * @param registry - active node-definition registry.
 * @returns diagnostics plus topological order when acyclic.
 */
export function validateMediaWorkflow(
  workflow: MediaWorkflow,
  registry: MediaNodeRegistry,
): MediaWorkflowValidationResult {
  const diagnostics: MediaWorkflowDiagnostic[] = []
  const definitions = definitionMap(workflow, registry, diagnostics)
  validatePorts(workflow, definitions, diagnostics)
  const topologicalNodeIds = topologicalOrder(workflow, diagnostics)
  warnUnreachable(workflow, diagnostics)
  return {
    valid: diagnostics.every(item => item.severity !== 'error'),
    diagnostics,
    topologicalNodeIds,
  }
}

/**
 * Validate and materialize the exact definition map needed by the planner.
 * @param workflow - current semantic workflow.
 * @param registry - active node-definition registry.
 * @returns validated workflow bundle.
 * @throws MediaWorkflowValidationError when any blocking diagnostic exists.
 */
export function assertValidMediaWorkflow(
  workflow: MediaWorkflow,
  registry: MediaNodeRegistry,
): ValidatedMediaWorkflow {
  const result = validateMediaWorkflow(workflow, registry)
  const errors = result.diagnostics.filter(item => item.severity === 'error')
  if (errors.length > 0) throw new MediaWorkflowValidationError(errors)
  const definitions = new Map<WorkflowNodeId, MediaNodeDefinition>()
  for (const node of workflow.nodes) definitions.set(node.id, registry.require({ type: node.type, version: node.nodeVersion ?? 1 }))
  return { workflow, definitions, topologicalNodeIds: result.topologicalNodeIds }
}
