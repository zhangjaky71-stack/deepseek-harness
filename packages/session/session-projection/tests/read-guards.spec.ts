import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'

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

describe('SessionProjectionRegistry browser read guards', () => {
  it('omits a denied key from snapshots without changing its internal checkpoint state', async () => {
    const { ctx, session } = await harness()
    session.append('turn/start', { turn: 1 })
    ctx.sessionProjections.registerReadGuard('test/guarded-count', () => false)

    expect(ctx.sessionProjections.snapshot(session).values).not.toHaveProperty('test/guarded-count')
    expect(ctx.sessionProjections.checkpoint(session)['test/guarded-count']?.val).toBe(1)
  })

  it('suppresses change-feed values denied by a read guard', async () => {
    const { ctx, session } = await harness()
    const seen: unknown[] = []
    ctx.sessionProjections.registerReadGuard('test/guarded-count', () => false)
    ctx.sessionProjections.onChanged((_session, key, value) => {
      if (key === 'test/guarded-count') seen.push(value)
    })

    session.append('turn/start', { turn: 1 })
    expect(seen).toEqual([])
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

  it('gives detached checkpoint/restore views no invented Session identity so identity-dependent guards can deny', async () => {
    const { ctx, session } = await harness()
    session.append('turn/start', { turn: 1 })
    const checkpoint = ctx.sessionProjections.checkpoint(session)
    ctx.sessionProjections.registerReadGuard('test/guarded-count', context => context.sessionId !== undefined)

    expect(ctx.sessionProjections.viewCheckpoint(checkpoint)).not.toHaveProperty('test/guarded-count')
    const restored = ctx.sessionProjections.restore({}, [...session.events], 0)
    expect(restored.snapshot.values).not.toHaveProperty('test/guarded-count')
    expect(restored.checkpoint['test/guarded-count']?.val).toBe(1)
  })

  it('removes the visibility decision when the read-guard registration is disposed', async () => {
    const { ctx, session } = await harness()
    const dispose = ctx.sessionProjections.registerReadGuard('test/guarded-count', () => false)
    expect(ctx.sessionProjections.snapshot(session).values).not.toHaveProperty('test/guarded-count')

    dispose()
    expect(ctx.sessionProjections.snapshot(session).values['test/guarded-count']).toBe(0)
  })

  it('composes multiple guards with AND semantics', async () => {
    const { ctx, session } = await harness()
    ctx.sessionProjections.registerReadGuard('test/guarded-count', () => true)
    ctx.sessionProjections.registerReadGuard('test/guarded-count', () => false)
    expect(ctx.sessionProjections.snapshot(session).values).not.toHaveProperty('test/guarded-count')
  })
})
