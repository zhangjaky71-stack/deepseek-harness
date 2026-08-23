/** Browser-local monotonic layout CAS token, scoped to one Canvas/workflow generation. */

import type { CanvasId, MediaWorkflowId } from '@deepseek-ai/dsh-canvas/client'

export interface CanvasLayoutRevisionClock {
  readonly canvasId: CanvasId
  readonly workflowId: MediaWorkflowId
  readonly revision: number
}

/**
 * Reconcile a projected layout revision into the local CAS token.
 * A new Canvas/workflow generation resets the token; within one generation a
 * delayed Projection may never move a receipt-advanced token backwards.
 */
export function reconcileProjectedLayoutRevision(
  current: CanvasLayoutRevisionClock,
  canvasId: CanvasId,
  workflowId: MediaWorkflowId,
  projectedRevision: number,
): CanvasLayoutRevisionClock {
  if (current.canvasId !== canvasId || current.workflowId !== workflowId) {
    return { canvasId, workflowId, revision: projectedRevision }
  }
  if (projectedRevision <= current.revision) return current
  return { canvasId, workflowId, revision: projectedRevision }
}

/**
 * Advance from a successful Host receipt only while its originating generation
 * is still current. A late receipt from a cleared/re-created Canvas is ignored.
 */
export function reconcileLayoutReceipt(
  current: CanvasLayoutRevisionClock,
  canvasId: CanvasId,
  workflowId: MediaWorkflowId,
  committedRevision: number,
): CanvasLayoutRevisionClock {
  if (current.canvasId !== canvasId || current.workflowId !== workflowId) return current
  if (committedRevision <= current.revision) return current
  return { canvasId, workflowId, revision: committedRevision }
}
