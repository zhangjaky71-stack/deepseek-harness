import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import CanvasService, {
  CanvasAuthorizationService,
  CanvasRunId,
  CanvasServiceError,
  CanvasVariantId,
  WorkflowNodeId,
  assertCanvasDurableAuditSafe,
  decodeCanvasChange,
} from '@deepseek-ai/dsh-canvas'
import * as CanvasInvariantCompanion from '@deepseek-ai/dsh-canvas/invariant'
import type {
  CanvasAccessContext,
  CanvasAuthorizationConfig,
  CanvasServiceConfig,
  CanvasSnapshot,
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

interface HarnessOptions {
  readonly authorization?: CanvasAuthorizationConfig
  readonly service?: CanvasServiceConfig
  readonly projections?: boolean
  readonly invariant?: boolean
}

async function harness(options: HarnessOptions = {}) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  if (options.invariant === true) {
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(CanvasInvariantCompanion)
  }
  await ctx.plugin(AgentRegistry)
  if (options.projections === true) await ctx.plugin(SessionProjectionRegistry)
  if (options.authorization !== undefined) await ctx.plugin(CanvasAuthorizationService, options.authorization)
  await ctx.plugin(CanvasService, options.service ?? {})
  const stub = stubAgent(ctx, `canvas-auth-${Math.random()}`)
  ctx.agents.register(stub.agent)
  return { ctx, ...stub, session: stub.agent.session }
}

function humanAccess(agent: Agent, requestId = 'request-human-1'): CanvasAccessContext {
  return {
    actor: { kind: 'human', id: String(agent.id) },
    source: 'browser-remote',
    requestId,
  }
}

function agentAccess(agent: Agent): CanvasAccessContext {
  return {
    actor: { kind: 'agent', id: String(agent.id) },
    source: 'agent-tool',
    requestId: 'request-agent-1',
  }
}

function unsafePromptWorkflow(workflow: MediaWorkflow, config: Record<string, unknown>): MediaWorkflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map(node => node.id === WorkflowNodeId('prompt')
      ? { ...node, config: { ...node.config, ...config } as never }
      : node),
  }
}

describe('Canvas Host authorization and audit', () => {
  it('allows human read while denying human edit at the Host commit boundary', async () => {
    const { ctx, agent, session } = await harness({
      authorization: {
        permissions: {
          'canvas.read': ['human'],
          'canvas.edit': ['agent'],
        },
      },
    })
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const before = session.seq
    const human = humanAccess(agent)

    expect(ctx.canvas.get(agent, human)).toEqual(created)
    expect(() => ctx.canvas.editWorkflow(
      agent,
      workflowRef(created),
      [{ op: 'rename-workflow', name: 'Forbidden browser edit' }],
      human,
    )).toThrow(expect.objectContaining<Partial<CanvasServiceError>>({ code: 'CANVAS_PERMISSION_DENIED' }))
    expect(session.seq).toBe(before)
    expect(ctx.canvas.get(agent)).toEqual(created)
  })

  it('supports configurable run authorization with typed resource scope', async () => {
    const { ctx, agent, session } = await harness({ authorization: { permissions: { 'canvas.run': ['agent'] } } })
    const common = {
      permission: 'canvas.run' as const,
      sessionId: String(session.id),
      resource: { kind: 'session' as const },
    }

    expect(ctx.canvas.authorize({ ...common, ...agentAccess(agent) })).toEqual({ allowed: true })
    expect(ctx.canvas.authorize({ ...common, ...humanAccess(agent) })).toEqual({
      allowed: false,
      reason: 'denied',
      policyCode: 'actor-kind-not-allowed',
    })
  })

  it('requires canvas.variant.create in addition to canvas.edit for an initial variant', async () => {
    const { ctx, agent, session } = await harness({
      authorization: {
        permissions: {
          'canvas.edit': ['agent'],
          'canvas.variant.create': ['human'],
        },
      },
    })
    expect(() => ctx.canvas.create(agent, {
      workflow: baseWorkflow(),
      currentVariantId: CanvasVariantId('variant-denied'),
    })).toThrow(expect.objectContaining<Partial<CanvasServiceError>>({ code: 'CANVAS_PERMISSION_DENIED' }))
    expect(session.seq).toBe(0)
  })

  it('binds source and actor provenance to the exact target Agent/Session', async () => {
    const { ctx, agent, session } = await harness()
    const invalid: readonly CanvasAccessContext[] = [
      { actor: { kind: 'system', id: 'forged-system' }, source: 'browser-remote' },
      { actor: { kind: 'human', id: String(agent.id) }, source: 'agent-tool' },
      { actor: { kind: 'agent', id: 'another-agent' }, source: 'agent-tool' },
      { actor: { kind: 'human', id: String(agent.id) }, source: 'system-reconciler' },
    ]

    for (const access of invalid) {
      expect(() => ctx.canvas.create(agent, { workflow: baseWorkflow() }, access)).toThrow(
        expect.objectContaining<Partial<CanvasServiceError>>({ code: 'CANVAS_INVALID_ACCESS_CONTEXT' }),
      )
      expect(session.seq).toBe(0)
    }
  })

  it('records a system reconciler actor/source and request correlation in current audit metadata', async () => {
    const { ctx, agent, session } = await harness({ invariant: true })
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

    const { ctx, agent, session } = await harness({ invariant: true })
    ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const event = session.events.at(-1)
    if (event?.type !== 'canvas/change') throw new Error('expected Canvas change')
    expect(event.data.meta).toMatchObject({
      schemaVersion: 2,
      actor: { kind: 'agent', id: String(agent.id) },
      source: 'host',
    })
  })

  it('materializes audit metadata by allow-list so caller extras cannot enter Session JSON', async () => {
    const { ctx, agent, session } = await harness()
    const access = {
      ...humanAccess(agent, 'safe-request'),
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

  it('rejects structural credential carriers and obvious secret payload values before append', async () => {
    const cases: readonly Record<string, unknown>[] = [
      { 'X-API-Key': 'not-written' },
      { payload: 'data:image/png;base64,aW1hZ2UtYnl0ZXM=' },
      { payload: 'Bearer abcdefghijklmnopqrstuvwxyz0123456789' },
      { payload: '-----BEGIN PRIVATE KEY-----\nnot-written\n-----END PRIVATE KEY-----' },
    ]

    for (const config of cases) {
      const { ctx, agent, session } = await harness()
      let thrown: unknown
      try {
        ctx.canvas.create(agent, { workflow: unsafePromptWorkflow(baseWorkflow(), config) })
      } catch (error) {
        thrown = error
      }
      expect(thrown).toEqual(expect.objectContaining<Partial<CanvasServiceError>>({ code: 'CANVAS_SENSITIVE_DATA' }))
      expect(session.seq).toBe(0)
      const serialized = JSON.stringify(session.events)
      for (const value of Object.values(config)) expect(serialized).not.toContain(String(value))
    }
  })

  it('does not reject ordinary token-count configuration merely because its key contains token', async () => {
    const { ctx, agent } = await harness()
    const workflow = unsafePromptWorkflow(baseWorkflow(), { maxTokens: 2048, tokenLimit: 4096 })
    expect(() => ctx.canvas.create(agent, { workflow })).not.toThrow()
  })

  it('rejects unsafe provider diagnostics before they can become durable Run state', async () => {
    const { ctx, agent } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    if (created.workflow === null) throw new Error('expected workflow')
    const unsafe: CanvasSnapshot = {
      ...created,
      runRevision: created.runRevision + 1,
      run: {
        id: CanvasRunId('run-provider-secret'),
        status: 'failed',
        workflowId: created.workflow.id,
        workflowRevision: created.workflowRevision,
        startedAt: created.updatedAt,
        finishedAt: created.updatedAt,
        error: {
          category: 'provider',
          code: 'PROVIDER_HTTP_ERROR',
          message: 'upstream rejected Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789',
        },
      },
    }
    expect(() => assertCanvasDurableAuditSafe(unsafe)).toThrow()
  })

  it('bounds durable actor/request/correlation identifiers', async () => {
    const { ctx, agent, session } = await harness()
    const oversized = 'x'.repeat(129)
    expect(() => ctx.canvas.create(agent, { workflow: baseWorkflow() }, {
      actor: { kind: 'human', id: String(agent.id) },
      source: 'browser-remote',
      requestId: oversized,
    })).toThrow(expect.objectContaining<Partial<CanvasServiceError>>({ code: 'CANVAS_INVALID_ACCESS_CONTEXT' }))
    expect(session.seq).toBe(0)
  })

  it('fails closed when an external authorization service is required but absent', async () => {
    const { ctx, agent, session } = await harness({
      service: { authorizationMode: 'required-external' },
    })
    expect(() => ctx.canvas.create(agent, { workflow: baseWorkflow() })).toThrow(
      expect.objectContaining<Partial<CanvasServiceError>>({ code: 'CANVAS_AUTHORIZATION_FAILED' }),
    )
    expect(session.seq).toBe(0)
  })

  it('applies canvas.read to browser projection delivery instead of only ctx.canvas.get()', async () => {
    const { ctx, agent } = await harness({
      projections: true,
      authorization: {
        permissions: {
          'canvas.edit': ['agent'],
          'canvas.read': ['agent'],
        },
      },
    })
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    expect(ctx.canvas.get(agent)).toEqual(created)
    const snapshot = ctx.sessionProjections.snapshot(agent.session)
    expect(snapshot.values).not.toHaveProperty('canvas')
    expect(snapshot.values).not.toHaveProperty('canvasLayout')
  })
})
