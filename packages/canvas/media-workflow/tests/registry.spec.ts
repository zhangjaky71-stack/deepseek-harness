import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import type { MediaNodeDefinition } from '../src/types.ts'
import MediaNodeRegistry, { MediaNodeRegistryError } from '../src/registry.ts'
import { BUILTIN_MEDIA_NODE_DEFINITIONS, apply as applyBuiltins, inject as builtinsInject } from '../src/builtins.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.dispose()
})

const configSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))

function definition(version: number, overrides: Partial<MediaNodeDefinition> = {}): MediaNodeDefinition {
  return {
    type: 'prompt',
    version,
    displayName: `Prompt v${version}`,
    inputs: [],
    outputs: [{ name: 'text', type: 'text', required: true }],
    configSchema,
    defaultConfig: {},
    execution: { deterministic: true, supportsPartialRun: true },
    lifecycle: { deprecated: false, creatable: true, executable: true },
    ui: { category: 'prompt', icon: 'prompt', inspectorKind: 'prompt' },
    ...overrides,
  }
}

async function registryHarness() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(MediaNodeRegistry)
  return ctx
}

describe('MediaNodeRegistry', () => {
  it('rejects duplicate type/version registration without replacing the first definition or advancing revision', async () => {
    const ctx = await registryHarness()
    const first = definition(9)
    ctx.mediaNodes.register(first)
    expect(ctx.mediaNodes.snapshot().revision).toBe(1)
    expect(() => ctx.mediaNodes.register(definition(9, { displayName: 'Duplicate' }))).toThrow(
      expect.objectContaining<Partial<MediaNodeRegistryError>>({ code: 'MEDIA_NODE_DUPLICATE_DEFINITION' }),
    )
    expect(ctx.mediaNodes.get('prompt', 9)?.displayName).toBe(first.displayName)
    expect(ctx.mediaNodes.snapshot().revision).toBe(1)
  })

  it('versions register, unload, and HMR-style replacement as distinct registry mutations', async () => {
    const ctx = await registryHarness()
    expect(ctx.mediaNodes.snapshot()).toEqual({ revision: 0, definitions: [] })

    const changes: Array<{ kind: string; revision: number }> = []
    ctx.mediaNodes.onChange(change => { changes.push({ kind: change.kind, revision: change.revision }) })
    const plugin = (displayName: string) => ({
      inject: ['mediaNodes'],
      apply(pluginCtx: Context) {
        pluginCtx.mediaNodes.register(definition(11, { displayName }))
      },
    })

    const first = ctx.plugin(plugin('Plugin v1'))
    await first.await()
    expect(ctx.mediaNodes.snapshot()).toMatchObject({
      revision: 1,
      definitions: [{ version: 11, displayName: 'Plugin v1' }],
    })

    await first.dispose()
    expect(ctx.mediaNodes.snapshot()).toEqual({ revision: 2, definitions: [] })

    const replacement = ctx.plugin(plugin('Plugin v2'))
    await replacement.await()
    expect(ctx.mediaNodes.snapshot()).toMatchObject({
      revision: 3,
      definitions: [{ version: 11, displayName: 'Plugin v2' }],
    })
    await replacement.dispose()
    expect(ctx.mediaNodes.snapshot()).toEqual({ revision: 4, definitions: [] })
    expect(changes).toEqual([
      { kind: 'registered', revision: 1 },
      { kind: 'unregistered', revision: 2 },
      { kind: 'registered', revision: 3 },
      { kind: 'unregistered', revision: 4 },
    ])
  })

  it('keeps deprecated definitions resolvable/executable while refusing new creation', async () => {
    const ctx = await registryHarness()
    ctx.mediaNodes.register(definition(12, {
      lifecycle: {
        deprecated: true,
        creatable: false,
        executable: true,
        replacement: { type: 'prompt', version: 1 },
      },
    }))
    expect(ctx.mediaNodes.get('prompt', 12)?.lifecycle.deprecated).toBe(true)
    expect(() => ctx.mediaNodes.assertCreatable({ type: 'prompt', version: 12 })).toThrow(
      expect.objectContaining<Partial<MediaNodeRegistryError>>({ code: 'MEDIA_NODE_NOT_CREATABLE' }),
    )
    expect(ctx.mediaNodes.assertExecutable({ type: 'prompt', nodeVersion: 12, config: {} }).version).toBe(12)
  })

  it('blocks intrinsic executable=false before a later workflow validator can run it', async () => {
    const ctx = await registryHarness()
    ctx.mediaNodes.register(definition(13, {
      lifecycle: { deprecated: false, creatable: true, executable: false },
    }))
    expect(() => ctx.mediaNodes.assertExecutable({ type: 'prompt', nodeVersion: 13, config: {} })).toThrow(
      expect.objectContaining<Partial<MediaNodeRegistryError>>({ code: 'MEDIA_NODE_NOT_EXECUTABLE' }),
    )
  })

  it('registers all seven V1 semantic definitions with stable ports, UI metadata, and Video feature requirements', async () => {
    const ctx = await registryHarness()
    const fiber = ctx.plugin({ inject: [...builtinsInject], apply: applyBuiltins })
    await fiber.await()
    expect(ctx.mediaNodes.list().map(item => item.type).sort()).toEqual([
      'asset.input',
      'image.edit',
      'image.generate',
      'output',
      'prompt',
      'video.generate',
      'video.image-to-video',
    ])
    expect(ctx.mediaNodes.snapshot().revision).toBe(7)
    expect(BUILTIN_MEDIA_NODE_DEFINITIONS).toHaveLength(7)
    expect(ctx.mediaNodes.get('image.edit')?.inputs.map(port => port.type)).toEqual(['image', 'text', 'mask'])
    expect(ctx.mediaNodes.get('image.generate')?.outputs[0]?.type).toBe('image-list')
    expect(ctx.mediaNodes.get('output')?.inputs.map(port => port.type)).toEqual(['image-list', 'video-list'])
    expect(ctx.mediaNodes.get('video.generate')?.execution).toMatchObject({
      capability: 'text-to-video',
      feature: 'video',
      deterministic: false,
    })
    for (const item of ctx.mediaNodes.list()) {
      expect(item.ui.category).not.toBe('')
      expect(item.ui.icon).not.toBe('')
      expect(item.ui.inspectorKind).not.toBe('')
    }
  })

  it('normalizes built-in defaults and rejects invalid semantic config through the same definition schema', async () => {
    const ctx = await registryHarness()
    await ctx.plugin({ inject: [...builtinsInject], apply: applyBuiltins })
    expect(ctx.mediaNodes.parseConfig({ type: 'prompt', config: {} })).toEqual({ text: '' })
    expect(ctx.mediaNodes.parseConfig({ type: 'image.generate', config: {} })).toEqual({ count: 1 })
    expect(() => ctx.mediaNodes.parseConfig({ type: 'image.generate', config: { count: 0 } })).toThrow(
      expect.objectContaining<Partial<MediaNodeRegistryError>>({ code: 'MEDIA_NODE_INVALID_CONFIG' }),
    )
  })
})
