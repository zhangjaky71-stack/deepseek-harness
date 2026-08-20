/** Per-session browser-local Minimal/Editor mode store. */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { CanvasMode } from '../types.ts'

/**
 * UI-local mode ledger. It has no Session, Remote, persistence, or Canvas mutation dependency.
 * The first mode is Minimal on narrow screens and Editor otherwise.
 */
export class CanvasModeStore {
  private readonly rows = new Map<SessionId, SnapshotStore<CanvasMode>>()

  constructor(private readonly isNarrow: () => boolean = defaultNarrowViewport) {}

  /** Stable observable face for one Session's UI preference. */
  faceOf(sessionId: SessionId): SnapshotStore<CanvasMode> {
    return this.row(sessionId)
  }

  /** Set a browser-local mode; identical writes are no-ops. */
  set(sessionId: SessionId, mode: CanvasMode): void {
    const row = this.row(sessionId)
    if (row.getSnapshot() === mode) return
    row.set(mode)
  }

  /** Drop one UI preference when an owning integration explicitly chooses to prune it. */
  delete(sessionId: SessionId): void {
    this.rows.delete(sessionId)
  }

  private row(sessionId: SessionId): SnapshotStore<CanvasMode> {
    let row = this.rows.get(sessionId)
    if (row !== undefined) return row
    row = createSnapshotStore<CanvasMode>(this.isNarrow() ? 'minimal' : 'editor')
    this.rows.set(sessionId, row)
    return row
  }
}

function defaultNarrowViewport(): boolean {
  return typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia('(max-width: 760px)').matches
}
