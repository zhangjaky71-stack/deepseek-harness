import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import CanvasService, {
  CanvasAuthorizationService,
  CanvasLayoutError,
  MediaWorkflowId,
  WorkflowNodeId,
  applyCanvasLayoutProjection,
  applyCanvasProjection,
  canvasBrowserAccess,
} from '@deepseek-ai/dsh-canvas'
import type { CanvasLayoutSnapshot, CanvasSnapshot } from '@deepseek-ai/dsh-canvas'
import { baseWorkflow, workflowRef } from './canvas-fixtures.ts'

interface Bench {
  ctx: Context
  session: Session
  agent: Agent
  values(): Record<string, unknown>
}

function liveAgent(ctx: Context, session: Session): Agent {
  const status: AgentStatus = 'idle'
  const inbox = new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} })
  const agent: Agent = {
    id: session.id,
    options: {},
    session,
    inbox,
    ctx,
    get status() { return status },
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject(input) { inbox.append('next-step', input) },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle() { return Promise.resolve() },
  }
  ctx.agents.register(agent)
  return agent
}

async function harness(withCanvas = true): Promise<Bench> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionProjectionRegistry)
  if (withCanvas) await ctx.plugin(CanvasService)
  const session = ctx.sessions.create(SessionId(`canvas-projection-${Math.random()}`))
  const agent = liveAgent(ctx, session)
  return {
    ctx,
    session,
    agent,
    values: () => ctx.sessionProjections.snapshot(session).values as Record<string, unknown>,
  }
}

function layoutFor(canvas: CanvasSnapshot) {
  if (canvas.workflow === null) throw new Error('test Canvas lacks workflow')
  return {
    workflowId: canvas.workflow.id,
    nodePositions: {
      [WorkflowNodeId('prompt')]: { x: 40, y: 80 },
      [WorkflowNodeId('output')]: { x: 360, y: 80 },
    },
    viewport: { x: 12, y: 24, zoom: 0.9 },
  }
}

describe('Canvas Session projections and layout state', () => {
  it('serves null whole values before Canvas/layout creation', async () => {
    const bench = await harness()
    expect(bench.values()).toEqual({ canvas: null, canvasLayout: null })
    expect(bench.ctx.sessionProjections.snapshot(bench.session).asOfSeq).toBe(-1)
  })

  it('projects Canvas and independently saved layout without advancing workflowRevision', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_787_100_100_000)
    try {
      const bench = await harness()
      const created = bench.ctx.canvas.create(bench.agent, { workflow: baseWorkflow() })
      const revision = created.workflowRevision
      const layout = bench.ctx.canvas.saveLayout(bench.agent, layoutFor(created))
      const values = bench.values()

      expect(values.canvas).toEqual(created)
      expect(values.canvasLayout).toEqual(layout)
      expect((values.canvas as CanvasSnapshot).workflowRevision).toBe(revision)
      expect(bench.session.events.map(event => event.type)).toEqual(['canvas/change', 'canvas/layout-change'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the latest layout when semantic Canvas state changes', async () => {
    const bench = await harness()
    const created = bench.ctx.canvas.create(bench.agent, { workflow: baseWorkflow() })
    const layout = bench.ctx.canvas.saveLayout(bench.agent, layoutFor(created))
    const edited = bench.ctx.canvas.editWorkflow(bench.agent, workflowRef(created), [
      { op: 'rename-workflow', name: 'Edited after layout' },
    ])

    expect((bench.values().canvas as CanvasSnapshot).workflowRevision).toBe(edited.workflowRevision)
    expect(bench.values().canvasLayout).toEqual(layout)
  })

  it('resets current layout after Canvas clear while retaining durable layout history', async () => {
    const bench = await harness()
    const created = bench.ctx.canvas.create(bench.agent, { workflow: baseWorkflow() })
    bench.ctx.canvas.saveLayout(bench.agent, layoutFor(created))
    bench.ctx.canvas.clear(bench.agent, workflowRef(created))

    expect(bench.values()).toEqual({ canvas: null, canvasLayout: null })
    expect(bench.session.events.some(event => event.type === 'canvas/layout-change')).toBe(true)
  })

  it('cold-folds the same Canvas and layout values after a refresh/reload boundary', async () => {
    const first = await harness()
    const created = first.ctx.canvas.create(first.agent, { workflow: baseWorkflow() })
    const layout = first.ctx.canvas.saveLayout(first.agent, layoutFor(created))
    const edited = first.ctx.canvas.editWorkflow(first.agent, workflowRef(created), [
      { op: 'rename-workflow', name: 'Reload me' },
    ])
    const liveValues = first.values()

    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(CanvasService)
    const restored = ctx.sessions.create(SessionId('canvas-projection-restored'), { seed: first.session.events })
    const coldValues = ctx.sessionProjections.snapshot(restored).values

    expect(coldValues.canvas).toEqual(edited)
    expect(coldValues.canvasLayout).toEqual(layout)
    expect(coldValues).toEqual(liveValues)
  })

  it('keeps large event history out of the projection payload', async () => {
    const bench = await harness()
    let canvas = bench.ctx.canvas.create(bench.agent, { workflow: baseWorkflow() })
    bench.ctx.canvas.saveLayout(bench.agent, layoutFor(canvas))
    for (let index = 0; index < 25; index += 1) {
      canvas = bench.ctx.canvas.editWorkflow(bench.agent, workflowRef(canvas), [
        { op: 'rename-workflow', name: `Revision ${index}` },
      ])
    }

    const values = bench.values()
    expect(bench.session.events.length).toBeGreaterThan(20)
    expect(Object.keys(values).sort()).toEqual(['canvas', 'canvasLayout'])
    expect((values.canvas as CanvasSnapshot).workflowRevision).toBe(26)
    expect(JSON.stringify(values)).not.toContain('runHistory')
    expect(JSON.stringify(values)).not.toContain('providerResponse')
    expect(JSON.stringify(values)).not.toContain('progressHistory')
  })

  it('returns the same state reference for unrelated or malformed projection events', () => {
    const canvas = { id: 'same-canvas' } as never as CanvasSnapshot
    const layout = { workflowId: 'same-workflow' } as never as CanvasLayoutSnapshot
    const unrelated = { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } } as never
    const malformedCanvas = { type: 'canvas/change', seq: 2, time: 2, data: { kind: 'canvas/change' } } as never
    const malformedLayout = { type: 'canvas/layout-change', seq: 3, time: 3, data: { kind: 'canvas/layout-change' } } as never

    expect(applyCanvasProjection(canvas, unrelated)).toBe(canvas)
    expect(applyCanvasLayoutProjection(layout, unrelated)).toBe(layout)
    expect(applyCanvasProjection(canvas, malformedCanvas)).toBe(canvas)
    expect(applyCanvasLayoutProjection(layout, malformedLayout)).toBe(layout)
  })

  it('drops both Canvas projection keys when the Canvas service fiber unloads', async () => {
    const bench = await harness(false)
    expect(bench.values()).toEqual({})
    const fiber = await bench.ctx.plugin(CanvasService)
    expect(bench.values()).toEqual({ canvas: null, canvasLayout: null })
    await fiber.dispose()
    expect(bench.values()).toEqual({})
  })

  it('rejects stale workflow identity, unknown layout nodes, and denied layout writes before append', async () => {
    const bench = await harness()
    const created = bench.ctx.canvas.create(bench.agent, { workflow: baseWorkflow() })
    const before = bench.session.seq

    expect(() => bench.ctx.canvas.saveLayout(bench.agent, {
      ...layoutFor(created),
      workflowId: MediaWorkflowId('other-workflow'),
    })).toThrow(CanvasLayoutError)
    const workflow = created.workflow
    if (workflow === null) throw new Error('test Canvas lacks workflow')
    expect(() => bench.ctx.canvas.saveLayout(bench.agent, {
      workflowId: workflow.id,
      nodePositions: { [WorkflowNodeId('missing')]: { x: 0, y: 0 } },
    })).toThrow(expect.objectContaining({ code: 'CANVAS_INVALID_LAYOUT' }))
    expect(bench.session.seq).toBe(before)

    const restricted = new Context()
    await restricted.plugin(SessionStore)
    await restricted.plugin(AgentRegistry)
    await restricted.plugin(SessionProjectionRegistry)
    await restricted.plugin(CanvasAuthorizationService, { permissions: { 'canvas.layout.write': ['agent'] } })
    await restricted.plugin(CanvasService)
    const session = restricted.sessions.create(SessionId('canvas-layout-denied'))
    const agent = liveAgent(restricted, session)
    const canvas = restricted.canvas.create(agent, { workflow: baseWorkflow() })
    const deniedBefore = session.seq
    expect(() => restricted.canvas.saveLayout(
      agent,
      layoutFor(canvas),
      canvasBrowserAccess(String(session.id)),
    )).toThrow(expect.objectContaining({ code: 'CANVAS_PERMISSION_DENIED' }))
    expect(session.seq).toBe(deniedBefore)
  })
})
