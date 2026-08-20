/** Deterministic node-execution cache implementations. */

import type {
  MediaNodeExecutionCache,
  MediaNodeExecutionFingerprint,
  MediaNodeExecutorResult,
} from './engine-types.ts'

/** Process-local cache useful for tests and deployments that explicitly opt into ephemeral reuse. */
export class MemoryMediaNodeExecutionCache implements MediaNodeExecutionCache {
  private readonly values = new Map<string, MediaNodeExecutorResult>()

  /** @inheritdoc */
  get(fingerprint: MediaNodeExecutionFingerprint): MediaNodeExecutorResult | undefined {
    return this.values.get(fingerprint.value)
  }

  /** @inheritdoc */
  set(fingerprint: MediaNodeExecutionFingerprint, result: MediaNodeExecutorResult): void {
    if (!fingerprint.cacheable) return
    this.values.set(fingerprint.value, result)
  }

  /** Remove all ephemeral cached results. */
  clear(): void {
    this.values.clear()
  }
}
