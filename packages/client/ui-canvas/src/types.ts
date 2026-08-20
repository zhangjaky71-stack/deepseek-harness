/** Browser-local Canvas UI vocabulary. Types only. */

import type { CanvasProductState, CanvasSnapshot } from '@deepseek-ai/dsh-canvas/client'
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

/** Session-bound UI-local mode face injected into the Canvas conversation view. */
export interface CanvasViewInjected {
  readonly hooks: {
    readonly mode: SnapshotStore<CanvasMode>
  }
  readonly setMode: (mode: CanvasMode) => void
}

/** Narrow input accepted by presentation helpers and tests. */
export type CanvasPresentationInput = CanvasSnapshot | null
