/** Bounded Canvas run-history queries derived exclusively from Session events. */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { TypertBusinessFailure } from '@deepseek-ai/dsh-typert-protocol'
import {
  applyCanvasEvent,
  decodeCanvasChange,
  emptyCanvasFoldState,
} from './fold.ts'
import type {
  CanvasHistoryCursor,
  CanvasRunHistoryPage,
  GetCanvasRunRequest,
  ListCanvasRunsRequest,
} from './client.ts'
import type {
  CanvasId,
  CanvasRunHistoryEntry,
  CanvasRunId,
} from './types.ts'

/** Default Browser history page size. */
export const DEFAULT_CANVAS_HISTORY_PAGE_SIZE = 20
/** Hard Host item-count cap for one Canvas history page. This is not a byte-size limit. */
export const MAX_CANVAS_HISTORY_PAGE_SIZE = 100

/** Stable malformed cursor/page-size failure safe for the Remote boundary. */
export class CanvasHistoryQueryError extends TypertBusinessFailure {
  /**
   * Create one rejected bounded-history query.
   * @param message - direct rejection reason.
   */
  constructor(message: string) {
    super(message, 'CANVAS_INVALID_HISTORY_QUERY')
  }
}

interface IndexedRunHistoryEntry {
  readonly startSeq: number
  entry: CanvasRunHistoryEntry
}

function cursorFor(startSeq: number): CanvasHistoryCursor {
  return `run:${startSeq}` as CanvasHistoryCursor
}

function decodeCursor(cursor: CanvasHistoryCursor): number {
  const match = /^run:(0|[1-9]\d*)$/.exec(cursor)
  if (match === null) throw new CanvasHistoryQueryError('Canvas run-history cursor is invalid')
  const value = Number(match[1])
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CanvasHistoryQueryError('Canvas run-history cursor is outside the supported range')
  }
  return value
}

function resolveLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_CANVAS_HISTORY_PAGE_SIZE
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CANVAS_HISTORY_PAGE_SIZE) {
    throw new CanvasHistoryQueryError(
      `Canvas run-history limit must be an integer from 1 to ${MAX_CANVAS_HISTORY_PAGE_SIZE}`,
    )
  }
  return limit
}

function startIndexBefore(rows: readonly IndexedRunHistoryEntry[], beforeSeq: number): number {
  if (beforeSeq === Number.POSITIVE_INFINITY) return rows.length - 1
  let low = 0
  let high = rows.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (rows[middle]!.startSeq < beforeSeq) low = middle + 1
    else high = middle
  }
  return low - 1
}

function runEntry(canvasId: CanvasId, change: NonNullable<ReturnType<typeof decodeCanvasChange>>): CanvasRunHistoryEntry {
  const canvas = change.canvas
  const run = canvas?.run
  if (canvas === null || canvas === undefined || run === null || run === undefined) {
    throw new Error(`Canvas ${change.operation} history event has no current run`)
  }
  const output = canvas.output?.runId === run.id ? structuredClone(canvas.output.assets) : []
  return {
    canvasId,
    runId: run.id,
    ...(canvas.currentVariantId === undefined ? {} : { variantId: canvas.currentVariantId }),
    workflowId: run.workflowId,
    workflowRevision: run.workflowRevision,
    status: run.status,
    outputs: output,
    startedAt: run.startedAt,
    ...(run.finishedAt === undefined ? {} : { finishedAt: run.finishedAt }),
  }
}

/**
 * Rebuildable in-memory index over authoritative Session events.
 * It stores no independent durable state and accepts events only after the
 * Canvas fold has validated the same prefix.
 */
export class CanvasRunHistoryIndex {
  private readonly byRun = new Map<CanvasRunId, IndexedRunHistoryEntry>()
  private readonly byCanvas = new Map<CanvasId, IndexedRunHistoryEntry[]>()

  /** Apply one already-fold-valid Session event incrementally. */
  apply(event: SessionEvent): void {
    if (event.type !== 'canvas/change') return
    const change = decodeCanvasChange(event.data)
    if (change === undefined) throw new Error(`canvas change at session event ${event.seq} has an invalid kind`)
    if (change.operation !== 'run-start' && change.operation !== 'run-update' && change.operation !== 'run-complete') return

    const canvas = change.canvas
    const run = canvas?.run
    if (canvas === null || canvas === undefined || run === null || run === undefined) {
      throw new Error(`Canvas ${change.operation} at session event ${event.seq} has no current run`)
    }

    const current = this.byRun.get(run.id)
    if (change.operation === 'run-start') {
      if (current !== undefined) {
        throw new Error(`Canvas run id "${run.id}" was started more than once in Session history`)
      }
      const indexed: IndexedRunHistoryEntry = {
        startSeq: event.seq,
        entry: runEntry(canvas.id, change),
      }
      this.byRun.set(run.id, indexed)
      const rows = this.byCanvas.get(canvas.id)
      if (rows === undefined) this.byCanvas.set(canvas.id, [indexed])
      else rows.push(indexed)
      return
    }

    if (current === undefined) {
      throw new Error(`Canvas run id "${run.id}" was updated before its run-start event`)
    }
    if (current.entry.canvasId !== canvas.id) {
      throw new Error(`Canvas run id "${run.id}" changed Canvas generation in Session history`)
    }
    if (current.entry.workflowId !== run.workflowId
      || current.entry.workflowRevision !== run.workflowRevision
      || current.entry.startedAt !== run.startedAt) {
      throw new Error(`Canvas run id "${run.id}" changed durable identity in Session history`)
    }

    const outputs = canvas.output?.runId === run.id
      ? structuredClone(canvas.output.assets)
      : current.entry.outputs
    current.entry = {
      ...current.entry,
      status: run.status,
      outputs,
      ...(run.finishedAt === undefined ? {} : { finishedAt: run.finishedAt }),
    }
  }

  /** Clone the rebuildable index for service-level preflight without publishing it. */
  clone(): CanvasRunHistoryIndex {
    const copy = new CanvasRunHistoryIndex()
    for (const [runId, indexed] of this.byRun) {
      const cloned: IndexedRunHistoryEntry = {
        startSeq: indexed.startSeq,
        entry: structuredClone(indexed.entry),
      }
      copy.byRun.set(runId, cloned)
    }
    for (const [canvasId, rows] of this.byCanvas) {
      copy.byCanvas.set(canvasId, rows.map(row => copy.byRun.get(row.entry.runId)!))
    }
    return copy
  }

  /** List one Canvas generation newest-first without rescanning the Session log. */
  list(request: ListCanvasRunsRequest): CanvasRunHistoryPage {
    const limit = resolveLimit(request.limit)
    const beforeSeq = request.cursor === undefined ? Number.POSITIVE_INFINITY : decodeCursor(request.cursor)
    const rows = this.byCanvas.get(request.canvasId) ?? []
    let index = startIndexBefore(rows, beforeSeq)
    const selected: IndexedRunHistoryEntry[] = []
    while (index >= 0 && selected.length <= limit) {
      selected.push(rows[index]!)
      index -= 1
    }
    const page = selected.slice(0, limit)
    return {
      items: page.map(row => structuredClone(row.entry)),
      ...(selected.length > limit && page.length > 0
        ? { nextCursor: cursorFor(page[page.length - 1]!.startSeq) }
        : {}),
    }
  }

  /** Read one exact Run only when it belongs to the requested Canvas generation. */
  get(request: GetCanvasRunRequest): CanvasRunHistoryEntry | null {
    const found = this.byRun.get(request.runId)
    if (found === undefined || found.entry.canvasId !== request.canvasId) return null
    return structuredClone(found.entry)
  }
}

/**
 * Build an index from a complete authoritative Session prefix. The strict
 * Canvas fold runs before each index update, so the query layer cannot invent
 * a more permissive Run lifecycle than N03 durable authority.
 */
export function buildCanvasRunHistoryIndex(events: readonly SessionEvent[]): CanvasRunHistoryIndex {
  const state = emptyCanvasFoldState()
  const index = new CanvasRunHistoryIndex()
  for (const event of events) {
    applyCanvasEvent(state, event)
    index.apply(event)
  }
  return index
}

/** Compatibility helper for focused tests and rebuild-only consumers. */
export function listCanvasRunHistory(
  events: readonly SessionEvent[],
  request: ListCanvasRunsRequest,
): CanvasRunHistoryPage {
  return buildCanvasRunHistoryIndex(events).list(request)
}

/** Compatibility helper for focused tests and rebuild-only consumers. */
export function getCanvasRunHistory(
  events: readonly SessionEvent[],
  request: GetCanvasRunRequest,
): CanvasRunHistoryEntry | null {
  return buildCanvasRunHistoryIndex(events).get(request)
}
