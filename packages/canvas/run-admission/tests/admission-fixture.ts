import { Context } from '@deepseek-ai/cordis'
import {
  CanvasAuthorizationPolicy,
  CanvasId,
  MediaWorkflowId,
  WorkflowEdgeId,
  WorkflowNodeId,
  canvasBrowserAccess,
  resolveCanvasCapabilities,
  type CanvasFeatureName,
  type MediaWorkflow,
} from '@deepseek-ai/dsh-canvas'
import MediaNodeRegistry from '@deepseek-ai/dsh-media-workflow'
import { apply as applyBuiltins, inject as builtinsInject } from '@deepseek-ai/dsh-media-workflow/builtins'
import {
  MediaModelId,
  MediaModelRegistry,
  MediaProviderId,
  type MediaModelResolutionRequest,
} from '@deepseek-ai/dsh-media-provider'
import {
  MediaProviderRuntimeRegistry,
  type MediaProvider,
} from '@deepseek-ai/dsh-media-provider/runtime'
import {
  CanvasRunConcurrencyLimiter,
  type CanvasRunAdmissionAuthorities,
  type CanvasRunAdmissionGovernance,
  type CanvasRunAdmissionRequest,
} from '../src/index.ts'

export const contexts: Context[] = []

export async function disposeContexts(): Promise<void> {
  while (contexts.length > 0) await contexts.pop()!.dispose()
}

export const canvasId = CanvasId('canvas-admission')
export const workflowId = MediaWorkflowId('workflow-admission')
export const generateNodeId = WorkflowNodeId('generate')
export const videoNodeId = WorkflowNodeId('video')

export function imageWorkflow(): MediaWorkflow {
  return {
    id: workflowId,
    schemaVersion: 1,
    name: 'Admission image',
    nodes: [
      { id: WorkflowNodeId('prompt'), type: 'prompt', nodeVersion: 1, config: { text: 'lighthouse' } },
      { id: generateNodeId, type: 'image.generate', nodeVersion: 1, config: { count: 1 } },
      { id: WorkflowNodeId('output'), type: 'output', nodeVersion: 1, config: {} },
    ],
    edges: [
      { id: WorkflowEdgeId('e-prompt'), sourceNodeId: WorkflowNodeId('prompt'), sourcePort: 'text', targetNodeId: generateNodeId, targetPort: 'prompt' },
      { id: WorkflowEdgeId('e-output'), sourceNodeId: generateNodeId, sourcePort: 'images', targetNodeId: WorkflowNodeId('output'), targetPort: 'images' },
    ],
    outputNodeIds: [WorkflowNodeId('output')],
  }
}

export function workflowWithUnscheduledVideo(): MediaWorkflow {
  const workflow = imageWorkflow()
  const videoPromptId = WorkflowNodeId('video-prompt')
  return {
    ...workflow,
    nodes: [
      ...workflow.nodes,
      { id: videoPromptId, type: 'prompt', nodeVersion: 1, config: { text: 'unused video' } },
      { id: videoNodeId, type: 'video.generate', nodeVersion: 1, config: {} },
    ],
    edges: [
      ...workflow.edges,
      { id: WorkflowEdgeId('e-video-prompt'), sourceNodeId: videoPromptId, sourcePort: 'text', targetNodeId: videoNodeId, targetPort: 'prompt' },
    ],
  }
}

export const providerId = MediaProviderId('admission-provider')
export const modelId = MediaModelId('admission-image-v1')

export function imageModelRequest(mode: 'strict' | 'fallback' = 'strict'): MediaModelResolutionRequest {
  const preferred = { providerId, modelId }
  if (mode === 'strict') {
    return { requirements: { capability: 'text-to-image' }, selection: { mode, preferred } }
  }
  return {
    requirements: { capability: 'text-to-image' },
    selection: { mode, preferred },
    routing: { candidateOrder: [preferred] },
  }
}

const runtimeProvider: MediaProvider = {
  start() { throw new Error('N15 must never start Provider work') },
  resume() { throw new Error('N15 must never resume Provider work') },
  cancel() { throw new Error('N15 must never cancel Provider work') },
}

export interface HarnessOptions {
  readonly registerRuntime?: boolean
  readonly canvasEnabled?: boolean
  readonly videoEnabled?: boolean
  readonly partialRunEnabled?: boolean
  readonly providerFallbackEnabled?: boolean
  readonly authorizationActors?: readonly ('human' | 'agent' | 'system')[]
}

export async function admissionHarness(options: HarnessOptions = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(MediaNodeRegistry)
  await ctx.plugin({ inject: [...builtinsInject], apply: applyBuiltins })
  await ctx.plugin(MediaModelRegistry)
  ctx.mediaModels.register({
    id: providerId,
    displayName: 'Admission Provider',
    enabled: true,
  }, [{
    providerId,
    id: modelId,
    displayName: 'Admission Image v1',
    enabled: true,
    executionIdentityKey: 'admission-provider/image@1',
    capabilities: {
      operations: ['text-to-image'],
      aspectRatios: 'any',
      dimensions: { width: null, height: null },
      duration: { supported: false },
      maxReferenceImages: 8,
      supportsMask: false,
      supportsSeed: true,
      supportsAudio: false,
    },
  }])
  await ctx.plugin(MediaProviderRuntimeRegistry)
  if (options.registerRuntime !== false) ctx.mediaProviders.register(providerId, runtimeProvider)

  const capabilities = resolveCanvasCapabilities({
    canvas: { enabled: options.canvasEnabled ?? true },
    video: { enabled: options.videoEnabled ?? false },
    partialRun: { enabled: options.partialRunEnabled ?? true },
    providerFallback: { enabled: options.providerFallbackEnabled ?? false },
  })
  const features = {
    isEnabled(feature: CanvasFeatureName): boolean { return capabilities[feature].enabled },
  }
  const authorization = new CanvasAuthorizationPolicy({
    defaultActors: options.authorizationActors ?? ['human', 'agent', 'system'],
  })

  const governance: CanvasRunAdmissionGovernance = {
    assets: { isAvailable: () => true },
    cost: { estimate: () => ({ kind: 'estimated', currency: 'USD', amountMinor: 12 }) },
    quota: { check: () => ({ allowed: true }) },
    approval: { request: () => ({ outcome: 'not-required' }) },
    idempotency: { check: () => ({ status: 'new' }) },
    concurrency: new CanvasRunConcurrencyLimiter({
      maxGlobalActive: 4,
      maxPerSessionActive: 2,
      maxPerProviderActive: 2,
      queueCapacity: 2,
      queueTimeoutMs: 50,
    }),
  }

  const authorities: CanvasRunAdmissionAuthorities = {
    authorization,
    features,
    nodes: ctx.mediaNodes,
    models: ctx.mediaModels,
    providers: ctx.mediaProviders,
    governance,
  }

  const request: CanvasRunAdmissionRequest = {
    sessionId: 'session-admission',
    canvasId,
    access: canvasBrowserAccess('session-admission'),
    workflow: imageWorkflow(),
    modelRequests: new Map([[generateNodeId, imageModelRequest()]]),
    idempotencyKey: 'request-admission-1',
  }
  return { ctx, authorities, governance, request }
}
