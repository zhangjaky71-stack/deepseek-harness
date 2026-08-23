import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import { CanvasRunId, type CanvasChange } from '@deepseek-ai/dsh-canvas'
import { describe, expect, it } from 'vitest'
import { buildCanvasRunHistoryIndex } from '../src/history.ts'
import { withCanvasWritePermit } from '../src/write-authority.ts'
import {
  createChange,
  currentWriterChange,
  runStartChange,
  runUpdateChange,
} from './canvas-fixtures.ts'

async function liveSession(rawId: string) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  return { ctx, session: ctx.sessions.create(SessionId(rawId)) }
}

function appendCanvasChange(session: Session, change: CanvasChange): void {
  withCanvasWritePermit(session, 'canvas/change', change, () => {
    session.append('canvas/change', change)
  })
}

describe('CanvasRunHistoryIndex', () => {
  it('fails loud when persisted history updates a run before run-start', () => {
    const created = currentWriterChange(createChange())
    if (created.canvas === null) throw new Error('expected created Canvas')
    const started = currentWriterChange(runStartChange(created.canvas, CanvasRunId('run-missing-start')))
    if (started.canvas === null) throw new Error('expected started Canvas')
    const completed = currentWriterChange(runUpdateChange(started.canvas, 'completed'))

    // A live Session rejects this corrupt stream earlier through the Canvas
    // invariant. The history index still needs a fail-loud boundary for a
    // malformed persisted/replayed carrier, so construct that carrier directly.
    const events = [
      { seq: 0, time: created.canvas.updatedAt, type: 'canvas/change', data: created },
      { seq: 1, time: completed.canvas?.updatedAt ?? created.canvas.updatedAt + 1, type: 'canvas/change', data: completed },
    ] as SessionEvent[]

    expect(() => buildCanvasRunHistoryIndex(events)).toThrow(
      /run-update must advance only the current non-terminal run lifecycle/,
    )
  })

  it('supports one rebuild followed by incremental apply and generation-scoped lookup', async () => {
    const { ctx, session } = await liveSession('history-incremental')
    try {
      const created = currentWriterChange(createChange())
      appendCanvasChange(session, created)
      if (created.canvas === null) throw new Error('expected created Canvas')

      const index = buildCanvasRunHistoryIndex(session.events)
      const started = currentWriterChange(runStartChange(created.canvas, CanvasRunId('run-incremental')))
      appendCanvasChange(session, started)
      index.apply(session.events.at(-1)!)
      if (started.canvas === null) throw new Error('expected started Canvas')
      const completed = currentWriterChange(runUpdateChange(started.canvas, 'completed'))
      appendCanvasChange(session, completed)
      index.apply(session.events.at(-1)!)

      const page = index.list({ canvasId: created.canvas.id, limit: 20 })
      expect(page.items).toHaveLength(1)
      expect(page.items[0]).toMatchObject({
        canvasId: created.canvas.id,
        runId: 'run-incremental',
        status: 'completed',
      })
      expect(index.get({
        canvasId: created.canvas.id,
        runId: CanvasRunId('run-incremental'),
      })?.status).toBe('completed')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
