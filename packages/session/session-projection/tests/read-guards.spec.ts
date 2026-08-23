import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry, { SESSION_PROJECTION_CONTROL_MARKER } from '@deepseek-ai/dsh-session-projection'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    'test/guarded-count': number
  }
}

async function harness(): Promise<{ ctx: Context; session: Session }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  const session = ctx.sessions.create()
  ctx.sessionProjections.register<'test/guarded-count', number>({
    key: 'test/guarded-count',
    schema: z.number().int().nonnegative(),
    init: () => 0,
    apply: state => state + 1,
    view: state => state,
    stateVersion: 1,
  })
  return { ctx, session }
}

function visibility(value: unknown): { generation: number; present: boolean; value?: unknown } | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return (value as Record<string, unknown>)[SESSION_PROJECTION_CONTROL_MARKER] as never
}

describe('SessionProjectionRegistry browser read guards', () => {
  it('omits a denied key from snapshots without changing its internal checkpoint state', async () => {
    const { ctx, session } = await harness()
    session.append('turn/start', { turn: 1 })
    ctx.sessionProjections.registerReadGuard('test/guarded-count', () => false)

    expect(ctx.sessionProjections.snapshot(session).values).not.toHaveProperty('test/guarded-count')
    expect(ctx.sessionProjections.checkpoint(session)['test/guarded-count']?.val).toBe(1)
  })

  it('suppresses ordinary change-feed values while a key has never been browser-visible', async () => {
    const { ctx, session } = await harness()
    const seen: unknown[] = []
    ctx.sessionProjections.registerReadGuard('test/guarded-count', () => false)
    ctx.sessionProjections.onChanged((_session, key, value) => {
      if (key === 'test/guarded-count') seen.push(value)
    })

    session.append('turn/start', { turn: 1 })
    expect(seen).toEqual([])
  })

  it('emits explicit same-seq absence and re-appearance with monotonically increasing visibility generations', async () => {
    const { ctx, session } = await harness()
    session.append('turn/start', { turn: 1 })
    expect(ctx.sessionProjections.snapshot(session).values['test/guarded-count']).toBe(1)
    const seen: Array<{ seq: number; value: unknown }> = []
    ctx.sessionProjections.onChanged((_session, key, value, seq) => {
      if (key === 'test/guarded-count') seen.push({ seq, value })
    })

    const dispose = ctx.sessionProjections.registerReadGuard('test/guarded-count', () => false)
    const absent = visibility(seen.at(-1)?.value)
    expect(absent).toMatchObject({ present: false })
    expect(absent?.generation).toBeGreaterThan(0)
    expect(seen.at(-1)?.seq).toBe(session.seq - 1)

    dispose()
    const present = visibility(seen.at(-1)?.value)
    expect(present).toMatchObject({ present: true, value: 1 })
    expect(present?.generation).toBeGreaterThan(absent?.generation ?? -1)
    expect(seen.at(-1)?.seq).toBe(session.seq - 1)
  })

  it('can refresh a mutable ACL decision without inventing a Session event', async () => {
    const { ctx, session } = await harness()
    session.append('turn/start', { turn: 1 })
    let allowed = true
    ctx.sessionProjections.registerReadGuard('test/guarded-count', () => allowed)
    ctx.sessionProjections.snapshot(session)
    const beforeSeq = session.seq
    const seen: unknown[] = []
    ctx.sessionProjections.onChanged((_session, key, value) => {
      if (key === 'test/guarded-count') seen.push(value)
    })

    allowed = false
    ctx.sessionProjections.refreshBrowserVisibility(session, ['test/guarded-count'])
    expect(session.seq).toBe(beforeSeq)
    const absent = visibility(seen.at(-1))
    expect(absent).toMatchObject({ present: false })
    expect(absent?.generation).toBeGreaterThan(0)

    allowed = true
    ctx.sessionProjections.refreshBrowserVisibility(session, ['test/guarded-count'])
    expect(session.seq).toBe(beforeSeq)
    const present = visibility(seen.at(-1))
    expect(present).toMatchObject({ present: true, value: 1 })
    expect(present?.generation).toBeGreaterThan(absent?.generation ?? -1)
  })

  it('fails closed when a read guard throws', async () => {
    const { ctx, session } = await harness()
    ctx.sessionProjections.registerReadGuard('test/guarded-count', () => {
      throw new Error('policy backend failed')
    })
    expect(ctx.sessionProjections.snapshot(session).values).not.toHaveProperty('test/guarded-count')
  })

  it('passes the live Session identity to browser snapshot/change guards', async () => {
    const { ctx, session } = await harness()
    const seenSessionIds: (string | undefined)[] = []
    ctx.sessionProjections.registerReadGuard('test/guarded-count', (context) => {
      seenSessionIds.push(context.sessionId)
      return true
    })
    ctx.sessionProjections.snapshot(session)
    session.append('turn/start', { turn: 1 })
    expect(seenSessionIds).toContain(String(session.id))
  })

  it('accepts an exact carrier-supplied Session identity for detached checkpoint/restore authorization', async () => {
    const { ctx, session } = await harness()
    session.append('turn/start', { turn: 1 })
    const checkpoint = ctx.sessionProjections.checkpoint(session)
    ctx.sessionProjections.registerReadGuard('test/guarded-count', context => context.sessionId === String(session.id))

    expect(ctx.sessionProjections.viewCheckpoint(checkpoint)).not.toHaveProperty('test/guarded-count')
    expect(ctx.sessionProjections.viewCheckpoint(checkpoint, {
      surface: 'browser', sessionId: String(session.id),
    })['test/guarded-count']).toBe(1)

    const denied = ctx.sessionProjections.restore({}, [...session.events], 0)
    expect(denied.snapshot.values).not.toHaveProperty('test/guarded-count')
    expect(denied.checkpoint['test/guarded-count']?.val).toBe(1)

    const restored = ctx.sessionProjections.restore({}, [...session.events], 0, {
      surface: 'browser', sessionId: String(session.id),
    })
    expect(restored.snapshot.values['test/guarded-count']).toBe(1)
  })

  it('removes the visibility decision when the explicit read-guard disposer runs', async () => {
    const { ctx, session } = await harness()
    const dispose = ctx.sessionProjections.registerReadGuard('test/guarded-count', () => false)
    expect(ctx.sessionProjections.snapshot(session).values).not.toHaveProperty('test/guarded-count')

    dispose()
    expect(ctx.sessionProjections.snapshot(session).values['test/guarded-count']).toBe(0)
  })

  it('removes a read guard automatically when its owning caller fiber unloads', async () => {
    const { ctx, session } = await harness()
    const fiber = await ctx.plugin(Object.assign((inner: Context) => {
      inner.sessionProjections.registerReadGuard('test/guarded-count', () => false)
    }, { inject: ['sessionProjections'] }))

    expect(ctx.sessionProjections.snapshot(session).values).not.toHaveProperty('test/guarded-count')
    await fiber.dispose()
    expect(ctx.sessionProjections.snapshot(session).values['test/guarded-count']).toBe(0)
  })

  it('composes multiple guards with AND semantics', async () => {
    const { ctx, session } = await harness()
    ctx.sessionProjections.registerReadGuard('test/guarded-count', () => true)
    ctx.sessionProjections.registerReadGuard('test/guarded-count', () => false)
    expect(ctx.sessionProjections.snapshot(session).values).not.toHaveProperty('test/guarded-count')
  })
})