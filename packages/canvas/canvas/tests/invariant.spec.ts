import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  CANVAS_LAYOUT_CHANGE_VERSION,
  MediaWorkflowId,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas'
import * as CanvasInvariantCompanion from '@deepseek-ai/dsh-canvas/invariant'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import {
  createChange,
  currentWriterChange,
  runCompleteChange,
  runStartChange,
} from './canvas-fixtures.ts'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry, { enabled: true })
  await ctx.plugin(CanvasInvariantCompanion)
  return ctx
}

describe('Canvas stream invariants', () => {
  it('accepts a canonical current-writer full-snapshot Canvas change', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-invariant-valid'))
    expect(() => session.append('canvas/change', currentWriterChange(createChange()))).not.toThrow()
    expect(session.seq).toBe(1)
  })

  it('rejects historical metadata v1 on live writes while preserving it during late-load replay', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-invariant-meta-v1-live'))
    expect(() => session.append('canvas/change', createChange())).toThrow(
      expect.objectContaining<Partial<InvariantError>>({ code: 'INVARIANT', packageName: '@deepseek-ai/dsh-canvas' }),
    )
    expect(session.seq).toBe(0)

    const replayCtx = new Context()
    await replayCtx.plugin(SessionStore)
    const replay = replayCtx.sessions.create(SessionId('canvas-invariant-meta-v1-replay'))
    replay.append('canvas/change', createChange())
    await replayCtx.plugin(InvariantRegistry, { enabled: true })
    await replayCtx.plugin(CanvasInvariantCompanion)
    expect(replay.seq).toBe(1)
    expect(() => replay.append('canvas/change', currentWriterChange({
      kind: 'canvas/change',
      version: 1,
      operation: 'clear',
      canvas: null,
      meta: { schemaVersion: 1 },
    }))).not.toThrow()
    expect(replay.seq).toBe(2)
  })

  it('rejects a malformed Canvas change before commit and keeps the fold reusable', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-invariant-invalid'))
    const change = currentWriterChange(createChange())
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
    session.append('canvas/change', currentWriterChange(createChange()))
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

  it('rejects sensitive workflow config even when a Host plugin appends canvas/change directly', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-invariant-secret-workflow'))
    const change = createChange()
    if (change.canvas === null || change.canvas.workflow === null) throw new Error('expected workflow')
    const workflow = change.canvas.workflow
    const nodes = workflow.nodes.map(node => node.id === WorkflowNodeId('prompt')
      ? { ...node, config: { ...node.config, apiKey: 'sk-never-persist-direct' } }
      : node)
    const unsafe = currentWriterChange({
      ...change,
      canvas: { ...change.canvas, workflow: { ...workflow, nodes } },
    })

    expect(() => session.append('canvas/change', unsafe)).toThrow(
      expect.objectContaining<Partial<InvariantError>>({ code: 'INVARIANT', packageName: '@deepseek-ai/dsh-canvas' }),
    )
    expect(session.seq).toBe(0)
    expect(JSON.stringify(session.events)).not.toContain('sk-never-persist-direct')
  })

  it('rejects live run-complete compatibility vocabulary and requires current writers to use run-update', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-invariant-run-update'))
    const created = currentWriterChange(createChange())
    session.append('canvas/change', created)
    const createdCanvas = created.canvas
    if (createdCanvas === null) throw new Error('expected Canvas')
    const started = currentWriterChange(runStartChange(createdCanvas))
    session.append('canvas/change', started)
    const startedCanvas = started.canvas
    if (startedCanvas === null) throw new Error('expected started Canvas')
    expect(() => session.append('canvas/change', currentWriterChange(runCompleteChange(startedCanvas)))).toThrow(
      expect.objectContaining<Partial<InvariantError>>({ code: 'INVARIANT' }),
    )
    expect(session.seq).toBe(2)
  })

  it('accepts a current-workflow layout and rejects mismatched or unknown-node layout before commit', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-layout-invariant'))
    const change = currentWriterChange(createChange())
    session.append('canvas/change', change)
    const canvas = change.canvas
    if (canvas === null || canvas.workflow === null) throw new Error('test Canvas lacks workflow')
    const workflow = canvas.workflow

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
        workflowId: workflow.id,
        nodePositions: { prompt: { x: 0, y: 0 } },
        viewport: { x: 0, y: 0, zoom: 1 },
        updatedAt: canvas.updatedAt,
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
        updatedAt: canvas.updatedAt + 1,
      },
      meta,
    } as never)).toThrow(expect.objectContaining<Partial<InvariantError>>({ code: 'INVARIANT' }))
    expect(session.seq).toBe(2)

    expect(() => session.append('canvas/layout-change', {
      kind: 'canvas/layout-change',
      version: CANVAS_LAYOUT_CHANGE_VERSION,
      layout: {
        schemaVersion: 1,
        workflowId: workflow.id,
        nodePositions: { missing: { x: 1, y: 1 } },
        updatedAt: canvas.updatedAt + 1,
      },
      meta,
    } as never)).toThrow(expect.objectContaining<Partial<InvariantError>>({ code: 'INVARIANT' }))
    expect(session.seq).toBe(2)
  })
})
