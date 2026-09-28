/** Deterministic node-execution cache implementations. */

import type {
  MediaNodeExecutionCache,
  MediaNodeExecutionFingerprint,
  MediaNodeExecutorResult,
} from './engine-types.ts'

/** Process-local cache for tests and deployments that explicitly opt into ephemeral deterministic reuse. */
export class MemoryMediaNodeExecutionCache implements MediaNodeExecutionCache {
  private readonly values = new Map<string, MediaNodeExecutorResult>()

  /** @inheritdoc */
  get(fingerprint: MediaNodeExecutionFingerprint): MediaNodeExecutorResult | undefined {
    const value = this.values.get(fingerprint.value)
    return value === undefined ? undefined : structuredClone(value) as MediaNodeExecutorResult
  }

  /** @inheritdoc */
  set(fingerprint: MediaNodeExecutionFingerprint, result: MediaNodeExecutorResult): void {
    if (!fingerprint.cacheable) return
    this.values.set(fingerprint.value, structuredClone(result) as MediaNodeExecutorResult)
  }

  /** Remove all ephemeral cached results. */
  clear(): void {
    this.values.clear()
  }
}
