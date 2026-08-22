import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import CanvasService, {
  CanvasAuthorizationService,
  CanvasServiceError,
  CanvasVariantId,
  WorkflowNodeId,
  decodeCanvasChange,
} from '@deepseek-ai/dsh-canvas'
import type {
  CanvasAccessContext,
  CanvasAuthorizationConfig,
  MediaWorkflow,
} from '@deepseek-ai/dsh-canvas'
import { baseWorkflow, workflowRef } from './canvas-fixtures.ts'

interface StubAgent {
  agent: Agent
}

function stubAgent(ctx: Context, rawId: string): StubAgent {
  const session = ctx.sessions.create(SessionId(rawId))
  const inbox = new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} })
  const agent: Agent = {
    id: session.id,
    options: {},
    session,
    inbox,
    ctx: new Context(),
    status: 'idle',
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject(input) { inbox.append('next-step', input) },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle() { return Promise.resolve() },
  }
  return { agent }
}

async function harness(authorization?: CanvasAuthorizationConfig) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  if (authorization !== undefined) await ctx.plugin(CanvasAuthorizationService, authorization)
  await ctx.plugin(CanvasService)
  const stub = stubAgent(ctx, `canvas-auth-${Math.random()}`)
  ctx.agents.register(stub.agent)
  return { ctx, ...stub, session: stub.agent.session }
}

const humanAccess: CanvasAccessContext = {
  actor: { kind: 'human', id: 'local-user' },
  source: 'browser-remote',
  requestId: 'request-human-1',
}

const agentAccess: CanvasAccessContext = {
  actor: { kind: 'agent', id: 'agent-1' },
  source: 'agent-tool',
  requestId: 'request-agent-1',
}

describe('Canvas Host authorization and audit', () => {
  it('allows human read while denying human edit at the Host commit boundary', async () => {
    const { ctx, agent, session } = await harness({
      permissions: {
        'canvas.read': ['human'],
        'canvas.edit': ['agent'],
      },
    })
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const before = session.seq

    expect(ctx.canvas.get(agent, humanAccess)).toEqual(created)
    expect(() => ctx.canvas.editWorkflow(
      agent,
      workflowRef(created),
      [{ op: 'rename-workflow', name: 'Forbidden browser edit' }],
      humanAccess,
    )).toThrow(expect.objectContaining<Partial<CanvasServiceError>>({ code: 'CANVAS_PERMISSION_DENIED' }))
    expect(session.seq).toBe(before)
    expect(ctx.canvas.get(agent, humanAccess)).toEqual(created)
  })

  it('supports configurable agent-run allow and human-run deny through one authorization seam', async () => {
    const { ctx, session } = await harness({ permissions: { 'canvas.run': ['agent'] } })
    const common = { permission: 'canvas.run' as const, sessionId: String(session.id) }

    expect(ctx.canvas.authorize({ ...common, ...agentAccess })).toEqual({ allowed: true })
    expect(ctx.canvas.authorize({ ...common, ...humanAccess })).toEqual({
      allowed: false,
      reason: 'actor-kind-not-allowed',
    })
  })

  it('requires canvas.variant.create in addition to canvas.edit for an initial variant', async () => {
    const { ctx, agent, session } = await harness({
      permissions: {
        'canvas.edit': ['agent'],
        'canvas.variant.create': ['human'],
      },
    })
    expect(() => ctx.canvas.create(agent, {
      workflow: baseWorkflow(),
      currentVariantId: CanvasVariantId('variant-denied'),
    })).toThrow(expect.objectContaining<Partial<CanvasServiceError>>({ code: 'CANVAS_PERMISSION_DENIED' }))
    expect(session.seq).toBe(0)
  })

  it('records a system reconciler actor/source and request correlation in current audit metadata', async () => {
    const { ctx, agent, session } = await harness()
    const access: CanvasAccessContext = {
      actor: { kind: 'system', id: 'canvas-run-reconciler' },
      source: 'system-reconciler',
      requestId: 'reconcile-req-1',
      correlationId: 'reconcile-cycle-7',
    }

    ctx.canvas.create(agent, { workflow: baseWorkflow() }, access)
    const event = session.events.at(-1)
    expect(event?.type).toBe('canvas/change')
    if (event?.type !== 'canvas/change') throw new Error('expected Canvas change')
    expect(event.data.meta).toEqual({
      schemaVersion: 2,
      actor: { kind: 'system', id: 'canvas-run-reconciler' },
      source: 'system-reconciler',
      requestId: 'reconcile-req-1',
      correlationId: 'reconcile-cycle-7',
    })
    expect(decodeCanvasChange(event.data)?.meta).toEqual(event.data.meta)
  })

  it('keeps historical meta v1 readable while current CanvasService mutations write meta v2', async () => {
    const historical = {
      kind: 'canvas/change' as const,
      version: 1 as const,
      operation: 'clear' as const,
      canvas: null,
      meta: { schemaVersion: 1 as const },
    }
    expect(decodeCanvasChange(historical)?.meta).toEqual({ schemaVersion: 1 })

    const { ctx, agent, session } = await harness()
    ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const event = session.events.at(-1)
    if (event?.type !== 'canvas/change') throw new Error('expected Canvas change')
    expect(event.data.meta).toMatchObject({
      schemaVersion: 2,
      actor: { kind: 'agent', id: String(agent.id) },
      source: 'host',
    })
  })

  it('materializes audit metadata by allow-list so credential/binary extras cannot enter Session JSON', async () => {
    const { ctx, agent, session } = await harness()
    const access = {
      actor: { kind: 'human', id: 'local-user' },
      source: 'browser-remote',
      requestId: 'safe-request',
      apiKey: 'sk-super-secret',
      authorization: 'Bearer super-secret',
      callbackSecret: 'callback-super-secret',
      binary: new Uint8Array([115, 101, 99, 114, 101, 116]),
    } as CanvasAccessContext

    ctx.canvas.create(agent, { workflow: baseWorkflow() }, access)
    const serialized = JSON.stringify(session.events.at(-1)?.data)
    expect(serialized).toContain('safe-request')
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('authorization')
    expect(serialized).not.toContain('callbackSecret')
    expect(serialized).not.toContain('sk-super-secret')
    expect(serialized).not.toContain('Bearer super-secret')
    expect(serialized).not.toContain('callback-super-secret')
    expect(serialized).not.toContain('binary')
  })

  it('rejects credential/header/binary-shaped workflow config before append without echoing secret values', async () => {
    const { ctx, agent, session } = await harness()
    const workflow = baseWorkflow()
    const promptIndex = workflow.nodes.findIndex(node => node.id === WorkflowNodeId('prompt'))
    if (promptIndex < 0) throw new Error('expected prompt node')
    const nodes = workflow.nodes.map((node, index) => index === promptIndex
      ? {
        ...node,
        config: {
          ...node.config,
          headers: { Authorization: 'Bearer never-log-this' },
          callbackSecret: 'callback-never-log-this',
          base64: 'aW1hZ2UtYnl0ZXM=',
        },
      }
      : node)
    const unsafe: MediaWorkflow = { ...workflow, nodes }

    let thrown: unknown
    try {
      ctx.canvas.create(agent, { workflow: unsafe })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toEqual(expect.objectContaining<Partial<CanvasServiceError>>({ code: 'CANVAS_SENSITIVE_DATA' }))
    expect(String(thrown)).not.toContain('Bearer never-log-this')
    expect(String(thrown)).not.toContain('callback-never-log-this')
    expect(String(thrown)).not.toContain('aW1hZ2UtYnl0ZXM=')
    expect(session.seq).toBe(0)
  })
})
