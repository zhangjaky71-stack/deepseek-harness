/** Renderer-neutral workflow/layout adapter. No renderer JSON crosses this module. */

import type {
  CanvasLayoutSnapshot,
  MediaWorkflow,
  WorkflowEdgeId,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/client'

/** Minimal node currency a graph renderer can consume. */
export interface CanvasFlowNode {
  readonly id: WorkflowNodeId
  readonly type: string
  readonly nodeVersion?: number
  readonly label: string
  readonly position: { readonly x: number; readonly y: number }
}

/** Minimal edge currency a graph renderer can consume. */
export interface CanvasFlowEdge {
  readonly id: WorkflowEdgeId
  readonly source: WorkflowNodeId
  readonly sourcePort: string
  readonly target: WorkflowNodeId
  readonly targetPort: string
}

/** Renderer-neutral projection of semantic workflow plus independent layout. */
export interface CanvasFlowModel {
  readonly nodes: readonly CanvasFlowNode[]
  readonly edges: readonly CanvasFlowEdge[]
}

/** Convert Domain workflow/layout into the graph renderer boundary. */
export function toCanvasFlow(
  workflow: MediaWorkflow,
  layout: CanvasLayoutSnapshot | null | undefined,
  localPositions: Readonly<Record<string, { readonly x: number; readonly y: number }>> = {},
): CanvasFlowModel {
  const nodes = workflow.nodes.map((node, index) => {
    const persisted = layout?.nodePositions[node.id]
    const local = localPositions[String(node.id)]
    return {
      id: node.id,
      type: String(node.type),
      ...(node.nodeVersion === undefined ? {} : { nodeVersion: node.nodeVersion }),
      label: node.name?.trim() || String(node.type),
      position: local ?? persisted ?? defaultPosition(index),
    }
  })
  const edges = workflow.edges.map(edge => ({
    id: edge.id,
    source: edge.sourceNodeId,
    sourcePort: edge.sourcePort,
    target: edge.targetNodeId,
    targetPort: edge.targetPort,
  }))
  return { nodes, edges }
}

/** Merge local drag positions onto the latest persisted layout request payload. */
export function mergedLayoutPositions(
  workflow: MediaWorkflow,
  layout: CanvasLayoutSnapshot | null | undefined,
  localPositions: Readonly<Record<string, { readonly x: number; readonly y: number }>>,
): Readonly<Record<WorkflowNodeId, { readonly x: number; readonly y: number }>> {
  const output: Record<string, { x: number; y: number }> = {}
  for (const [index, node] of workflow.nodes.entries()) {
    output[String(node.id)] = {
      ...(layout?.nodePositions[node.id] ?? defaultPosition(index)),
      ...(localPositions[String(node.id)] ?? {}),
    }
  }
  return output as Readonly<Record<WorkflowNodeId, { readonly x: number; readonly y: number }>>
}

function defaultPosition(index: number): { x: number; y: number } {
  const column = index % 4
  const row = Math.floor(index / 4)
  return { x: 36 + column * 220, y: 36 + row * 132 }
}
