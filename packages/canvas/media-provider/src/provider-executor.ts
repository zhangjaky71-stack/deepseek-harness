/** Generic N12 executor bridge for Provider-backed built-in media nodes. */

import { createHash } from 'node:crypto'
import type { CanvasImageAssetRef, CanvasJsonValue } from '@deepseek-ai/dsh-canvas/types'
import type {
  MediaNodeExecutionInputs,
  MediaNodeExecutionOutput,
  MediaNodeExecutor,
  MediaNodeExecutorContext,
  MediaNodeExecutorResult,
} from '@deepseek-ai/dsh-media-workflow/engine'
import { MediaNodeExecutorRegistry } from '@deepseek-ai/dsh-media-workflow/engine'
import type { MediaNodeDefinitionRef } from '@deepseek-ai/dsh-media-workflow/types'
import type { MediaModelDescriptor } from './types.ts'
import { MediaModelRegistry } from './model-registry.ts'
import type {
  MediaProviderMaterializedOutput,
  MediaProviderNodeBindingContext,
  MediaProviderOutputMaterializer,
  MediaProviderRequest,
  MediaProviderRunResult,
} from './runtime-types.ts'
import {
  MediaProviderError,
  MediaProviderRuntimeRegistry,
  runMediaProviderOperation,
} from './provider-runtime.ts'

/** Exact semantic node binding for the generic Provider executor bridge. */
export interface MediaProviderExecutorBinding {
  readonly ref: MediaNodeDefinitionRef
  readonly capability: MediaProviderRequest['capability']
  readonly outputKind: 'image' | 'video'
  outputCount(context: MediaProviderNodeBindingContext): number
  buildRequest(context: MediaProviderNodeBindingContext): MediaProviderRequest
  buildResult(
    context: MediaProviderNodeBindingContext,
    run: MediaProviderRunResult,
    materialized: readonly MediaProviderMaterializedOutput[],
  ): MediaNodeExecutorResult
}

/** Dependencies shared by every Provider-backed node executor. */
export interface MediaProviderExecutorDependencies {
  readonly models: MediaModelRegistry
  readonly providers: MediaProviderRuntimeRegistry
  readonly materializer: MediaProviderOutputMaterializer
}

function nodeConfig(context: MediaNodeExecutorContext): Readonly<Record<string, CanvasJsonValue>> {
  const node = context.workflow.nodes.find(candidate => candidate.id === context.nodeId)
  if (node === undefined) {
    throw new MediaProviderError('MEDIA_PROVIDER_INVALID_OPERATION', `Provider executor could not resolve workflow node ${context.nodeId}`)
  }
  return node.config
}

function findResolvedModel(context: MediaNodeExecutorContext, models: MediaModelRegistry): MediaModelDescriptor {
  const key = context.executionIdentity?.key
  if (key === undefined) {
    throw new MediaProviderError(
      'MEDIA_PROVIDER_EXECUTION_IDENTITY_REQUIRED',
      `Provider-backed node ${context.definition.type}@${context.definition.version} requires a resolved execution identity`,
    )
  }
  const model = models.listModels().find(candidate => candidate.executionIdentityKey === key)
  if (model === undefined) {
    throw new MediaProviderError(
      'MEDIA_PROVIDER_MODEL_NOT_FOUND',
      'Resolved media model identity is no longer present in the model catalog',
    )
  }
  const provider = models.getProvider(model.providerId)
  if (provider?.enabled !== true || !model.enabled) {
    throw new MediaProviderError(
      'MEDIA_PROVIDER_MODEL_NOT_FOUND',
      'Resolved media model is no longer enabled in the model catalog',
      { providerId: model.providerId },
    )
  }
  return model
}

function bindingContext(
  context: MediaNodeExecutorContext,
  model: MediaModelDescriptor,
): MediaProviderNodeBindingContext {
  return Object.freeze({
    providerId: model.providerId,
    modelId: model.id,
    executionIdentityKey: model.executionIdentityKey,
    nodeId: context.nodeId,
    nodeType: context.definition.type,
    nodeVersion: context.definition.version,
    config: nodeConfig(context),
    inputs: context.inputs,
    fingerprint: context.fingerprint,
  })
}

function assertRequestIdentity(request: MediaProviderRequest, model: MediaModelDescriptor): void {
  if (request.providerId === model.providerId
    && request.modelId === model.id
    && request.executionIdentityKey === model.executionIdentityKey) return
  throw new MediaProviderError(
    'MEDIA_PROVIDER_INVALID_OPERATION',
    'Provider node binding returned a request for a different resolved model identity',
    { providerId: model.providerId },
  )
}

function assertRawOutputs(
  binding: MediaProviderExecutorBinding,
  context: MediaProviderNodeBindingContext,
  run: MediaProviderRunResult,
): void {
  const expectedCount = binding.outputCount(context)
  if (run.completion.outputs.length === expectedCount
    && run.completion.outputs.every(output => output.kind === binding.outputKind)) return
  throw new MediaProviderError(
    'MEDIA_PROVIDER_INVALID_RESULT',
    `Media Provider ${context.providerId} returned an unexpected ${binding.outputKind} output set`,
    { providerId: context.providerId },
  )
}

async function materializeOutputs(
  materializer: MediaProviderOutputMaterializer,
  binding: MediaProviderNodeBindingContext,
  run: MediaProviderRunResult,
): Promise<readonly MediaProviderMaterializedOutput[]> {
  return Promise.all(run.completion.outputs.map((output, outputIndex) => materializer.materialize(output, {
    providerId: binding.providerId,
    modelId: binding.modelId,
    executionIdentityKey: binding.executionIdentityKey,
    nodeId: binding.nodeId,
    fingerprint: binding.fingerprint,
    outputIndex,
    operationMode: run.mode,
    ...(run.providerTaskId === undefined ? {} : { providerTaskId: run.providerTaskId }),
    ...(run.completion.providerRequestId === undefined ? {} : { providerRequestId: run.completion.providerRequestId }),
  })))
}

/** Construct one N12 executor without making N12 aware of Provider routing. */
export function createMediaProviderNodeExecutor(
  binding: MediaProviderExecutorBinding,
  dependencies: MediaProviderExecutorDependencies,
): MediaNodeExecutor {
  return Object.freeze({
    async execute(context: MediaNodeExecutorContext): Promise<MediaNodeExecutorResult> {
      if (context.definition.type !== binding.ref.type || context.definition.version !== binding.ref.version) {
        throw new MediaProviderError(
          'MEDIA_PROVIDER_INVALID_OPERATION',
          `Provider executor binding ${binding.ref.type}@${binding.ref.version} received ${context.definition.type}@${context.definition.version}`,
        )
      }
      if (context.definition.execution.capability !== binding.capability) {
        throw new MediaProviderError(
          'MEDIA_PROVIDER_INVALID_OPERATION',
          'Provider executor binding capability does not match the node definition',
        )
      }
      const model = findResolvedModel(context, dependencies.models)
      if (!model.capabilities.operations.includes(binding.capability)) {
        throw new MediaProviderError(
          'MEDIA_PROVIDER_INVALID_OPERATION',
          `Resolved media model does not advertise ${binding.capability}`,
          { providerId: model.providerId },
        )
      }
      const semantic = bindingContext(context, model)
      const request = binding.buildRequest(semantic)
      assertRequestIdentity(request, model)
      const provider = dependencies.providers.require(model.providerId)
      const run = await runMediaProviderOperation(provider, request, context.signal)
      // Validate Provider semantics before N17/N21 materialization can durably store any bytes.
      assertRawOutputs(binding, semantic, run)
      const materialized = await materializeOutputs(dependencies.materializer, semantic, run)
      return binding.buildResult(semantic, run, materialized)
    },
  })
}

function onlyValue(inputs: MediaNodeExecutionInputs, port: string): MediaNodeExecutionOutput | undefined {
  const values = inputs[port]
  if (values === undefined || values.length === 0) return undefined
  if (values.length === 1) return values[0]
  throw new MediaProviderError('MEDIA_PROVIDER_INVALID_OPERATION', `Provider binding expected one value on input ${port}`)
}

function requiredText(inputs: MediaNodeExecutionInputs, port: string): string {
  const value = onlyValue(inputs, port)?.value
  if (value?.kind === 'text') return value.text
  throw new MediaProviderError('MEDIA_PROVIDER_INVALID_OPERATION', `Provider binding requires text input ${port}`)
}

function optionalText(inputs: MediaNodeExecutionInputs, port: string): string | undefined {
  const value = onlyValue(inputs, port)?.value
  if (value === undefined) return undefined
  if (value.kind === 'text') return value.text
  throw new MediaProviderError('MEDIA_PROVIDER_INVALID_OPERATION', `Provider binding expected text input ${port}`)
}

function requiredImage(inputs: MediaNodeExecutionInputs, port: string): CanvasImageAssetRef {
  const value = onlyValue(inputs, port)?.value
  if (value?.kind === 'image') return value.asset
  throw new MediaProviderError('MEDIA_PROVIDER_INVALID_OPERATION', `Provider binding requires image input ${port}`)
}

function optionalMask(inputs: MediaNodeExecutionInputs, port: string): CanvasImageAssetRef | undefined {
  const value = onlyValue(inputs, port)?.value
  if (value === undefined) return undefined
  if (value.kind === 'mask') return value.asset
  throw new MediaProviderError('MEDIA_PROVIDER_INVALID_OPERATION', `Provider binding expected mask input ${port}`)
}

function optionalImageList(inputs: MediaNodeExecutionInputs, port: string): readonly CanvasImageAssetRef[] {
  const value = onlyValue(inputs, port)?.value
  if (value === undefined) return []
  if (value.kind === 'image-list') return value.assets
  throw new MediaProviderError('MEDIA_PROVIDER_INVALID_OPERATION', `Provider binding expected image-list input ${port}`)
}

function countFromConfig(config: Readonly<Record<string, CanvasJsonValue>>): number {
  const count = config.count
  if (typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= 8) return count
  throw new MediaProviderError('MEDIA_PROVIDER_INVALID_OPERATION', 'image.generate config.count must be an integer from 1 through 8')
}

function common(context: MediaProviderNodeBindingContext): Pick<
  MediaProviderRequest,
  'providerId' | 'modelId' | 'executionIdentityKey' | 'nodeType' | 'nodeVersion' | 'config'
> {
  return {
    providerId: context.providerId,
    modelId: context.modelId,
    executionIdentityKey: context.executionIdentityKey,
    nodeType: context.nodeType,
    nodeVersion: context.nodeVersion,
    config: context.config,
  }
}

function assertMaterializedKind(
  materialized: readonly MediaProviderMaterializedOutput[],
  kind: 'image' | 'video',
  count: number,
  providerId: MediaProviderNodeBindingContext['providerId'],
): void {
  if (materialized.length === count && materialized.every(item => item.value.kind === kind && item.fingerprint.trim() !== '')) return
  throw new MediaProviderError(
    'MEDIA_PROVIDER_INVALID_RESULT',
    `Media Provider ${providerId} materializer returned an unexpected ${kind} output set`,
    { providerId },
  )
}

function listFingerprint(kind: 'image-list' | 'video-list', outputs: readonly MediaProviderMaterializedOutput[]): string {
  return createHash('sha256')
    .update(JSON.stringify({ kind, fingerprints: outputs.map(output => output.fingerprint) }))
    .digest('hex')
}

/** Built-in provider-backed semantic bindings. Provider implementations do not need to re-register these. */
export const BUILTIN_MEDIA_PROVIDER_BINDINGS: readonly MediaProviderExecutorBinding[] = Object.freeze([
  Object.freeze({
    ref: Object.freeze({ type: 'image.generate', version: 1 }),
    capability: 'text-to-image',
    outputKind: 'image',
    outputCount: (context: MediaProviderNodeBindingContext) => countFromConfig(context.config),
    buildRequest(context: MediaProviderNodeBindingContext): MediaProviderRequest {
      return Object.freeze({
        ...common(context),
        capability: 'text-to-image',
        prompt: requiredText(context.inputs, 'prompt'),
        count: countFromConfig(context.config),
        references: Object.freeze([...optionalImageList(context.inputs, 'references')]),
      })
    },
    buildResult(context: MediaProviderNodeBindingContext, _run: MediaProviderRunResult, materialized: readonly MediaProviderMaterializedOutput[]): MediaNodeExecutorResult {
      const count = countFromConfig(context.config)
      assertMaterializedKind(materialized, 'image', count, context.providerId)
      const assets = materialized.map(item => item.value.kind === 'image' ? item.value.asset : neverMaterialized())
      return Object.freeze({
        outputs: Object.freeze({
          images: Object.freeze({
            value: Object.freeze({ kind: 'image-list', assets: Object.freeze(assets) }),
            fingerprint: listFingerprint('image-list', materialized),
          }),
        }),
      })
    },
  } satisfies MediaProviderExecutorBinding),
  Object.freeze({
    ref: Object.freeze({ type: 'image.edit', version: 1 }),
    capability: 'image-edit',
    outputKind: 'image',
    outputCount: () => 1,
    buildRequest(context: MediaProviderNodeBindingContext): MediaProviderRequest {
      const mask = optionalMask(context.inputs, 'mask')
      return Object.freeze({
        ...common(context),
        capability: 'image-edit',
        image: requiredImage(context.inputs, 'image'),
        prompt: requiredText(context.inputs, 'prompt'),
        ...(mask === undefined ? {} : { mask }),
      })
    },
    buildResult(context: MediaProviderNodeBindingContext, _run: MediaProviderRunResult, materialized: readonly MediaProviderMaterializedOutput[]): MediaNodeExecutorResult {
      assertMaterializedKind(materialized, 'image', 1, context.providerId)
      return Object.freeze({ outputs: Object.freeze({ image: materialized[0]! }) })
    },
  } satisfies MediaProviderExecutorBinding),
  Object.freeze({
    ref: Object.freeze({ type: 'video.generate', version: 1 }),
    capability: 'text-to-video',
    outputKind: 'video',
    outputCount: () => 1,
    buildRequest(context: MediaProviderNodeBindingContext): MediaProviderRequest {
      return Object.freeze({
        ...common(context),
        capability: 'text-to-video',
        prompt: requiredText(context.inputs, 'prompt'),
      })
    },
    buildResult(context: MediaProviderNodeBindingContext, _run: MediaProviderRunResult, materialized: readonly MediaProviderMaterializedOutput[]): MediaNodeExecutorResult {
      assertMaterializedKind(materialized, 'video', 1, context.providerId)
      return Object.freeze({ outputs: Object.freeze({ video: materialized[0]! }) })
    },
  } satisfies MediaProviderExecutorBinding),
  Object.freeze({
    ref: Object.freeze({ type: 'video.image-to-video', version: 1 }),
    capability: 'image-to-video',
    outputKind: 'video',
    outputCount: () => 1,
    buildRequest(context: MediaProviderNodeBindingContext): MediaProviderRequest {
      const prompt = optionalText(context.inputs, 'prompt')
      return Object.freeze({
        ...common(context),
        capability: 'image-to-video',
        image: requiredImage(context.inputs, 'image'),
        ...(prompt === undefined ? {} : { prompt }),
      })
    },
    buildResult(context: MediaProviderNodeBindingContext, _run: MediaProviderRunResult, materialized: readonly MediaProviderMaterializedOutput[]): MediaNodeExecutorResult {
      assertMaterializedKind(materialized, 'video', 1, context.providerId)
      return Object.freeze({ outputs: Object.freeze({ video: materialized[0]! }) })
    },
  } satisfies MediaProviderExecutorBinding),
])

function neverMaterialized(): never {
  throw new MediaProviderError('MEDIA_PROVIDER_INVALID_RESULT', 'Materialized Provider output changed kind after validation')
}

/**
 * Register all V1 Provider-backed built-in executors transactionally. A registration conflict rolls back earlier entries.
 */
export function registerBuiltinMediaProviderExecutors(
  executors: MediaNodeExecutorRegistry,
  dependencies: MediaProviderExecutorDependencies,
): () => void {
  const disposers: Array<() => void> = []
  try {
    for (const binding of BUILTIN_MEDIA_PROVIDER_BINDINGS) {
      disposers.push(executors.register(binding.ref, createMediaProviderNodeExecutor(binding, dependencies)))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
  let active = true
  return () => {
    if (!active) return
    active = false
    for (const dispose of disposers.reverse()) dispose()
  }
}
