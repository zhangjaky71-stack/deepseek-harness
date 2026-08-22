import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaProviderId } from '@deepseek-ai/dsh-media-provider'
import { CanvasRunConcurrencyLimiter } from '../src/index.ts'

const providerA = MediaProviderId('provider-a')
const providerB = MediaProviderId('provider-b')

afterEach(() => {
  vi.useRealTimers()
})

function limiter(overrides: Partial<ConstructorParameters<typeof CanvasRunConcurrencyLimiter>[0]> = {}) {
  return new CanvasRunConcurrencyLimiter({
    maxGlobalActive: 2,
    maxPerSessionActive: 2,
    maxPerProviderActive: 1,
    queueCapacity: 2,
    queueTimeoutMs: 50,
    ...overrides,
  })
}

describe('CanvasRunConcurrencyLimiter', () => {
  it('reserves all Provider counters atomically and wakes FIFO waiters after idempotent release', async () => {
    const policy = limiter()
    const first = await policy.acquire('session-a', [providerB, providerA, providerA])
    let secondResolved = false
    const secondPromise = policy.acquire('session-b', [providerA]).then((lease) => {
      secondResolved = true
      return lease
    })
    await Promise.resolve()
    expect(secondResolved).toBe(false)

    first.release()
    first.release()
    const second = await secondPromise
    expect(secondResolved).toBe(true)
    second.release()
  })

  it('fails immediately when concurrency is full and queueing is disabled', async () => {
    const policy = limiter({ maxGlobalActive: 1, queueCapacity: 0 })
    const first = await policy.acquire('session-a', [providerA])
    await expect(policy.acquire('session-b', [providerB])).rejects.toMatchObject({
      code: 'CANVAS_RUN_CONCURRENCY_FULL',
    })
    first.release()
  })

  it('rejects new waiters when the bounded queue is full', async () => {
    const policy = limiter({ maxGlobalActive: 1, queueCapacity: 1 })
    const first = await policy.acquire('session-a', [providerA])
    const queued = policy.acquire('session-b', [providerB])
    await expect(policy.acquire('session-c', [])).rejects.toMatchObject({
      code: 'CANVAS_RUN_QUEUE_FULL',
    })
    first.release()
    const second = await queued
    second.release()
  })

  it('times out a queued request and removes it so later work can proceed', async () => {
    vi.useFakeTimers()
    const policy = limiter({ maxGlobalActive: 1, queueCapacity: 2, queueTimeoutMs: 10 })
    const first = await policy.acquire('session-a', [providerA])
    const queued = policy.acquire('session-b', [providerB])
    const rejection = expect(queued).rejects.toMatchObject({ code: 'CANVAS_RUN_QUEUE_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(10)
    await rejection
    first.release()
    const later = await policy.acquire('session-c', [providerB])
    later.release()
  })

  it('aborts and removes a queued request without leaking counters or queue capacity', async () => {
    const policy = limiter({ maxGlobalActive: 1, queueCapacity: 1 })
    const first = await policy.acquire('session-a', [providerA])
    const controller = new AbortController()
    const queued = policy.acquire('session-b', [providerB], controller.signal)
    controller.abort()
    await expect(queued).rejects.toMatchObject({ code: 'CANVAS_RUN_ABORTED' })
    first.release()
    const later = await policy.acquire('session-c', [providerB])
    later.release()
  })

  it('enforces the per-session limit independently from global capacity', async () => {
    const policy = limiter({ maxGlobalActive: 3, maxPerSessionActive: 1, queueCapacity: 1 })
    const first = await policy.acquire('same-session', [providerA])
    const queued = policy.acquire('same-session', [providerB])
    let resolved = false
    void queued.then(() => { resolved = true })
    await Promise.resolve()
    expect(resolved).toBe(false)
    first.release()
    const second = await queued
    second.release()
  })

  it('rejects invalid deployment limits at construction', () => {
    expect(() => limiter({ maxGlobalActive: 0 })).toThrow(/maxGlobalActive/)
    expect(() => limiter({ queueCapacity: -1 })).toThrow(/queueCapacity/)
    expect(() => limiter({ queueTimeoutMs: 0 })).toThrow(/queueTimeoutMs/)
  })
})
