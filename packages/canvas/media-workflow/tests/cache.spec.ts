import { afterEach, describe, expect, it } from 'vitest'
import { WorkflowNodeId } from '@deepseek-ai/dsh-canvas'
import {
  MemoryMediaNodeExecutionCache,
} from '../src/engine.ts'
import type {
  MediaNodeExecutionCache,
  MediaNodeExecutionFingerprint,
  MediaNodeExecutorResult,
} from '../src/engine-types.ts'
import type { MediaWorkflowExecutionError } from '../src/engine.ts'
import {
  chain,
  disposeContexts,
  engineHarness,
  node,
  registerTextExecutors,
  textOutput,
  workflow,
} from './engine-fixture.ts'

afterEach(disposeContexts)

describe('deterministic execution cache', () => {
  it('reuses deterministic DAG results on a later run', async () => {
    const cache = new MemoryMediaNodeExecutionCache()
    const { executors, engine } = await engineHarness(undefined, cache)
    const calls: string[] = []
    registerTextExecutors(executors, calls)
    const first = await engine.run({ workflow: chain() })
    const second = await engine.run({ workflow: chain() })
    expect(first.nodes.get(WorkflowNodeId('a'))?.cacheHit).toBe(false)
    expect(second.nodes.get(WorkflowNodeId('a'))?.cacheHit).toBe(true)
    expect(calls).toEqual(['a', 'b', 'c'])
  })

  it('never auto-caches a non-deterministic definition', async () => {
    const cache = new MemoryMediaNodeExecutionCache()
    const { executors, engine } = await engineHarness(undefined, cache)
    let calls = 0
    executors.register({ type: 'test.unstable', version: 1 }, {
      execute: () => ({ outputs: { text: textOutput(`run-${++calls}`) } }),
    })
    const candidate = workflow([node('u', 'test.unstable')], [])
    await engine.run({ workflow: candidate })
    await engine.run({ workflow: candidate })
    expect(calls).toBe(2)
  })

  it('revalidates a cache hit before exposing it', async () => {
    const invalidCache: MediaNodeExecutionCache = {
      get: () => ({ outputs: { unexpected: textOutput('cached') } }),
      set: () => {},
    }
    const { engine } = await engineHarness(undefined, invalidCache)
    await expect(engine.run({ workflow: workflow([node('a', 'test.source')], []) })).rejects.toThrow(
      expect.objectContaining<Partial<MediaWorkflowExecutionError>>({ code: 'MEDIA_WORKFLOW_INVALID_EXECUTOR_OUTPUT' }),
    )
  })

  it('detaches stored results, ignores non-cacheable writes, and clears entries', () => {
    const cache = new MemoryMediaNodeExecutionCache()
    const fingerprint: MediaNodeExecutionFingerprint = {
      algorithm: 'sha256', value: 'cache-key', cacheable: true, nodeType: 'test.source', nodeVersion: 1,
    }
    const original: MediaNodeExecutorResult = { outputs: { text: textOutput('original') } }
    cache.set(fingerprint, original)
    expect(cache.get(fingerprint)).toEqual(original)
    expect(cache.get(fingerprint)).not.toBe(original)
    cache.set({ ...fingerprint, value: 'ignored', cacheable: false }, original)
    expect(cache.get({ ...fingerprint, value: 'ignored' })).toBeUndefined()
    cache.clear()
    expect(cache.get(fingerprint)).toBeUndefined()
  })
})
