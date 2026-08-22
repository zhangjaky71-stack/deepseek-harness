import { afterEach, describe, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { apply, inject } from '../src/invariant.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.dispose()
})

describe('media-provider-mock invariant companion', () => {
  it('registers, disposes, and re-registers its intentionally empty contribution', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(InvariantRegistry)
    const first = ctx.plugin({ inject: [...inject], apply })
    await first.await()
    await first.dispose()
    const second = ctx.plugin({ inject: [...inject], apply })
    await second.await()
  })
})
