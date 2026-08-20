/** Browser-local Canvas UI vocabulary. Types only. */

import type {
  CanvasAssetRef,
  CanvasCapabilities,
  CanvasId,
  CanvasProductState,
  CanvasRegionSelection,
  CanvasRunId,
  CanvasSnapshot,
  MediaWorkflowId,
  WorkflowEdgeId,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Canvas presentation preference. Never persisted into Session state. */
export type CanvasMode = 'minimal' | 'editor'

/** Save-status skeleton owned by N07 and expanded by the draft/autosave node. */
export type CanvasSaveStatus = 'saved' | 'saving' | 'error'

/** Primary control selected from the authoritative Canvas product state. */
export type CanvasPrimaryAction = 'none' | 'run' | 'retry' | 'cancel'

/** Product-state presentation derived without creating a second state machine. */
export interface CanvasPresentation {
  readonly state: CanvasProductState
  readonly primaryAction: CanvasPrimaryAction
  readonly showOutput: boolean
  readonly staleOutput: boolean
}

/** Semantic revision at which the current browser selection was made. */
export interface CanvasInteractionAnchor {
  readonly canvasId: CanvasId
  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number
}

/** Per-session browser-local selection/focus state; never a Session Projection. */
export interface CanvasInteractionSelection {
  readonly anchor?: CanvasInteractionAnchor
  readonly selectedNodeIds: readonly WorkflowNodeId[]
  readonly selectedEdgeIds: readonly WorkflowEdgeId[]
  readonly selectedAssetRefs: readonly CanvasAssetRef[]
  readonly focusedOutput?: {
    readonly runId: CanvasRunId
    readonly assetIndex: number
  }
  readonly region?: CanvasRegionSelection
}

/** Mutations exposed to the Canvas view without handing it the store implementation. */
export interface CanvasInteractionActions {
  readonly selectNode: (canvas: CanvasSnapshot, nodeId: WorkflowNodeId) => void
  readonly selectEdge: (canvas: CanvasSnapshot, edgeId: WorkflowEdgeId) => void
  readonly selectOutput: (canvas: CanvasSnapshot, assetIndex: number) => void
  readonly setRegion: (canvas: CanvasSnapshot, region: CanvasRegionSelection) => void
  readonly clearSelection: () => void
}

/** Session-bound UI-local faces injected into the Canvas conversation view. */
export interface CanvasViewInjected extends CanvasInteractionActions {
  /** Effective Host deployment capabilities sampled when the view registration is created. */
  readonly capabilities: CanvasCapabilities
  readonly hooks: {
    readonly mode: SnapshotStore<CanvasMode>
    readonly interaction: SnapshotStore<CanvasInteractionSelection>
  }
  readonly setMode: (mode: CanvasMode) => void
}

/** Narrow input accepted by presentation helpers and tests. */
export type CanvasPresentationInput = CanvasSnapshot | null
