/** Durable Canvas event vocabulary owned by the Host-side Canvas package. */

import type { CanvasSnapshot } from './types.ts'

/** Canvas mutations currently committed as full post-change snapshots. */
export type CanvasOperation =
  | 'create'
  | 'workflow-edit'
  | 'workflow-replace'
  | 'run-start'
  | 'run-complete'
  | 'output-select'
  | 'clear'

/** Versioned metadata seam; actor/audit fields are added by N04. */
export interface CanvasChangeMeta {
  readonly schemaVersion: 1
}

/** Full post-mutation Canvas snapshot, or a null tombstone after clear. */
export interface CanvasChange {
  readonly kind: 'canvas/change'
  readonly version: 1
  readonly operation: CanvasOperation
  readonly canvas: CanvasSnapshot | null
  readonly meta: CanvasChangeMeta
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Complete post-mutation Canvas state. `clear` carries `canvas: null`.
     * @param data - versioned Canvas mutation and its complete post-change snapshot.
     * @mode append
     */
    'canvas/change': CanvasChange
  }
}
