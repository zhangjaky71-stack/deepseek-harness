import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import CanvasService, {
  CanvasAuthorizationService,
  CanvasLayoutError,
  WorkflowNodeId,
  applyCanvasLayoutProjection,
  applyCanvasProjection,
  emptyCanvasLayoutFoldState,
  foldCanvasLayout,
} from '@deepseek-ai/dsh-canvas'
import type { CanvasSnapshot, CurrentCanvasLayoutSnapshot, SaveCanvasLayoutRequest } from '@deepseek-ai/dsh-canvas'
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

function layoutFor(
  canvas: CanvasSnapshot,
  expectedLayoutRevision = 0,
): SaveCanvasLayoutRequest {
  if (canvas.workflow === null) throw new Error('test Canvas lacks workflow')
  return {
    canvasId: canvas.id,
    workflowId: canvas.workflow.id,
    expectedLayoutRevision,
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

  it('projects Canvas and independently revised layout without advancing workflowRevision', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_787_100_100_000)
    try {
      const bench = await harness()
      const created = bench.ctx.canvas.create(bench.agent, { workflow: baseWorkflow() })
      const workflowRevision = created.workflowRevision
      const layout = bench.ctx.canvas.saveLayout(bench.agent, layoutFor(created))
      const values = bench.values()

      expect(layout.canvasId).toBe(created.id)
      expect(layout.layoutRevision).toBe(1)
      expect(values.canvas).toEqual(created)
      expect(values.canvasLayout).toEqual(layout)
      expect((values.canvas as CanvasSnapshot).workflowRevision).toBe(workflowRevision)
      expect(bench.session.events.map(event => event.type)).toEqual(['canvas/change', 'canvas/layout-change'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the current-generation layout across semantic edits', async () => {
    const bench = await harness()
    const created = bench.ctx.canvas.create(bench.agent, { workflow: baseWorkflow() })
    const layout = bench.ctx.canvas.saveLayout(bench.agent, layoutFor(created))
    const edited = bench.ctx.canvas.editWorkflow(bench.agent, workflowRef(created), [
      { op: 'rename-workflow', name: 'Edited after layout' },
    ])

    expect((bench.values().canvas as CanvasSnapshot).workflowRevision).toBe(edited.workflowRevision)
    expect(bench.values().canvasLayout).toEqual(layout)
  })

  it('resets current layout after Canvas clear and strict current-layout replay agrees', async () => {
    const bench = await harness()
    const created = bench.ctx.canvas.create(bench.agent, { workflow: baseWorkflow() })
    bench.ctx.canvas.saveLayout(bench.agent, layoutFor(created))
    bench.ctx.canvas.clear(bench.agent, workflowRef(created))

    expect(bench.values()).toEqual({ canvas: null, canvasLayout: null })
    expect(foldCanvasLayout(bench.session.events)).toBeNull()
    expect(bench.session.events.some(event => event.type === 'canvas/layout-change')).toBe(true)
  })

  it('cold-folds the same Canvas and normalized current layout after refresh/reload', async () => {
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
    const restored = Session.create(SessionId('canvas-projection-restored'), first.session.events)
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

  it('ignores unrelated events by reference but fails loud on malformed own-domain events', () => {
    const canvas = { id: 'same-canvas' } as never as CanvasSnapshot
    const layoutState = emptyCanvasLayoutFoldState()
    const unrelated = { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } } as never
    const malformedCanvas = { type: 'canvas/change', seq: 2, time: 2, data: { kind: 'canvas/change' } } as never
    const malformedLayout = { type: 'canvas/layout-change', seq: 3, time: 3, data: { kind: 'canvas/layout-change' } } as never

    expect(applyCanvasProjection(canvas, unrelated)).toBe(canvas)
    expect(applyCanvasLayoutProjection(layoutState, unrelated)).toBe(layoutState)
    expect(() => applyCanvasProjection(canvas, malformedCanvas)).toThrow()
    expect(() => applyCanvasLayoutProjection(layoutState, malformedCanvas)).toThrow()
    expect(() => applyCanvasLayoutProjection(layoutState, malformedLayout)).toThrow()
  })

  it('drops both Canvas projection keys when the Canvas service fiber unloads', async () => {
    const bench = await harness(false)
    expect(bench.values()).toEqual({})
    const fiber = await bench.ctx.plugin(CanvasService)
    expect(bench.values()).toEqual({ canvas: null, canvasLayout: null })
    await fiber.dispose()
    expect(bench.values()).toEqual({})
  })

  it('rejects stale Canvas generation and stale layout revisions before append', async () => {
    const bench = await harness()
    const firstCanvas = bench.ctx.canvas.create(bench.agent, { workflow: baseWorkflow() })
    const tabA = layoutFor(firstCanvas)
    const tabB = structuredClone(tabA)
    const firstLayout = bench.ctx.canvas.saveLayout(bench.agent, tabA)
    expect(firstLayout.layoutRevision).toBe(1)

    const beforeStaleRevision = bench.session.seq
    expect(() => bench.ctx.canvas.saveLayout(bench.agent, tabB)).toThrow(
      expect.objectContaining({ code: 'CANVAS_STALE_LAYOUT_REVISION' }),
    )
    expect(bench.session.seq).toBe(beforeStaleRevision)

    bench.ctx.canvas.clear(bench.agent, workflowRef(firstCanvas))
    const secondCanvas = bench.ctx.canvas.create(bench.agent, { workflow: baseWorkflow() })
    const beforeOldGeneration = bench.session.seq
    expect(() => bench.ctx.canvas.saveLayout(bench.agent, {
      ...tabA,
      expectedLayoutRevision: 1,
    })).toThrow(expect.objectContaining({ code: 'CANVAS_LAYOUT_CANVAS_MISMATCH' }))
    expect(bench.session.seq).toBe(beforeOldGeneration)

    const newLayout = bench.ctx.canvas.saveLayout(bench.agent, layoutFor(secondCanvas))
    expect(newLayout.canvasId).toBe(secondCanvas.id)
    expect(newLayout.layoutRevision).toBe(1)
  })

  it('rejects wrong workflow identity, unknown layout nodes, and denied Browser layout writes before append', async () => {
    const bench = await harness()
    const created = bench.ctx.canvas.create(bench.agent, { workflow: baseWorkflow() })
    const before = bench.session.seq

    expect(() => bench.ctx.canvas.saveLayout(bench.agent, {
      ...layoutFor(created),
      workflowId: 'other-workflow' as never,
    })).toThrow(CanvasLayoutError)
    expect(() => bench.ctx.canvas.saveLayout(bench.agent, {
      ...layoutFor(created),
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
    expect(() => restricted.canvas.remoteExportSaveLayout(agent, layoutFor(canvas))).toThrow(
      expect.objectContaining({ code: 'CANVAS_PERMISSION_DENIED' }),
    )
    expect(session.seq).toBe(deniedBefore)
  })

  it('increments layoutRevision independently while workflowRevision stays fixed', async () => {
    const bench = await harness()
    const canvas = bench.ctx.canvas.create(bench.agent, { workflow: baseWorkflow() })
    const workflowRevision = canvas.workflowRevision
    const first = bench.ctx.canvas.saveLayout(bench.agent, layoutFor(canvas))
    const second = bench.ctx.canvas.saveLayout(bench.agent, {
      ...layoutFor(canvas, first.layoutRevision),
      nodePositions: {
        ...first.nodePositions,
        [WorkflowNodeId('prompt')]: { x: 80, y: 120 },
      },
    })

    expect(first.layoutRevision).toBe(1)
    expect(second.layoutRevision).toBe(2)
    expect((bench.values().canvas as CanvasSnapshot).workflowRevision).toBe(workflowRevision)
    expect((bench.values().canvasLayout as CurrentCanvasLayoutSnapshot).layoutRevision).toBe(2)
  })
})
