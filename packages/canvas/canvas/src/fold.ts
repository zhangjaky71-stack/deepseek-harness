/** Strict durable decoder and pure replay fold for `canvas/change`. */

import { isDeepStrictEqual } from 'node:util'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { isCanvasRunTerminal } from './domain.ts'
import { decodeCanvasChangeVersion, decodeCanvasSnapshot, CanvasMigrationError } from './migration.ts'
import { canonicalCanvasAccessContext } from './audit.ts'
import type {
  CanvasAccessContext,
  CanvasActor,
  CanvasId,
  CanvasRequestSource,
  CanvasRunId,
  CanvasSnapshot,
} from './types.ts'
import type { CanvasChange, CanvasChangeMeta, CanvasOperation } from './events.ts'

const OPERATIONS: ReadonlySet<CanvasOperation> = new Set([
  'create',
  'workflow-edit',
  'workflow-replace',
  'run-start',
  'run-update',
  'run-complete',
  'output-select',
  'clear',
])

/** Mutable accumulator kept private to service caches and runtime invariants. */
export interface CanvasFoldState {
  canvas: CanvasSnapshot | null
  seenCanvasIds: Set<CanvasId>
  /** Run ids are unique across the complete Session, including across clear/re-create boundaries. */
  seenRunIds: Set<CanvasRunId>
}

/** Build an empty Canvas replay accumulator. */
export function emptyCanvasFoldState(): CanvasFoldState {
  return { canvas: null, seenCanvasIds: new Set(), seenRunIds: new Set() }
}

/** Clone replay state without aliasing its mutable identity sets. */
export function cloneCanvasFoldState(state: CanvasFoldState): CanvasFoldState {
  return {
    canvas: state.canvas,
    seenCanvasIds: new Set(state.seenCanvasIds),
    seenRunIds: new Set(state.seenRunIds),
  }
}

function invalid(subject: string, message: string): never {
  throw new CanvasMigrationError('CANVAS_MIGRATION_INVALID_VALUE', subject, message)
}

function record(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(subject, `${subject} must be an object`)
  return value as Record<string, unknown>
}

function decodeMeta(value: unknown): CanvasChangeMeta {
  const source = record(value, 'canvas-change.meta')
  if (source.schemaVersion === 1) {
    if (Object.keys(source).sort().join(',') !== 'schemaVersion') {
      invalid('canvas-change.meta', 'Canvas change meta v1 must contain only schemaVersion')
    }
    return { schemaVersion: 1 }
  }
  if (source.schemaVersion !== 2) {
    invalid('canvas-change.meta', `unsupported Canvas change meta schema ${String(source.schemaVersion)}`)
  }
  const allowed = new Set(['actor', 'correlationId', 'requestId', 'schemaVersion', 'source'])
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) invalid('canvas-change.meta', `Canvas change meta v2 contains unsupported field "${key}"`)
  }
  try {
    const access = canonicalCanvasAccessContext({
      actor: source.actor as CanvasActor,
      source: source.source as CanvasRequestSource,
      ...(source.requestId === undefined ? {} : { requestId: source.requestId as string }),
      ...(source.correlationId === undefined ? {} : { correlationId: source.correlationId as string }),
    } satisfies CanvasAccessContext)
    return {
      schemaVersion: 2,
      actor: access.actor,
      source: access.source,
      ...(access.requestId === undefined ? {} : { requestId: access.requestId }),
      ...(access.correlationId === undefined ? {} : { correlationId: access.correlationId }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid Canvas change meta v2'
    invalid('canvas-change.meta', message)
  }
}

/** Decode one value that declares itself as a Canvas change. */
export function decodeCanvasChange(value: unknown): CanvasChange | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as Record<string, unknown>
  if (source.kind !== 'canvas/change') return undefined
  const expectedKeys = 'canvas,kind,meta,operation,version'
  if (Object.keys(source).sort().join(',') !== expectedKeys) {
    invalid('canvas-change', `canvas-change must contain exactly ${expectedKeys}`)
  }
  const version = decodeCanvasChangeVersion(source.version)
  const operation = source.operation
  if (typeof operation !== 'string' || !OPERATIONS.has(operation as CanvasOperation)) {
    invalid('canvas-change.operation', `unsupported Canvas operation ${String(operation)}`)
  }
  const canvas = source.canvas === null ? null : decodeCanvasSnapshot(source.canvas).value
  if (operation === 'clear' ? canvas !== null : canvas === null) {
    invalid('canvas-change.canvas', operation === 'clear'
      ? 'Canvas clear must carry canvas: null'
      : `Canvas ${operation} must carry a complete snapshot`)
  }
  return {
    kind: 'canvas/change',
    version,
    operation: operation as CanvasOperation,
    canvas,
    meta: decodeMeta(source.meta),
  }
}

function requireCurrent(state: CanvasFoldState, operation: CanvasOperation): CanvasSnapshot {
  if (state.canvas === null) throw new Error(`Canvas ${operation} requires a current Canvas`)
  return state.canvas
}

function requireNext(change: CanvasChange): CanvasSnapshot {
  if (change.canvas === null) throw new Error(`Canvas ${change.operation} requires a post-change snapshot`)
  return change.canvas
}

function requireSameIdentity(current: CanvasSnapshot, next: CanvasSnapshot, operation: CanvasOperation): void {
  if (next.id !== current.id || next.createdAt !== current.createdAt || next.updatedAt < current.updatedAt) {
    throw new Error(`Canvas ${operation} must preserve Canvas identity/creation time and monotonic updatedAt`)
  }
}

function sameVariant(current: CanvasSnapshot, next: CanvasSnapshot): boolean {
  return current.currentVariantId === next.currentVariantId
}

function requireWorkflowMutation(current: CanvasSnapshot, next: CanvasSnapshot, operation: CanvasOperation): void {
  requireSameIdentity(current, next, operation)
  if (current.workflow === null || next.workflow === null) {
    throw new Error(`Canvas ${operation} requires a current workflow`)
  }
  if (next.workflow.id !== current.workflow.id
    || next.workflowRevision !== current.workflowRevision + 1
    || next.runRevision !== current.runRevision
    || !sameVariant(current, next)
    || !isDeepStrictEqual(next.run, current.run)
    || !isDeepStrictEqual(next.output, current.output)) {
    throw new Error(`Canvas ${operation} must advance only the semantic workflow revision`)
  }
}

function requireRunStart(current: CanvasSnapshot, next: CanvasSnapshot): void {
  requireSameIdentity(current, next, 'run-start')
  if (current.workflow === null || next.workflow === null
    || !isDeepStrictEqual(next.workflow, current.workflow)
    || next.workflowRevision !== current.workflowRevision
    || next.runRevision !== current.runRevision + 1
    || !sameVariant(current, next)
    || !isDeepStrictEqual(next.output, current.output)) {
    throw new Error('Canvas run-start must advance only runRevision while preserving workflow/output state')
  }
  if (current.run !== null && !isCanvasRunTerminal(current.run.status)) {
    throw new Error('Canvas run-start requires no current non-terminal run')
  }
  const run = next.run
  if (run === null || (run.status !== 'queued' && run.status !== 'running')
    || run.workflowId !== current.workflow.id || run.workflowRevision !== current.workflowRevision) {
    throw new Error('Canvas run-start must install a queued/running run for the current workflow revision')
  }
}

function requireRunUpdate(current: CanvasSnapshot, next: CanvasSnapshot, operation: 'run-update' | 'run-complete'): void {
  requireSameIdentity(current, next, operation)
  const previousRun = current.run
  const run = next.run
  if (current.workflow === null || next.workflow === null
    || !isDeepStrictEqual(next.workflow, current.workflow)
    || next.workflowRevision !== current.workflowRevision
    || next.runRevision !== current.runRevision + 1
    || !sameVariant(current, next)
    || previousRun === null || run === null
    || isCanvasRunTerminal(previousRun.status)
    || run.id !== previousRun.id
    || run.workflowId !== previousRun.workflowId
    || run.workflowRevision !== previousRun.workflowRevision
    || run.startedAt !== previousRun.startedAt) {
    throw new Error(`Canvas ${operation} must advance only the current non-terminal run lifecycle`)
  }
  if (previousRun.status === 'running' && run.status === 'queued') {
    throw new Error(`Canvas ${operation} cannot move a running run back to queued`)
  }
  if (run.status !== 'queued' && run.status !== 'running' && !isCanvasRunTerminal(run.status)) {
    throw new Error(`Canvas ${operation} contains an unsupported run status ${String(run.status)}`)
  }
  if (operation === 'run-complete' && run.status !== 'completed') {
    throw new Error('Historical Canvas run-complete must finish the run as completed')
  }
  if (run.status === 'completed') {
    if (next.output === null
      || next.output.runId !== run.id
      || next.output.workflowId !== run.workflowId
      || next.output.workflowRevision !== run.workflowRevision) {
      throw new Error(`Canvas ${operation} completed run must publish its durable output`)
    }
  } else if (!isDeepStrictEqual(next.output, current.output)) {
    throw new Error(`Canvas ${operation} may change output only when the run completes`)
  }
}

function requireOutputSelect(current: CanvasSnapshot, next: CanvasSnapshot): void {
  requireSameIdentity(current, next, 'output-select')
  if (current.output === null || next.output === null
    || next.workflowRevision !== current.workflowRevision
    || next.runRevision !== current.runRevision
    || !sameVariant(current, next)
    || !isDeepStrictEqual(next.workflow, current.workflow)
    || !isDeepStrictEqual(next.run, current.run)
    || next.output.runId !== current.output.runId
    || next.output.workflowId !== current.output.workflowId
    || next.output.workflowRevision !== current.output.workflowRevision
    || !isDeepStrictEqual(next.output.assets, current.output.assets)) {
    throw new Error('Canvas output-select may only change the primary output index and updatedAt')
  }
}

/** Validate and apply one decoded change to mutable replay state. */
export function applyCanvasChange(state: CanvasFoldState, change: CanvasChange): void {
  if (change.operation === 'create') {
    if (state.canvas !== null) throw new Error('Canvas create requires no current Canvas')
    const next = requireNext(change)
    if (next.workflow === null || next.workflowRevision !== 1 || next.runRevision !== 0
      || next.run !== null || next.output !== null || state.seenCanvasIds.has(next.id)) {
      throw new Error('Canvas create requires a fresh revision-one Canvas with a workflow and no run/output')
    }
    state.seenCanvasIds.add(next.id)
    state.canvas = next
    return
  }
  if (change.operation === 'clear') {
    const current = requireCurrent(state, change.operation)
    if (current.run !== null && !isCanvasRunTerminal(current.run.status)) {
      throw new Error('Canvas clear requires the current run to be terminal before publishing a tombstone')
    }
    if (change.canvas !== null) throw new Error('Canvas clear must publish a null tombstone')
    state.canvas = null
    return
  }
  const current = requireCurrent(state, change.operation)
  const next = requireNext(change)
  switch (change.operation) {
    case 'workflow-edit':
    case 'workflow-replace':
      requireWorkflowMutation(current, next, change.operation)
      break
    case 'run-start': {
      requireRunStart(current, next)
      const run = next.run
      if (run === null) throw new Error('Canvas run-start must install a run')
      if (state.seenRunIds.has(run.id)) throw new Error(`Canvas run id "${run.id}" cannot be reused in one Session`)
      state.seenRunIds.add(run.id)
      break
    }
    case 'run-update':
      requireRunUpdate(current, next, 'run-update')
      break
    case 'run-complete':
      requireRunUpdate(current, next, 'run-complete')
      break
    case 'output-select':
      requireOutputSelect(current, next)
      break
    default:
      change.operation satisfies never
  }
  state.canvas = next
}

/** Apply one Session event to the strict Canvas fold. */
export function applyCanvasEvent(state: CanvasFoldState, event: SessionEvent): void {
  if (event.type !== 'canvas/change') return
  const change = decodeCanvasChange(event.data)
  if (change === undefined) throw new Error(`canvas change at session event ${event.seq} has an invalid kind`)
  applyCanvasChange(state, change)
}

/** Reconstruct current Canvas state from the Session log. */
export function foldCanvas(events: readonly SessionEvent[]): CanvasSnapshot | null {
  const state = emptyCanvasFoldState()
  for (const event of events) applyCanvasEvent(state, event)
  return state.canvas === null ? null : structuredClone(state.canvas)
}
