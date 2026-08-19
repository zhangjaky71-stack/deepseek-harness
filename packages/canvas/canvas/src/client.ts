/** Client-safe Canvas projection and layout-write types. */

import type {
  CanvasLayoutSnapshot,
  CanvasSnapshot,
  MediaWorkflowId,
  WorkflowNodeId,
} from './types.ts'

export type * from './types.ts'

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

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Whole current Canvas state, or null before create/after clear. */
    canvas: CanvasSnapshot | null
    /** Latest independently persisted editor layout, or null before the first save. */
    canvasLayout: CanvasLayoutSnapshot | null
  }
}
