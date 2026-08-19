import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  CANVAS_LAYOUT_CHANGE_VERSION,
  MediaWorkflowId,
} from '@deepseek-ai/dsh-canvas'
import * as CanvasInvariantCompanion from '@deepseek-ai/dsh-canvas/invariant'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { createChange } from './canvas-fixtures.ts'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry, { enabled: true })
  await ctx.plugin(CanvasInvariantCompanion)
  return ctx
}

describe('Canvas stream invariants', () => {
  it('accepts a canonical full-snapshot Canvas change', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-invariant-valid'))
    expect(() => session.append('canvas/change', createChange())).not.toThrow()
    expect(session.seq).toBe(1)
  })

  it('rejects a malformed Canvas change before commit and keeps the fold reusable', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-invariant-invalid'))
    const change = createChange()
    expect(() => session.append('canvas/change', { ...change, extra: true } as never)).toThrow(
      expect.objectContaining<Partial<InvariantError>>({
        code: 'INVARIANT',
        packageName: '@deepseek-ai/dsh-canvas',
      }),
    )
    expect(session.seq).toBe(0)
    expect(() => session.append('canvas/change', change)).not.toThrow()
    expect(session.seq).toBe(1)
  })

  it('rejects secret-bearing actor extensions before Session commit', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-invariant-secret-meta'))
    session.append('canvas/change', createChange())
    expect(() => session.append('canvas/change', {
      kind: 'canvas/change',
      version: 1,
      operation: 'clear',
      canvas: null,
      meta: {
        schemaVersion: 2,
        actor: { kind: 'human', id: 'local-user', apiKey: 'sk-never-persist' },
        source: 'browser-remote',
      },
    } as never)).toThrow(expect.objectContaining<Partial<InvariantError>>({
      code: 'INVARIANT',
      packageName: '@deepseek-ai/dsh-canvas',
    }))
    expect(session.seq).toBe(1)
    expect(JSON.stringify(session.events)).not.toContain('sk-never-persist')
  })

  it('accepts a current-workflow layout and rejects mismatched or unknown-node layout before commit', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-layout-invariant'))
    const change = createChange()
    session.append('canvas/change', change)
    if (change.canvas === null || change.canvas.workflow === null) throw new Error('test Canvas lacks workflow')

    const meta = {
      schemaVersion: 2 as const,
      actor: { kind: 'agent' as const, id: 'layout-test' },
      source: 'host' as const,
    }
    expect(() => session.append('canvas/layout-change', {
      kind: 'canvas/layout-change',
      version: CANVAS_LAYOUT_CHANGE_VERSION,
      layout: {
        schemaVersion: 1,
        workflowId: change.canvas.workflow.id,
        nodePositions: { prompt: { x: 0, y: 0 } },
        viewport: { x: 0, y: 0, zoom: 1 },
        updatedAt: change.canvas.updatedAt,
      },
      meta,
    } as never)).not.toThrow()
    expect(session.seq).toBe(2)

    expect(() => session.append('canvas/layout-change', {
      kind: 'canvas/layout-change',
      version: CANVAS_LAYOUT_CHANGE_VERSION,
      layout: {
        schemaVersion: 1,
        workflowId: MediaWorkflowId('wrong-workflow'),
        nodePositions: {},
        updatedAt: change.canvas.updatedAt + 1,
      },
      meta,
    } as never)).toThrow(expect.objectContaining<Partial<InvariantError>>({ code: 'INVARIANT' }))
    expect(session.seq).toBe(2)

    expect(() => session.append('canvas/layout-change', {
      kind: 'canvas/layout-change',
      version: CANVAS_LAYOUT_CHANGE_VERSION,
      layout: {
        schemaVersion: 1,
        workflowId: change.canvas.workflow.id,
        nodePositions: { missing: { x: 1, y: 1 } },
        updatedAt: change.canvas.updatedAt + 1,
      },
      meta,
    } as never)).toThrow(expect.objectContaining<Partial<InvariantError>>({ code: 'INVARIANT' }))
    expect(session.seq).toBe(2)
  })

  it('reconstructs existing Canvas history before validating later changes', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('canvas-invariant-late-load'))
    const change = createChange()
    session.append('canvas/change', change)

    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(CanvasInvariantCompanion)
    expect(() => session.append('canvas/change', {
      kind: 'canvas/change',
      version: 1,
      operation: 'clear',
      canvas: null,
      meta: { schemaVersion: 1 },
    })).not.toThrow()
    expect(session.seq).toBe(2)
  })
})
