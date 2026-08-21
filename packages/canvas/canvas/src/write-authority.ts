/** Process-local authority fence for current durable Canvas writes. */

import { isDeepStrictEqual } from 'node:util'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

type CanvasDurableEventType = 'canvas/change' | 'canvas/layout-change'

interface PendingWritePermit {
  readonly eventType: CanvasDurableEventType
  readonly data: unknown
  consumed: boolean
}

const permits = new WeakMap<Session, PendingWritePermit>()

/**
 * Execute exactly one synchronous Session append under a package-owned write permit.
 * The permit is process-local and never enters Session JSON; it protects against
 * accidental alternate Host write paths, not against malicious code in the same process.
 */
export function withCanvasWritePermit<T>(
  session: Session,
  eventType: CanvasDurableEventType,
  data: unknown,
  append: () => T,
): T {
  if (permits.has(session)) throw new Error('Canvas durable write permit is already active for this Session')
  const permit: PendingWritePermit = {
    eventType,
    data: structuredClone(data),
    consumed: false,
  }
  permits.set(session, permit)
  try {
    const result = append()
    if (!permit.consumed) {
      // The invariant companion is optional in lightweight compositions, so a
      // successful append without a consumer is valid. When mounted, it flips
      // this flag synchronously from Session precommit.
    }
    return result
  } finally {
    permits.delete(session)
  }
}

/**
 * Consume the exact package-owned permit for one current Canvas event.
 * Called only from the N03/N04 Session precommit invariant.
 */
export function consumeCanvasWritePermit(session: Session, event: SessionEvent): boolean {
  if (event.type !== 'canvas/change' && event.type !== 'canvas/layout-change') return true
  const permit = permits.get(session)
  if (permit === undefined || permit.consumed || permit.eventType !== event.type) return false
  if (!isDeepStrictEqual(permit.data, event.data)) return false
  permit.consumed = true
  return true
}
