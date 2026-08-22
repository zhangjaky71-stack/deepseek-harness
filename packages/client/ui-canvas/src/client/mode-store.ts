/** Per-session browser-local Minimal/Editor mode store. */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { CanvasMode } from '../types.ts'

/**
 * UI-local mode ledger. It has no Session, Remote, persistence, or Canvas mutation dependency.
 * The first mode is Minimal on narrow screens and Editor otherwise; later viewport changes do not
 * overwrite an explicit per-session preference.
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

  /** Drop one UI preference when its client-side Session lifetime ends. */
  delete(sessionId: SessionId): void {
    this.rows.delete(sessionId)
  }

  /** Remove rows that no longer belong to the current Session catalog. */
  prune(liveSessionIds: ReadonlySet<SessionId>): void {
    for (const sessionId of this.rows.keys()) {
      if (!liveSessionIds.has(sessionId)) this.rows.delete(sessionId)
    }
  }

  /** Drop every row when the owning plugin fiber is disposed or replaced. */
  clearAll(): void { this.rows.clear() }

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
