/**
 * Generic per-session projection value store. The Host is the only computation
 * site; the client holds finished whole values and framework visibility
 * tombstones. Durable Session seq orders domain changes, while a separate
 * visibility generation orders allow/deny or capability transitions that can
 * happen at the same durable seq.
 */
import type { SessionProjectionMap } from '@deepseek-ai/dsh-session-projection/types'
import type { ObservableSnapshot } from '../contract/store.ts'
import { Notifier } from './notifier.ts'

export type { SessionProjectionMap } from '@deepseek-ai/dsh-session-projection/types'

const SESSION_PROJECTION_CONTROL_MARKER = '__dshSessionProjectionV1' as const

export type UseProjection = {
  <K extends Extract<keyof SessionProjectionMap, string>>(key: K): SessionProjectionMap[K] | undefined
  <K extends Extract<keyof SessionProjectionMap, string>, S>(
    key: K,
    selector: (value: SessionProjectionMap[K] | undefined) => S,
    eq?: (a: S, b: S) => boolean,
  ): S
}

export interface ProjectionsBaseline {
  readonly asOfSeq: number
  readonly values: Partial<SessionProjectionMap>
}

interface Row {
  value: unknown
  seq: number
  generation: number
}

interface Clock {
  seq: number
  generation: number
}

interface Channel {
  face: ObservableSnapshot<unknown>
  notifier: Notifier
}

interface DecodedControl {
  readonly generation: number
  readonly present: boolean
  readonly value?: unknown
}

function decodeControl(value: unknown): DecodedControl | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const outer = value as Record<string, unknown>
  if (Object.keys(outer).length !== 1 || !Object.hasOwn(outer, SESSION_PROJECTION_CONTROL_MARKER)) return undefined
  const body = outer[SESSION_PROJECTION_CONTROL_MARKER]
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return undefined
  const source = body as Record<string, unknown>
  if (!Number.isSafeInteger(source.generation) || (source.generation as number) < 1 || typeof source.present !== 'boolean') return undefined
  if (source.present === false) {
    if (Object.keys(source).sort().join(',') !== 'generation,present') return undefined
    return { generation: source.generation as number, present: false }
  }
  if (Object.keys(source).sort().join(',') !== 'generation,present,value') return undefined
  return { generation: source.generation as number, present: true, value: source.value }
}

/** One Session's projection rows plus per-key ordering clocks. */
export class ProjectionValueStore {
  private readonly rows = new Map<string, Row>()
  private readonly clocks = new Map<string, Clock>()
  private readonly channels = new Map<string, Channel>()
  private valuesCache: Readonly<Partial<SessionProjectionMap>> | undefined
  private readonly anyNotifier = new Notifier(() => {})

  faceOf(key: string): ObservableSnapshot<unknown> {
    return this.channel(key).face
  }

  get(key: string): unknown {
    return this.rows.get(key)?.value
  }

  values(): Readonly<Partial<SessionProjectionMap>> {
    if (this.valuesCache === undefined) {
      this.valuesCache = Object.freeze(Object.fromEntries(
        [...this.rows].map(([key, row]) => [key, row.value]),
      ))
    }
    return this.valuesCache
  }

  subscribeAny(listener: () => void): () => void {
    return this.anyNotifier.subscribe(listener)
  }

  /** Apply one live `session/projection` payload. */
  apply(key: string, value: unknown, seq: number): void {
    const control = decodeControl(value)
    if (control !== undefined) {
      this.applyControl(key, control, seq)
      return
    }
    const clock = this.clocks.get(key)
    if (clock !== undefined && seq <= clock.seq) return
    this.clocks.set(key, { seq, generation: 0 })
    this.rows.set(key, { value, seq, generation: 0 })
    this.changed(key)
  }

  /**
   * Seed one fresh full baseline. A same-seq visibility control from the live
   * stream outranks the baseline until `truncate()` starts a new mux generation.
   */
  seed(baseline: ProjectionsBaseline): void {
    const values = baseline.values as Record<string, unknown>
    for (const [key, value] of Object.entries(values)) {
      const clock = this.clocks.get(key)
      if (clock !== undefined) {
        if (clock.seq > baseline.asOfSeq) continue
        if (clock.seq === baseline.asOfSeq && clock.generation > 0) continue
      }
      const current = this.rows.get(key)
      this.clocks.set(key, { seq: baseline.asOfSeq, generation: 0 })
      this.rows.set(key, { value, seq: baseline.asOfSeq, generation: 0 })
      if (
        current === undefined
        || current.value !== value
        || current.seq !== baseline.asOfSeq
        || current.generation !== 0
      ) this.changed(key)
    }
    for (const key of new Set([...this.rows.keys(), ...this.clocks.keys()])) {
      if (Object.hasOwn(values, key)) continue
      const clock = this.clocks.get(key)
      if (clock !== undefined) {
        if (clock.seq > baseline.asOfSeq) continue
        if (clock.seq === baseline.asOfSeq && clock.generation > 0) continue
      }
      const existed = this.rows.delete(key)
      this.clocks.set(key, { seq: baseline.asOfSeq, generation: 0 })
      if (existed) this.changed(key)
    }
  }

  /**
   * Start a new mux generation. State claiming a seq beyond the Host durable
   * baseline is dropped; same-or-earlier visibility generations are reset so
   * the fresh history baseline can become authoritative at an equal seq.
   */
  truncate(lastSeq: number): void {
    for (const [key, clock] of this.clocks) {
      if (clock.seq > lastSeq) {
        const existed = this.rows.delete(key)
        this.clocks.delete(key)
        if (existed) this.changed(key)
        continue
      }
      if (clock.generation > 0) {
        this.clocks.set(key, { seq: clock.seq, generation: 0 })
        const row = this.rows.get(key)
        if (row !== undefined) this.rows.set(key, { value: row.value, seq: row.seq, generation: 0 })
      }
    }
  }

  private applyControl(key: string, control: DecodedControl, seq: number): void {
    const clock = this.clocks.get(key)
    if (clock !== undefined) {
      if (seq < clock.seq) return
      if (seq === clock.seq && control.generation <= clock.generation) return
    }
    this.clocks.set(key, { seq, generation: control.generation })
    if (!control.present) {
      if (this.rows.delete(key)) this.changed(key)
      return
    }
    const previous = this.rows.get(key)
    this.rows.set(key, { value: control.value, seq, generation: control.generation })
    if (
      previous === undefined
      || previous.value !== control.value
      || previous.seq !== seq
      || previous.generation !== control.generation
    ) this.changed(key)
  }

  private changed(key: string): void {
    this.valuesCache = undefined
    this.channels.get(key)?.notifier.markDirty()
    this.anyNotifier.markDirty()
  }

  private channel(key: string): Channel {
    let channel = this.channels.get(key)
    if (channel === undefined) {
      const notifier = new Notifier(() => {})
      channel = {
        notifier,
        face: {
          getSnapshot: () => this.rows.get(key)?.value,
          subscribe: listener => notifier.subscribe(listener),
        },
      }
      this.channels.set(key, channel)
    }
    return channel
  }
}