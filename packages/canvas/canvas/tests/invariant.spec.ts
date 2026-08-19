import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as CanvasInvariantCompanion from '@deepseek-ai/dsh-canvas/invariant'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { createChange } from './canvas-fixtures.ts'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry, { enabled: true })
  await ctx.plugin(CanvasInvariantCompanion)
  return ctx
}

describe('Canvas stream invariants', () => {
  it('accepts a canonical full-snapshot Canvas change', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-invariant-valid'))
    expect(() => session.append('canvas/change', createChange())).not.toThrow()
    expect(session.seq).toBe(1)
  })

  it('rejects a malformed Canvas change before commit and keeps the fold reusable', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('canvas-invariant-invalid'))
    const change = createChange()
    expect(() => session.append('canvas/change', { ...change, extra: true } as never)).toThrow(
      expect.objectContaining<Partial<InvariantError>>({
        code: 'INVARIANT',
        packageName: '@deepseek-ai/dsh-canvas',
      }),
    )
    expect(session.seq).toBe(0)
    expect(() => session.append('canvas/change', change)).not.toThrow()
    expect(session.seq).toBe(1)
  })

  it('reconstructs existing Canvas history before validating later changes', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('canvas-invariant-late-load'))
    const change = createChange()
    session.append('canvas/change', change)

    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(CanvasInvariantCompanion)
    expect(() => session.append('canvas/change', {
      kind: 'canvas/change',
      version: 1,
      operation: 'clear',
      canvas: null,
      meta: { schemaVersion: 1 },
    })).not.toThrow()
    expect(session.seq).toBe(2)
  })
})
