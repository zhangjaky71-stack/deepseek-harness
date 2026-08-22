import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  MediaWorkflowId,
  WorkflowEdgeId,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas'
import type { CanvasImageAssetRef, MediaWorkflow } from '@deepseek-ai/dsh-canvas/types'
import MediaNodeRegistry from '@deepseek-ai/dsh-media-workflow'
import * as builtins from '@deepseek-ai/dsh-media-workflow/builtins'
import {
  MediaNodeExecutorRegistry,
  MediaWorkflowEngine,
} from '@deepseek-ai/dsh-media-workflow/engine'
import MediaModelRegistry from '@deepseek-ai/dsh-media-provider'
import {
  MediaProviderRuntimeRegistry,
  registerBuiltinMediaProviderExecutors,
  type MediaProviderOutputMaterializer,
} from '@deepseek-ai/dsh-media-provider/runtime'
import * as mockPlugin from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.fiber.dispose()
})

const promptId = WorkflowNodeId('prompt')
const generateId = WorkflowNodeId('generate')
const outputId = WorkflowNodeId('output')

const workflow: MediaWorkflow = {
  id: MediaWorkflowId('mock-provider-dag'),
  schemaVersion: 1,
  name: 'Mock Provider DAG',
  nodes: [
    { id: promptId, type: 'prompt', nodeVersion: 1, config: { text: 'glass city at dawn' } },
    { id: generateId, type: 'image.generate', nodeVersion: 1, config: { count: 2 } },
    { id: outputId, type: 'output', nodeVersion: 1, config: {} },
  ],
  edges: [
    {
      id: WorkflowEdgeId('prompt-to-generate'),
      sourceNodeId: promptId,
      sourcePort: 'text',
      targetNodeId: generateId,
      targetPort: 'prompt',
    },
    {
      id: WorkflowEdgeId('generate-to-output'),
      sourceNodeId: generateId,
      sourcePort: 'images',
      targetNodeId: outputId,
      targetPort: 'images',
    },
  ],
  outputNodeIds: [outputId],
}

function testImageAsset(index: number, bytes: number): CanvasImageAssetRef {
  return {
    kind: 'image',
    image: {
      attachmentId: `mock-dag-${index}`,
      mediaType: 'image/png',
      bytes,
      width: 1,
      height: 1,
    },
  } as CanvasImageAssetRef
}

describe('Mock Provider N12 integration', () => {
  it('runs prompt -> image.generate -> output without a cloud service or Canvas/Session write', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(MediaNodeRegistry)
    await ctx.plugin({ inject: [...builtins.inject], apply: builtins.apply }).await()
    await ctx.plugin(MediaModelRegistry)
    await ctx.plugin(MediaProviderRuntimeRegistry)
    const mockFiber = ctx.plugin({ inject: [...mockPlugin.inject], apply: mockPlugin.apply })
    await mockFiber.await()

    const materializedBytes: number[] = []
    const materializer: MediaProviderOutputMaterializer = {
      materialize(output, provenance) {
        materializedBytes.push(output.data.byteLength)
        const asset = testImageAsset(provenance.outputIndex, output.data.byteLength)
        return {
          value: { kind: 'image', asset },
          fingerprint: `mock-asset:${provenance.outputIndex}:${output.data.byteLength}`,
        }
      },
    }

    const executors = new MediaNodeExecutorRegistry()
    executors.register({ type: 'prompt', version: 1 }, {
      execute(context) {
        const node = context.workflow.nodes.find(item => item.id === context.nodeId)
        const text = String(node?.config.text ?? '')
        return { outputs: { text: { value: { kind: 'text', text }, fingerprint: `prompt:${text}` } } }
      },
    })
    executors.register({ type: 'output', version: 1 }, {
      execute() {
        return { outputs: {} }
      },
    })
    registerBuiltinMediaProviderExecutors(executors, {
      models: ctx.mediaModels,
      providers: ctx.mediaProviders,
      materializer,
    })

    const engine = new MediaWorkflowEngine(ctx.mediaNodes, executors)
    const result = await engine.run({
      workflow,
      executionIdentities: new Map([
        [generateId, { key: mockPlugin.MOCK_MEDIA_MODEL_DESCRIPTOR.executionIdentityKey }],
      ]),
    })

    const generated = result.nodes.get(generateId)?.outputs.images
    expect(generated?.value.kind).toBe('image-list')
    if (generated?.value.kind !== 'image-list') throw new Error('expected generated image-list')
    expect(generated.value.assets).toHaveLength(2)
    expect(generated.value.assets.map(asset => asset.image.attachmentId)).toEqual([
      'mock-dag-0',
      'mock-dag-1',
    ])
    expect(materializedBytes).toHaveLength(2)
    expect(result.nodes.get(outputId)?.cacheHit).toBe(false)

    await mockFiber.dispose()
    expect(ctx.mediaModels.getProvider(mockPlugin.MOCK_MEDIA_PROVIDER_ID)).toBeUndefined()
    expect(ctx.mediaProviders.get(mockPlugin.MOCK_MEDIA_PROVIDER_ID)).toBeUndefined()
  })
})
