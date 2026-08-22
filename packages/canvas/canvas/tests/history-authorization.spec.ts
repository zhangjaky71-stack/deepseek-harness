import { Context, Service } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import CanvasService, {
  CanvasRunId,
  type CanvasAuthorizationDecision,
  type CanvasAuthorizationRequest,
  type CanvasId,
  type CanvasSnapshot,
} from '@deepseek-ai/dsh-canvas'
import { describe, expect, it } from 'vitest'
import {
  baseWorkflow,
  runStartChange,
  runUpdateChange,
  workflowRef,
} from './canvas-fixtures.ts'

class GenerationAuthorizationService extends Service {
  deniedCanvasId: CanvasId | undefined
  readonly requests: CanvasAuthorizationRequest[] = []

  constructor(ctx: Context) {
    super(ctx, 'canvasAuthorization')
  }

  authorize(request: CanvasAuthorizationRequest): CanvasAuthorizationDecision {
    this.requests.push(structuredClone(request))
    const resourceCanvasId = request.resource.kind === 'session' ? undefined : request.resource.canvasId
    if (request.permission === 'canvas.history.read' && resourceCanvasId === this.deniedCanvasId) {
      return { allowed: false, reason: 'denied', policyCode: 'old-canvas-denied' }
    }
    return { allowed: true }
  }
}

function liveAgent(ctx: Context, rawId: string): Agent {
  const session = ctx.sessions.create(SessionId(rawId))
  const inbox = new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} })
  const status: AgentStatus = 'idle'
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

function currentCanvas(ctx: Context, agent: Agent): CanvasSnapshot {
  const canvas = ctx.canvas.get(agent)
  if (canvas === null) throw new Error('expected current Canvas')
  return canvas
}

function appendCompletedRun(ctx: Context, agent: Agent, id: string): void {
  const before = currentCanvas(ctx, agent)
  agent.session.append('canvas/change', runStartChange(before, CanvasRunId(id)))
  const queued = currentCanvas(ctx, agent)
  agent.session.append('canvas/change', runUpdateChange(queued, 'completed'))
  currentCanvas(ctx, agent)
}

async function harness(): Promise<{
  readonly ctx: Context
  readonly agent: Agent
  readonly policy: GenerationAuthorizationService
}> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(GenerationAuthorizationService)
  await ctx.plugin(CanvasService, { authorizationMode: 'required-external' })
  const policy = ctx.get('canvasAuthorization') as unknown as GenerationAuthorizationService
  return { ctx, agent: liveAgent(ctx, 'canvas-history-generation'), policy }
}

describe('Canvas generation-scoped history authorization', () => {
  it('does not let current-Canvas permission expose an older Canvas generation', async () => {
    const { ctx, agent, policy } = await harness()
    const first = ctx.canvas.create(agent, { workflow: baseWorkflow('First generation') })
    appendCompletedRun(ctx, agent, 'run-first')
    ctx.canvas.clear(agent, workflowRef(currentCanvas(ctx, agent)))

    const second = ctx.canvas.create(agent, { workflow: baseWorkflow('Second generation') })
    appendCompletedRun(ctx, agent, 'run-second')
    policy.deniedCanvasId = first.id

    const secondPage = ctx.canvas.remoteExportListRuns(agent, { canvasId: second.id, limit: 20 })
    expect(secondPage.items.map(item => [item.canvasId, item.runId])).toEqual([
      [second.id, CanvasRunId('run-second')],
    ])
    expect(ctx.canvas.remoteExportGetRun(agent, {
      canvasId: second.id,
      runId: CanvasRunId('run-first'),
    })).toBeNull()

    expect(() => ctx.canvas.remoteExportListRuns(agent, { canvasId: first.id, limit: 20 })).toThrow(
      expect.objectContaining({ code: 'CANVAS_PERMISSION_DENIED' }),
    )
    expect(() => ctx.canvas.remoteExportGetRun(agent, {
      canvasId: first.id,
      runId: CanvasRunId('run-first'),
    })).toThrow(expect.objectContaining({ code: 'CANVAS_PERMISSION_DENIED' }))

    const historyRequests = policy.requests.filter(request => request.permission === 'canvas.history.read')
    expect(historyRequests.map(request => request.resource)).toEqual([
      { kind: 'canvas', canvasId: second.id },
      { kind: 'run', canvasId: second.id, runId: CanvasRunId('run-first') },
      { kind: 'canvas', canvasId: first.id },
      { kind: 'run', canvasId: first.id, runId: CanvasRunId('run-first') },
    ])
  })
})
