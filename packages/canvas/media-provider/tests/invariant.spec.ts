import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import MediaModelRegistry from '../src/model-registry.ts'
import { MediaProviderRuntimeRegistry } from '../src/provider-runtime.ts'
import type { MediaProvider } from '../src/runtime-types.ts'
import { apply, inject } from '../src/invariant.ts'
import { model, provider } from './model-fixture.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.fiber.dispose()
})

const runtime: MediaProvider = {
  start() {
    return {
      mode: 'inline',
      completion: {
        outputs: [{ kind: 'image', mediaType: 'image/png', data: new Uint8Array([1]) }],
      },
    }
  },
  resume() {
    throw new Error('inline invariant fixture must not resume')
  },
  cancel() {},
}

async function harness(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(InvariantRegistry)
  await ctx.plugin(MediaModelRegistry)
  await ctx.plugin(MediaProviderRuntimeRegistry)
  return ctx
}

describe('media-provider invariant companion', () => {
  it('registers, disposes, and re-registers while catalog/runtime authorities agree', async () => {
    const ctx = await harness()
    const descriptor = provider('invariant-provider')
    ctx.mediaModels.register(descriptor, [model(descriptor.id, 'invariant-model')])
    ctx.mediaProviders.register(descriptor.id, runtime)

    const first = ctx.plugin({ inject: [...inject], apply })
    await first.await()
    await first.dispose()
    const second = ctx.plugin({ inject: [...inject], apply })
    await second.await()
  })

  it('rejects reconstructed state with a runtime adapter whose catalog Provider was removed', async () => {
    const ctx = await harness()
    const descriptor = provider('orphan-invariant-provider')
    const disposeCatalog = ctx.mediaModels.register(descriptor, [model(descriptor.id, 'orphan-model')])
    ctx.mediaProviders.register(descriptor.id, runtime)
    disposeCatalog()

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await expect(fiber.await()).rejects.toMatchObject({
      code: 'INVARIANT',
      packageName: '@deepseek-ai/dsh-media-provider',
    })
  })
})
