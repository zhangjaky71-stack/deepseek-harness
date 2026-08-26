/**
 * Service Definition and drive registry for Session projections.
 * Domain packages contribute synchronous pure fold/view mathematics; this
 * package owns live drive, checkpoint watermarks, browser visibility and the
 * generic change feed.
 *
 * @module @deepseek-ai/dsh-session-projection
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { ZodType } from 'zod'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionProjectionControlEnvelope, SessionProjectionMap } from './types.ts'

export type { SessionProjectionMap, SessionProjectionControlEnvelope } from './types.ts'

/** Reserved framework marker used only inside live `session/projection.value` control envelopes. */
export const SESSION_PROJECTION_CONTROL_MARKER = '__dshSessionProjectionV1' as const

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionProjections: SessionProjectionRegistry
  }
}

/** Browser-facing context supplied to projection read guards. */
export interface ProjectionReadContext {
  readonly surface: 'browser'
  /** Present for live Session reads and carrier-supplied detached reads. */
  readonly sessionId?: string
}

/** Domain-owned fail-closed visibility decision over one already-computed projection value. */
export type ProjectionReadGuard = (context: ProjectionReadContext, value: unknown) => boolean

/** One domain's synchronous state-driven projection unit. */
export interface ProjectionDefinition<K extends keyof SessionProjectionMap, S> {
  readonly key: K
  readonly schema: ZodType<SessionProjectionMap[K]>
  init(): S
  apply(state: S, event: SessionEvent): S
  view(state: S): SessionProjectionMap[K]
  /** Persisted-cache invalidation version. */
  readonly stateVersion: number
  /**
   * Stable logical owner enabling same-owner HMR replacement. Omit for legacy
   * shared registrations: duplicate unowned definitions retain the historical
   * same-stateVersion co-registration behavior and do not replace each other.
   */
  readonly owner?: string
}

/**
 * Live change-feed listener. Ordinary domain changes carry the raw typed value.
 * Visibility/capability/HMR transitions that do not advance Session seq carry
 * the reserved framework control envelope in the same `value` slot.
 */
export type ProjectionChangeListener = (
  session: Session,
  key: Extract<keyof SessionProjectionMap, string>,
  value: unknown,
  seq: number,
) => void

/** One consistent browser-facing cut over all registered units. */
export interface ProjectionSnapshot {
  readonly asOfSeq: number
  readonly values: Partial<SessionProjectionMap>
}

/** One persisted rebuildable projection-cache row. */
export interface ProjectionCheckpointRow {
  readonly ver: number
  readonly seq: number
  readonly val: unknown
}

export type ProjectionCheckpoint = Record<string, ProjectionCheckpointRow>

interface ErasedDefinition {
  key: string
  schema: { parse(value: unknown): unknown }
  init(): unknown
  apply(state: unknown, event: SessionEvent): unknown
  view(state: unknown): unknown
  stateVersion: number
  owner?: string
}

interface UnitCell {
  state: unknown
  observedSeq: number
}

interface RegistrationEntry {
  readonly token: symbol
  readonly def: ErasedDefinition
}

interface Registration {
  /** Registration order: newest same-owner entry owns active HMR semantics. */
  readonly entries: RegistrationEntry[]
  def: ErasedDefinition
  cells: WeakMap<Session, UnitCell>
}

interface VisibilityCell {
  generation: number
  present: boolean
}

/** Generic Host registry for Session projection units and browser visibility. */
export class SessionProjectionRegistry extends Service {
  private readonly registrations = new Map<string, Registration>()
  private readonly listeners = new Set<ProjectionChangeListener>()
  private readonly readGuards = new Map<string, Set<ProjectionReadGuard>>()
  private readonly visibility = new WeakMap<Session, Map<string, VisibilityCell>>()
  /** Weak references make capability/guard HMR refresh iterable without owning Session lifetime. */
  private readonly knownSessions = new Map<string, WeakRef<Session>>()

  constructor(ctx: Context) {
    super(ctx, 'sessionProjections')
    ctx.on('session/event', (session: Session, event: SessionEvent) => {
      this.drive(session, event)
    })
  }

  /**
   * Register one projection definition. Explicit same-owner registrations use
   * newest-live-definition HMR semantics and rebuild from authoritative Session
   * history. Unowned duplicates keep the pre-N05 same-version shared behavior;
   * a different explicit owner can never replace an existing key.
   */
  register<K extends keyof SessionProjectionMap, S>(definition: ProjectionDefinition<K, S>): () => void {
    if (!Number.isSafeInteger(definition.stateVersion) || definition.stateVersion < 0) {
      throw new Error(`session projection ${JSON.stringify(definition.key)} stateVersion must be a non-negative integer, got ${String(definition.stateVersion)}`)
    }
    if (definition.owner !== undefined && (definition.owner.length === 0 || definition.owner.trim() !== definition.owner)) {
      throw new Error(`session projection ${JSON.stringify(definition.key)} owner must be a non-empty trimmed string`)
    }
    const token = Symbol(String(definition.key))
    const dispose = this.ctx.effect(function* (this: SessionProjectionRegistry) {
      const key = definition.key as string
      const entry: RegistrationEntry = { token, def: definition }
      const existing = this.registrations.get(key)
      if (existing === undefined) {
        this.registrations.set(key, { entries: [entry], def: definition, cells: new WeakMap() })
        this.refreshKnownSessions(key)
      } else if (definition.owner === undefined && existing.def.owner === undefined) {
        if (existing.def.stateVersion !== definition.stateVersion) {
          throw new Error(`session projection key ${JSON.stringify(key)} is already registered at stateVersion ${String(existing.def.stateVersion)}; refusing unowned stateVersion ${String(definition.stateVersion)}`)
        }
        existing.entries.push(entry)
      } else {
        if (definition.owner === undefined || existing.def.owner === undefined || definition.owner !== existing.def.owner) {
          throw new Error(`session projection key ${JSON.stringify(key)} is already owned by ${JSON.stringify(existing.def.owner ?? '<unowned>')}; refusing owner ${JSON.stringify(definition.owner ?? '<unowned>')}`)
        }
        existing.entries.push(entry)
        existing.def = definition
        existing.cells = new WeakMap()
        this.refreshKnownSessions(key, true)
      }
      yield () => {
        const live = this.registrations.get(key)
        /* v8 ignore next -- disposer runs once per successful registration. */
        if (live === undefined) return
        const index = live.entries.findIndex(candidate => candidate.token === token)
        /* v8 ignore next -- the token belongs to this successful registration. */
        if (index < 0) return
        const wasActiveDefinition = live.def === entry.def
        live.entries.splice(index, 1)
        if (live.entries.length === 0) {
          this.emitKnownAbsence(key)
          this.registrations.delete(key)
          return
        }
        // Unowned duplicate registrations never replace the first live
        // definition. If that first definition unloads, promote the next
        // surviving registration rather than retaining a disposed ghost.
        if (definition.owner === undefined) {
          if (wasActiveDefinition) {
            live.def = live.entries[0]!.def
            live.cells = new WeakMap()
            this.refreshKnownSessions(key, true)
          }
          return
        }
        if (wasActiveDefinition) {
          live.def = live.entries.at(-1)!.def
          live.cells = new WeakMap()
          this.refreshKnownSessions(key, true)
        }
      }
    }.bind(this), 'sessionProjections.register()')
    return () => void dispose()
  }

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

  /** Re-evaluate browser visibility without inventing a Session event. */
  refreshBrowserVisibility(
    session: Session,
    keys?: readonly Extract<keyof SessionProjectionMap, string>[],
  ): void {
    this.remember(session)
    const selected = keys === undefined ? [...this.registrations.keys()] : [...keys]
    for (const key of selected) {
      const registration = this.registrations.get(key)
      if (registration === undefined) {
        this.emitAbsence(session, key)
        continue
      }
      const cell = this.cellFor(registration, session)
      const value = registration.def.schema.parse(registration.def.view(cell.state))
      const context: ProjectionReadContext = { surface: 'browser', sessionId: String(session.id) }
      this.emitVisibilityTransition(session, key, value, this.readAllowed(key, value, context), session.seq - 1)
    }
  }

  snapshot(session: Session): ProjectionSnapshot {
    this.remember(session)
    const values: Record<string, unknown> = {}
    const context: ProjectionReadContext = { surface: 'browser', sessionId: String(session.id) }
    for (const registration of this.registrations.values()) {
      const cell = this.cellFor(registration, session)
      const value = registration.def.schema.parse(registration.def.view(cell.state))
      const allowed = this.readAllowed(registration.def.key, value, context)
      this.recordVisibility(session, registration.def.key, allowed)
      if (allowed) values[registration.def.key] = value
    }
    return { asOfSeq: session.seq - 1, values: values }
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

  /** View usable checkpoint rows with an optional carrier-supplied target Session identity. */
  viewCheckpoint(
    checkpoint: ProjectionCheckpoint,
    context: ProjectionReadContext = { surface: 'browser' },
  ): Partial<SessionProjectionMap> {
    const values: Record<string, unknown> = {}
    for (const registration of this.registrations.values()) {
      const def = registration.def
      const row = checkpoint[def.key]
      if (row === undefined || row.ver !== def.stateVersion) continue
      const value = def.schema.parse(def.view(row.val))
      if (this.readAllowed(def.key, value, context)) values[def.key] = value
    }
    return values
  }

  /** Cold replay with an optional carrier-supplied target Session identity. */
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
        && row.ver === registration.def.stateVersion
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
      if (!changed) continue
      const value = registration.def.schema.parse(registration.def.view(next))
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

  private refreshKnownSessions(key: string, forcePresent = false): void {
    this.forEachKnown((session) => {
      const registration = this.registrations.get(key)
      if (registration === undefined) {
        this.emitAbsence(session, key)
        return
      }
      const cell = this.cellFor(registration, session)
      const value = registration.def.schema.parse(registration.def.view(cell.state))
      const context: ProjectionReadContext = { surface: 'browser', sessionId: String(session.id) }
      const allowed = this.readAllowed(key, value, context)
      if (forcePresent && allowed) {
        this.emitPresentRefresh(session, key, value, session.seq - 1)
        return
      }
      this.emitVisibilityTransition(session, key, value, allowed, session.seq - 1)
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
    const cell = this.visibilityCell(session, key)
    cell.present = present
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

  private emitPresentRefresh(session: Session, key: string, value: unknown, seq: number): void {
    const cell = this.visibilityCell(session, key)
    cell.present = true
    cell.generation += 1
    this.emitControl(session, key, value, true, seq, cell.generation)
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