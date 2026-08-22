import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { apply, inject } from '../src/invariant.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.dispose()
})

describe('media-provider invariant companion', () => {
  it('registers and disposes the intentionally relation-free N13 contribution', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(InvariantRegistry)
    const first = ctx.plugin({ inject: [...inject], apply })
    await expect(first).resolves.toBeDefined()
    await first.dispose()
    const second = ctx.plugin({ inject: [...inject], apply })
    await expect(second).resolves.toBeDefined()
  })
})
