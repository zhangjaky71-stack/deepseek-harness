import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import SessionProjectionCache from '../src/index.ts'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    'cache-identity/value': string
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'cache-identity/set': { value: string }
  }

  interface OutOfBandSessionEventMap {
    'cache-identity/set': true
  }
}

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function harness(logs = new Map<string, SessionEvent[]>()) {
  const ctx = new Context()
  contexts.push(ctx)

  const pool = new MemoryMediaPool()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)

  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  ctx.sessionProjections.register<'cache-identity/value', string>({
    key: 'cache-identity/value',
    schema: z.string(),
    init: () => 'empty',
    apply: (state, event) => event.type === 'cache-identity/set' ? event.data.value : state,
    view: state => state,
    stateVersion: 1,
  })

  ctx.provide('sessionPersistence', {
    readFrom: async (id: ReturnType<typeof SessionId>, fromSeq: number) => {
      const events = logs.get(String(id))
      if (events === undefined) throw new Error(`session "${id}" not found`)
      return {
        meta: { version: 0, id, createdAt: 0 },
        events: events.filter(event => event.seq >= fromSeq),
      }
    },
  } as never)

  await ctx.plugin(SessionProjectionCache, { writeEveryEvents: 100, writeIntervalMs: 60_000 })
  return { ctx, logs }
}

describe('SessionProjectionCache browser read identity', () => {
  it('passes the exact listed SessionId through checkpoint read guards', async () => {
    const { ctx } = await harness()
    const session = ctx.sessions.create(SessionId('cache-identity-listed'))
    session.append('cache-identity/set', { value: 'secret-for-target' })
    await ctx.sessionProjectionCache.write(session)

    const seen: Array<string | undefined> = []
    let allowed = String(session.id)
    ctx.sessionProjections.registerReadGuard('cache-identity/value', (context) => {
      seen.push(context.sessionId)
      return context.sessionId === allowed
    })

    expect(ctx.sessionProjectionCache.cachedSnapshot(session.header)?.values['cache-identity/value'])
      .toBe('secret-for-target')
    expect(seen.at(-1)).toBe(String(session.id))

    allowed = 'another-session'
    expect(ctx.sessionProjectionCache.cachedSnapshot(session.header)).toBeUndefined()
    expect(seen.at(-1)).toBe(String(session.id))
  })

  it('passes the exact persisted SessionId through cold restore read guards', async () => {
    const { ctx, logs } = await harness()
    const id = SessionId('cache-identity-cold')
    const source = ctx.sessions.create(id)
    source.append('cache-identity/set', { value: 'cold-target' })
    logs.set(String(id), [...source.events])

    const seen: Array<string | undefined> = []
    let allowed = String(id)
    ctx.sessionProjections.registerReadGuard('cache-identity/value', (context) => {
      seen.push(context.sessionId)
      return context.sessionId === allowed
    })

    const visible = await ctx.sessionProjectionCache.coldSnapshot(id)
    expect(visible.values['cache-identity/value']).toBe('cold-target')
    expect(seen.at(-1)).toBe(String(id))

    allowed = 'another-session'
    const denied = await ctx.sessionProjectionCache.coldSnapshot(id)
    expect(denied.values).not.toHaveProperty('cache-identity/value')
    expect(seen.at(-1)).toBe(String(id))
  })
})
