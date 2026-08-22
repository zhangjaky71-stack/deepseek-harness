/** Process-local Canvas run concurrency/backpressure limiter. */

import type { MediaProviderId } from '@deepseek-ai/dsh-media-provider'
import { CanvasRunAdmissionError } from './errors.ts'
import type { CanvasRunConcurrencyLease, CanvasRunConcurrencyPolicy } from './types.ts'

/** Explicit process-local concurrency/backpressure limits. */
export interface CanvasRunConcurrencyConfig {
  readonly maxGlobalActive: number
  readonly maxPerSessionActive: number
  readonly maxPerProviderActive: number
  readonly queueCapacity: number
  readonly queueTimeoutMs: number
}

interface PendingAcquire {
  readonly sessionId: string
  readonly providerIds: readonly MediaProviderId[]
  readonly resolve: (lease: CanvasRunConcurrencyLease) => void
  readonly reject: (error: unknown) => void
  readonly signal?: AbortSignal
  readonly onAbort?: () => void
  readonly timer?: ReturnType<typeof setTimeout>
}

function positive(value: number, subject: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${subject} must be a positive safe integer`)
  return value
}

function nonNegative(value: number, subject: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${subject} must be a non-negative safe integer`)
  return value
}

function providerSet(providerIds: readonly MediaProviderId[]): readonly MediaProviderId[] {
  return Object.freeze([...new Set(providerIds)].sort((left, right) => left.localeCompare(right)))
}

/**
 * FIFO process-local concurrency limiter. One acquisition reserves global,
 * session, and every resolved Provider counter atomically, so multi-Provider
 * workflows cannot deadlock by acquiring Provider slots in different orders.
 */
export class CanvasRunConcurrencyLimiter implements CanvasRunConcurrencyPolicy {
  private readonly config: CanvasRunConcurrencyConfig
  private globalActive = 0
  private readonly sessions = new Map<string, number>()
  private readonly providers = new Map<MediaProviderId, number>()
  private readonly queue: PendingAcquire[] = []

  /**
   * Create one limiter with explicit deployment limits.
   * @param config - active-run limits plus bounded queue capacity/timeout.
   */
  constructor(config: CanvasRunConcurrencyConfig) {
    this.config = Object.freeze({
      maxGlobalActive: positive(config.maxGlobalActive, 'maxGlobalActive'),
      maxPerSessionActive: positive(config.maxPerSessionActive, 'maxPerSessionActive'),
      maxPerProviderActive: positive(config.maxPerProviderActive, 'maxPerProviderActive'),
      queueCapacity: nonNegative(config.queueCapacity, 'queueCapacity'),
      queueTimeoutMs: positive(config.queueTimeoutMs, 'queueTimeoutMs'),
    })
  }

  private canAcquire(sessionId: string, providerIds: readonly MediaProviderId[]): boolean {
    if (this.globalActive >= this.config.maxGlobalActive) return false
    if ((this.sessions.get(sessionId) ?? 0) >= this.config.maxPerSessionActive) return false
    return providerIds.every(providerId =>
      (this.providers.get(providerId) ?? 0) < this.config.maxPerProviderActive)
  }

  private reserve(sessionId: string, providerIds: readonly MediaProviderId[]): CanvasRunConcurrencyLease {
    this.globalActive += 1
    this.sessions.set(sessionId, (this.sessions.get(sessionId) ?? 0) + 1)
    for (const providerId of providerIds) {
      this.providers.set(providerId, (this.providers.get(providerId) ?? 0) + 1)
    }
    let active = true
    return Object.freeze({
      release: () => {
        if (!active) return
        active = false
        this.globalActive -= 1
        this.decrement(this.sessions, sessionId)
        for (const providerId of providerIds) this.decrement(this.providers, providerId)
        this.drain()
      },
    })
  }

  private decrement<K>(map: Map<K, number>, key: K): void {
    const next = (map.get(key) ?? 0) - 1
    if (next <= 0) map.delete(key)
    else map.set(key, next)
  }

  private detach(pending: PendingAcquire): void {
    if (pending.timer !== undefined) clearTimeout(pending.timer)
    if (pending.onAbort !== undefined) pending.signal?.removeEventListener('abort', pending.onAbort)
  }

  private remove(pending: PendingAcquire): boolean {
    const index = this.queue.indexOf(pending)
    if (index < 0) return false
    this.queue.splice(index, 1)
    this.detach(pending)
    return true
  }

  private drain(): void {
    while (this.queue.length > 0) {
      const pending = this.queue[0]!
      if (!this.canAcquire(pending.sessionId, pending.providerIds)) return
      this.queue.shift()
      this.detach(pending)
      pending.resolve(this.reserve(pending.sessionId, pending.providerIds))
    }
  }

  /**
   * Atomically reserve run concurrency or enter the bounded FIFO queue.
   * @param sessionId - target Session identity used for the per-session limit.
   * @param providerIds - distinct Providers used by the already-resolved run.
   * @param signal - optional cancellation while waiting.
   * @returns an idempotently releasable active-run lease.
   */
  acquire(
    sessionId: string,
    providerIds: readonly MediaProviderId[],
    signal?: AbortSignal,
  ): Promise<CanvasRunConcurrencyLease> {
    if (sessionId.length === 0) {
      return Promise.reject(new CanvasRunAdmissionError('CANVAS_RUN_CONCURRENCY_FULL', 'Canvas run session id is required'))
    }
    if (signal?.aborted === true) {
      return Promise.reject(new CanvasRunAdmissionError('CANVAS_RUN_ABORTED', 'Canvas run admission was aborted'))
    }
    const providers = providerSet(providerIds)
    if (this.canAcquire(sessionId, providers) && this.queue.length === 0) {
      return Promise.resolve(this.reserve(sessionId, providers))
    }
    if (this.config.queueCapacity === 0) {
      return Promise.reject(new CanvasRunAdmissionError('CANVAS_RUN_CONCURRENCY_FULL', 'Canvas run concurrency is full'))
    }
    if (this.queue.length >= this.config.queueCapacity) {
      return Promise.reject(new CanvasRunAdmissionError('CANVAS_RUN_QUEUE_FULL', 'Canvas run admission queue is full'))
    }

    return new Promise<CanvasRunConcurrencyLease>((resolve, reject) => {
      let pending: PendingAcquire
      const onAbort = () => {
        if (!this.remove(pending)) return
        reject(new CanvasRunAdmissionError('CANVAS_RUN_ABORTED', 'Canvas run admission was aborted'))
        this.drain()
      }
      const timer = setTimeout(() => {
        if (!this.remove(pending)) return
        reject(new CanvasRunAdmissionError('CANVAS_RUN_QUEUE_TIMEOUT', 'Canvas run admission queue timed out'))
        this.drain()
      }, this.config.queueTimeoutMs)
      pending = {
        sessionId,
        providerIds: providers,
        resolve,
        reject,
        ...(signal === undefined ? {} : { signal, onAbort }),
        timer,
      }
      this.queue.push(pending)
      signal?.addEventListener('abort', onAbort, { once: true })
      this.drain()
    })
  }
}
