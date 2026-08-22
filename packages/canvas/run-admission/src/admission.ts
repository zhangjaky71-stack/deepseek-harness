/** Transport-independent N15 Canvas run-admission coordinator. */

import { CanvasFeatureError } from '@deepseek-ai/dsh-canvas'
import type { CanvasImageAssetRef, CanvasVideoAssetRef, WorkflowNodeId } from '@deepseek-ai/dsh-canvas'
import {
  MediaWorkflowValidationError,
  assertValidMediaWorkflow,
  planMediaWorkflowExecution,
  type MediaNodeExecutionOutput,
  type MediaNodeRegistry,
} from '@deepseek-ai/dsh-media-workflow'
import {
  MediaModelRegistry,
  MediaModelResolutionError,
  type MediaModelResolution,
  type MediaProviderId,
} from '@deepseek-ai/dsh-media-provider'
import {
  MediaProviderRuntimeRegistry,
} from '@deepseek-ai/dsh-media-provider/runtime'
import { CanvasRunAdmissionError } from './errors.ts'
import type {
  CanvasRunAdmissionGovernance,
  CanvasRunAdmissionPermit,
  CanvasRunAdmissionRequest,
  CanvasRunAuthorizationPort,
  CanvasRunCostEstimate,
  CanvasRunFeaturePort,
  CanvasRunGovernanceEvidence,
  CanvasRunInputAsset,
} from './types.ts'

/** Current Host authorities required to preflight one run. */
export interface CanvasRunAdmissionAuthorities {
  readonly authorization: CanvasRunAuthorizationPort
  readonly features: CanvasRunFeaturePort
  readonly nodes: MediaNodeRegistry
  readonly models: MediaModelRegistry
  readonly providers: MediaProviderRuntimeRegistry
  readonly governance: CanvasRunAdmissionGovernance
}

function abortIfNeeded(signal: AbortSignal | undefined): void {
  if (signal?.aborted !== true) return
  throw new CanvasRunAdmissionError('CANVAS_RUN_ABORTED', 'Canvas run admission was aborted')
}

function assertIdempotencyKey(key: string): void {
  if (key.length < 1 || key.length > 256 || key.trim() !== key || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new CanvasRunAdmissionError(
      'CANVAS_RUN_DUPLICATE_REQUEST',
      'Canvas run idempotency key must be non-empty, control-free, trimmed, and at most 256 characters',
    )
  }
}

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
}

function frozenWorkflow<T>(workflow: T): T {
  const snapshot = structuredClone(workflow)
  deepFreeze(snapshot)
  return snapshot
}

function authorize(request: CanvasRunAdmissionRequest, authority: CanvasRunAuthorizationPort): void {
  const decision = authority.authorize({
    permission: 'canvas.run',
    sessionId: request.sessionId,
    actor: request.access.actor,
    source: request.access.source,
    ...(request.access.requestId === undefined ? {} : { requestId: request.access.requestId }),
    ...(request.access.correlationId === undefined ? {} : { correlationId: request.access.correlationId }),
    resource: {
      kind: 'workflow',
      canvasId: request.canvasId,
      workflowId: request.workflow.id,
    },
  })
  if (decision.allowed) return
  if (decision.reason === 'policy-unavailable') {
    throw new CanvasRunAdmissionError(
      'CANVAS_RUN_AUTHORIZATION_UNAVAILABLE',
      'Canvas run authorization is unavailable',
    )
  }
  throw new CanvasRunAdmissionError('CANVAS_RUN_PERMISSION_DENIED', 'Canvas run permission denied')
}

function assertFeatures(
  workflow: CanvasRunAdmissionRequest['workflow'],
  selection: NonNullable<CanvasRunAdmissionRequest['selection']>,
  features: CanvasRunFeaturePort,
): void {
  try {
    features.assertWorkflowExecutable(workflow)
    if (selection.mode !== 'all' && !features.isEnabled('partialRun')) {
      throw new CanvasFeatureError('partialRun')
    }
  } catch (error) {
    if (error instanceof CanvasFeatureError) {
      throw new CanvasRunAdmissionError(
        'CANVAS_RUN_FEATURE_DISABLED',
        `Canvas run requires disabled feature ${error.feature}`,
        { cause: error },
      )
    }
    throw error
  }
}

function expectedValueKind(portType: string): MediaNodeExecutionOutput['value']['kind'] | undefined {
  switch (portType) {
    case 'text': return 'text'
    case 'image': return 'image'
    case 'video': return 'video'
    case 'image-list': return 'image-list'
    case 'video-list': return 'video-list'
    case 'mask': return 'mask'
    default: return undefined
  }
}

function assetsFromOutput(output: MediaNodeExecutionOutput): readonly CanvasRunInputAsset[] {
  switch (output.value.kind) {
    case 'text': return []
    case 'image': return [output.value.asset]
    case 'video': return [output.value.asset]
    case 'mask': return [output.value.asset]
    case 'image-list': return output.value.assets
    case 'video-list': return output.value.assets
    default:
      output.value satisfies never
      return []
  }
}

async function assertBoundaryAssets(
  request: CanvasRunAdmissionRequest,
  plan: ReturnType<typeof planMediaWorkflowExecution>,
  definitions: ReadonlyMap<WorkflowNodeId, ReturnType<MediaNodeRegistry['require']>>,
  governance: CanvasRunAdmissionGovernance,
): Promise<void> {
  for (const boundary of plan.boundaryInputs) {
    const output = request.boundaryInputs?.get(boundary.edgeId)
    if (output === undefined) {
      throw new CanvasRunAdmissionError(
        'CANVAS_RUN_BOUNDARY_INPUT_MISSING',
        `Canvas partial run is missing boundary input ${boundary.edgeId}`,
      )
    }
    const definition = definitions.get(boundary.targetNodeId)
    const port = definition?.inputs.find(candidate => candidate.name === boundary.targetPort)
    const expected = port === undefined ? undefined : expectedValueKind(port.type)
    if (expected === undefined || output.value.kind !== expected) {
      throw new CanvasRunAdmissionError(
        'CANVAS_RUN_INVALID_WORKFLOW',
        `Canvas boundary input ${boundary.edgeId} does not match target port ${boundary.targetPort}`,
      )
    }
    for (const asset of assetsFromOutput(output)) {
      abortIfNeeded(request.signal)
      let available: boolean
      try {
        available = await governance.assets.isAvailable(asset)
      } catch (error) {
        throw new CanvasRunAdmissionError(
          'CANVAS_RUN_ASSET_UNAVAILABLE',
          'Canvas run input asset availability could not be verified',
          { cause: error },
        )
      }
      if (!available) {
        throw new CanvasRunAdmissionError('CANVAS_RUN_ASSET_UNAVAILABLE', 'Canvas run input asset is unavailable')
      }
    }
  }
}

function scheduledProviderNodes(
  plan: ReturnType<typeof planMediaWorkflowExecution>,
  definitions: ReadonlyMap<WorkflowNodeId, ReturnType<MediaNodeRegistry['require']>>,
): readonly WorkflowNodeId[] {
  return Object.freeze(plan.scheduledNodeIds.filter(nodeId =>
    definitions.get(nodeId)?.execution.capability !== undefined))
}

function assertNoExtraModelRequests(
  request: CanvasRunAdmissionRequest,
  scheduled: ReadonlySet<WorkflowNodeId>,
): void {
  for (const nodeId of request.modelRequests.keys()) {
    if (scheduled.has(nodeId)) continue
    throw new CanvasRunAdmissionError(
      'CANVAS_RUN_MODEL_REQUEST_INVALID',
      `Canvas run includes a model request for unscheduled or non-Provider node ${nodeId}`,
    )
  }
}

function resolveModels(
  request: CanvasRunAdmissionRequest,
  providerNodes: readonly WorkflowNodeId[],
  definitions: ReadonlyMap<WorkflowNodeId, ReturnType<MediaNodeRegistry['require']>>,
  authorities: CanvasRunAdmissionAuthorities,
): {
  readonly resolutions: ReadonlyMap<WorkflowNodeId, MediaModelResolution>
  readonly executionIdentities: ReadonlyMap<WorkflowNodeId, MediaModelResolution['executionIdentity']>
  readonly providerIds: readonly MediaProviderId[]
} {
  const scheduled = new Set(providerNodes)
  assertNoExtraModelRequests(request, scheduled)
  const resolutions = new Map<WorkflowNodeId, MediaModelResolution>()
  const executionIdentities = new Map<WorkflowNodeId, MediaModelResolution['executionIdentity']>()
  const providerIds = new Set<MediaProviderId>()

  for (const nodeId of providerNodes) {
    const definition = definitions.get(nodeId)!
    const modelRequest = request.modelRequests.get(nodeId)
    if (modelRequest === undefined) {
      throw new CanvasRunAdmissionError(
        'CANVAS_RUN_MODEL_REQUEST_MISSING',
        `Canvas run requires a model-resolution request for node ${nodeId}`,
      )
    }
    if (modelRequest.requirements.capability !== definition.execution.capability) {
      throw new CanvasRunAdmissionError(
        'CANVAS_RUN_MODEL_REQUEST_INVALID',
        `Canvas model request capability does not match node ${nodeId}`,
      )
    }
    if (modelRequest.selection.mode === 'fallback' && !authorities.features.isEnabled('providerFallback')) {
      throw new CanvasRunAdmissionError(
        'CANVAS_RUN_FEATURE_DISABLED',
        'Canvas Provider fallback feature is disabled',
      )
    }
    let resolution: MediaModelResolution
    try {
      resolution = authorities.models.resolve(modelRequest)
    } catch (error) {
      if (error instanceof MediaModelResolutionError) {
        throw new CanvasRunAdmissionError(
          'CANVAS_RUN_MODEL_RESOLUTION_FAILED',
          `Canvas model resolution failed for node ${nodeId}`,
          { cause: error },
        )
      }
      throw error
    }
    if (authorities.providers.get(resolution.provider.id) === undefined) {
      throw new CanvasRunAdmissionError(
        'CANVAS_RUN_PROVIDER_UNAVAILABLE',
        `Canvas media Provider ${resolution.provider.id} is unavailable`,
      )
    }
    resolutions.set(nodeId, resolution)
    executionIdentities.set(nodeId, resolution.executionIdentity)
    providerIds.add(resolution.provider.id)
  }

  return {
    resolutions,
    executionIdentities,
    providerIds: Object.freeze([...providerIds].sort((left, right) => left.localeCompare(right))),
  }
}

function assertCostEstimate(estimate: CanvasRunCostEstimate): void {
  if (estimate.kind === 'not-applicable') return
  if (estimate.kind === 'unavailable') {
    throw new CanvasRunAdmissionError('CANVAS_RUN_COST_UNAVAILABLE', 'Canvas run cost estimate is unavailable')
  }
  if (
    estimate.currency.length < 1
    || estimate.currency.length > 16
    || estimate.currency.trim() !== estimate.currency
    || /[\u0000-\u001f\u007f]/.test(estimate.currency)
    || !Number.isSafeInteger(estimate.amountMinor)
    || estimate.amountMinor < 0
  ) {
    throw new CanvasRunAdmissionError('CANVAS_RUN_COST_UNAVAILABLE', 'Canvas run cost estimate is invalid')
  }
}

async function costEstimate(
  evidence: CanvasRunGovernanceEvidence,
  governance: CanvasRunAdmissionGovernance,
): Promise<CanvasRunCostEstimate> {
  try {
    const estimate = await governance.cost.estimate(evidence)
    assertCostEstimate(estimate)
    return estimate
  } catch (error) {
    if (error instanceof CanvasRunAdmissionError) throw error
    throw new CanvasRunAdmissionError('CANVAS_RUN_COST_UNAVAILABLE', 'Canvas run cost estimate is unavailable', { cause: error })
  }
}

/**
 * Evaluate every N15 gate and atomically reserve process-local concurrency last.
 * No Provider operation, Run record, Job, or Session event is created here.
 * @param request - immutable run intent plus per-node model requirements and optional partial boundary values.
 * @param authorities - current N04/N09/N10/N13/N14 authorities plus deployment governance policies.
 * @returns an admission permit whose workflow/plan/identities must be used by N16 and whose lease must be released at terminal settlement.
 */
export async function admitCanvasRun(
  request: CanvasRunAdmissionRequest,
  authorities: CanvasRunAdmissionAuthorities,
): Promise<CanvasRunAdmissionPermit> {
  abortIfNeeded(request.signal)
  assertIdempotencyKey(request.idempotencyKey)
  if (request.sessionId.length === 0) {
    throw new CanvasRunAdmissionError('CANVAS_RUN_AUTHORIZATION_UNAVAILABLE', 'Canvas run session id is required')
  }
  authorize(request, authorities.authorization)

  const workflow = frozenWorkflow(request.workflow)
  const selection = request.selection ?? { mode: 'all' as const }
  assertFeatures(workflow, selection, authorities.features)

  let validated: ReturnType<typeof assertValidMediaWorkflow>
  let plan: ReturnType<typeof planMediaWorkflowExecution>
  try {
    validated = assertValidMediaWorkflow(workflow, authorities.nodes)
    plan = planMediaWorkflowExecution(validated, selection)
  } catch (error) {
    if (error instanceof MediaWorkflowValidationError) {
      throw new CanvasRunAdmissionError('CANVAS_RUN_INVALID_WORKFLOW', 'Canvas workflow is not executable', { cause: error })
    }
    throw error
  }

  await assertBoundaryAssets(request, plan, validated.definitions, authorities.governance)
  abortIfNeeded(request.signal)

  const providerNodes = scheduledProviderNodes(plan, validated.definitions)
  const resolved = resolveModels(request, providerNodes, validated.definitions, authorities)
  const governanceEvidence: CanvasRunGovernanceEvidence = Object.freeze({
    sessionId: request.sessionId,
    canvasId: request.canvasId,
    workflow,
    plan,
    access: frozenWorkflow(request.access),
    resolutions: resolved.resolutions,
    providerIds: resolved.providerIds,
  })

  abortIfNeeded(request.signal)
  const estimate = await costEstimate(governanceEvidence, authorities.governance)
  abortIfNeeded(request.signal)

  let quota
  try {
    quota = await authorities.governance.quota.check(governanceEvidence, estimate)
  } catch (error) {
    throw new CanvasRunAdmissionError('CANVAS_RUN_QUOTA_DENIED', 'Canvas run quota policy is unavailable', { cause: error })
  }
  if (!quota.allowed) {
    throw new CanvasRunAdmissionError('CANVAS_RUN_QUOTA_DENIED', 'Canvas run quota denied')
  }

  abortIfNeeded(request.signal)
  let approval
  try {
    approval = await authorities.governance.approval.request(governanceEvidence, estimate, request.signal)
  } catch (error) {
    throw new CanvasRunAdmissionError('CANVAS_RUN_APPROVAL_UNAVAILABLE', 'Canvas run approval is unavailable', { cause: error })
  }
  if (approval.outcome === 'denied') {
    throw new CanvasRunAdmissionError('CANVAS_RUN_APPROVAL_DENIED', 'Canvas run approval denied')
  }
  if (approval.outcome === 'unavailable') {
    throw new CanvasRunAdmissionError('CANVAS_RUN_APPROVAL_UNAVAILABLE', 'Canvas run approval is unavailable')
  }

  abortIfNeeded(request.signal)
  let idempotency
  try {
    idempotency = await authorities.governance.idempotency.check(request.idempotencyKey, governanceEvidence)
  } catch (error) {
    throw new CanvasRunAdmissionError('CANVAS_RUN_DUPLICATE_REQUEST', 'Canvas run idempotency precheck is unavailable', { cause: error })
  }
  if (idempotency.status === 'duplicate') {
    throw new CanvasRunAdmissionError('CANVAS_RUN_DUPLICATE_REQUEST', 'Canvas run request is already admitted or started')
  }

  abortIfNeeded(request.signal)
  const lease = await authorities.governance.concurrency.acquire(
    request.sessionId,
    resolved.providerIds,
    request.signal,
  )
  try {
    abortIfNeeded(request.signal)
    return Object.freeze({
      evidence: Object.freeze({
        ...governanceEvidence,
        executionIdentities: resolved.executionIdentities,
        costEstimate: estimate,
      }),
      lease,
    })
  } catch (error) {
    lease.release()
    throw error
  }
}
