/** Browser-independent media DAG engine for validation, partial scheduling, execution, and deterministic cache reuse. */

import type {
  MediaWorkflow,
  MediaWorkflowEdge,
  MediaWorkflowNode,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/types'
import type { MediaNodeConfig, MediaNodeDefinition } from './types.ts'
import type { MediaNodeRegistry } from './registry.ts'
import type {
  MediaNodeExecutionCache,
  MediaNodeExecutionIdentity,
  MediaNodeExecutionInputs,
  MediaNodeExecutionOutput,
  MediaNodeFingerprintInput,
  MediaWorkflowExecutionPlan,
  MediaWorkflowNodeRunResult,
  MediaWorkflowRunRequest,
  MediaWorkflowRunResult,
  MediaWorkflowRunSnapshot,
  ValidatedMediaWorkflow,
  WorkflowEventSink,
  WorkflowRuntimeEvent,
} from './engine-types.ts'
import {
  MediaNodeExecutorRegistry,
  MediaWorkflowExecutionError,
  snapshotMediaNodeExecutorResult,
} from './executor.ts'
import { fingerprintMediaNodeExecution } from './fingerprint.ts'
import { planMediaWorkflowExecution } from './scheduler.ts'
import { assertValidMediaWorkflow } from './validate.ts'

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
}

function snapshotWorkflow(validated: ValidatedMediaWorkflow, registry: MediaNodeRegistry): MediaWorkflowRunSnapshot {
  const nodes = validated.workflow.nodes.map(node => {
    const definition = validated.definitions.get(node.id)!
    const config = registry.parseConfig(node)
    return {
      ...node,
      nodeVersion: node.nodeVersion ?? definition.version,
      config: structuredClone(config),
    }
  })
  const workflow: MediaWorkflow = structuredClone({ ...validated.workflow, nodes })
  deepFreeze(workflow)
  return Object.freeze({ workflow })
}

function validatedSnapshot(
  snapshot: MediaWorkflowRunSnapshot,
  definitions: ReadonlyMap<WorkflowNodeId, MediaNodeDefinition>,
  topologicalNodeIds: readonly WorkflowNodeId[],
): ValidatedMediaWorkflow {
  return Object.freeze({ workflow: snapshot.workflow, definitions, topologicalNodeIds })
}

function incomingEdges(workflow: MediaWorkflow, nodeId: WorkflowNodeId): readonly MediaWorkflowEdge[] {
  return workflow.edges
    .filter(edge => edge.targetNodeId === nodeId)
    .sort((left, right) => left.id.localeCompare(right.id))
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted !== true) return
  throw new MediaWorkflowExecutionError('MEDIA_WORKFLOW_ABORTED', 'Media workflow execution was aborted')
}

function executionIdentity(
  identities: MediaWorkflowRunRequest['executionIdentities'],
  nodeId: WorkflowNodeId,
): MediaNodeExecutionIdentity | undefined {
  const identity = identities?.get(nodeId)
  if (identity === undefined) return undefined
  if (identity.key.trim() !== '') return Object.freeze({ key: identity.key })
  throw new MediaWorkflowExecutionError(
    'MEDIA_WORKFLOW_INVALID_EXECUTION_IDENTITY',
    `Execution identity for node ${nodeId} must use a non-empty stable key`,
  )
}

function sourceOutput(
  edge: MediaWorkflowEdge,
  scheduled: ReadonlySet<WorkflowNodeId>,
  completed: ReadonlyMap<WorkflowNodeId, MediaWorkflowNodeRunResult>,
  boundaryInputs: MediaWorkflowRunRequest['boundaryInputs'],
): MediaNodeExecutionOutput {
  if (!scheduled.has(edge.sourceNodeId)) {
    const boundary = boundaryInputs?.get(edge.id)
    if (boundary !== undefined) return boundary
    throw new MediaWorkflowExecutionError(
      'MEDIA_WORKFLOW_BOUNDARY_INPUT_MISSING',
      `Partial execution requires boundary value for edge ${edge.id}`,
    )
  }
  const source = completed.get(edge.sourceNodeId)
  const output = source?.outputs[edge.sourcePort]
  if (output !== undefined) return output
  throw new MediaWorkflowExecutionError(
    'MEDIA_WORKFLOW_OUTPUT_VALUE_MISSING',
    `Scheduled source ${edge.sourceNodeId} produced no value for ${edge.sourcePort}`,
  )
}

interface ResolvedNodeInputs {
  readonly inputs: MediaNodeExecutionInputs
  readonly fingerprintInputs: readonly MediaNodeFingerprintInput[]
}

function resolveInputs(
  workflow: MediaWorkflow,
  nodeId: WorkflowNodeId,
  definition: MediaNodeDefinition,
  scheduled: ReadonlySet<WorkflowNodeId>,
  completed: ReadonlyMap<WorkflowNodeId, MediaWorkflowNodeRunResult>,
  boundaryInputs: MediaWorkflowRunRequest['boundaryInputs'],
): ResolvedNodeInputs {
  const grouped: Record<string, MediaNodeExecutionOutput[]> = {}
  const fingerprints: MediaNodeFingerprintInput[] = []
  for (const edge of incomingEdges(workflow, nodeId)) {
    const targetPort = definition.inputs.find(port => port.name === edge.targetPort)!
    const output = sourceOutput(edge, scheduled, completed, boundaryInputs)
    if (output.value.kind !== targetPort.type) {
      throw new MediaWorkflowExecutionError(
        'MEDIA_WORKFLOW_INVALID_EXECUTOR_OUTPUT',
        `Boundary/source value for edge ${edge.id} is ${output.value.kind}; expected ${targetPort.type}`,
      )
    }
    const values = grouped[edge.targetPort] ?? []
    values.push(output)
    grouped[edge.targetPort] = values
    fingerprints.push({
      edgeId: edge.id,
      sourceNodeId: edge.sourceNodeId,
      sourcePort: edge.sourcePort,
      targetPort: edge.targetPort,
      fingerprint: output.fingerprint,
    })
  }
  for (const values of Object.values(grouped)) Object.freeze(values)
  return Object.freeze({ inputs: Object.freeze(grouped), fingerprintInputs: Object.freeze(fingerprints) })
}

function nodeById(workflow: MediaWorkflow, nodeId: WorkflowNodeId): MediaWorkflowNode {
  return workflow.nodes.find(node => node.id === nodeId)!
}

async function publish(sink: WorkflowEventSink | undefined, event: WorkflowRuntimeEvent): Promise<void> {
  await sink?.publish(event)
}

/** Pure engine object. It owns no Session, Browser, Provider routing, admission, Job, retry, or durable Run state. */
export class MediaWorkflowEngine {
  /**
   * @param registry - active semantic node-definition registry sampled synchronously when a run starts.
   * @param executors - exact type/version executor registry.
   * @param cache - optional deterministic-result cache; non-deterministic definitions never auto-read or auto-write it.
   */
  constructor(
    private readonly registry: MediaNodeRegistry,
    private readonly executors: MediaNodeExecutorRegistry,
    private readonly cache?: MediaNodeExecutionCache,
  ) {}

  /**
   * Capture normalized configs and exact active definitions for one immutable workflow snapshot.
   * @param workflow - current semantic workflow.
   * @returns immutable snapshot plus the captured definition map and deterministic topology.
   */
  prepare(workflow: MediaWorkflow): {
    readonly snapshot: MediaWorkflowRunSnapshot
    readonly validated: ValidatedMediaWorkflow
  } {
    const current = assertValidMediaWorkflow(workflow, this.registry)
    const snapshot = snapshotWorkflow(current, this.registry)
    return Object.freeze({
      snapshot,
      validated: validatedSnapshot(snapshot, current.definitions, current.topologicalNodeIds),
    })
  }

  /**
   * Validate, plan, and execute one immutable workflow snapshot in deterministic topological order.
   * @param request - workflow, optional partial selection/boundaries, already-resolved execution identities, event sink, and abort signal.
   * @returns node results without publishing Canvas durable state.
   */
  async run(request: MediaWorkflowRunRequest): Promise<MediaWorkflowRunResult> {
    assertNotAborted(request.signal)
    const prepared = this.prepare(request.workflow)
    const plan: MediaWorkflowExecutionPlan = planMediaWorkflowExecution(prepared.validated, request.selection)
    const scheduled = new Set(plan.scheduledNodeIds)
    const completed = new Map<WorkflowNodeId, MediaWorkflowNodeRunResult>()

    for (const nodeId of plan.scheduledNodeIds) {
      assertNotAborted(request.signal)
      const node = nodeById(prepared.snapshot.workflow, nodeId)
      const definition = prepared.validated.definitions.get(nodeId)!
      const resolved = resolveInputs(
        prepared.snapshot.workflow,
        nodeId,
        definition,
        scheduled,
        completed,
        request.boundaryInputs,
      )
      const identity = executionIdentity(request.executionIdentities, nodeId)
      const fingerprint = fingerprintMediaNodeExecution(
        node,
        definition,
        node.config as MediaNodeConfig,
        resolved.fingerprintInputs,
        identity,
      )
      await publish(request.eventSink, { kind: 'node-started', nodeId, fingerprint })
      assertNotAborted(request.signal)

      const cached = fingerprint.cacheable ? await this.cache?.get(fingerprint) : undefined
      assertNotAborted(request.signal)
      let result = cached === undefined ? undefined : snapshotMediaNodeExecutorResult(cached, definition)
      const cacheHit = result !== undefined
      if (cacheHit) {
        await publish(request.eventSink, { kind: 'node-cache-hit', nodeId, fingerprint })
      } else {
        const executor = this.executors.require({ type: definition.type, version: definition.version })
        const raw = await executor.execute({
          workflow: prepared.snapshot.workflow,
          nodeId,
          definition,
          inputs: resolved.inputs,
          fingerprint,
          ...(identity === undefined ? {} : { executionIdentity: identity }),
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        })
        assertNotAborted(request.signal)
        result = snapshotMediaNodeExecutorResult(raw, definition)
        if (fingerprint.cacheable) await this.cache?.set(fingerprint, result)
      }

      const nodeResult = Object.freeze({ nodeId, fingerprint, outputs: result.outputs, cacheHit })
      completed.set(nodeId, nodeResult)
      await publish(request.eventSink, { kind: 'node-completed', nodeId, fingerprint, cacheHit })
    }

    return Object.freeze({ snapshot: prepared.snapshot, plan, nodes: completed })
  }
}

export type * from './engine-types.ts'
export { MediaNodeExecutorRegistry, MediaWorkflowExecutionError } from './executor.ts'
export { MemoryMediaNodeExecutionCache } from './cache.ts'
export { fingerprintMediaNodeExecution } from './fingerprint.ts'
export { planMediaWorkflowExecution } from './scheduler.ts'
export { MediaWorkflowValidationError, assertValidMediaWorkflow, validateMediaWorkflow } from './validate.ts'
