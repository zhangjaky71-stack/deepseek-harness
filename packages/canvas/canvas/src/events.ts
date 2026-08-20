/** Durable Canvas event vocabulary owned by the Host-side Canvas package. */

import type { CanvasAccessContext, CanvasSnapshot } from './types.ts'

/**
 * Canvas mutations currently committed as full post-change snapshots.
 * `run-complete` is retained for historical N03 replay; current writers use
 * `run-update` for queued/running/terminal lifecycle changes.
 */
export type CanvasOperation =
  | 'create'
  | 'workflow-edit'
  | 'workflow-replace'
  | 'run-start'
  | 'run-update'
  | 'run-complete'
  | 'output-select'
  | 'clear'

/** Historical N03 metadata shape kept readable without inventing an actor retroactively. */
export interface CanvasChangeMetaV1 {
  readonly schemaVersion: 1
}

/** Current audit metadata recorded by every CanvasService mutation. */
export interface CanvasChangeMetaV2 extends CanvasAccessContext {
  readonly schemaVersion: 2
}

/** Versioned Canvas mutation audit metadata. Historical replay accepts v1; current Host writes use v2. */
export type CanvasChangeMeta = CanvasChangeMetaV1 | CanvasChangeMetaV2

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
     * @param data - versioned Canvas mutation, complete post-change snapshot, and Host audit metadata.
     * @mode append
     */
    'canvas/change': CanvasChange
  }
}
