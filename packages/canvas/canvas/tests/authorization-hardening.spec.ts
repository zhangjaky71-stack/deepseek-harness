import { Context, Service } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import CanvasService, {
  CanvasServiceError,
  CanvasVariantId,
} from '@deepseek-ai/dsh-canvas'
import type {
  CanvasAuthorizationRequest,
  CanvasAuthorizationDecision,
} from '@deepseek-ai/dsh-canvas'
import { describe, expect, it } from 'vitest'
import { baseWorkflow } from './canvas-fixtures.ts'

function stubAgent(ctx: Context, rawId: string): Agent {
  const session = ctx.sessions.create(SessionId(rawId))
  const inbox = new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} })
  return {
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
}

async function baseContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  return ctx
}

class MalformedAuthorizationService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'canvasAuthorization')
  }

  authorize(_request: CanvasAuthorizationRequest): CanvasAuthorizationDecision {
    return { allowed: true, reason: 'denied' } as never
  }
}

class CapturingAuthorizationService extends Service {
  readonly requests: CanvasAuthorizationRequest[] = []

  constructor(ctx: Context) {
    super(ctx, 'canvasAuthorization')
  }

  authorize(request: CanvasAuthorizationRequest): CanvasAuthorizationDecision {
    this.requests.push(structuredClone(request))
    return { allowed: true }
  }
}

class ResourceScopedAuthorizationService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'canvasAuthorization')
  }

  authorize(request: CanvasAuthorizationRequest): CanvasAuthorizationDecision {
    if (request.permission === 'canvas.read' && request.resource.kind === 'canvas') {
      return { allowed: false, reason: 'denied', policyCode: 'canvas-resource-denied' }
    }
    return { allowed: true }
  }
}

describe('Canvas authorization hardening', () => {
  it('rejects an unknown authorizationMode instead of silently falling back', async () => {
    const ctx = await baseContext()
    let thrown: unknown
    try {
      await ctx.plugin(CanvasService, { authorizationMode: 'required-external-typo' } as never)
    } catch (error) {
      thrown = error
    }
    expect(String(thrown)).toContain('unsupported Canvas authorizationMode')
  })

  it('fails closed when an external authorization service returns a contradictory decision', async () => {
    const ctx = await baseContext()
    await ctx.plugin(MalformedAuthorizationService)
    await ctx.plugin(CanvasService, { authorizationMode: 'required-external' })
    const agent = stubAgent(ctx, 'canvas-auth-malformed-external')
    ctx.agents.register(agent)

    expect(() => ctx.canvas.create(agent, { workflow: baseWorkflow() })).toThrow(
      expect.objectContaining<Partial<CanvasServiceError>>({ code: 'CANVAS_AUTHORIZATION_FAILED' }),
    )
    expect(agent.session.seq).toBe(0)
  })

  it('authorizes an initial variant against the concrete candidate variant resource', async () => {
    const ctx = await baseContext()
    await ctx.plugin(CapturingAuthorizationService)
    await ctx.plugin(CanvasService, { authorizationMode: 'required-external' })
    const agent = stubAgent(ctx, 'canvas-auth-variant-resource')
    ctx.agents.register(agent)
    const variantId = CanvasVariantId('variant-candidate')

    const created = ctx.canvas.create(agent, { workflow: baseWorkflow(), currentVariantId: variantId })
    const policy = ctx.get('canvasAuthorization') as unknown as CapturingAuthorizationService
    const variantRequest = policy.requests.find(request => request.permission === 'canvas.variant.create')

    expect(variantRequest).toBeDefined()
    expect(variantRequest?.sessionId).toBe(String(agent.session.id))
    expect(variantRequest?.resource).toEqual({
      kind: 'variant',
      canvasId: created.id,
      variantId,
    })
  })

  it('uses the same canvas.read resource scope for live Browser Projection and ctx.canvas.get()', async () => {
    const ctx = await baseContext()
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(ResourceScopedAuthorizationService)
    await ctx.plugin(CanvasService, { authorizationMode: 'required-external' })
    const agent = stubAgent(ctx, 'canvas-auth-projection-resource')
    ctx.agents.register(agent)

    ctx.canvas.create(agent, { workflow: baseWorkflow() })
    expect(() => ctx.canvas.get(agent)).toThrow(
      expect.objectContaining<Partial<CanvasServiceError>>({ code: 'CANVAS_PERMISSION_DENIED' }),
    )

    const projection = ctx.sessionProjections.snapshot(agent.session)
    expect(projection.values).not.toHaveProperty('canvas')
    expect(projection.values).not.toHaveProperty('canvasLayout')
  })
})
