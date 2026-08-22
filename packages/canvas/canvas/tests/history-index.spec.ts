import { describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { CanvasRunId } from '@deepseek-ai/dsh-canvas'
import { buildCanvasRunHistoryIndex } from '../src/history.ts'
import {
  createChange,
  runStartChange,
  runUpdateChange,
} from './canvas-fixtures.ts'

describe('CanvasRunHistoryIndex', () => {
  it('fails loud when Session history updates a run before run-start', () => {
    const session = Session.create(SessionId('history-missing-start'))
    const created = createChange()
    session.append('canvas/change', created)
    if (created.canvas === null) throw new Error('expected created Canvas')
    const started = runStartChange(created.canvas, CanvasRunId('run-missing-start'))
    if (started.canvas === null) throw new Error('expected started Canvas')
    const completed = runUpdateChange(started.canvas, 'completed')
    session.append('canvas/change', completed)

    expect(() => buildCanvasRunHistoryIndex(session.events)).toThrow(
      /run-update must advance only the current non-terminal run lifecycle/,
    )
  })

  it('supports one rebuild followed by incremental apply and generation-scoped lookup', () => {
    const session = Session.create(SessionId('history-incremental'))
    const created = createChange()
    session.append('canvas/change', created)
    if (created.canvas === null) throw new Error('expected created Canvas')

    const index = buildCanvasRunHistoryIndex(session.events)
    const started = runStartChange(created.canvas, CanvasRunId('run-incremental'))
    session.append('canvas/change', started)
    index.apply(session.events.at(-1)!)
    if (started.canvas === null) throw new Error('expected started Canvas')
    const completed = runUpdateChange(started.canvas, 'completed')
    session.append('canvas/change', completed)
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
  })
})
