/** Browser-independent media DAG engine for static validation, partial scheduling, execution, and deterministic cache reuse. */

import type { MediaWorkflow, MediaWorkflowEdge, MediaWorkflowNode, WorkflowNodeId } from '@deepseek-ai/dsh-canvas/types'
import type { MediaNodeConfig, MediaNodeDefinition } from './types.ts'
import type { MediaNodeRegistry } from './registry.ts'
import type {
  MediaNodeExecutionCache,
  MediaNodeExecutionInputs,
  MediaNodeExecutionOutput,
  MediaNodeFingerprintInput,
  MediaWorkflowExecutionPlan,
  MediaWorkflowNodeRunResult,
  MediaWorkflowRunRequest,
  MediaWorkflowRunResult,
  MediaWorkflowRunSnapshot,
  ValidatedMediaWorkflow,
} from './engine-types.ts'
import { MediaNodeExecutorRegistry, MediaWorkflowExecutionError, snapshotMediaNodeExecutorResult } from './executor.ts'
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

function validatedSnapshot(snapshot: MediaWorkflowRunSnapshot, definitions: ReadonlyMap<WorkflowNodeId, MediaNodeDefinition>, topologicalNodeIds: readonly WorkflowNodeId[]): ValidatedMediaWorkflow {
  return { workflow: snapshot.workflow, definitions, topologicalNodeIds }
}

function incomingEdges(workflow: MediaWorkflow, nodeId: WorkflowNodeId): readonly MediaWorkflowEdge[] {
  return workflow.edges.filter(edge => edge.targetNodeId === nodeId).sort((left, right) => left.id.localeCompare(right.id))
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted !== true) return
  throw new MediaWorkflowExecutionError('MEDIA_WORKFLOW_ABORTED', 'Media workflow execution was aborted')
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
    throw new MediaWorkflowExecutionError('MEDIA_WORKFLOW_BOUNDARY_INPUT_MISSING', `Partial execution requires boundary value for edge ${edge.id}`)
  }
  const source = completed.get(edge.sourceNodeId)
  const output = source?.outputs[edge.sourcePort]
  if (output !== undefined) return output
  throw new MediaWorkflowExecutionError('MEDIA_WORKFLOW_OUTPUT_VALUE_MISSING', `Scheduled source ${edge.sourceNodeId} produced no value for ${edge.sourcePort}`)
}

function resolveInputs(
  workflow: MediaWorkflow,
  nodeId: WorkflowNodeId,
  definition: MediaNodeDefinition,
  scheduled: ReadonlySet<WorkflowNodeId>,
  completed: ReadonlyMap<WorkflowNodeId, MediaWorkflowNodeRunResult>,
  boundaryInputs: MediaWorkflowRunRequest['boundaryInputs'],
): MediaNodeExecutionInputs {
  const grouped: Record<string, MediaNodeExecutionOutput[]> = {}
  for (const edge of incomingEdges(workflow, nodeId)) {
    const targetPort = definition.inputs.find(port => port.name === edge.targetPort)!
    const output = sourceOutput(edge, scheduled, completed, boundaryInputs)
    if (output.value.kind !== targetPort.type) {
      throw new MediaWorkflowExecutionError('MEDIA_WORKFLOW_INVALID_EXECUTOR_OUTPUT', `Boundary/source value for edge ${edge.id} is ${output.value.kind}; expected ${targetPort.type}`)
    }
    const values = grouped[edge.targetPort] ?? []
    values.push(output)
    grouped[edge.targetPort] = values
  }
  for (const values of Object.values(grouped)) Object.freeze(values)
  return Object.freeze(grouped)
}

function fingerprintInputs(inputs: MediaNodeExecutionInputs): readonly MediaNodeFingerprintInput[] {
  const values: MediaNodeFingerprintInput[] = []
  for (const [port, outputs] of Object.entries(inputs)) {
    for (const output of outputs) values.push({ port, fingerprint: output.fingerprint })
  }
  return values
}

function nodeById(workflow: MediaWorkflow, nodeId: WorkflowNodeId): MediaWorkflowNode {
  return workflow.nodes.find(node => node.id === nodeId)!
}

/** Pure engine object. It neither publishes Canvas durable state nor depends on Browser/UI services. */
export class MediaWorkflowEngine {
  /**
   * @param registry - active semantic node-definition registry sampled when a run starts.
   * @param executors - exact type/version executor registry.
   * @param cache - optional deterministic-result cache; generative definitions never auto-read or auto-write it.
   */
  constructor(
    private readonly registry: MediaNodeRegistry,
    private readonly executors: MediaNodeExecutorRegistry,
    private readonly cache?: MediaNodeExecutionCache,
  ) {}

  /**
   * Capture normalized config and exact registered definitions for one immutable run snapshot.
   * @param workflow - current semantic workflow.
   * @returns snapshot, definition map, and deterministic topology.
   */
  prepare(workflow: MediaWorkflow): { readonly snapshot: MediaWorkflowRunSnapshot; readonly validated: ValidatedMediaWorkflow } {
    const current = assertValidMediaWorkflow(workflow, this.registry)
    const snapshot = snapshotWorkflow(current, this.registry)
    return { snapshot, validated: validatedSnapshot(snapshot, current.definitions, current.topologicalNodeIds) }
  }

  /**
   * Validate, schedule, and execute one immutable workflow revision in deterministic topological order.
   * @param request - workflow, optional partial target, boundary values, cancellation signal, and model-key resolver.
   * @returns node results without publishing Canvas run/session state.
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
      const inputs = resolveInputs(prepared.snapshot.workflow, nodeId, definition, scheduled, completed, request.boundaryInputs)
      const modelKey = request.resolveModelKey?.(nodeId, definition)
      const fingerprint = fingerprintMediaNodeExecution(node, definition, node.config as MediaNodeConfig, fingerprintInputs(inputs), modelKey)
      let result = fingerprint.cacheable ? await this.cache?.get(fingerprint) : undefined
      const cacheHit = result !== undefined
      if (result === undefined) {
        const executor = this.executors.require({ type: definition.type, version: definition.version })
        result = snapshotMediaNodeExecutorResult(await executor.execute({
          workflow: prepared.snapshot.workflow,
          nodeId,
          definition,
          inputs,
          fingerprint,
          ...(modelKey === undefined ? {} : { modelKey }),
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        }), definition)
        if (fingerprint.cacheable) await this.cache?.set(fingerprint, result)
      }
      completed.set(nodeId, Object.freeze({ nodeId, fingerprint, outputs: result.outputs, cacheHit }))
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
