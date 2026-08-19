/** Pure Canvas UI-state projection over the domain-owned product-state function. */

import { deriveCanvasProductState } from '@deepseek-ai/dsh-canvas/client'
import type { CanvasPresentation, CanvasPresentationInput, CanvasPrimaryAction } from '../types.ts'

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

/**
 * Derive the complete N07 presentation model from the authoritative Canvas projection.
 * No UI-owned business state is introduced here.
 */
export function deriveCanvasPresentation(canvas: CanvasPresentationInput): CanvasPresentation {
  const state = deriveCanvasProductState(canvas)
  return {
    state,
    primaryAction: canvasPrimaryAction(state),
    showOutput: canvas?.output !== null && canvas?.output !== undefined,
    staleOutput: state === 'DIRTY_READY',
  }
}
