import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { MediaWorkflowId, WorkflowNodeId } from '@deepseek-ai/dsh-canvas'
import type { CanvasImageAssetRef, MediaWorkflow } from '@deepseek-ai/dsh-canvas/types'
import { BUILTIN_MEDIA_NODE_DEFINITIONS } from '@deepseek-ai/dsh-media-workflow/builtins'
import { MediaNodeExecutorRegistry } from '@deepseek-ai/dsh-media-workflow/engine'
import type {
  MediaNodeExecutionFingerprint,
  MediaNodeExecutorContext,
} from '@deepseek-ai/dsh-media-workflow/engine'
import { MediaProviderId } from '../src/brand.ts'
import MediaModelRegistry from '../src/model-registry.ts'
import {
  BUILTIN_MEDIA_PROVIDER_BINDINGS,
  createMediaProviderNodeExecutor,
  registerBuiltinMediaProviderExecutors,
} from '../src/provider-executor.ts'
import { MediaProviderRuntimeRegistry } from '../src/provider-runtime.ts'
import type {
  MediaProvider,
  MediaProviderMaterializedOutput,
  MediaProviderOutputMaterializer,
  MediaProviderRequest,
} from '../src/runtime-types.ts'
import { capabilities, model, provider } from './model-fixture.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.fiber.dispose()
})

const definition = BUILTIN_MEDIA_NODE_DEFINITIONS.find(item => item.type === 'image.generate')!
const nodeId = WorkflowNodeId('generate')
const providerId = MediaProviderId('executor-provider')
const descriptor = provider('executor-provider')
const descriptorModel = model(providerId, 'image-model', {
  executionIdentityKey: 'executor-provider/image-model@1',
  capabilities: capabilities({ operations: ['text-to-image'], maxReferenceImages: 8 }),
})

const workflow: MediaWorkflow = {
  id: MediaWorkflowId('provider-executor-workflow'),
  schemaVersion: 1,
  name: 'Provider executor test',
  nodes: [{ id: nodeId, type: 'image.generate', nodeVersion: 1, config: { count: 2 } }],
  edges: [],
  outputNodeIds: [nodeId],
}

const fingerprint: MediaNodeExecutionFingerprint = {
  algorithm: 'sha256',
  value: 'provider-executor-fingerprint',
  cacheable: false,
  nodeType: 'image.generate',
  nodeVersion: 1,
  executionIdentityKey: descriptorModel.executionIdentityKey,
}

function executionContext(identity = descriptorModel.executionIdentityKey): MediaNodeExecutorContext {
  return {
    workflow,
    nodeId,
    definition,
    inputs: {
      prompt: [{ value: { kind: 'text', text: 'draw a lighthouse' }, fingerprint: 'prompt:1' }],
    },
    fingerprint,
    executionIdentity: { key: identity },
  }
}

async function harness(providerRuntime: MediaProvider) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(MediaModelRegistry)
  ctx.mediaModels.register(descriptor, [descriptorModel])
  await ctx.plugin(MediaProviderRuntimeRegistry)
  ctx.mediaProviders.register(providerId, providerRuntime)
  return ctx
}

function imageValue(index: number): MediaProviderMaterializedOutput {
  const asset = {
    kind: 'image',
    image: {
      attachmentId: `materialized-${index}`,
      mediaType: 'image/png',
      bytes: 1,
      width: 1,
      height: 1,
    },
  } as CanvasImageAssetRef
  return {
    value: { kind: 'image', asset },
    fingerprint: `asset:${index}`,
  }
}

function imageProvider(capture: (request: MediaProviderRequest) => void): MediaProvider {
  return {
    start(request) {
      capture(request)
      return {
        mode: 'inline',
        completion: {
          providerRequestId: 'provider-request-1',
          outputs: [0, 1].map(index => ({
            kind: 'image' as const,
            mediaType: 'image/png',
            data: new Uint8Array([index + 1]),
            providerOutputId: `provider-output-${index}`,
          })),
        },
      }
    },
    resume() {
      throw new Error('inline provider must not resume')
    },
    cancel() {},
  }
}

describe('Provider-backed N12 executor', () => {
  it('builds a semantic request and materializes validated outputs with safe provenance', async () => {
    let captured: MediaProviderRequest | undefined
    const ctx = await harness(imageProvider(request => { captured = request }))
    const materializedIndices: number[] = []
    const materializer: MediaProviderOutputMaterializer = {
      materialize(output, provenance) {
        expect(output.data).toBeInstanceOf(Uint8Array)
        expect(provenance).toMatchObject({
          providerId,
          modelId: descriptorModel.id,
          executionIdentityKey: descriptorModel.executionIdentityKey,
          nodeId,
          operationMode: 'inline',
          providerRequestId: 'provider-request-1',
        })
        materializedIndices.push(provenance.outputIndex)
        return imageValue(provenance.outputIndex)
      },
    }
    const binding = BUILTIN_MEDIA_PROVIDER_BINDINGS.find(item => item.ref.type === 'image.generate')!
    const executor = createMediaProviderNodeExecutor(binding, {
      models: ctx.mediaModels,
      providers: ctx.mediaProviders,
      materializer,
    })

    const result = await executor.execute(executionContext())
    expect(captured).toMatchObject({
      providerId,
      modelId: descriptorModel.id,
      executionIdentityKey: descriptorModel.executionIdentityKey,
      capability: 'text-to-image',
      prompt: 'draw a lighthouse',
      count: 2,
      references: [],
    })
    expect(captured).not.toHaveProperty('credential')
    expect(captured).not.toHaveProperty('url')
    expect(materializedIndices).toEqual([0, 1])
    expect(result.outputs.images?.value).toMatchObject({ kind: 'image-list' })
    if (result.outputs.images?.value.kind !== 'image-list') throw new Error('expected image-list')
    expect(result.outputs.images.value.assets).toHaveLength(2)
    expect(result.outputs.images.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects an unexpected Provider media kind before invoking the materializer', async () => {
    const badProvider: MediaProvider = {
      start() {
        return {
          mode: 'inline',
          completion: {
            outputs: [
              { kind: 'video', mediaType: 'video/mp4', data: new Uint8Array([1]) },
              { kind: 'video', mediaType: 'video/mp4', data: new Uint8Array([2]) },
            ],
          },
        }
      },
      resume() {
        throw new Error('not reached')
      },
      cancel() {},
    }
    const ctx = await harness(badProvider)
    let materializeCalls = 0
    const materializer: MediaProviderOutputMaterializer = {
      materialize() {
        materializeCalls += 1
        return imageValue(0)
      },
    }
    const binding = BUILTIN_MEDIA_PROVIDER_BINDINGS.find(item => item.ref.type === 'image.generate')!
    const executor = createMediaProviderNodeExecutor(binding, {
      models: ctx.mediaModels,
      providers: ctx.mediaProviders,
      materializer,
    })

    await expect(executor.execute(executionContext())).rejects.toMatchObject({
      code: 'MEDIA_PROVIDER_INVALID_RESULT',
    })
    expect(materializeCalls).toBe(0)
  })

  it('fails closed when the N13 execution identity is missing or stale', async () => {
    const ctx = await harness(imageProvider(() => {}))
    const binding = BUILTIN_MEDIA_PROVIDER_BINDINGS.find(item => item.ref.type === 'image.generate')!
    const executor = createMediaProviderNodeExecutor(binding, {
      models: ctx.mediaModels,
      providers: ctx.mediaProviders,
      materializer: { materialize: () => imageValue(0) },
    })

    const { executionIdentity: _identity, ...withoutIdentity } = executionContext()
    await expect(executor.execute(withoutIdentity)).rejects.toMatchObject({
      code: 'MEDIA_PROVIDER_EXECUTION_IDENTITY_REQUIRED',
    })
    await expect(executor.execute(executionContext('stale-provider/model@old'))).rejects.toMatchObject({
      code: 'MEDIA_PROVIDER_MODEL_NOT_FOUND',
    })
  })

  it('rolls back built-in executor registration when one exact binding conflicts', async () => {
    const ctx = await harness(imageProvider(() => {}))
    const executors = new MediaNodeExecutorRegistry()
    executors.register({ type: 'image.edit', version: 1 }, { execute: async () => ({ outputs: {} }) })

    expect(() => registerBuiltinMediaProviderExecutors(executors, {
      models: ctx.mediaModels,
      providers: ctx.mediaProviders,
      materializer: { materialize: () => imageValue(0) },
    })).toThrow(/image\.edit@1 is already registered/)

    expect(() => executors.require({ type: 'image.generate', version: 1 })).toThrow(/No executor is registered/)
  })

  it('removes every built-in Provider executor through the returned disposer', async () => {
    const ctx = await harness(imageProvider(() => {}))
    const executors = new MediaNodeExecutorRegistry()
    const dispose = registerBuiltinMediaProviderExecutors(executors, {
      models: ctx.mediaModels,
      providers: ctx.mediaProviders,
      materializer: { materialize: () => imageValue(0) },
    })
    expect(executors.require({ type: 'image.generate', version: 1 })).toBeDefined()
    expect(executors.require({ type: 'video.generate', version: 1 })).toBeDefined()
    dispose()
    expect(() => executors.require({ type: 'image.generate', version: 1 })).toThrow(/No executor is registered/)
  })
})
