import { describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import CanvasService, {
  CanvasAuthorizationService,
  CanvasRunId,
  type CanvasAuthorizationDecision,
  type CanvasAuthorizationRequest,
} from '@deepseek-ai/dsh-canvas'
import type { CanvasSnapshot } from '@deepseek-ai/dsh-canvas'
import { withCanvasWritePermit } from '../src/write-authority.ts'
import {
  baseWorkflow,
  currentWriterChange,
  runStartChange,
  runUpdateChange,
  workflowRef,
} from './canvas-fixtures.ts'

class BoundaryAuthorizationService extends Service {
  readonly requests: CanvasAuthorizationRequest[] = []

  constructor(ctx: Context) {
    super(ctx, 'canvasAuthorization')
  }

  authorize(request: CanvasAuthorizationRequest): CanvasAuthorizationDecision {
    this.requests.push(structuredClone(request))
    return { allowed: true }
  }
}

function liveAgent(ctx: Context, sessionId: string): Agent {
  const session = ctx.sessions.create(SessionId(sessionId))
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

async function harness(
  authorization?: ConstructorParameters<typeof CanvasAuthorizationService>[1],
): Promise<{ ctx: Context; agent: Agent }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionProjectionRegistry)
  if (authorization !== undefined) await ctx.plugin(CanvasAuthorizationService, authorization)
  await ctx.plugin(CanvasService)
  return { ctx, agent: liveAgent(ctx, `canvas-remote-${Math.random()}`) }
}

function currentCanvas(ctx: Context, agent: Agent): CanvasSnapshot {
  const canvas = ctx.canvas.get(agent)
  if (canvas === null) throw new Error('expected current Canvas')
  return canvas
}

function appendCurrentChange(agent: Agent, change: ReturnType<typeof currentWriterChange>): void {
  withCanvasWritePermit(agent.session, 'canvas/change', change, () => {
    agent.session.append('canvas/change', change)
  })
}

function appendCompletedRun(ctx: Context, agent: Agent, id: string): void {
  const before = currentCanvas(ctx, agent)
  appendCurrentChange(agent, currentWriterChange(runStartChange(before, CanvasRunId(id))))
  const queued = currentCanvas(ctx, agent)
  appendCurrentChange(agent, currentWriterChange(runUpdateChange(queued, 'completed')))
  currentCanvas(ctx, agent)
}

describe('Canvas Typert Remote contract and history API', () => {
  it('marks only currently implemented Browser endpoints and has no current-state RPC', async () => {
    const { ctx } = await harness()
    const names = remoteMethods(ctx.canvas).map(marker => marker.exportName ?? marker.method)
    expect(names).toEqual([
      'editWorkflow',
      'replaceWorkflow',
      'selectOutput',
      'saveLayout',
      'clear',
      'listRuns',
      'getRun',
    ])
    expect(names).not.toContain('getCurrent')
    expect(names).not.toContain('run')
    expect(names).not.toContain('cancel')
    expect(names).not.toContain('createVariant')
    expect(names).not.toContain('restoreWorkflow')
  })

  it('Remote edit commits through CanvasService, records browser-human audit, and updates Projection', async () => {
    const { ctx, agent } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const receipt = ctx.canvas.remoteExportEditWorkflow(
      agent,
      workflowRef(created),
      [{ op: 'rename-workflow', name: 'Edited from Browser Remote' }],
    )

    if (created.workflow === null) throw new Error('expected created workflow')
    expect(receipt).toEqual({
      ref: {
        canvasId: created.id,
        workflowId: created.workflow.id,
        workflowRevision: 2,
      },
    })
    const projected = ctx.sessionProjections.snapshot(agent.session).values.canvas as CanvasSnapshot
    expect(projected.workflow?.name).toBe('Edited from Browser Remote')
    expect(projected.workflowRevision).toBe(2)
    const event = agent.session.events.at(-1)
    expect(event?.type).toBe('canvas/change')
    if (event?.type !== 'canvas/change') throw new Error('expected Canvas change')
    expect(event.data.meta).toMatchObject({
      schemaVersion: 2,
      actor: { kind: 'human', id: 'host-browser' },
      source: 'browser-remote',
    })
  })

  it('rejects a Browser Remote mutation through Host authorization before Session append', async () => {
    const { ctx, agent } = await harness({ permissions: { 'canvas.edit': ['agent'] } })
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const before = agent.session.seq

    expect(() => ctx.canvas.remoteExportEditWorkflow(
      agent,
      workflowRef(created),
      [{ op: 'rename-workflow', name: 'Denied' }],
    )).toThrow(expect.objectContaining({ code: 'CANVAS_PERMISSION_DENIED' }))
    expect(agent.session.seq).toBe(before)
    expect(currentCanvas(ctx, agent)).toEqual(created)
  })

  it('rejects malformed weak mutation DTOs before authorization or business logic', async () => {
    const { ctx, agent } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    await ctx.plugin(BoundaryAuthorizationService)
    const policy = ctx.get('canvasAuthorization') as unknown as BoundaryAuthorizationService

    expect(() => ctx.canvas.remoteExportEditWorkflow(
      agent,
      { canvasId: created.id } as never,
      [{ op: 'rename-workflow', name: 'never reached' }],
    )).toThrow(expect.objectContaining({ code: 'CANVAS_INVALID_EDIT' }))
    expect(policy.requests).toHaveLength(0)

    expect(() => ctx.canvas.remoteExportEditWorkflow(
      agent,
      workflowRef(created),
      [{ op: 'unsupported-op' }] as never,
    )).toThrow(expect.objectContaining({ code: 'CANVAS_INVALID_EDIT' }))
    expect(policy.requests).toHaveLength(0)

    expect(() => ctx.canvas.remoteExportReplaceWorkflow(
      agent,
      workflowRef(created),
      { id: 'workflow-main' } as never,
    )).toThrow(expect.objectContaining({ code: 'CANVAS_INVALID_EDIT' }))
    expect(policy.requests).toHaveLength(0)

    expect(() => ctx.canvas.remoteExportClear(
      agent,
      { canvasId: created.id, workflowId: 'workflow-main', workflowRevision: 0 } as never,
    )).toThrow(expect.objectContaining({ code: 'CANVAS_INVALID_EDIT' }))
    expect(policy.requests).toHaveLength(0)
  })

  it('pages newest-first by stable run-start Session cursor even when a later run is appended', async () => {
    const { ctx, agent } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    appendCompletedRun(ctx, agent, 'run-1')
    appendCompletedRun(ctx, agent, 'run-2')
    appendCompletedRun(ctx, agent, 'run-3')

    const first = ctx.canvas.remoteExportListRuns(agent, { canvasId: created.id, limit: 2 })
    expect(first.items.map(item => item.runId)).toEqual(['run-3', 'run-2'])
    if (first.nextCursor === undefined) throw new Error('expected a second history page')

    appendCompletedRun(ctx, agent, 'run-4')
    const second = ctx.canvas.remoteExportListRuns(agent, {
      canvasId: created.id,
      cursor: first.nextCursor,
      limit: 2,
    })
    expect(second.items.map(item => item.runId)).toEqual(['run-1'])
    expect(second.nextCursor).toBeUndefined()

    expect(ctx.canvas.remoteExportGetRun(agent, {
      canvasId: created.id,
      runId: CanvasRunId('run-2'),
    })).toMatchObject({
      canvasId: created.id,
      runId: 'run-2',
      status: 'completed',
      workflowRevision: 1,
      outputs: [{ kind: 'video' }, { kind: 'video' }],
    })
    expect(ctx.canvas.remoteExportGetRun(agent, {
      canvasId: created.id,
      runId: CanvasRunId('missing'),
    })).toBeNull()
  })

  it('enforces bounded history pages and Host history-read authorization', async () => {
    const { ctx, agent } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    expect(() => ctx.canvas.remoteExportListRuns(agent, { canvasId: created.id, limit: 101 })).toThrow(
      expect.objectContaining({ code: 'CANVAS_INVALID_HISTORY_QUERY' }),
    )

    const restricted = await harness({ permissions: { 'canvas.history.read': ['agent'] } })
    const restrictedCanvas = restricted.ctx.canvas.create(restricted.agent, { workflow: baseWorkflow() })
    expect(() => restricted.ctx.canvas.remoteExportListRuns(restricted.agent, {
      canvasId: restrictedCanvas.id,
      limit: 20,
    })).toThrow(expect.objectContaining({ code: 'CANVAS_PERMISSION_DENIED' }))
  })
})
