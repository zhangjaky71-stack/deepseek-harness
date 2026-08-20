/** Durable editor-layout event, validation, and replay fold. */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { canonicalCanvasAccessContext, canvasChangeMeta } from './audit.ts'
import type { CanvasChangeMetaV2 } from './events.ts'
import {
  CANVAS_LAYOUT_SCHEMA_VERSION,
  CanvasMigrationError,
  migrateStoredCanvasLayoutSnapshot,
} from './migration.ts'
import type {
  CanvasLayoutSnapshot,
  CanvasRequestSource,
} from './types.ts'
import type { CanvasLayoutErrorCode, SaveCanvasLayoutRequest } from './client.ts'

/** Current `canvas/layout-change` envelope version. */
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
    /**
     * Complete post-save Canvas editor layout, independent from semantic workflow revisioning.
     * @param data - current layout snapshot plus Host audit attribution.
     * @mode append
     */
    'canvas/layout-change': CanvasLayoutChange
  }
}

/** Stable Host rejection for invalid or mismatched editor layout writes. */
export class CanvasLayoutError extends HarnessError {
  /**
   * @param message - human-readable layout rejection.
   * @param code - stable layout error code.
   */
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

/** Assert current runtime layout relationships after structural migration. */
export function assertCanvasLayoutSnapshot(layout: CanvasLayoutSnapshot): void {
  if (layout.schemaVersion !== CANVAS_LAYOUT_SCHEMA_VERSION) {
    throw new CanvasLayoutError(
      `Canvas layout schemaVersion must be ${CANVAS_LAYOUT_SCHEMA_VERSION}`,
      'CANVAS_INVALID_LAYOUT',
    )
  }
  if (typeof layout.workflowId !== 'string' || layout.workflowId.length === 0) {
    throw new CanvasLayoutError('Canvas layout workflowId must be non-empty', 'CANVAS_INVALID_LAYOUT')
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

/** Construct a detached current-version layout snapshot from one editor save request. */
export function createCanvasLayoutSnapshot(request: SaveCanvasLayoutRequest, updatedAt: number): CanvasLayoutSnapshot {
  const layout: CanvasLayoutSnapshot = {
    schemaVersion: CANVAS_LAYOUT_SCHEMA_VERSION,
    workflowId: request.workflowId,
    nodePositions: structuredClone(request.nodePositions),
    ...(request.viewport === undefined ? {} : { viewport: { ...request.viewport } }),
    updatedAt,
  }
  assertCanvasLayoutSnapshot(layout)
  return layout
}

/**
 * Decode one stored layout by running N02 structural migration followed by the current layout invariant.
 * @param value - stored layout JSON value.
 * @returns validated current layout.
 */
export function decodeCanvasLayoutSnapshot(value: unknown): CanvasLayoutSnapshot {
  const layout = migrateStoredCanvasLayoutSnapshot(value)
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
  requireAllowedKeys(
    source,
    new Set(['actor', 'correlationId', 'requestId', 'schemaVersion', 'source']),
    'canvas-layout-change.meta',
  )
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

/** Decode one strict durable layout change; unrelated values return undefined. */
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

/** Mutable strict replay state for the independent layout stream. */
export interface CanvasLayoutFoldState {
  layout: CanvasLayoutSnapshot | null
}

/** Build an empty layout replay state. */
export function emptyCanvasLayoutFoldState(): CanvasLayoutFoldState {
  return { layout: null }
}

/** Clone layout replay state for pre-commit invariant validation. */
export function cloneCanvasLayoutFoldState(state: CanvasLayoutFoldState): CanvasLayoutFoldState {
  return { layout: state.layout }
}

/** Validate and apply one decoded layout change. */
export function applyCanvasLayoutChange(state: CanvasLayoutFoldState, change: CanvasLayoutChange): void {
  const current = state.layout
  if (current !== null && current.workflowId === change.layout.workflowId && change.layout.updatedAt < current.updatedAt) {
    throw new Error('Canvas layout updatedAt cannot move backwards for the same workflow')
  }
  state.layout = change.layout
}

/** Apply one Session event to the strict layout fold. */
export function applyCanvasLayoutEvent(state: CanvasLayoutFoldState, event: SessionEvent): void {
  if (event.type !== 'canvas/layout-change') return
  const change = decodeCanvasLayoutChange(event.data)
  if (change === undefined) throw new Error(`canvas layout change at session event ${event.seq} has an invalid kind`)
  applyCanvasLayoutChange(state, change)
}

/** Reconstruct the latest independently persisted Canvas layout. */
export function foldCanvasLayout(events: readonly SessionEvent[]): CanvasLayoutSnapshot | null {
  const state = emptyCanvasLayoutFoldState()
  for (const event of events) applyCanvasLayoutEvent(state, event)
  return state.layout === null ? null : structuredClone(state.layout)
}
