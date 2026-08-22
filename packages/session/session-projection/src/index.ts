/**
 * Session projection registry: synchronous host fold state, optional client
 * views, rebuildable checkpoints, and guarded browser visibility.
 *
 * @module @deepseek-ai/dsh-session-projection
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { ZodType } from 'zod'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {
  SessionProjectionControlEnvelope,
  SessionProjectionMap,
  SessionProjectionStateMap,
} from './types.ts'

export type {
  SessionProjectionControlEnvelope,
  SessionProjectionMap,
  SessionProjectionStateMap,
} from './types.ts'

/** Reserved framework marker used only inside live projection visibility envelopes. */
export const SESSION_PROJECTION_CONTROL_MARKER = '__dshSessionProjectionV1' as const

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionProjections: SessionProjectionRegistry
  }
}

/** Browser-facing identity supplied to projection read guards. */
export interface ProjectionReadContext {
  readonly surface: 'browser'
  readonly sessionId?: string
}

/** Domain-owned fail-closed visibility decision over one computed wire value. */
export type ProjectionReadGuard = (context: ProjectionReadContext, value: unknown) => boolean

/** One domain's synchronous state-driven projection unit. */
export interface ProjectionDefinition<
  K extends keyof SessionProjectionStateMap,
  S extends SessionProjectionStateMap[K] = SessionProjectionStateMap[K],
> {
  readonly key: K
  readonly stateSchema: ZodType<S>
  init(): NoInfer<S>
  apply(state: NoInfer<S>, event: SessionEvent): NoInfer<S>
  readonly wire?: K extends keyof SessionProjectionMap ? {
    readonly viewSchema: ZodType<SessionProjectionMap[K]>
    view(state: NoInfer<S>): SessionProjectionMap[K]
  } : never
  readonly stateVersion: number
}

/** Live client-view change feed. Visibility transitions use a control envelope. */
export type ProjectionChangeListener = (
  session: Session,
  key: Extract<keyof SessionProjectionMap, string>,
  value: unknown,
  seq: number,
) => void

export interface ProjectionSnapshot {
  readonly asOfSeq: number
  readonly values: Partial<SessionProjectionMap>
}

export interface ProjectionCheckpointRow {
  readonly ver: number
  readonly seq: number
  readonly val: unknown
}

export type ProjectionCheckpoint = Record<string, ProjectionCheckpointRow>

interface ErasedDefinition {
  key: string
  stateSchema: { parse(value: unknown): unknown }
  init(): unknown
  apply(state: unknown, event: SessionEvent): unknown
  wire: { viewSchema: { parse(value: unknown): unknown }; view(state: unknown): unknown } | undefined
  stateVersion: number
}

interface UnitCell {
  state: unknown
  observedSeq: number
}

interface Registration {
  readonly def: ErasedDefinition
  readonly cells: WeakMap<Session, UnitCell>
  refs: number
}

interface VisibilityCell {
  generation: number
  present: boolean
}

/** Generic Host registry for Session projection units and guarded Browser views. */
export class SessionProjectionRegistry extends Service {
  private readonly registrations = new Map<string, Registration>()
  private readonly listeners = new Set<ProjectionChangeListener>()
  private readonly readGuards = new Map<string, Set<ProjectionReadGuard>>()
  private readonly visibility = new WeakMap<Session, Map<string, VisibilityCell>>()
  private readonly knownSessions = new Map<string, WeakRef<Session>>()

  constructor(ctx: Context) {
    super(ctx, 'sessionProjections')
    ctx.on('session/event', (session: Session, event: SessionEvent) => {
      this.drive(session, event)
    })
  }

  register<
    K extends keyof SessionProjectionMap,
    S extends SessionProjectionStateMap[K],
  >(
    definition: Omit<ProjectionDefinition<K, S>, 'wire'> & {
      wire: NonNullable<ProjectionDefinition<K, S>['wire']>
    },
  ): () => void
  register<
    K extends Exclude<keyof SessionProjectionStateMap, keyof SessionProjectionMap>,
    S extends SessionProjectionStateMap[K],
  >(
    definition: Omit<ProjectionDefinition<K, S>, 'wire'>,
  ): () => void
  register<K extends keyof SessionProjectionStateMap, S extends SessionProjectionStateMap[K]>(
    definition: ProjectionDefinition<K, S>,
  ): () => void {
    const wire = definition.wire as {
      viewSchema: ZodType
      view(state: S): unknown
    } | undefined
    const erased: ErasedDefinition = {
      key: definition.key as string,
      stateSchema: definition.stateSchema,
      init: () => definition.init(),
      apply: (state, event) => definition.apply(state as S, event),
      wire: wire === undefined
        ? undefined
        : { viewSchema: wire.viewSchema, view: state => wire.view(state as S) },
      stateVersion: definition.stateVersion,
    }
    if (!Number.isSafeInteger(definition.stateVersion) || definition.stateVersion < 0) {
      throw new Error(`session projection ${JSON.stringify(definition.key)} stateVersion must be a non-negative integer, got ${String(definition.stateVersion)}`)
    }
    const dispose = this.ctx.effect(function* (this: SessionProjectionRegistry) {
      const key = erased.key
      const existing = this.registrations.get(key)
      if (existing === undefined) {
        this.registrations.set(key, { def: erased, cells: new WeakMap(), refs: 1 })
        this.refreshKnownSessions(key)
      } else {
        if (existing.def.stateVersion !== erased.stateVersion) {
          throw new Error(`session projection key ${JSON.stringify(key)} is already registered at stateVersion ${String(existing.def.stateVersion)}; refusing to share it with stateVersion ${String(erased.stateVersion)}`)
        }
        existing.refs += 1
      }
      yield () => {
        const live = this.registrations.get(key)
        /* v8 ignore next -- disposer corresponds to one successful registration. */
        if (live === undefined) return
        live.refs -= 1
        if (live.refs !== 0) return
        this.emitKnownAbsence(key)
        this.registrations.delete(key)
      }
    }.bind(this), 'sessionProjections.register()')
    return () => void dispose()
  }

  /** Register one fail-closed Browser read guard for a client-visible key. */
  registerReadGuard<K extends keyof SessionProjectionMap>(key: K, guard: ProjectionReadGuard): () => void {
    const dispose = this.ctx.effect(() => {
      const name = key as string
      const guards = this.readGuards.get(name) ?? new Set<ProjectionReadGuard>()
      guards.add(guard)
      this.readGuards.set(name, guards)
      this.refreshKnownSessions(name)
      return () => {
        const live = this.readGuards.get(name)
        if (live === undefined) return
        live.delete(guard)
        if (live.size === 0) this.readGuards.delete(name)
        this.refreshKnownSessions(name)
      }
    }, 'sessionProjections.registerReadGuard()')
    return () => void dispose()
  }

  onChanged(listener: ProjectionChangeListener): () => void {
    const dispose = this.ctx.effect(() => {
      this.listeners.add(listener)
      return () => {
        this.listeners.delete(listener)
      }
    }, 'sessionProjections.onChanged()')
    return () => void dispose()
  }

  stateOf<K extends keyof SessionProjectionStateMap>(
    session: Session,
    key: K,
  ): SessionProjectionStateMap[K] | undefined {
    const registration = this.registrations.get(key as string)
    if (registration === undefined) return undefined
    return this.cellFor(registration, session).state as SessionProjectionStateMap[K]
  }

  /** Re-evaluate Browser visibility without inventing a durable Session event. */
  refreshBrowserVisibility(
    session: Session,
    keys?: readonly Extract<keyof SessionProjectionMap, string>[],
  ): void {
    this.remember(session)
    const selected = keys === undefined ? [...this.registrations.keys()] : [...keys]
    for (const key of selected) {
      const registration = this.registrations.get(key)
      if (registration?.def.wire === undefined) {
        this.emitAbsence(session, key)
        continue
      }
      const value = this.wireValue(registration, this.cellFor(registration, session).state)
      const context: ProjectionReadContext = { surface: 'browser', sessionId: String(session.id) }
      this.emitVisibilityTransition(session, key, value, this.readAllowed(key, value, context), session.seq - 1)
    }
  }

  snapshot(session: Session): ProjectionSnapshot {
    this.remember(session)
    const values: Record<string, unknown> = {}
    const context: ProjectionReadContext = { surface: 'browser', sessionId: String(session.id) }
    for (const registration of this.registrations.values()) {
      if (registration.def.wire === undefined) continue
      const value = this.wireValue(registration, this.cellFor(registration, session).state)
      const allowed = this.readAllowed(registration.def.key, value, context)
      this.recordVisibility(session, registration.def.key, allowed)
      if (allowed) values[registration.def.key] = value
    }
    return { asOfSeq: session.seq - 1, values }
  }

  checkpoint(session: Session): ProjectionCheckpoint {
    this.remember(session)
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

  /** View usable checkpoint rows under an optional carrier-supplied Session identity. */
  viewCheckpoint(
    checkpoint: ProjectionCheckpoint,
    context: ProjectionReadContext = { surface: 'browser' },
  ): Partial<SessionProjectionMap> {
    const values: Record<string, unknown> = {}
    for (const registration of this.registrations.values()) {
      const def = registration.def
      if (def.wire === undefined) continue
      const row = checkpoint[def.key]
      if (row === undefined || row.ver !== def.stateVersion) continue
      let state: unknown
      try {
        state = def.stateSchema.parse(row.val)
      } catch {
        continue
      }
      const value = def.wire.viewSchema.parse(def.wire.view(state))
      if (this.readAllowed(def.key, value, context)) values[def.key] = value
    }
    return values
  }

  restore(
    checkpoint: ProjectionCheckpoint,
    events: readonly SessionEvent[],
    baseSeq: number,
    context: ProjectionReadContext = { surface: 'browser' },
  ): { snapshot: ProjectionSnapshot; checkpoint: ProjectionCheckpoint } {
    const endSeq = events.at(-1)?.seq ?? baseSeq - 1
    const values: Record<string, unknown> = {}
    const refreshed: ProjectionCheckpoint = {}
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
      let state = usable ? def.stateSchema.parse(row.val) : def.init()
      const from = usable ? row.seq : baseSeq - 1
      for (const event of events) {
        if (event.seq > from) state = def.apply(state, event)
      }
      if (def.wire !== undefined) {
        const value = def.wire.viewSchema.parse(def.wire.view(state))
        if (this.readAllowed(def.key, value, context)) values[def.key] = value
      }
      refreshed[def.key] = { ver: def.stateVersion, seq: endSeq, val: state }
    }
    return {
      snapshot: { asOfSeq: endSeq, values },
      checkpoint: refreshed,
    }
  }

  private buildCell(def: ErasedDefinition, events: readonly SessionEvent[]): UnitCell {
    let state = def.init()
    for (const event of events) state = def.apply(state, event)
    return { state, observedSeq: events.at(-1)?.seq ?? -1 }
  }

  private cellFor(registration: Registration, session: Session): UnitCell {
    this.remember(session)
    let cell = registration.cells.get(session)
    if (cell === undefined) {
      cell = this.buildCell(registration.def, session.events)
      registration.cells.set(session, cell)
    }
    return cell
  }

  private wireValue(registration: Registration, state: unknown): unknown {
    const wire = registration.def.wire
    if (wire === undefined) return undefined
    return wire.viewSchema.parse(wire.view(state))
  }

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

  private drive(session: Session, event: SessionEvent): void {
    this.remember(session)
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
      if (!changed || registration.def.wire === undefined) continue
      const value = this.wireValue(registration, next)
      const guards = this.readGuards.get(registration.def.key)
      if (guards === undefined) {
        this.recordVisibility(session, registration.def.key, true)
        if (this.listeners.size === 0) continue
        for (const listener of this.listeners) {
          listener(session, registration.def.key as Extract<keyof SessionProjectionMap, string>, value, event.seq)
        }
        continue
      }
      const allowed = this.readAllowed(registration.def.key, value, context)
      const prior = this.visibilityCell(session, registration.def.key)
      if (prior.present !== allowed) {
        this.emitVisibilityTransition(session, registration.def.key, value, allowed, event.seq)
        continue
      }
      if (!allowed || this.listeners.size === 0) continue
      for (const listener of this.listeners) {
        listener(session, registration.def.key as Extract<keyof SessionProjectionMap, string>, value, event.seq)
      }
    }
  }

  private remember(session: Session): void {
    this.knownSessions.set(String(session.id), new WeakRef(session))
  }

  private forEachKnown(callback: (session: Session) => void): void {
    for (const [id, reference] of this.knownSessions) {
      const session = reference.deref()
      if (session === undefined) {
        this.knownSessions.delete(id)
        continue
      }
      callback(session)
    }
  }

  private refreshKnownSessions(key: string): void {
    this.forEachKnown((session) => {
      const registration = this.registrations.get(key)
      if (registration?.def.wire === undefined) {
        this.emitAbsence(session, key)
        return
      }
      const value = this.wireValue(registration, this.cellFor(registration, session).state)
      const context: ProjectionReadContext = { surface: 'browser', sessionId: String(session.id) }
      this.emitVisibilityTransition(session, key, value, this.readAllowed(key, value, context), session.seq - 1)
    })
  }

  private emitKnownAbsence(key: string): void {
    this.forEachKnown(session => this.emitAbsence(session, key))
  }

  private visibilityCell(session: Session, key: string): VisibilityCell {
    let rows = this.visibility.get(session)
    if (rows === undefined) {
      rows = new Map()
      this.visibility.set(session, rows)
    }
    let cell = rows.get(key)
    if (cell === undefined) {
      cell = { generation: 0, present: false }
      rows.set(key, cell)
    }
    return cell
  }

  private recordVisibility(session: Session, key: string, present: boolean): void {
    this.visibilityCell(session, key).present = present
  }

  private emitVisibilityTransition(
    session: Session,
    key: string,
    value: unknown,
    present: boolean,
    seq: number,
  ): void {
    const cell = this.visibilityCell(session, key)
    if (cell.present === present) return
    cell.present = present
    cell.generation += 1
    this.emitControl(session, key, value, present, seq, cell.generation)
  }

  private emitControl(
    session: Session,
    key: string,
    value: unknown,
    present: boolean,
    seq: number,
    generation: number,
  ): void {
    if (this.listeners.size === 0) return
    const envelope: SessionProjectionControlEnvelope = present
      ? { [SESSION_PROJECTION_CONTROL_MARKER]: { generation, present: true, value } }
      : { [SESSION_PROJECTION_CONTROL_MARKER]: { generation, present: false } }
    for (const listener of this.listeners) {
      listener(session, key as Extract<keyof SessionProjectionMap, string>, envelope, seq)
    }
  }

  private emitAbsence(session: Session, key: string): void {
    const cell = this.visibilityCell(session, key)
    if (!cell.present) return
    this.emitVisibilityTransition(session, key, undefined, false, session.seq - 1)
  }
}

export default SessionProjectionRegistry
