/**
 * Pure-type outlet of the session-projection Service Definition: the one projection type
 * table, importable from client aggregates without dragging the host-side
 * cordis Context merges of the package root (dsh-agent → dsh-session). Domain
 * packages may declare-merge through either the package root or this outlet —
 * re-export preserves symbol identity, so both land on the same table.
 *
 * @module @deepseek-ai/dsh-session-projection/types
 */

/**
 * The single projection type table for the whole chain (host provider, wire
 * block, client cell, React hook). Domain packages merge their key here via
 * declaration merging; values are wire-JSON whole values. How a value is
 * rendered is the slot system's business, never this layer's.
 */
export interface SessionProjectionMap {}

/**
 * Framework-owned live visibility envelope. Baseline `values` stay ordinary
 * `SessionProjectionMap` values; only live push frames use this wrapper when a
 * read-guard or capability lifecycle changes without advancing Session seq.
 * The literal property is protocol-owned so this `/types` outlet remains
 * runtime-free.
 */
export type SessionProjectionControlEnvelope = {
  readonly __dshSessionProjectionV1: {
    readonly generation: number
    readonly present: false
  } | {
    readonly generation: number
    readonly present: true
    readonly value: unknown
  }
}
