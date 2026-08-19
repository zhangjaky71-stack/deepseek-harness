/** Client-safe Canvas projection, Remote DTO, layout-write, bounded-history types, and pure product-state derivation. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  CanvasId,
  CanvasLayoutSnapshot,
  CanvasRunHistoryEntry,
  CanvasRunId,
  MediaWorkflowId,
  WorkflowNodeId,
  WorkflowRef,
} from './types.ts'

export type * from './types.ts'
export { deriveCanvasProductState } from './domain.ts'

/** Opaque cursor over a stable Session-event boundary in Canvas run history. */
export type CanvasHistoryCursor = Branded<'CanvasHistoryCursor'>

/** Browser/editor layout payload committed on drag-end or viewport save. */
export interface SaveCanvasLayoutRequest {
  readonly workflowId: MediaWorkflowId
  readonly nodePositions: Readonly<Record<WorkflowNodeId, { readonly x: number; readonly y: number }>>
  readonly viewport?: {
    readonly x: number
    readonly y: number
    readonly zoom: number
  }
}

/** Stable layout-write failures. */
export type CanvasLayoutErrorCode =
  | 'CANVAS_INVALID_LAYOUT'
  | 'CANVAS_LAYOUT_WORKFLOW_MISMATCH'

/** Stable wire names reserved for the Canvas Browser mutation/query namespace. */
export type CanvasRemoteMethodName =
  | 'editWorkflow'
  | 'replaceWorkflow'
  | 'createVariant'
  | 'restoreWorkflow'
  | 'selectOutput'
  | 'run'
  | 'cancel'
  | 'clear'
  | 'saveLayout'
  | 'listRuns'
  | 'getRun'

/** Small acknowledgement for a committed semantic workflow mutation. */
export interface CanvasWorkflowMutationReceipt {
  readonly ref: WorkflowRef
}

/** Small acknowledgement for a committed primary-output selection. */
export interface CanvasOutputSelectionReceipt {
  readonly runId: CanvasRunId
  readonly primaryAssetIndex: number
}

/** Small acknowledgement for a committed editor-layout save. */
export interface CanvasLayoutMutationReceipt {
  readonly workflowId: MediaWorkflowId
  readonly updatedAt: number
}

/** Small acknowledgement for a committed Canvas clear tombstone. */
export interface CanvasClearReceipt {
  readonly canvasId: CanvasId
}

/** Cursor-paged run-history query. Omitted limit resolves to the Host default. */
export interface ListCanvasRunsRequest {
  readonly cursor?: CanvasHistoryCursor
  readonly limit?: number
}

/** Bounded run-history page derived from Session events rather than a second store. */
export interface CanvasRunHistoryPage {
  readonly items: readonly CanvasRunHistoryEntry[]
  readonly nextCursor?: CanvasHistoryCursor
}

/** Exact run-history query. */
export interface GetCanvasRunRequest {
  readonly runId: CanvasRunId
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Whole current Canvas state, or null before create/after clear. */
    canvas: import('./types.ts').CanvasSnapshot | null
    /** Latest independently persisted editor layout, or null before the first save. */
    canvasLayout: CanvasLayoutSnapshot | null
  }
}
