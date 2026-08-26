import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry, { SESSION_PROJECTION_CONTROL_MARKER } from '@deepseek-ai/dsh-session-projection'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    'test/hmr-value': number
  }
}

const OWNER = 'test:hmr-value'

function control(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return (value as Record<string, Record<string, unknown>>)[SESSION_PROJECTION_CONTROL_MARKER]
}

describe('SessionProjectionRegistry HMR definition replacement', () => {
  it('activates the newest overlapping same-owner definition and ignores later disposal of the old one', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })

    const disposeOld = ctx.sessionProjections.register<'test/hmr-value', number>({
      key: 'test/hmr-value', owner: OWNER,
      schema: z.number(),
      init: () => 0,
      apply: state => state + 1,
      view: state => state,
      stateVersion: 1,
    })
    expect(ctx.sessionProjections.snapshot(session).values['test/hmr-value']).toBe(1)

    const seen: unknown[] = []
    ctx.sessionProjections.onChanged((_session, key, value) => {
      if (key === 'test/hmr-value') seen.push(value)
    })
    const disposeNew = ctx.sessionProjections.register<'test/hmr-value', number>({
      key: 'test/hmr-value', owner: OWNER,
      schema: z.number(),
      init: () => 100,
      apply: state => state + 10,
      view: state => state,
      stateVersion: 2,
    })

    expect(ctx.sessionProjections.snapshot(session).values['test/hmr-value']).toBe(110)
    expect(control(seen.at(-1))).toMatchObject({ present: true, value: 110 })

    disposeOld()
    expect(ctx.sessionProjections.snapshot(session).values['test/hmr-value']).toBe(110)

    disposeNew()
    expect(ctx.sessionProjections.snapshot(session).values).not.toHaveProperty('test/hmr-value')
  })

  it('restores the previous same-owner definition only when the active replacement itself is disposed first', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })

    const disposeOld = ctx.sessionProjections.register<'test/hmr-value', number>({
      key: 'test/hmr-value', owner: OWNER, schema: z.number(), init: () => 1,
      apply: state => state + 1, view: state => state, stateVersion: 1,
    })
    ctx.sessionProjections.snapshot(session)
    const disposeNew = ctx.sessionProjections.register<'test/hmr-value', number>({
      key: 'test/hmr-value', owner: OWNER, schema: z.number(), init: () => 20,
      apply: state => state + 2, view: state => state, stateVersion: 2,
    })
    expect(ctx.sessionProjections.snapshot(session).values['test/hmr-value']).toBe(22)

    disposeNew()
    expect(ctx.sessionProjections.snapshot(session).values['test/hmr-value']).toBe(2)
    disposeOld()
  })

  it('rejects a different owner instead of letting it replace an existing projection key', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register<'test/hmr-value', number>({
      key: 'test/hmr-value', owner: OWNER, schema: z.number(), init: () => 0,
      apply: state => state, view: state => state, stateVersion: 1,
    })

    expect(() => ctx.sessionProjections.register<'test/hmr-value', number>({
      key: 'test/hmr-value', owner: 'other:plugin', schema: z.number(), init: () => 1,
      apply: state => state, view: state => state, stateVersion: 1,
    })).toThrow(/already owned/)
  })

  it('keeps unowned same-version duplicate registrations on legacy shared-definition semantics', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })
    const disposeFirst = ctx.sessionProjections.register<'test/hmr-value', number>({
      key: 'test/hmr-value', schema: z.number(), init: () => 2,
      apply: state => state + 1, view: state => state, stateVersion: 1,
    })
    const disposeDuplicate = ctx.sessionProjections.register<'test/hmr-value', number>({
      key: 'test/hmr-value', schema: z.number(), init: () => 100,
      apply: state => state + 50, view: state => state, stateVersion: 1,
    })
    expect(ctx.sessionProjections.snapshot(session).values['test/hmr-value']).toBe(3)
    disposeDuplicate()
    expect(ctx.sessionProjections.snapshot(session).values['test/hmr-value']).toBe(3)
    disposeFirst()
  })

  it('promotes the next live unowned definition when the legacy active registration unloads first', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })
    const disposeFirst = ctx.sessionProjections.register<'test/hmr-value', number>({
      key: 'test/hmr-value', schema: z.number(), init: () => 2,
      apply: state => state + 1, view: state => state, stateVersion: 1,
    })
    const disposeSecond = ctx.sessionProjections.register<'test/hmr-value', number>({
      key: 'test/hmr-value', schema: z.number(), init: () => 100,
      apply: state => state + 50, view: state => state, stateVersion: 1,
    })
    expect(ctx.sessionProjections.snapshot(session).values['test/hmr-value']).toBe(3)

    disposeFirst()
    expect(ctx.sessionProjections.snapshot(session).values['test/hmr-value']).toBe(150)
    disposeSecond()
  })
})
