/** Browser-local Canvas UI vocabulary. Types only. */

import type {
  CanvasAssetRef,
  CanvasCapabilities,
  CanvasId,
  CanvasNodeCatalogEntry,
  CanvasProductState,
  CanvasRegionSelection,
  CanvasRunId,
  CanvasSnapshot,
  MediaWorkflowId,
  SaveCanvasLayoutRequest,
  WorkflowEditOperation,
  WorkflowEdgeId,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

export type CanvasMode = 'minimal' | 'editor'
export type CanvasSaveStatus = 'saved' | 'saving' | 'conflict' | 'offline' | 'save-failed'
export type CanvasPrimaryAction = 'none' | 'run' | 'retry' | 'cancel'

export interface CanvasPresentation {
  readonly state: CanvasProductState
  readonly primaryAction: CanvasPrimaryAction
  readonly showOutput: boolean
  readonly staleOutput: boolean
}
export interface CanvasInteractionAnchor {
  readonly canvasId: CanvasId
  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number
}
export interface CanvasInteractionSelection {
  readonly anchor?: CanvasInteractionAnchor
  readonly selectedNodeIds: readonly WorkflowNodeId[]
  readonly selectedEdgeIds: readonly WorkflowEdgeId[]
  readonly selectedAssetRefs: readonly CanvasAssetRef[]
  readonly focusedOutput?: { readonly runId: CanvasRunId; readonly assetIndex: number }
  readonly region?: CanvasRegionSelection
}
export type CanvasWorkflowWriteResult =
  | { readonly ok: true; readonly workflowRevision: number }
  | { readonly ok: false; readonly status: 'conflict' | 'offline' | 'save-failed'; readonly message: string }
export type CanvasLayoutWriteResult =
  | { readonly ok: true; readonly layoutRevision: number }
  | { readonly ok: false; readonly status: 'conflict' | 'offline' | 'save-failed'; readonly message: string }

export interface CanvasInteractionActions {
  readonly selectNode: (canvas: CanvasSnapshot, nodeId: WorkflowNodeId) => void
  readonly selectNodes: (canvas: CanvasSnapshot, nodeIds: readonly WorkflowNodeId[]) => void
  readonly selectEdge: (canvas: CanvasSnapshot, edgeId: WorkflowEdgeId) => void
  readonly selectEdges: (canvas: CanvasSnapshot, edgeIds: readonly WorkflowEdgeId[]) => void
  readonly selectOutput: (canvas: CanvasSnapshot, assetIndex: number) => void
  readonly setRegion: (canvas: CanvasSnapshot, region: CanvasRegionSelection) => void
  readonly clearSelection: () => void
}
export interface CanvasViewInjected extends CanvasInteractionActions {
  readonly capabilities: CanvasCapabilities
  readonly nodeCatalog: readonly CanvasNodeCatalogEntry[]
  readonly hooks: {
    readonly mode: SnapshotStore<CanvasMode>
    readonly interaction: SnapshotStore<CanvasInteractionSelection>
  }
  readonly setMode: (mode: CanvasMode) => void
  readonly commitOperations: (operations: readonly WorkflowEditOperation[], expectedWorkflowRevision: number) => Promise<CanvasWorkflowWriteResult>
  readonly saveLayout: (request: SaveCanvasLayoutRequest) => Promise<CanvasLayoutWriteResult>
}
export type CanvasPresentationInput = CanvasSnapshot | null
