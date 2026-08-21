/** Durable editor-layout event, validation, generation identity, and replay fold. */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { canonicalCanvasAccessContext, canvasChangeMeta } from './audit.ts'
import type { CanvasChangeMetaV2 } from './events.ts'
import { decodeCanvasChange } from './fold.ts'
import {
  CANVAS_LAYOUT_SCHEMA_VERSION,
  CanvasMigrationError,
  migrateStoredCanvasLayoutSnapshot,
} from './migration.ts'
import { CanvasId, MediaWorkflowId } from './domain.ts'
import type {
  CanvasLayoutSnapshot,
  CanvasRequestSource,
  CurrentCanvasLayoutSnapshot,
} from './types.ts'
import type { CanvasLayoutErrorCode, SaveCanvasLayoutRequest } from './client.ts'

/** Current `canvas/layout-change` envelope version. Historical rows remain version 1. */
export const CANVAS_LAYOUT_CHANGE_VERSION = 1

/** One complete post-save editor layout plus durable audit attribution. */
export interface CanvasLayoutChange {
  readonly kind: 'canvas/layout-change'
  readonly version: 1
  readonly layout: CanvasLayoutSnapshot
  readonly meta: CanvasChangeMetaV2
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete post-save Canvas editor layout, independent from semantic workflow revisioning. */
    'canvas/layout-change': CanvasLayoutChange
  }
}

/** Stable Host rejection for invalid, stale, or mismatched editor layout writes. */
export class CanvasLayoutError extends HarnessError {
  // oxlint-disable-next-line typescript/no-useless-constructor -- narrows HarnessError's string code
  constructor(message: string, code: CanvasLayoutErrorCode) {
    super(message, code)
  }
}

function invalid(subject: string, message: string): never {
  throw new CanvasMigrationError('CANVAS_MIGRATION_INVALID_VALUE', subject, message)
}

function record(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(subject, `${subject} must be an object`)
  return value as Record<string, unknown>
}

function requireAllowedKeys(source: Record<string, unknown>, allowed: ReadonlySet<string>, subject: string): void {
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) invalid(subject, `${subject} contains unsupported field "${key}"`)
  }
}

/** Assert the structural layout contract. Legacy history may omit current-generation identity. */
export function assertCanvasLayoutSnapshot(layout: CanvasLayoutSnapshot): void {
  if (layout.schemaVersion !== CANVAS_LAYOUT_SCHEMA_VERSION) {
    throw new CanvasLayoutError(`Canvas layout schemaVersion must be ${CANVAS_LAYOUT_SCHEMA_VERSION}`, 'CANVAS_INVALID_LAYOUT')
  }
  if (typeof layout.workflowId !== 'string' || layout.workflowId.length === 0) {
    throw new CanvasLayoutError('Canvas layout workflowId must be non-empty', 'CANVAS_INVALID_LAYOUT')
  }
  const hasCanvasId = layout.canvasId !== undefined
  const hasRevision = layout.layoutRevision !== undefined
  if (hasCanvasId !== hasRevision) {
    throw new CanvasLayoutError('Canvas layout current-generation identity must include both canvasId and layoutRevision', 'CANVAS_INVALID_LAYOUT')
  }
  if (layout.canvasId !== undefined && (typeof layout.canvasId !== 'string' || layout.canvasId.length === 0)) {
    throw new CanvasLayoutError('Canvas layout canvasId must be non-empty', 'CANVAS_INVALID_LAYOUT')
  }
  if (layout.layoutRevision !== undefined && (!Number.isSafeInteger(layout.layoutRevision) || layout.layoutRevision < 1)) {
    throw new CanvasLayoutError('Canvas layout layoutRevision must be a positive safe integer', 'CANVAS_INVALID_LAYOUT')
  }
  if (!Number.isSafeInteger(layout.updatedAt) || layout.updatedAt < 0) {
    throw new CanvasLayoutError('Canvas layout updatedAt must be a non-negative safe integer', 'CANVAS_INVALID_LAYOUT')
  }
  for (const [nodeId, position] of Object.entries(layout.nodePositions)) {
    if (nodeId.length === 0 || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new CanvasLayoutError(`Canvas layout position for "${nodeId}" is invalid`, 'CANVAS_INVALID_LAYOUT')
    }
  }
  if (layout.viewport !== undefined) {
    if (!Number.isFinite(layout.viewport.x) || !Number.isFinite(layout.viewport.y)
      || !Number.isFinite(layout.viewport.zoom) || layout.viewport.zoom <= 0) {
      throw new CanvasLayoutError('Canvas layout viewport must use finite coordinates and positive zoom', 'CANVAS_INVALID_LAYOUT')
    }
  }
}

/** Assert that a layout is suitable for the current writer / current Projection. */
export function assertCurrentCanvasLayoutSnapshot(layout: CanvasLayoutSnapshot): asserts layout is CurrentCanvasLayoutSnapshot {
  assertCanvasLayoutSnapshot(layout)
  if (layout.canvasId === undefined || layout.layoutRevision === undefined) {
    throw new CanvasLayoutError('current Canvas layout must include canvasId and layoutRevision', 'CANVAS_INVALID_LAYOUT')
  }
}

/** Construct one current-generation layout candidate from the Browser CAS request. */
export function createCanvasLayoutSnapshot(request: SaveCanvasLayoutRequest, updatedAt: number): CurrentCanvasLayoutSnapshot {
  if (!Number.isSafeInteger(request.expectedLayoutRevision) || request.expectedLayoutRevision < 0) {
    throw new CanvasLayoutError('expectedLayoutRevision must be a non-negative safe integer', 'CANVAS_INVALID_LAYOUT')
  }
  const layout: CurrentCanvasLayoutSnapshot = {
    schemaVersion: CANVAS_LAYOUT_SCHEMA_VERSION,
    canvasId: request.canvasId,
    workflowId: request.workflowId,
    layoutRevision: request.expectedLayoutRevision + 1,
    nodePositions: structuredClone(request.nodePositions),
    ...(request.viewport === undefined ? {} : { viewport: { ...request.viewport } }),
    updatedAt,
  }
  assertCurrentCanvasLayoutSnapshot(layout)
  return layout
}

/**
 * Decode one stored layout. N02 owns the historical layout payload; N05 adds
 * optional current-generation identity without rewriting immutable old rows.
 */
export function decodeCanvasLayoutSnapshot(value: unknown): CanvasLayoutSnapshot {
  const source = record(value, 'canvas-layout')
  requireAllowedKeys(
    source,
    new Set(['canvasId', 'layoutRevision', 'nodePositions', 'schemaVersion', 'updatedAt', 'viewport', 'workflowId']),
    'canvas-layout',
  )
  const legacySource = { ...source }
  delete legacySource.canvasId
  delete legacySource.layoutRevision
  const migrated = migrateStoredCanvasLayoutSnapshot(legacySource)
  const canvasId = source.canvasId === undefined
    ? undefined
    : CanvasId(typeof source.canvasId === 'string' ? source.canvasId : invalid('canvas-layout.canvasId', 'canvasId must be a string'))
  const layoutRevision = source.layoutRevision === undefined
    ? undefined
    : typeof source.layoutRevision === 'number' && Number.isSafeInteger(source.layoutRevision) && source.layoutRevision > 0
      ? source.layoutRevision
      : invalid('canvas-layout.layoutRevision', 'layoutRevision must be a positive safe integer')
  const layout: CanvasLayoutSnapshot = {
    ...migrated,
    ...(canvasId === undefined ? {} : { canvasId }),
    ...(layoutRevision === undefined ? {} : { layoutRevision }),
  }
  assertCanvasLayoutSnapshot(layout)
  return layout
}

function decodeStrictLayout(value: unknown): CanvasLayoutSnapshot {
  try {
    return decodeCanvasLayoutSnapshot(value)
  } catch (error) {
    if (error instanceof CanvasMigrationError) throw error
    const message = error instanceof Error ? error.message : 'invalid Canvas layout'
    return invalid('canvas-layout-change.layout', message)
  }
}

function decodeMeta(value: unknown): CanvasChangeMetaV2 {
  const source = record(value, 'canvas-layout-change.meta')
  requireAllowedKeys(source, new Set(['actor', 'correlationId', 'requestId', 'schemaVersion', 'source']), 'canvas-layout-change.meta')
  if (source.schemaVersion !== 2) invalid('canvas-layout-change.meta', 'layout change meta must use schemaVersion 2')
  try {
    return canvasChangeMeta(canonicalCanvasAccessContext({
      actor: source.actor as never,
      source: source.source as CanvasRequestSource,
      ...(source.requestId === undefined ? {} : { requestId: source.requestId as string }),
      ...(source.correlationId === undefined ? {} : { correlationId: source.correlationId as string }),
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid Canvas layout audit metadata'
    invalid('canvas-layout-change.meta', message)
  }
}

export function decodeCanvasLayoutChange(value: unknown): CanvasLayoutChange | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as Record<string, unknown>
  if (source.kind !== 'canvas/layout-change') return undefined
  if (Object.keys(source).sort().join(',') !== 'kind,layout,meta,version') {
    invalid('canvas-layout-change', 'canvas/layout-change must contain exactly kind, layout, meta, and version')
  }
  if (source.version !== CANVAS_LAYOUT_CHANGE_VERSION) {
    invalid('canvas-layout-change.version', `unsupported Canvas layout change version ${String(source.version)}`)
  }
  return {
    kind: 'canvas/layout-change',
    version: CANVAS_LAYOUT_CHANGE_VERSION,
    layout: decodeStrictLayout(source.layout),
    meta: decodeMeta(source.meta),
  }
}

/** Mutable current-layout replay state. Canvas identity changes reset the layout generation. */
export interface CanvasLayoutFoldState {
  layout: CurrentCanvasLayoutSnapshot | null
  canvasId: ReturnType<typeof CanvasId> | null
  workflowId: ReturnType<typeof MediaWorkflowId> | null
}

export function emptyCanvasLayoutFoldState(): CanvasLayoutFoldState {
  return { layout: null, canvasId: null, workflowId: null }
}

export function cloneCanvasLayoutFoldState(state: CanvasLayoutFoldState): CanvasLayoutFoldState {
  return { layout: state.layout, canvasId: state.canvasId, workflowId: state.workflowId }
}

/** Validate and apply one layout event against the current Canvas generation. */
export function applyCanvasLayoutChange(state: CanvasLayoutFoldState, change: CanvasLayoutChange): void {
  if (state.canvasId === null || state.workflowId === null) {
    throw new CanvasLayoutError('Canvas layout change requires a current Canvas workflow', 'CANVAS_LAYOUT_WORKFLOW_MISMATCH')
  }
  if (change.layout.workflowId !== state.workflowId) {
    throw new CanvasLayoutError(
      `Canvas layout workflow "${change.layout.workflowId}" does not match current workflow "${state.workflowId}"`,
      'CANVAS_LAYOUT_WORKFLOW_MISMATCH',
    )
  }
  const expectedRevision = (state.layout?.layoutRevision ?? 0) + 1
  let next: CurrentCanvasLayoutSnapshot
  if (change.layout.canvasId === undefined || change.layout.layoutRevision === undefined) {
    // Historical N05-v1 layout: infer current generation and replay order.
    next = {
      ...change.layout,
      canvasId: state.canvasId,
      layoutRevision: expectedRevision,
    }
  } else {
    assertCurrentCanvasLayoutSnapshot(change.layout)
    if (change.layout.canvasId !== state.canvasId) {
      throw new CanvasLayoutError(
        `Canvas layout canvas "${change.layout.canvasId}" does not match current Canvas "${state.canvasId}"`,
        'CANVAS_LAYOUT_CANVAS_MISMATCH',
      )
    }
    if (change.layout.layoutRevision !== expectedRevision) {
      throw new CanvasLayoutError(
        `stale Canvas layout revision ${change.layout.layoutRevision - 1}; current revision is ${expectedRevision - 1}`,
        'CANVAS_STALE_LAYOUT_REVISION',
      )
    }
    next = change.layout
  }
  if (state.layout !== null && next.updatedAt < state.layout.updatedAt) {
    throw new CanvasLayoutError('Canvas layout updatedAt cannot move backwards in one Canvas generation', 'CANVAS_INVALID_LAYOUT')
  }
  state.layout = next
}

/** Apply one Session event to the current-layout fold. Own-domain malformed events fail loud. */
export function applyCanvasLayoutEvent(state: CanvasLayoutFoldState, event: SessionEvent): void {
  if (event.type === 'canvas/change') {
    const change = decodeCanvasChange(event.data)
    if (change === undefined) throw new Error(`canvas change at session event ${event.seq} has an invalid kind`)
    const canvas = change.canvas
    const nextCanvasId = canvas?.id ?? null
    const nextWorkflowId = canvas?.workflow?.id ?? null
    if (state.canvasId !== nextCanvasId || state.workflowId !== nextWorkflowId) state.layout = null
    state.canvasId = nextCanvasId
    state.workflowId = nextWorkflowId
    return
  }
  if (event.type !== 'canvas/layout-change') return
  const change = decodeCanvasLayoutChange(event.data)
  if (change === undefined) throw new Error(`canvas layout change at session event ${event.seq} has an invalid kind`)
  applyCanvasLayoutChange(state, change)
}

/** Reconstruct the layout belonging to the current Canvas generation, not the latest historical layout row. */
export function foldCanvasLayout(events: readonly SessionEvent[]): CurrentCanvasLayoutSnapshot | null {
  const state = emptyCanvasLayoutFoldState()
  for (const event of events) applyCanvasLayoutEvent(state, event)
  return state.layout === null ? null : structuredClone(state.layout)
}
