/** Package-owned durable Canvas-stream invariants. @module @deepseek-ai/dsh-canvas/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { applyCanvasEvent, cloneCanvasFoldState, emptyCanvasFoldState } from './fold.ts'
import type { CanvasFoldState } from './fold.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-canvas'

/** Cordis companion plugin name. */
export const name = 'canvas-invariant'
/** Services required before the companion can reserve package ownership. */
export const inject = ['invariants']

function applyChecked(state: CanvasFoldState, event: SessionEvent, fail: InvariantFailure): void {
  try {
    applyCanvasEvent(state, event)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fail(`session event ${event.seq} violates the durable Canvas stream: ${message}`)
  }
}

/** Install an independent incremental Canvas fold over every attached Session. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const states = new WeakMap<Session, CanvasFoldState>()
  const staged = new WeakMap<SessionEvent, { session: Session; state: CanvasFoldState }>()

  const seed = (session: Session): CanvasFoldState => {
    const state = emptyCanvasFoldState()
    for (const event of session.events) applyChecked(state, event, fail)
    states.set(session, state)
    return state
  }
  /* v8 ignore next -- session/event follows list() or session/created seeding. */
  const stateFor = (session: Session): CanvasFoldState => states.get(session) ?? seed(session)

  for (const session of ctx.sessions.list()) seed(session)
  ctx.on('session/created', (session) => { seed(session) }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    const state = cloneCanvasFoldState(stateFor(session))
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

/**
 * Register this package's Canvas-stream invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
