/** Pure Session projection units for current Canvas and editor layout state. */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import { decodeCanvasChange } from './fold.ts'
import { assertCanvasLayoutSnapshot, decodeCanvasLayoutChange } from './layout.ts'
import { decodeCanvasSnapshot } from './migration.ts'
import type { CanvasLayoutSnapshot, CanvasSnapshot } from './types.ts'

const canvasProjectionSchema = z.custom<CanvasSnapshot | null>((value) => {
  if (value === null) return true
  try {
    decodeCanvasSnapshot(value)
    return true
  } catch {
    return false
  }
}, { message: 'invalid Canvas projection value' })

const layoutProjectionSchema = z.custom<CanvasLayoutSnapshot | null>((value) => {
  if (value === null) return true
  try {
    assertCanvasLayoutSnapshot(value as CanvasLayoutSnapshot)
    return true
  } catch {
    return false
  }
}, { message: 'invalid Canvas layout projection value' })

/** Last-wins whole Canvas projection; malformed candidate events fail-soft. */
export function applyCanvasProjection(state: CanvasSnapshot | null, event: SessionEvent): CanvasSnapshot | null {
  if (event.type !== 'canvas/change') return state
  try {
    const change = decodeCanvasChange(event.data)
    return change === undefined ? state : change.canvas
  } catch {
    return state
  }
}

/** Last-wins whole layout projection; Canvas create/clear reset current layout and malformed events fail-soft. */
export function applyCanvasLayoutProjection(
  state: CanvasLayoutSnapshot | null,
  event: SessionEvent,
): CanvasLayoutSnapshot | null {
  if (event.type === 'canvas/change') {
    try {
      const change = decodeCanvasChange(event.data)
      return change?.operation === 'create' || change?.operation === 'clear' ? null : state
    } catch {
      return state
    }
  }
  if (event.type !== 'canvas/layout-change') return state
  try {
    const change = decodeCanvasLayoutChange(event.data)
    return change === undefined ? state : change.layout
  } catch {
    return state
  }
}

/** Register Canvas current-state and layout units on the composed projection registry. */
export function registerCanvasProjections(ctx: Context): void {
  ctx.sessionProjections.register<'canvas', CanvasSnapshot | null>({
    key: 'canvas',
    schema: canvasProjectionSchema,
    init: () => null,
    apply: (state: CanvasSnapshot | null, event: SessionEvent) => applyCanvasProjection(state, event),
    view: (state: CanvasSnapshot | null) => state,
    stateVersion: 1,
  })
  ctx.sessionProjections.register<'canvasLayout', CanvasLayoutSnapshot | null>({
    key: 'canvasLayout',
    schema: layoutProjectionSchema,
    init: () => null,
    apply: (state: CanvasLayoutSnapshot | null, event: SessionEvent) => applyCanvasLayoutProjection(state, event),
    view: (state: CanvasLayoutSnapshot | null) => state,
    stateVersion: 1,
  })
}
