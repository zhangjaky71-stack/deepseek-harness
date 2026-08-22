/** Static media-workflow validation over the active exact-version node registry. */

import type {
  MediaWorkflow,
  MediaWorkflowEdge,
  MediaWorkflowNode,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/types'
import type { MediaNodeDefinition } from './types.ts'
import type { MediaNodeRegistry } from './registry.ts'
import type {
  MediaWorkflowDiagnostic,
  MediaWorkflowValidationResult,
  ValidatedMediaWorkflow,
} from './engine-types.ts'

/** Static workflow rejection carrying every blocking diagnostic found in one pass. */
export class MediaWorkflowValidationError extends Error {
  /**
   * @param diagnostics - blocking validation/planning diagnostics.
   */
  constructor(readonly diagnostics: readonly MediaWorkflowDiagnostic[]) {
    super(diagnostics.map(item => item.message).join('; ') || 'media workflow validation failed')
    this.name = 'MediaWorkflowValidationError'
  }
}

interface StructuralIndex {
  readonly nodes: ReadonlyMap<WorkflowNodeId, MediaWorkflowNode>
  readonly edges: readonly MediaWorkflowEdge[]
}

function structuralIndex(workflow: MediaWorkflow, diagnostics: MediaWorkflowDiagnostic[]): StructuralIndex {
  const nodes = new Map<WorkflowNodeId, MediaWorkflowNode>()
  for (const node of workflow.nodes) {
    if (nodes.has(node.id)) {
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_DUPLICATE_NODE_ID',
        message: `Workflow contains duplicate node id ${node.id}`,
        nodeId: node.id,
      })
      continue
    }
    nodes.set(node.id, node)
  }

  const edgeIds = new Set<string>()
  const edges: MediaWorkflowEdge[] = []
  for (const edge of workflow.edges) {
    if (edgeIds.has(edge.id)) {
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_DUPLICATE_EDGE_ID',
        message: `Workflow contains duplicate edge id ${edge.id}`,
        edgeId: edge.id,
      })
      continue
    }
    edgeIds.add(edge.id)
    let valid = true
    if (!nodes.has(edge.sourceNodeId)) {
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_UNKNOWN_SOURCE_NODE',
        message: `Edge ${edge.id} source node ${edge.sourceNodeId} does not exist`,
        edgeId: edge.id,
        nodeId: edge.sourceNodeId,
      })
      valid = false
    }
    if (!nodes.has(edge.targetNodeId)) {
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_UNKNOWN_TARGET_NODE',
        message: `Edge ${edge.id} target node ${edge.targetNodeId} does not exist`,
        edgeId: edge.id,
        nodeId: edge.targetNodeId,
      })
      valid = false
    }
    if (valid) edges.push(edge)
  }

  const outputIds = new Set<string>()
  for (const nodeId of workflow.outputNodeIds) {
    if (outputIds.has(nodeId)) {
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_DUPLICATE_OUTPUT_NODE',
        message: `Workflow contains duplicate output node id ${nodeId}`,
        nodeId,
      })
      continue
    }
    outputIds.add(nodeId)
    if (nodes.has(nodeId)) continue
    diagnostics.push({
      severity: 'error',
      code: 'MEDIA_WORKFLOW_UNKNOWN_OUTPUT_NODE',
      message: `Workflow output node ${nodeId} does not exist`,
      nodeId,
    })
  }

  return { nodes, edges }
}

function definitionMap(
  nodes: ReadonlyMap<WorkflowNodeId, MediaWorkflowNode>,
  registry: MediaNodeRegistry,
  diagnostics: MediaWorkflowDiagnostic[],
): Map<WorkflowNodeId, MediaNodeDefinition> {
  const definitions = new Map<WorkflowNodeId, MediaNodeDefinition>()
  for (const node of nodes.values()) {
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
    if (definition.lifecycle.executable) continue
    diagnostics.push({
      severity: 'error',
      code: 'MEDIA_WORKFLOW_NODE_NOT_EXECUTABLE',
      message: `Node ${node.id} definition ${definition.type}@${definition.version} is not executable`,
      nodeId: node.id,
    })
  }
  return definitions
}

function validatePorts(
  nodes: ReadonlyMap<WorkflowNodeId, MediaWorkflowNode>,
  edges: readonly MediaWorkflowEdge[],
  definitions: ReadonlyMap<WorkflowNodeId, MediaNodeDefinition>,
  diagnostics: MediaWorkflowDiagnostic[],
): void {
  const incomingByPort = new Map<string, number>()
  for (const edge of edges) {
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
    if (sourcePort === undefined || targetPort === undefined) continue
    if (sourcePort.type !== targetPort.type) {
      diagnostics.push({
        severity: 'error',
        code: 'MEDIA_WORKFLOW_PORT_TYPE_MISMATCH',
        message: `Edge ${edge.id} connects ${sourcePort.type} to ${targetPort.type}`,
        edgeId: edge.id,
        nodeId: edge.targetNodeId,
        port: edge.targetPort,
      })
      continue
    }
    const key = `${edge.targetNodeId}\u0000${edge.targetPort}`
    const count = (incomingByPort.get(key) ?? 0) + 1
    incomingByPort.set(key, count)
    if (count <= 1 || targetPort.multiple === true) continue
    diagnostics.push({
      severity: 'error',
      code: 'MEDIA_WORKFLOW_INPUT_MULTIPLICITY',
      message: `Node ${edge.targetNodeId} input ${edge.targetPort} accepts only one edge`,
      edgeId: edge.id,
      nodeId: edge.targetNodeId,
      port: edge.targetPort,
    })
  }

  for (const node of nodes.values()) {
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

function topologicalOrder(
  nodes: ReadonlyMap<WorkflowNodeId, MediaWorkflowNode>,
  edges: readonly MediaWorkflowEdge[],
  diagnostics: MediaWorkflowDiagnostic[],
): readonly WorkflowNodeId[] {
  const ids = [...nodes.keys()].sort((left, right) => left.localeCompare(right))
  const indegree = new Map(ids.map(nodeId => [nodeId, 0] as const))
  const outgoing = new Map<WorkflowNodeId, MediaWorkflowEdge[]>()
  for (const edge of edges) {
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1)
    const list = outgoing.get(edge.sourceNodeId) ?? []
    list.push(edge)
    outgoing.set(edge.sourceNodeId, list)
  }
  for (const list of outgoing.values()) {
    list.sort((left, right) => left.targetNodeId.localeCompare(right.targetNodeId) || left.id.localeCompare(right.id))
  }

  const queue = ids.filter(nodeId => indegree.get(nodeId) === 0)
  const order: WorkflowNodeId[] = []
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    order.push(nodeId)
    for (const edge of outgoing.get(nodeId) ?? []) {
      const next = (indegree.get(edge.targetNodeId) ?? 0) - 1
      indegree.set(edge.targetNodeId, next)
      if (next !== 0) continue
      queue.push(edge.targetNodeId)
      queue.sort((left, right) => left.localeCompare(right))
    }
  }
  if (order.length !== nodes.size) {
    const cyclic = ids.filter(nodeId => (indegree.get(nodeId) ?? 0) > 0)
    diagnostics.push({
      severity: 'error',
      code: 'MEDIA_WORKFLOW_CYCLE',
      message: `Workflow contains a cycle involving ${cyclic.join(', ')}`,
      ...(cyclic[0] === undefined ? {} : { nodeId: cyclic[0] }),
    })
  }
  return Object.freeze(order)
}

function validateOutputsAndReachability(
  workflow: MediaWorkflow,
  nodes: ReadonlyMap<WorkflowNodeId, MediaWorkflowNode>,
  edges: readonly MediaWorkflowEdge[],
  diagnostics: MediaWorkflowDiagnostic[],
): void {
  if (workflow.outputNodeIds.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'MEDIA_WORKFLOW_NO_OUTPUT',
      message: 'Workflow must declare at least one output node before execution',
    })
    return
  }
  const upstream = new Map<WorkflowNodeId, WorkflowNodeId[]>()
  for (const edge of edges) {
    const list = upstream.get(edge.targetNodeId) ?? []
    list.push(edge.sourceNodeId)
    upstream.set(edge.targetNodeId, list)
  }
  const reachable = new Set<WorkflowNodeId>()
  const stack = [...workflow.outputNodeIds].filter(nodeId => nodes.has(nodeId))
  while (stack.length > 0) {
    const nodeId = stack.pop()!
    if (reachable.has(nodeId)) continue
    reachable.add(nodeId)
    for (const source of upstream.get(nodeId) ?? []) stack.push(source)
  }
  for (const node of nodes.values()) {
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
 * Validate static workflow execution semantics using the active definition registry.
 * @param workflow - semantic workflow to inspect.
 * @param registry - active exact-version node-definition registry.
 * @returns diagnostics plus node-id-stable topology when acyclic.
 */
export function validateMediaWorkflow(workflow: MediaWorkflow, registry: MediaNodeRegistry): MediaWorkflowValidationResult {
  const diagnostics: MediaWorkflowDiagnostic[] = []
  const structure = structuralIndex(workflow, diagnostics)
  const definitions = definitionMap(structure.nodes, registry, diagnostics)
  validatePorts(structure.nodes, structure.edges, definitions, diagnostics)
  const topologicalNodeIds = topologicalOrder(structure.nodes, structure.edges, diagnostics)
  validateOutputsAndReachability(workflow, structure.nodes, structure.edges, diagnostics)
  return Object.freeze({
    valid: diagnostics.every(item => item.severity !== 'error'),
    diagnostics: Object.freeze(diagnostics),
    topologicalNodeIds,
  })
}

/**
 * Validate a workflow and capture the exact active definitions needed by scheduler/executor code.
 * @param workflow - semantic workflow to validate.
 * @param registry - active exact-version node-definition registry.
 * @returns validated workflow, definition map, and deterministic topology.
 * @throws MediaWorkflowValidationError when any blocking diagnostic exists.
 */
export function assertValidMediaWorkflow(workflow: MediaWorkflow, registry: MediaNodeRegistry): ValidatedMediaWorkflow {
  const result = validateMediaWorkflow(workflow, registry)
  const errors = result.diagnostics.filter(item => item.severity === 'error')
  if (errors.length > 0) throw new MediaWorkflowValidationError(errors)
  const definitions = new Map<WorkflowNodeId, MediaNodeDefinition>()
  for (const node of workflow.nodes) {
    definitions.set(node.id, registry.require({ type: node.type, version: node.nodeVersion ?? 1 }))
  }
  return Object.freeze({ workflow, definitions, topologicalNodeIds: result.topologicalNodeIds })
}
