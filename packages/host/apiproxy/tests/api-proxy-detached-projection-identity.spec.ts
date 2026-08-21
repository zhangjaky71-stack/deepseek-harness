import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    'detached-identity/value': string
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'detached-identity/set': { value: string }
  }

  interface OutOfBandSessionEventMap {
    'detached-identity/set': true
  }
}

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function harness() {
  const id = SessionId('detached-projection-identity')
  const header: SessionHeader = { version: 0, id, createdAt: 1, cwd: '/tmp' }
  const events = [{
    seq: 0,
    time: 2,
    type: 'detached-identity/set',
    data: { value: 'visible-only-to-target' },
  }] as SessionEvent[]
  const driftedEvents = [...events, {
    seq: 1,
    time: 3,
    type: 'detached-identity/set',
    data: { value: 'newer-log-cut' },
  } as SessionEvent]
  let drifted = false

  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionProjectionRegistry)

  ctx.sessionProjections.register<'detached-identity/value', string>({
    key: 'detached-identity/value',
    schema: z.string(),
    init: () => 'empty',
    apply: (state, event) => event.type === 'detached-identity/set' ? event.data.value : state,
    view: state => state,
    stateVersion: 1,
  })

  ctx.provide('sessionPersistence', {
    list: async () => [header],
    inspect: async (sessionId: ReturnType<typeof SessionId>) => {
      if (sessionId !== id) throw new Error('not found')
      return { meta: header, events: drifted ? driftedEvents : events }
    },
  } as never)

  return {
    ctx,
    id,
    attach: () => ctx.sessions.get(id) ?? ctx.sessions.create(id, {
      seed: events,
      meta: {
        createdAt: header.createdAt,
        ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
      },
    }),
    triggerDrift: () => { drifted = true },
    proxy: createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'test', model: 'test' }),
      cwd: '/tmp',
    }),
  }
}

describe('ApiProxy detached projection read identity', () => {
  it('recomputes a detached tail baseline with the exact durable SessionId', async () => {
    const { ctx, id, proxy } = await harness()
    const seen: Array<string | undefined> = []
    let allowed = String(id)
    ctx.sessionProjections.registerReadGuard('detached-identity/value', (context) => {
      seen.push(context.sessionId)
      return context.sessionId === allowed
    })

    const visible = await proxy.sessions.history({
      rpcId: RpcId('detached-visible'),
      payload: { sessionId: id },
    })
    expect(visible.result.ok).toBe(true)
    if (!visible.result.ok) throw new Error('history unexpectedly failed')
    expect(visible.result.value.projections?.values['detached-identity/value'])
      .toBe('visible-only-to-target')
    expect(seen).toContain(String(id))

    allowed = 'another-session'
    const denied = await proxy.sessions.history({
      rpcId: RpcId('detached-denied'),
      payload: { sessionId: id },
    })
    expect(denied.result.ok).toBe(true)
    if (!denied.result.ok) throw new Error('history unexpectedly failed')
    expect(denied.result.value.projections?.values)
      .not.toHaveProperty('detached-identity/value')
    expect(seen.at(-1)).toBe(String(id))
  })

  it('re-evaluates with exact live identity when a detached source attaches during the core fold', async () => {
    const { ctx, id, proxy, attach } = await harness()
    const seen: Array<string | undefined> = []
    let attached = false
    ctx.sessionProjections.registerReadGuard('detached-identity/value', (context) => {
      seen.push(context.sessionId)
      if (context.sessionId === undefined && !attached) {
        attached = true
        attach()
      }
      return context.sessionId === String(id)
    })

    const response = await proxy.sessions.history({
      rpcId: RpcId('detached-to-live'),
      payload: { sessionId: id },
    })
    expect(response.result.ok).toBe(true)
    if (!response.result.ok) throw new Error('history unexpectedly failed')
    expect(attached).toBe(true)
    expect(response.result.value.projections?.values['detached-identity/value'])
      .toBe('visible-only-to-target')
    expect(seen).toContain(undefined)
    expect(seen.at(-1)).toBe(String(id))
  })

  it('removes the whole detached projection baseline when the exact-identity recompute no longer matches the served log cut', async () => {
    const { ctx, id, proxy, triggerDrift } = await harness()
    ctx.sessionProjections.registerReadGuard('detached-identity/value', (context) => {
      if (context.sessionId === undefined) triggerDrift()
      return true
    })

    const response = await proxy.sessions.history({
      rpcId: RpcId('detached-drift'),
      payload: { sessionId: id },
    })
    expect(response.result.ok).toBe(true)
    if (!response.result.ok) throw new Error('history unexpectedly failed')
    expect(response.result.value.events.at(-1)?.event.seq).toBe(0)
    expect('projections' in response.result.value).toBe(false)
  })

  it('does not add a projection baseline to loadOlder pages', async () => {
    const { ctx, id, proxy } = await harness()
    ctx.sessionProjections.registerReadGuard(
      'detached-identity/value',
      context => context.sessionId === String(id),
    )

    const older = await proxy.sessions.history({
      rpcId: RpcId('detached-older'),
      payload: { sessionId: id, beforeSeq: 1 },
    })
    expect(older.result.ok).toBe(true)
    if (!older.result.ok) throw new Error('history unexpectedly failed')
    expect('projections' in older.result.value).toBe(false)
  })
})
