/** Pure editor Draft, command, clipboard, and atomic-operation helpers. */

import type {
  CanvasJsonValue,
  CanvasLayoutSnapshot,
  CanvasSnapshot,
  MediaWorkflow,
  MediaWorkflowEdge,
  MediaWorkflowNode,
  WorkflowEditOperation,
  WorkflowEdgeId,
  WorkflowNodeId,
  WorkflowRef,
} from '@deepseek-ai/dsh-canvas/client'

/** Inspector-local draft for exactly one semantic node. */
export interface CanvasNodeDraft {
  readonly nodeId: WorkflowNodeId
  readonly baseWorkflowRevision: number
  readonly originalName?: string
  readonly originalConfig: Readonly<Record<string, CanvasJsonValue>>
  readonly nameText: string
  readonly configText: string
  readonly dirty: boolean
}

/** One undoable semantic command. Full workflow snapshots never enter this structure. */
export interface CanvasEditorCommand {
  readonly id: string
  readonly label: string
  readonly forward: readonly WorkflowEditOperation[]
  readonly inverse: readonly WorkflowEditOperation[]
}

/** Browser-local copied subgraph. It is not Session state. */
export interface CanvasClipboard {
  readonly nodes: readonly MediaWorkflowNode[]
  readonly edges: readonly MediaWorkflowEdge[]
  readonly positions: Readonly<Record<string, { readonly x: number; readonly y: number }>>
}

/** Paste result: one atomic semantic batch plus local layout positions for the new nodes. */
export interface CanvasPastePlan {
  readonly operations: readonly WorkflowEditOperation[]
  readonly nodeIds: readonly WorkflowNodeId[]
  readonly positions: Readonly<Record<string, { readonly x: number; readonly y: number }>>
}

/** Stable CAS ref read from the authoritative current projection immediately before a write. */
export function workflowRefOf(canvas: CanvasSnapshot): WorkflowRef | undefined {
  if (canvas.workflow === null) return undefined
  return {
    canvasId: canvas.id,
    workflowId: canvas.workflow.id,
    workflowRevision: canvas.workflowRevision,
  }
}

/** Create an Inspector draft from the current authoritative workflow. */
export function createNodeDraft(canvas: CanvasSnapshot, nodeId: WorkflowNodeId): CanvasNodeDraft | undefined {
  const node = canvas.workflow?.nodes.find(candidate => candidate.id === nodeId)
  if (node === undefined) return undefined
  return {
    nodeId,
    baseWorkflowRevision: canvas.workflowRevision,
    ...(node.name === undefined ? {} : { originalName: node.name }),
    originalConfig: structuredClone(node.config),
    nameText: node.name ?? '',
    configText: JSON.stringify(node.config, null, 2),
    dirty: false,
  }
}

/** Parse a JSON-object config from an Inspector textarea. */
export function parseNodeConfig(text: string): Readonly<Record<string, CanvasJsonValue>> {
  const parsed: unknown = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('节点配置必须是 JSON 对象')
  }
  assertJson(parsed, 'config')
  return parsed as Readonly<Record<string, CanvasJsonValue>>
}

/** Convert a dirty node Draft into the smallest atomic operation batch. */
export function nodeDraftOperations(workflow: MediaWorkflow, draft: CanvasNodeDraft): readonly WorkflowEditOperation[] {
  const node = workflow.nodes.find(candidate => candidate.id === draft.nodeId)
  if (node === undefined) throw new Error(`节点 ${draft.nodeId} 已不存在`)
  const operations: WorkflowEditOperation[] = []
  const nextName = draft.nameText.trim()
  const currentName = node.name ?? ''
  if (nextName !== currentName) operations.push({ op: 'rename-node', nodeId: node.id, name: nextName })
  const nextConfig = parseNodeConfig(draft.configText)
  if (JSON.stringify(nextConfig) !== JSON.stringify(node.config)) {
    operations.push({ op: 'replace-node-config', nodeId: node.id, config: nextConfig })
  }
  return operations
}

/** Build an undoable command by deriving inverse operations against the authoritative workflow. */
export function commandFor(
  workflow: MediaWorkflow,
  label: string,
  forward: readonly WorkflowEditOperation[],
  id = editorId('cmd'),
): CanvasEditorCommand {
  if (forward.length === 0) throw new Error('编辑命令不能为空')
  return { id, label, forward: structuredClone(forward), inverse: inverseOperations(workflow, forward) }
}

/** Copy selected nodes and only edges whose endpoints are both selected. */
export function copySelection(
  workflow: MediaWorkflow,
  nodeIds: readonly WorkflowNodeId[],
  layout: CanvasLayoutSnapshot | null | undefined,
): CanvasClipboard | undefined {
  const selected = new Set(nodeIds.map(String))
  if (selected.size === 0) return undefined
  const nodes = workflow.nodes.filter(node => selected.has(String(node.id))).map(node => structuredClone(node))
  if (nodes.length === 0) return undefined
  const edges = workflow.edges
    .filter(edge => selected.has(String(edge.sourceNodeId)) && selected.has(String(edge.targetNodeId)))
    .map(edge => ({ ...edge }))
  const positions: Record<string, { x: number; y: number }> = {}
  for (const node of nodes) {
    const position = layout?.nodePositions[node.id]
    if (position !== undefined) positions[String(node.id)] = { ...position }
  }
  return { nodes, edges, positions }
}

/** Build one atomic paste batch with fresh opaque node/edge identities. */
export function pasteClipboard(clipboard: CanvasClipboard, offset = 36): CanvasPastePlan {
  const nodeIds = new Map<string, WorkflowNodeId>()
  const operations: WorkflowEditOperation[] = []
  const positions: Record<string, { x: number; y: number }> = {}
  const pasted: WorkflowNodeId[] = []
  for (const source of clipboard.nodes) {
    const id = editorId('node') as WorkflowNodeId
    nodeIds.set(String(source.id), id)
    pasted.push(id)
    operations.push({ op: 'add-node', node: { ...structuredClone(source), id } })
    const position = clipboard.positions[String(source.id)]
    if (position !== undefined) positions[String(id)] = { x: position.x + offset, y: position.y + offset }
  }
  for (const source of clipboard.edges) {
    const sourceNodeId = nodeIds.get(String(source.sourceNodeId))
    const targetNodeId = nodeIds.get(String(source.targetNodeId))
    if (sourceNodeId === undefined || targetNodeId === undefined) continue
    operations.push({
      op: 'connect',
      edge: {
        ...source,
        id: editorId('edge') as WorkflowEdgeId,
        sourceNodeId,
        targetNodeId,
      },
    })
  }
  return { operations, nodeIds: pasted, positions }
}

/** Build a valid atomic delete batch: disconnect first, remove nodes, then repair output selection. */
export function deleteSelectionOperations(
  workflow: MediaWorkflow,
  nodeIds: readonly WorkflowNodeId[],
  edgeIds: readonly WorkflowEdgeId[],
): readonly WorkflowEditOperation[] {
  const nodes = new Set(nodeIds.map(String))
  const explicitEdges = new Set(edgeIds.map(String))
  const disconnected = workflow.edges.filter(edge =>
    explicitEdges.has(String(edge.id))
    || nodes.has(String(edge.sourceNodeId))
    || nodes.has(String(edge.targetNodeId)),
  )
  const operations: WorkflowEditOperation[] = disconnected.map(edge => ({ op: 'disconnect', edgeId: edge.id }))
  for (const node of workflow.nodes) if (nodes.has(String(node.id))) operations.push({ op: 'remove-node', nodeId: node.id })
  const nextOutputs = workflow.outputNodeIds.filter(nodeId => !nodes.has(String(nodeId)))
  if (nextOutputs.length !== workflow.outputNodeIds.length) operations.push({ op: 'set-output-nodes', nodeIds: nextOutputs })
  return operations
}

function inverseOperations(workflow: MediaWorkflow, operations: readonly WorkflowEditOperation[]): readonly WorkflowEditOperation[] {
  let name = workflow.name
  const nodes = workflow.nodes.map(node => structuredClone(node))
  const edges = workflow.edges.map(edge => ({ ...edge }))
  let outputs = [...workflow.outputNodeIds]
  const inverse: WorkflowEditOperation[] = []
  const prepend = (operation: WorkflowEditOperation): void => { inverse.unshift(operation) }

  for (const operation of operations) {
    switch (operation.op) {
      case 'add-node':
        nodes.push(structuredClone(operation.node))
        prepend({ op: 'remove-node', nodeId: operation.node.id })
        break
      case 'remove-node': {
        const index = nodes.findIndex(node => node.id === operation.nodeId)
        if (index < 0) throw new Error(`节点 ${operation.nodeId} 已不存在`)
        const [removed] = nodes.splice(index, 1)
        prepend({ op: 'add-node', node: removed! })
        break
      }
      case 'replace-node-config': {
        const index = nodes.findIndex(node => node.id === operation.nodeId)
        if (index < 0) throw new Error(`节点 ${operation.nodeId} 已不存在`)
        const current = nodes[index]!
        prepend({ op: 'replace-node-config', nodeId: current.id, config: structuredClone(current.config) })
        nodes[index] = { ...current, config: structuredClone(operation.config) }
        break
      }
      case 'rename-node': {
        const index = nodes.findIndex(node => node.id === operation.nodeId)
        if (index < 0) throw new Error(`节点 ${operation.nodeId} 已不存在`)
        const current = nodes[index]!
        // The V1 wire operation cannot represent an absent optional name. Empty
        // string is the reversible UI-equivalent until the Host op gains clear-name.
        prepend({ op: 'rename-node', nodeId: current.id, name: current.name ?? '' })
        nodes[index] = { ...current, name: operation.name }
        break
      }
      case 'connect':
        edges.push({ ...operation.edge })
        prepend({ op: 'disconnect', edgeId: operation.edge.id })
        break
      case 'disconnect': {
        const index = edges.findIndex(edge => edge.id === operation.edgeId)
        if (index < 0) throw new Error(`连线 ${operation.edgeId} 已不存在`)
        const [removed] = edges.splice(index, 1)
        prepend({ op: 'connect', edge: removed! })
        break
      }
      case 'set-output-nodes': {
        const previous = outputs
        outputs = [...operation.nodeIds]
        prepend({ op: 'set-output-nodes', nodeIds: previous })
        break
      }
      case 'rename-workflow': {
        const previous = name
        name = operation.name
        prepend({ op: 'rename-workflow', name: previous })
        break
      }
      default:
        operation satisfies never
    }
  }
  return inverse
}

function editorId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${id}`
}

function assertJson(value: unknown, path: string, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} 不能包含非有限数字`)
    return
  }
  if (typeof value !== 'object') throw new Error(`${path} 不是 JSON 值`)
  if (ancestors.has(value)) throw new Error(`${path} 不能包含循环引用`)
  const next = new Set(ancestors)
  next.add(value)
  if (Array.isArray(value)) {
    value.forEach((item, index) => { assertJson(item, `${path}[${index}]`, next) })
    return
  }
  for (const [key, item] of Object.entries(value)) assertJson(item, `${path}.${key}`, next)
}
