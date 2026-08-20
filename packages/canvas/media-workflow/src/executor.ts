/** Provider-neutral executor registry and executor-result validation. */

import type { MediaNodeDefinitionRef } from './types.ts'
import type {
  MediaNodeExecutor,
  MediaNodeExecutorResult,
  MediaWorkflowExecutionErrorCode,
} from './engine-types.ts'
import type { MediaNodeDefinition } from './types.ts'

/** Stable runtime failure raised while dispatching or validating node execution. */
export class MediaWorkflowExecutionError extends Error {
  /**
   * @param code - machine-readable engine failure.
   * @param message - direct failure description.
   */
  constructor(readonly code: MediaWorkflowExecutionErrorCode, message: string) {
    super(message)
    this.name = 'MediaWorkflowExecutionError'
  }
}

function keyOf(ref: MediaNodeDefinitionRef): string {
  return `${ref.type}@${ref.version}`
}

/** Per-engine executor registry; registration returns an idempotent disposer and never uses a node-type switch. */
export class MediaNodeExecutorRegistry {
  private readonly executors = new Map<string, MediaNodeExecutor>()

  /**
   * Register one exact node executor.
   * @param ref - exact semantic node type/version.
   * @param executor - provider-neutral executor implementation.
   * @returns idempotent disposer for this exact registration.
   */
  register(ref: MediaNodeDefinitionRef, executor: MediaNodeExecutor): () => void {
    const key = keyOf(ref)
    if (this.executors.has(key)) throw new Error(`media node executor ${key} is already registered`)
    this.executors.set(key, executor)
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.executors.get(key) === executor) this.executors.delete(key)
    }
  }

  /**
   * Resolve one executor or fail before node execution.
   * @param ref - exact semantic node type/version.
   * @returns registered executor.
   * @throws MediaWorkflowExecutionError when no executor exists.
   */
  require(ref: MediaNodeDefinitionRef): MediaNodeExecutor {
    const executor = this.executors.get(keyOf(ref))
    if (executor !== undefined) return executor
    throw new MediaWorkflowExecutionError('MEDIA_WORKFLOW_EXECUTOR_NOT_FOUND', `No executor is registered for ${keyOf(ref)}`)
  }
}

function assertOutput(result: MediaNodeExecutorResult, definition: MediaNodeDefinition): void {
  for (const [name, output] of Object.entries(result.outputs)) {
    const port = definition.outputs.find(item => item.name === name)
    if (port === undefined) throw new MediaWorkflowExecutionError('MEDIA_WORKFLOW_INVALID_EXECUTOR_OUTPUT', `Executor ${definition.type}@${definition.version} returned unknown output port ${name}`)
    if (output.value.kind !== port.type) throw new MediaWorkflowExecutionError('MEDIA_WORKFLOW_INVALID_EXECUTOR_OUTPUT', `Executor ${definition.type}@${definition.version} returned ${output.value.kind} for ${name}; expected ${port.type}`)
    if (output.fingerprint.trim() === '') throw new MediaWorkflowExecutionError('MEDIA_WORKFLOW_INVALID_EXECUTOR_OUTPUT', `Executor ${definition.type}@${definition.version} returned an empty fingerprint for ${name}`)
  }
  for (const port of definition.outputs) {
    if (!port.required || result.outputs[port.name] !== undefined) continue
    throw new MediaWorkflowExecutionError('MEDIA_WORKFLOW_INVALID_EXECUTOR_OUTPUT', `Executor ${definition.type}@${definition.version} omitted required output ${port.name}`)
  }
}

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
}

/**
 * Validate, detach, and recursively freeze one executor result before it reaches downstream nodes or cache storage.
 * @param result - executor-owned result object.
 * @param definition - exact node definition used to validate output names and value kinds.
 * @returns immutable detached result.
 */
export function snapshotMediaNodeExecutorResult(result: MediaNodeExecutorResult, definition: MediaNodeDefinition): MediaNodeExecutorResult {
  assertOutput(result, definition)
  const snapshot = structuredClone(result) as MediaNodeExecutorResult
  deepFreeze(snapshot)
  return snapshot
}
