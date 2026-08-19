/** Bounded Canvas run-history queries derived exclusively from Session events. */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { decodeCanvasChange } from './fold.ts'
import type {
  CanvasHistoryCursor,
  CanvasRunHistoryPage,
  ListCanvasRunsRequest,
} from './client.ts'
import type { CanvasRunHistoryEntry, CanvasRunId } from './types.ts'

/** Default Browser history page size. */
export const DEFAULT_CANVAS_HISTORY_PAGE_SIZE = 20
/** Hard Host cap for one Canvas history page. */
export const MAX_CANVAS_HISTORY_PAGE_SIZE = 100

/** Stable malformed cursor/page-size failure. */
export class CanvasHistoryQueryError extends HarnessError {
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
  readonly entry: CanvasRunHistoryEntry
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

function deriveIndexedRuns(events: readonly SessionEvent[]): IndexedRunHistoryEntry[] {
  const byRun = new Map<CanvasRunId, IndexedRunHistoryEntry>()
  for (const event of events) {
    if (event.type !== 'canvas/change') continue
    const change = decodeCanvasChange(event.data)
    if (change === undefined) throw new Error(`canvas change at session event ${event.seq} has an invalid kind`)
    const canvas = change.canvas
    const run = canvas?.run
    if (canvas === null || run === null || run === undefined) continue

    const current = byRun.get(run.id)
    if (change.operation === 'run-start' && current !== undefined) {
      throw new Error(`Canvas run id "${run.id}" was started more than once in Session history`)
    }
    const startSeq = current?.startSeq ?? event.seq
    const outputs = canvas.output?.runId === run.id
      ? structuredClone(canvas.output.assets)
      : current?.entry.outputs ?? []
    const variantId = current?.entry.variantId ?? canvas.currentVariantId
    const entry: CanvasRunHistoryEntry = {
      runId: run.id,
      ...(variantId === undefined ? {} : { variantId }),
      workflowId: run.workflowId,
      workflowRevision: run.workflowRevision,
      status: run.status,
      outputs,
      startedAt: run.startedAt,
      ...(run.finishedAt === undefined ? {} : { finishedAt: run.finishedAt }),
    }
    byRun.set(run.id, { startSeq, entry })
  }
  return [...byRun.values()].sort((left, right) => right.startSeq - left.startSeq)
}

/**
 * List run history newest-first with a stable exclusive Session-seq cursor.
 * @param events - authoritative Session event log.
 * @param request - optional cursor and bounded page size.
 * @returns one detached page; adding later runs cannot reorder a continued cursor walk.
 */
export function listCanvasRunHistory(
  events: readonly SessionEvent[],
  request: ListCanvasRunsRequest = {},
): CanvasRunHistoryPage {
  const limit = resolveLimit(request.limit)
  const beforeSeq = request.cursor === undefined ? Number.POSITIVE_INFINITY : decodeCursor(request.cursor)
  const eligible = deriveIndexedRuns(events).filter(row => row.startSeq < beforeSeq)
  const rows = eligible.slice(0, limit)
  return {
    items: rows.map(row => structuredClone(row.entry)),
    ...(eligible.length > limit && rows.length > 0
      ? { nextCursor: cursorFor(rows[rows.length - 1]!.startSeq) }
      : {}),
  }
}

/**
 * Read one run-history entry by durable run id.
 * @param events - authoritative Session event log.
 * @param runId - exact run identity.
 * @returns detached history entry or null when absent.
 */
export function getCanvasRunHistory(
  events: readonly SessionEvent[],
  runId: CanvasRunId,
): CanvasRunHistoryEntry | null {
  const found = deriveIndexedRuns(events).find(row => row.entry.runId === runId)
  return found === undefined ? null : structuredClone(found.entry)
}
