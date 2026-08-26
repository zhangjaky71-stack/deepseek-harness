/** Pure strict Session projection units for current Canvas and editor layout state. */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import { decodeCanvasChange } from './fold.ts'
import {
  applyCanvasLayoutEvent,
  assertCurrentCanvasLayoutSnapshot,
  cloneCanvasLayoutFoldState,
  emptyCanvasLayoutFoldState,
  type CanvasLayoutFoldState,
} from './layout.ts'
import { decodeCanvasSnapshot } from './migration.ts'
import type { CanvasSnapshot, CurrentCanvasLayoutSnapshot } from './types.ts'

const canvasProjectionSchema = z.custom<CanvasSnapshot | null>((value) => {
  if (value === null) return true
  try {
    decodeCanvasSnapshot(value)
    return true
  } catch {
    return false
  }
}, { message: 'invalid Canvas projection value' })

const layoutProjectionSchema = z.custom<CurrentCanvasLayoutSnapshot | null>((value) => {
  if (value === null) return true
  try {
    assertCurrentCanvasLayoutSnapshot(value as CurrentCanvasLayoutSnapshot)
    return true
  } catch {
    return false
  }
}, { message: 'invalid current Canvas layout projection value' })

/** Host-side browser visibility decision over the already-computed value. */
export type CanvasProjectionReadGate = (sessionId: string | undefined, value: unknown) => boolean

/** Last-wins whole Canvas projection. Own-domain malformed events fail loud. */
export function applyCanvasProjection(state: CanvasSnapshot | null, event: SessionEvent): CanvasSnapshot | null {
  if (event.type !== 'canvas/change') return state
  const change = decodeCanvasChange(event.data)
  if (change === undefined) throw new Error(`canvas change at session event ${event.seq} has an invalid kind`)
  return change.canvas
}

/**
 * Strict current-layout projection state. The fold understands Canvas
 * generation changes and normalizes historical layout rows before view.
 */
export function applyCanvasLayoutProjection(
  state: CanvasLayoutFoldState,
  event: SessionEvent,
): CanvasLayoutFoldState {
  if (event.type !== 'canvas/change' && event.type !== 'canvas/layout-change') return state
  const next = cloneCanvasLayoutFoldState(state)
  applyCanvasLayoutEvent(next, event)
  return next
}

export function registerCanvasProjections(ctx: Context, canRead?: CanvasProjectionReadGate): void {
  ctx.sessionProjections.register<'canvas', CanvasSnapshot | null>({
    key: 'canvas',
    owner: '@deepseek-ai/dsh-canvas:canvas',
    schema: canvasProjectionSchema,
    init: () => null,
    apply: (state: CanvasSnapshot | null, event: SessionEvent) => applyCanvasProjection(state, event),
    view: (state: CanvasSnapshot | null) => state,
    stateVersion: 1,
  })
  ctx.sessionProjections.register<'canvasLayout', CanvasLayoutFoldState>({
    key: 'canvasLayout',
    owner: '@deepseek-ai/dsh-canvas:canvasLayout',
    schema: layoutProjectionSchema,
    init: emptyCanvasLayoutFoldState,
    apply: (state: CanvasLayoutFoldState, event: SessionEvent) => applyCanvasLayoutProjection(state, event),
    view: (state: CanvasLayoutFoldState) => state.layout,
    // Internal state now carries Canvas generation identity and normalized layout revision.
    stateVersion: 2,
  })
  if (canRead !== undefined) {
    ctx.sessionProjections.registerReadGuard('canvas', (context, value) => canRead(context.sessionId, value))
    ctx.sessionProjections.registerReadGuard('canvasLayout', (context, value) => canRead(context.sessionId, value))
  }
}
