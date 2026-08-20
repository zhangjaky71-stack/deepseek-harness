import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { decodeMediaWorkflow } from '@deepseek-ai/dsh-canvas'
import { z } from 'zod'
import MediaNodeRegistry, { MediaNodeRegistryError } from '../src/registry.ts'
import type { MediaNodeDefinition } from '../src/types.ts'

declare module '@deepseek-ai/dsh-canvas/types' {
  interface MediaWorkflowNodeTypeMap {
    'plugin.demo': true
  }
}

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.dispose()
})

const pluginDefinition: MediaNodeDefinition = {
  type: 'plugin.demo',
  version: 3,
  displayName: 'Plugin Demo',
  inputs: [{ name: 'prompt', type: 'text', required: true }],
  outputs: [{ name: 'image', type: 'image', required: true }],
  configSchema: z.object({ strength: z.number().min(0).max(1).default(0.5) }),
  defaultConfig: { strength: 0.5 },
  execution: {
    capability: 'image-to-image',
    deterministic: false,
    supportsPartialRun: true,
  },
  lifecycle: { deprecated: false, creatable: true, executable: true },
  ui: { category: 'plugin', icon: 'plugin-demo', inspectorKind: 'plugin-demo' },
}

const storedWorkflow = {
  id: 'workflow-plugin-demo',
  schemaVersion: 1,
  name: 'Plugin workflow',
  nodes: [{
    id: 'plugin-node',
    type: 'plugin.demo',
    nodeVersion: 3,
    config: {},
  }],
  edges: [],
  outputNodeIds: ['plugin-node'],
}

describe('open-world media node definitions', () => {
  it('keeps an unknown plugin node replayable before its definition is installed', async () => {
    const decoded = decodeMediaWorkflow(storedWorkflow)
    expect(decoded.value.nodes[0]).toMatchObject({ type: 'plugin.demo', nodeVersion: 3 })

    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(MediaNodeRegistry)
    expect(() => ctx.mediaNodes.assertExecutable(decoded.value.nodes[0]!)).toThrow(
      expect.objectContaining<Partial<MediaNodeRegistryError>>({ code: 'MEDIA_NODE_UNKNOWN_DEFINITION' }),
    )
  })

  it('resolves the same historical plugin node after the plugin registers its definition', async () => {
    const decoded = decodeMediaWorkflow(storedWorkflow)
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(MediaNodeRegistry)
    ctx.mediaNodes.register(pluginDefinition)

    expect(ctx.mediaNodes.resolveNode(decoded.value.nodes[0]!)).toMatchObject({
      type: 'plugin.demo',
      version: 3,
      displayName: 'Plugin Demo',
    })
    expect(ctx.mediaNodes.parseConfig(decoded.value.nodes[0]!)).toEqual({ strength: 0.5 })
    expect(ctx.mediaNodes.assertExecutable(decoded.value.nodes[0]!).version).toBe(3)
  })

  it('still rejects a future version of a known built-in node', () => {
    expect(() => decodeMediaWorkflow({
      ...storedWorkflow,
      nodes: [{ id: 'known-node', type: 'image.generate', nodeVersion: 99, config: {} }],
      outputNodeIds: ['known-node'],
    })).toThrow(expect.objectContaining({ code: 'CANVAS_UNSUPPORTED_FUTURE_NODE_VERSION' }))
  })
})
