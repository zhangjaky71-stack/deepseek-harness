/** Pure Canvas UI-state projection over the domain-owned product-state rules. */

import type { CanvasProductState } from '@deepseek-ai/dsh-canvas/client'
import type { CanvasPresentation, CanvasPresentationInput, CanvasPrimaryAction } from '../types.ts'

/**
 * Client-side isomorphic copy of N01 `deriveCanvasProductState`.
 * Kept here rather than value-importing the Host-domain package into the browser bundle.
 */
export function deriveCanvasViewProductState(canvas: CanvasPresentationInput): CanvasProductState {
  if (canvas === null || canvas.workflow === null) return 'EMPTY'
  const run = canvas.run
  if (run?.status === 'queued' || run?.status === 'running') return 'RUNNING'
  const currentRun = run !== null
    && run.workflowId === canvas.workflow.id
    && run.workflowRevision === canvas.workflowRevision
  if (currentRun) {
    if (run.status === 'failed') return 'FAILED'
    if (run.status === 'cancelled') return 'CANCELLED'
    if (run.status === 'interrupted') return 'INTERRUPTED'
    if (run.status === 'completed') return 'COMPLETED'
  }
  if (canvas.output !== null) {
    return canvas.output.workflowRevision === canvas.workflowRevision ? 'COMPLETED' : 'DIRTY_READY'
  }
  return 'READY'
}

/** Map one domain product state to the only primary control the shell may show. */
export function canvasPrimaryAction(state: CanvasPresentation['state']): CanvasPrimaryAction {
  switch (state) {
    case 'EMPTY': return 'none'
    case 'READY': return 'run'
    case 'DIRTY_READY': return 'run'
    case 'RUNNING': return 'cancel'
    case 'COMPLETED': return 'run'
    case 'FAILED': return 'retry'
    case 'CANCELLED': return 'retry'
    case 'INTERRUPTED': return 'retry'
  }
}

/** Derive the complete N07 presentation model from the authoritative Canvas projection. */
export function deriveCanvasPresentation(canvas: CanvasPresentationInput): CanvasPresentation {
  const state = deriveCanvasViewProductState(canvas)
  return {
    state,
    primaryAction: canvasPrimaryAction(state),
    showOutput: canvas?.output !== null && canvas?.output !== undefined,
    staleOutput: state === 'DIRTY_READY',
  }
}
