/**
 * Service Definition and drive registry for the session-projection capability seam: the merge-extensible `SessionProjectionMap` type
 * table, the `ProjectionDefinition` state-driven computation unit contract,
 * and the `ctx.sessionProjections` registry that DRIVES every registered unit
 * forward eagerly over committed session events. Domain host plugins
 * contribute pure mathematics (init/apply/view); the framework owns the
 * subscription, the per-session watermark cache, and change notification;
 * carriers consume the snapshot read face and the change feed. Neither side
 * knows the other
 * (capability-seam three-way split). Design authority: the session-projection
 * RFC (.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md).
 *
 * Whole-value event rule (load-bearing): a state-carrying log event MUST
 * carry the complete post-change state, never a bare delta — it keeps every
 * unit's transition trivially cheap and every served value self-describing.
 *
 * @module @deepseek-ai/dsh-session-projection
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { ZodType } from 'zod'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionProjections: SessionProjectionRegistry
  }
}

import type { SessionProjectionMap } from './types.ts'

export type { SessionProjectionMap } from './types.ts'

/** Browser-facing context supplied to projection read guards. */
export interface ProjectionReadContext {
  readonly surface: 'browser'
  /** Present for live Session snapshots/change frames; absent for detached cache/history views. */
  readonly sessionId?: string
}

/** Domain-owned fail-closed visibility decision over one already-computed projection value. */
export type ProjectionReadGuard = (context: ProjectionReadContext, value: unknown) => boolean

/**
 * One domain's state-driven computation unit: three pure synchronous
 * functions plus declarations — never an opaque getter. The framework drives
 * `apply` on every committed session event; the domain holds no
 * subscriptions and owns only the mathematics. All three functions MUST be
 * synchronous (an async unit would tear the carriers' consistency cut) and
 * `state` MUST be plain JSON (the persisted-cache precondition).
 */
export interface ProjectionDefinition<K extends keyof SessionProjectionMap, S> {
  /** The projection key this unit owns (its `SessionProjectionMap` entry). */
  key: K
  /** Validates the wire payload (`view` output) before it leaves the host. */
  schema: ZodType<SessionProjectionMap[K]>
  /**
   * State for the empty log.
   * @returns the initial state.
   */
  init(): S
  /**
   * Pure transition: previous state + one committed event → next state. A
   * unit uninterested in an event MUST return the same state reference — an
   * unchanged reference (`Object.is`) produces zero downstream work.
   * @param state - the state covering all prior events.
   * @param event - the next committed session event.
   * @returns the next state (same reference when the event is not the unit's).
   */
  apply(state: S, event: SessionEvent): S
  /**
   * State → wire payload (the read-side projection).
   * @param state - the current state.
   * @returns the whole current value for this unit's key.
   */
  view(state: S): SessionProjectionMap[K]
  /**
   * Persisted-cache invalidation version: bump whenever the serialized state fields or the
   * fold semantics change, so persisted `(sessionId, key, ver, seq, val)`
   * rows from an older unit are discarded instead of being forward-applied
   * into garbage. Non-negative integer.
   */
  stateVersion: number
}

/**
 * Change-feed listener: one unit's value changed for one session. `value` is
 * the schema-validated and read-guarded `view` output; `seq` is the unit's watermark at
 * emission (the seq of the event that caused the change).
 */
export type ProjectionChangeListener = (
  session: Session,
  key: Extract<keyof SessionProjectionMap, string>,
  value: unknown,
  seq: number,
) => void

/**
 * One consistent read cut over every registered unit for one session.
 * `asOfSeq` is the shared watermark — the seq of the last event every value
 * reflects (`-1` for an empty log, mirroring `session/subscribed.lastSeq`).
 */
export interface ProjectionSnapshot {
  /** Seq of the last event the values reflect; -1 for an empty log. */
  asOfSeq: number
  /** Whole current value per registered and browser-readable key. */
  values: Partial<SessionProjectionMap>
}

/**
 * One unit's checkpoint: its internal state (plain JSON by the unit
 * contract), the seq of the last event folded into it, and the unit
 * `stateVersion` that produced it — the persisted projection-cache row
 * `(sessionId, key, ver, seq, val)` minus the two outer keys. A row is
 * never authoritative, only a fold shortcut: `restore` discards it on a
 * version mismatch or when it claims events past the stored log end.
 */
export interface ProjectionCheckpointRow {
  /** The registering unit's `stateVersion` at fold time. */
  ver: number
  /** Seq of the last event folded into `val`; -1 for the empty log. */
  seq: number
  /** The unit's internal state — plain JSON per the unit contract. */
  val: unknown
}

/** Checkpoint rows keyed by projection key (one session's persisted cache value). */
export type ProjectionCheckpoint = Record<string, ProjectionCheckpointRow>

/** Type-erased unit view the drive machinery works with (the registration contract already proved the typed form). */
interface ErasedDefinition {
  key: string
  schema: { parse(value: unknown): unknown }
  init(): unknown
  apply(state: unknown, event: SessionEvent): unknown
  view(state: unknown): unknown
  stateVersion: number
}

/** Per-session per-unit watermark cache row. */
interface UnitCell {
  state: unknown
  /** Seq of the last event passed through `apply` (regardless of change). */
  observedSeq: number
}

/**
 * One live registration: the unit plus its per-session cells (dropped whole
 * once the last registrant releases it).
 *
 * `refs` exists because one unit definition already serves every session — the
 * cells are keyed by `Session` — while the registrants are now per-session:
 * an agent preset mounts the same tool package once per agent, so N sessions
 * on one preset register the same key N times. Without a count the first
 * registrant would own the disposer, and its session ending would strip the
 * projection from every other live session.
 */
interface Registration {
  readonly def: ErasedDefinition
  readonly cells: WeakMap<Session, UnitCell>
  /** Live registrants sharing this unit; the last one out removes the key. */
  refs: number
}

/**
 * `ctx.sessionProjections`: the projection unit table and its drive. The
 * service subscribes to `session/event` once; every committed event passes
 * every registered unit's `apply` (eager drive), and a changed state
 * reference notifies the change feed only when all domain read guards allow
 * that browser-facing value. Cells build lazily — a unit registered after
 * events flowed, or a session older than the registry, folds `init` over the
 * in-memory log on first touch. Registration and read guards are effects, so
 * unloaded domain plugins leave neither projection values nor stale security
 * decisions behind.
 */
export class SessionProjectionRegistry extends Service {
  private readonly registrations = new Map<string, Registration>()
  private readonly listeners = new Set<ProjectionChangeListener>()
  private readonly readGuards = new Map<string, Set<ProjectionReadGuard>>()

  /**
   * Create and install the registry as `ctx.sessionProjections`.
   * @param ctx - Cordis context that owns the service.
   */
  constructor(ctx: Context) {
    super(ctx, 'sessionProjections')
    ctx.on('session/event', (session: Session, event: SessionEvent) => {
      this.drive(session, event)
    })
  }

  /**
   * Register one domain's unit. The registration is an effect on the calling
   * context's fiber: disposing the fiber (or calling the returned disposer)
   * removes the key — and the unit's cached cells — from subsequent drives
   * and snapshots.
   * @param definition - key, state schema, pure unit functions, and stateVersion.
   * @returns the exact disposer that unregisters this unit.
   */
  register<K extends keyof SessionProjectionMap, S>(definition: ProjectionDefinition<K, S>): () => void {
    if (!Number.isSafeInteger(definition.stateVersion) || definition.stateVersion < 0) {
      throw new Error(`session projection ${JSON.stringify(definition.key)} stateVersion must be a non-negative integer, got ${String(definition.stateVersion)}`)
    }
    const dispose = this.ctx.effect(function* (this: SessionProjectionRegistry) {
      const key = definition.key as string
      const existing = this.registrations.get(key)
      if (existing === undefined) {
        this.registrations.set(key, { def: definition, cells: new WeakMap(), refs: 1 })
      } else {
        if (existing.def.stateVersion !== definition.stateVersion) {
          throw new Error(`session projection key ${JSON.stringify(key)} is already registered at stateVersion ${String(existing.def.stateVersion)}; refusing to share it with stateVersion ${String(definition.stateVersion)}`)
        }
        existing.refs += 1
      }
      yield () => {
        const live = this.registrations.get(key)
        /* v8 ignore next -- the disposer runs once per successful registration, so the entry it counted is still here */
        if (live === undefined) return
        live.refs -= 1
        if (live.refs === 0) this.registrations.delete(key)
      }
    }.bind(this), 'sessionProjections.register()')
    return () => void dispose()
  }

  /**
   * Register one browser-facing read guard for a projection key. Guards compose
   * with AND semantics and fail closed when they throw. The disposer rides the
   * calling fiber, so HMR/unload cannot leave a stale deny/allow decision.
   */
  registerReadGuard<K extends keyof SessionProjectionMap>(key: K, guard: ProjectionReadGuard): () => void {
    const dispose = this.ctx.effect(() => {
      const name = key as string
      const guards = this.readGuards.get(name) ?? new Set<ProjectionReadGuard>()
      guards.add(guard)
      this.readGuards.set(name, guards)
      return () => {
        const live = this.readGuards.get(name)
        if (live === undefined) return
        live.delete(guard)
        if (live.size === 0) this.readGuards.delete(name)
      }
    }, 'sessionProjections.registerReadGuard()')
    return () => void dispose()
  }

  /**
   * Subscribe to the browser-facing change feed. The registration is an effect on the calling context's fiber.
   * @param listener - called once per readable unit whose state reference changed, per committed event.
   * @returns the exact disposer that unsubscribes.
   */
  onChanged(listener: ProjectionChangeListener): () => void {
    const dispose = this.ctx.effect(() => {
      this.listeners.add(listener)
      return () => {
        this.listeners.delete(listener)
      }
    }, 'sessionProjections.onChanged()')
    return () => void dispose()
  }

  /**
   * One consistent browser-facing cut over every registered unit for one session.
   * Fully synchronous — every included value and `asOfSeq` reflect the same log position.
   */
  snapshot(session: Session): ProjectionSnapshot {
    const values: Record<string, unknown> = {}
    const context: ProjectionReadContext = { surface: 'browser', sessionId: String(session.id) }
    for (const registration of this.registrations.values()) {
      const cell = this.cellFor(registration, session)
      const value = registration.def.schema.parse(registration.def.view(cell.state))
      if (this.readAllowed(registration.def.key, value, context)) values[registration.def.key] = value
    }
    return { asOfSeq: session.seq - 1, values: values }
  }

  /** State-level checkpoint of every registered unit; read guards never alter internal cache state. */
  checkpoint(session: Session): ProjectionCheckpoint {
    const rows: ProjectionCheckpoint = {}
    for (const registration of this.registrations.values()) {
      const cell = this.cellFor(registration, session)
      rows[registration.def.key] = {
        ver: registration.def.stateVersion,
        seq: cell.observedSeq,
        val: structuredClone(cell.state),
      }
    }
    return rows
  }

  /** Determine the stored tail floor needed to restore every registered unit. */
  restoreFloor(checkpoint: ProjectionCheckpoint): number | undefined {
    let floor: number | undefined
    for (const registration of this.registrations.values()) {
      const row = checkpoint[registration.def.key]
      const need = row !== undefined && row.ver === registration.def.stateVersion
        ? Math.max(row.seq + 1, 0)
        : 0
      floor = floor === undefined ? need : Math.min(floor, need)
    }
    return floor === undefined ? undefined : Math.max(floor - 1, 0)
  }

  /**
   * View usable checkpoint rows without log I/O. Detached browser views carry
   * no session identity; a domain guard may therefore deny them fail-closed.
   */
  viewCheckpoint(checkpoint: ProjectionCheckpoint): Partial<SessionProjectionMap> {
    const values: Record<string, unknown> = {}
    const context: ProjectionReadContext = { surface: 'browser' }
    for (const registration of this.registrations.values()) {
      const def = registration.def
      const row = checkpoint[def.key]
      if (row === undefined || row.ver !== def.stateVersion) continue
      const value = def.schema.parse(def.view(row.val))
      if (this.readAllowed(def.key, value, context)) values[def.key] = value
    }
    return values
  }

  /**
   * Cold read over a stored log suffix. Internal checkpoint rows are refreshed
   * for every unit, while the returned browser snapshot omits guarded values
   * that cannot be authorized without a live Session identity.
   */
  restore(checkpoint: ProjectionCheckpoint, events: readonly SessionEvent[], baseSeq: number):
  { snapshot: ProjectionSnapshot; checkpoint: ProjectionCheckpoint } {
    const endSeq = events.at(-1)?.seq ?? baseSeq - 1
    const values: Record<string, unknown> = {}
    const refreshed: ProjectionCheckpoint = {}
    const context: ProjectionReadContext = { surface: 'browser' }
    for (const registration of this.registrations.values()) {
      const def = registration.def
      const row = checkpoint[def.key]
      const usable = row !== undefined
        && row.ver === def.stateVersion
        && row.seq >= baseSeq - 1
        && row.seq <= endSeq
      if (!usable && baseSeq > 0) {
        throw new Error(
          `session projection ${JSON.stringify(def.key)} cannot restore from seq ${baseSeq}: `
          + 'its checkpoint row is missing, version-mismatched, or beyond the supplied log end; re-read from seq 0',
        )
      }
      let state = usable ? row.val : def.init()
      const from = usable ? row.seq : baseSeq - 1
      for (const event of events) {
        if (event.seq > from) state = def.apply(state, event)
      }
      const value = def.schema.parse(def.view(state))
      if (this.readAllowed(def.key, value, context)) values[def.key] = value
      refreshed[def.key] = { ver: def.stateVersion, seq: endSeq, val: state }
    }
    return {
      snapshot: { asOfSeq: endSeq, values: values },
      checkpoint: refreshed,
    }
  }

  /** Fold one unit from init over `events`, producing a cell watermarked at the last folded event. */
  private buildCell(def: ErasedDefinition, events: readonly SessionEvent[]): UnitCell {
    let state = def.init()
    for (const event of events) state = def.apply(state, event)
    return { state, observedSeq: (events.at(-1)?.seq ?? -1) }
  }

  /** Read (or lazily build, folding the full in-memory log) one unit's cell. */
  private cellFor(registration: Registration, session: Session): UnitCell {
    let cell = registration.cells.get(session)
    if (cell === undefined) {
      cell = this.buildCell(registration.def, session.events)
      registration.cells.set(session, cell)
    }
    return cell
  }

  /** Fail-closed AND composition of every domain read guard for one key. */
  private readAllowed(key: string, value: unknown, context: ProjectionReadContext): boolean {
    const guards = this.readGuards.get(key)
    if (guards === undefined) return true
    for (const guard of guards) {
      try {
        if (!guard(context, value)) return false
      } catch {
        return false
      }
    }
    return true
  }

  /** Eager drive: pass one committed event through every registered unit; notify only readable changed values. */
  private drive(session: Session, event: SessionEvent): void {
    const context: ProjectionReadContext = { surface: 'browser', sessionId: String(session.id) }
    for (const registration of this.registrations.values()) {
      let cell = registration.cells.get(session)
      if (cell === undefined) {
        cell = this.buildCell(registration.def, session.events.slice(0, event.seq))
        registration.cells.set(session, cell)
      }
      const next = registration.def.apply(cell.state, event)
      const changed = !Object.is(next, cell.state)
      cell.state = next
      cell.observedSeq = event.seq
      if (changed && this.listeners.size > 0) {
        const value = registration.def.schema.parse(registration.def.view(next))
        if (!this.readAllowed(registration.def.key, value, context)) continue
        for (const listener of this.listeners) {
          listener(session, registration.def.key as Extract<keyof SessionProjectionMap, string>, value, event.seq)
        }
      }
    }
  }
}

export default SessionProjectionRegistry