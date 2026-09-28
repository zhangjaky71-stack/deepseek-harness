/** Package-owned durable Canvas and editor-layout stream invariants. @module @deepseek-ai/dsh-canvas/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { assertCanvasDurableAuditSafe } from './audit.ts'
import {
  applyCanvasEvent,
  cloneCanvasFoldState,
  decodeCanvasChange,
  emptyCanvasFoldState,
} from './fold.ts'
import type { CanvasFoldState } from './fold.ts'
import {
  applyCanvasLayoutEvent,
  assertCurrentCanvasLayoutSnapshot,
  cloneCanvasLayoutFoldState,
  decodeCanvasLayoutChange,
  emptyCanvasLayoutFoldState,
} from './layout.ts'
import type { CanvasLayoutFoldState } from './layout.ts'
import { consumeCanvasWritePermit } from './write-authority.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-canvas'
export const name = 'canvas-invariant'
export const inject = ['invariants']

interface CombinedState {
  readonly canvas: CanvasFoldState
  readonly layout: CanvasLayoutFoldState
}

function emptyState(): CombinedState {
  return { canvas: emptyCanvasFoldState(), layout: emptyCanvasLayoutFoldState() }
}

function cloneState(state: CombinedState): CombinedState {
  return {
    canvas: cloneCanvasFoldState(state.canvas),
    layout: cloneCanvasLayoutFoldState(state.layout),
  }
}

function applyChecked(state: CombinedState, event: SessionEvent, fail: InvariantFailure): void {
  try {
    applyCanvasEvent(state.canvas, event)
    applyCanvasLayoutEvent(state.layout, event)
    if (event.type === 'canvas/layout-change') {
      const canvas = state.canvas.canvas
      const layout = state.layout.layout
      if (canvas === null || canvas.workflow === null || layout === null) {
        throw new Error('Canvas layout change must target a current Canvas workflow')
      }
      if (layout.canvasId !== canvas.id || layout.workflowId !== canvas.workflow.id) {
        throw new Error('Canvas layout change must target the current Canvas generation and workflow identity')
      }
      const nodeIds = new Set(canvas.workflow.nodes.map(node => String(node.id)))
      for (const nodeId of Object.keys(layout.nodePositions)) {
        if (!nodeIds.has(nodeId)) throw new Error(`Canvas layout references unknown current node "${nodeId}"`)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fail(`session event ${event.seq} violates the durable Canvas stream: ${message}`)
  }
}

/** Current-writer-only checks at the Session pre-commit boundary. */
function assertCurrentWriter(session: Session, event: SessionEvent, fail: InvariantFailure): void {
  if (event.type !== 'canvas/change' && event.type !== 'canvas/layout-change') return
  try {
    if (!consumeCanvasWritePermit(session, event)) {
      throw new Error('current Canvas durable writes must be committed by CanvasService')
    }
    if (event.type === 'canvas/layout-change') {
      const change = decodeCanvasLayoutChange(event.data)
      if (change === undefined) throw new Error('Canvas event data does not decode as canvas/layout-change')
      assertCurrentCanvasLayoutSnapshot(change.layout)
      return
    }

    const change = decodeCanvasChange(event.data)
    if (change === undefined) throw new Error('Canvas event data does not decode as canvas/change')
    if (change.meta.schemaVersion !== 2) {
      throw new Error('new Canvas changes must use audit metadata schemaVersion 2')
    }
    if (change.operation === 'run-complete') {
      throw new Error('run-complete is historical replay vocabulary; current writers must use run-update')
    }
    assertCanvasDurableAuditSafe(change.canvas)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fail(`session event ${event.seq} violates the current Canvas writer contract: ${message}`)
  }
}

const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const states = new WeakMap<Session, CombinedState>()
  const staged = new WeakMap<SessionEvent, { session: Session; state: CombinedState }>()

  const seed = (session: Session): CombinedState => {
    const state = emptyState()
    for (const event of session.events) applyChecked(state, event, fail)
    states.set(session, state)
    return state
  }
  /* v8 ignore next -- session/event follows list() or session/created seeding. */
  const stateFor = (session: Session): CombinedState => states.get(session) ?? seed(session)

  for (const session of ctx.sessions.list()) seed(session)
  ctx.on('session/created', (session) => { seed(session) }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    assertCurrentWriter(session, event, fail)
    const state = cloneState(stateFor(session))
    applyChecked(state, event, fail)
    staged.set(event, { session, state })
  }, { global: true })
  ctx.on('session/event', (session, event) => {
    const candidate = staged.get(event)
    /* v8 ignore next 2 -- internal/dispatch stages the exact callback arguments. */
    if (candidate === undefined || candidate.session !== session) {
      return fail('session/event reached publication without matching Canvas-fold validation')
    }
    staged.delete(event)
    states.set(session, candidate.state)
  }, { global: true })
}, { inject: ['sessions'] })

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
