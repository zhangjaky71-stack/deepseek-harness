/** Per-session browser-local Minimal/Editor mode store. */

import type { SessionId, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { CanvasMode } from '../types.ts'

interface ModeRow {
  mode: CanvasMode
  readonly listeners: Set<() => void>
  readonly face: SnapshotStore<CanvasMode>
}

/**
 * UI-local mode ledger. It has no Session, Remote, persistence, or Canvas mutation dependency.
 * The first mode is Minimal on narrow screens and Editor otherwise.
 */
export class CanvasModeStore {
  private readonly rows = new Map<SessionId, ModeRow>()

  constructor(private readonly isNarrow: () => boolean = defaultNarrowViewport) {}

  /** Stable observable face for one Session's UI preference. */
  faceOf(sessionId: SessionId): SnapshotStore<CanvasMode> {
    return this.row(sessionId).face
  }

  /** Set a browser-local mode; identical writes are no-ops. */
  set(sessionId: SessionId, mode: CanvasMode): void {
    const row = this.row(sessionId)
    if (row.mode === mode) return
    row.mode = mode
    for (const listener of row.listeners) listener()
  }

  /** Drop one UI preference when an owning integration explicitly chooses to prune it. */
  delete(sessionId: SessionId): void {
    this.rows.delete(sessionId)
  }

  private row(sessionId: SessionId): ModeRow {
    let row = this.rows.get(sessionId)
    if (row !== undefined) return row
    const listeners = new Set<() => void>()
    const created: ModeRow = {
      mode: this.isNarrow() ? 'minimal' : 'editor',
      listeners,
      face: {
        getSnapshot: () => created.mode,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      },
    }
    this.rows.set(sessionId, created)
    return created
  }
}

function defaultNarrowViewport(): boolean {
  return typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia('(max-width: 760px)').matches
}
