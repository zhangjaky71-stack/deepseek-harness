/** Client-safe Canvas projection, Remote DTO, layout-write, bounded-history, interaction-context, and capability types. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  CanvasId,
  CurrentCanvasLayoutSnapshot,
  CanvasRunHistoryEntry,
  CanvasRunId,
  MediaWorkflowId,
  WorkflowNodeId,
  WorkflowRef,
} from './types.ts'

export type * from './types.ts'
export type * from './interaction-types.ts'
export type * from './feature-types.ts'

/** Opaque cursor over a stable Session-event boundary in one Canvas generation's run history. */
export type CanvasHistoryCursor = Branded<'CanvasHistoryCursor'>

/** Browser/editor layout payload committed on drag-end or viewport save. */
export interface SaveCanvasLayoutRequest {
  /** Canvas generation fence; stale tabs from a cleared/re-created Canvas cannot write through it. */
  readonly canvasId: CanvasId
  readonly workflowId: MediaWorkflowId
  /** Independent layout CAS token; semantic workflowRevision is intentionally not reused. */
  readonly expectedLayoutRevision: number
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
  | 'CANVAS_LAYOUT_CANVAS_MISMATCH'
  | 'CANVAS_LAYOUT_WORKFLOW_MISMATCH'
  | 'CANVAS_STALE_LAYOUT_REVISION'

/** Actual callable methods in the current Canvas Browser Remote namespace. */
export type CanvasRemoteMethodName =
  | 'editWorkflow'
  | 'replaceWorkflow'
  | 'selectOutput'
  | 'clear'
  | 'saveLayout'
  | 'listRuns'
  | 'getRun'

export interface CanvasWorkflowMutationReceipt {
  readonly ref: WorkflowRef
}

export interface CanvasOutputSelectionReceipt {
  readonly runId: CanvasRunId
  readonly primaryAssetIndex: number
}

/** Small acknowledgement for a committed editor-layout save. */
export interface CanvasLayoutMutationReceipt {
  readonly canvasId: CanvasId
  readonly workflowId: MediaWorkflowId
  readonly layoutRevision: number
  readonly updatedAt: number
}

export interface CanvasClearReceipt {
  readonly canvasId: CanvasId
}

/** Bounded run-history query scoped to one durable Canvas generation. */
export interface ListCanvasRunsRequest {
  readonly canvasId: CanvasId
  readonly cursor?: CanvasHistoryCursor
  readonly limit?: number
}

export interface CanvasRunHistoryPage {
  readonly items: readonly CanvasRunHistoryEntry[]
  readonly nextCursor?: CanvasHistoryCursor
}

/** Exact run-history lookup scoped to one durable Canvas generation. */
export interface GetCanvasRunRequest {
  readonly canvasId: CanvasId
  readonly runId: CanvasRunId
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Whole current Canvas state, or null before create/after clear. */
    canvas: import('./types.ts').CanvasSnapshot | null
    /** Current-generation editor layout with an independent CAS revision. */
    canvasLayout: CurrentCanvasLayoutSnapshot | null
  }
}
