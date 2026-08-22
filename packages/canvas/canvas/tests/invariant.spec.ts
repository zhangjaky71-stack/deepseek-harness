import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  CANVAS_LAYOUT_CHANGE_VERSION,
  MediaWorkflowId,
} from '@deepseek-ai/dsh-canvas'
import * as CanvasInvariantCompanion from '@deepseek-ai/dsh-canvas/invariant'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import {
  createChange,
  currentWriterChange,
} from './canvas-fixtures.ts'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry, { enabled: true })
  await ctx.plugin(CanvasInvariantCompanion)
  return ctx
}

describe('Canvas stream invariants', () => {
  it('rejects a structurally valid current canvas/change that bypasses CanvasService write authority', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-invariant-authority'))
    expect(() => session.append('canvas/change', currentWriterChange(createChange()))).toThrow(
      expect.objectContaining<Partial<InvariantError>>({
        code: 'INVARIANT',
        packageName: '@deepseek-ai/dsh-canvas',
      }),
    )
    expect(session.seq).toBe(0)
  })

  it('keeps historical metadata v1 replayable while refusing a later direct current write', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('canvas-invariant-historical-replay'))
    session.append('canvas/change', createChange())
    expect(session.seq).toBe(1)

    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(CanvasInvariantCompanion)
    expect(session.seq).toBe(1)

    expect(() => session.append('canvas/change', currentWriterChange({
      kind: 'canvas/change',
      version: 1,
      operation: 'clear',
      canvas: null,
      meta: { schemaVersion: 1 },
    }))).toThrow(expect.objectContaining<Partial<InvariantError>>({
      code: 'INVARIANT',
      packageName: '@deepseek-ai/dsh-canvas',
    }))
    expect(session.seq).toBe(1)
  })

  it('rejects malformed direct Canvas data before Session publication', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-invariant-malformed'))
    expect(() => session.append('canvas/change', {
      ...currentWriterChange(createChange()),
      extra: true,
    } as never)).toThrow(expect.objectContaining<Partial<InvariantError>>({
      code: 'INVARIANT',
      packageName: '@deepseek-ai/dsh-canvas',
    }))
    expect(session.seq).toBe(0)
  })

  it('rejects a direct current canvas/layout-change without package write authority', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('canvas-layout-authority'))
    const created = createChange()
    session.append('canvas/change', created)
    const canvas = created.canvas
    if (canvas === null || canvas.workflow === null) throw new Error('test Canvas lacks workflow')
    const workflow = canvas.workflow

    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(CanvasInvariantCompanion)
    const meta = {
      schemaVersion: 2 as const,
      actor: { kind: 'agent' as const, id: String(session.id) },
      source: 'host' as const,
    }
    expect(() => session.append('canvas/layout-change', {
      kind: 'canvas/layout-change',
      version: CANVAS_LAYOUT_CHANGE_VERSION,
      layout: {
        schemaVersion: 1,
        workflowId: workflow.id,
        nodePositions: { prompt: { x: 0, y: 0 } },
        viewport: { x: 0, y: 0, zoom: 1 },
        updatedAt: canvas.updatedAt,
      },
      meta,
    } as never)).toThrow(expect.objectContaining<Partial<InvariantError>>({
      code: 'INVARIANT',
      packageName: '@deepseek-ai/dsh-canvas',
    }))
    expect(session.seq).toBe(1)
  })

  it('still validates malformed historical layout relationships during late-load replay', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('canvas-layout-historical-invalid'))
    const created = createChange()
    session.append('canvas/change', created)
    if (created.canvas === null) throw new Error('test Canvas lacks snapshot')
    session.append('canvas/layout-change', {
      kind: 'canvas/layout-change',
      version: CANVAS_LAYOUT_CHANGE_VERSION,
      layout: {
        schemaVersion: 1,
        workflowId: MediaWorkflowId('wrong-workflow'),
        nodePositions: {},
        updatedAt: created.canvas.updatedAt,
      },
      meta: {
        schemaVersion: 2,
        actor: { kind: 'agent', id: String(session.id) },
        source: 'host',
      },
    })

    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(CanvasInvariantCompanion)).rejects.toThrow()
  })
})
