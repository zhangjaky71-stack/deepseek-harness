/** Request-scoped Canvas selection/focus vocabulary. Types only; never durable Canvas state. */

import type {
  CanvasAssetRef,
  CanvasId,
  CanvasRunId,
  MediaWorkflowId,
  WorkflowEdgeId,
  WorkflowNodeId,
} from './types.ts'

/** Normalized image/video region selected by the browser for deictic references such as “here”. */
export interface CanvasRegionSelection {
  /** Durable source asset the region belongs to. */
  readonly asset: CanvasAssetRef
  /** Optional normalized [0,1] rectangle in source-media coordinates. */
  readonly normalizedBounds?: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  /** Optional durable mask asset when a later editor creates one. */
  readonly maskAsset?: CanvasAssetRef
}

/**
 * One send-time browser snapshot used only by the next Agent turn.
 * It is not Workflow state, Session Projection state, or a long-lived Canvas mutation.
 */
export interface CanvasInteractionContext {
  /** Canvas identity observed by the browser when the prompt was sent. */
  readonly canvasId: CanvasId
  /** Semantic workflow identity observed by the browser. */
  readonly workflowId: MediaWorkflowId
  /** Required compare point so the Agent can detect stale deictic context. */
  readonly workflowRevision: number
  /** Browser presentation mode at send time. */
  readonly mode?: 'minimal' | 'editor'
  /** Editor node selection at send time. */
  readonly selectedNodeIds?: readonly WorkflowNodeId[]
  /** Editor edge selection at send time. */
  readonly selectedEdgeIds?: readonly WorkflowEdgeId[]
  /** Selected/focused durable media references at send time. */
  readonly selectedAssetRefs?: readonly CanvasAssetRef[]
  /** Minimal/Editor current-output candidate focus. */
  readonly focusedOutput?: {
    readonly runId: CanvasRunId
    readonly assetIndex: number
  }
  /** Optional region/mask seam for “here” style instructions. */
  readonly region?: CanvasRegionSelection
}

/** Host-side interpretation facts attached to the rendered turn context. */
export interface ResolvedCanvasInteractionContext {
  readonly context: CanvasInteractionContext
  /** Host workflow revision observed during prompt admission. */
  readonly currentWorkflowRevision: number
  /** Whether browser selection was sampled from an older workflow revision. */
  readonly stale: boolean
}
