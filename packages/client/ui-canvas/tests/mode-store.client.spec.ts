import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { CanvasModeStore } from '../src/client/mode-store.ts'

const A = 'session-a' as SessionId
const B = 'session-b' as SessionId

describe('Canvas UI-local mode store', () => {
  it('uses viewport width only for the first per-session default', () => {
    let narrow = true
    const store = new CanvasModeStore(() => narrow)
    expect(store.faceOf(A).getSnapshot()).toBe('minimal')
    narrow = false
    // Existing preference is stable; a new session samples the new viewport.
    expect(store.faceOf(A).getSnapshot()).toBe('minimal')
    expect(store.faceOf(B).getSnapshot()).toBe('editor')
  })

  it('keeps preferences per session and has no Session/Remote persistence dependency', () => {
    const store = new CanvasModeStore(() => false)
    const listener = vi.fn()
    const dispose = store.faceOf(A).subscribe(listener)
    store.set(A, 'minimal')
    store.set(B, 'minimal')
    expect(store.faceOf(A).getSnapshot()).toBe('minimal')
    expect(store.faceOf(B).getSnapshot()).toBe('minimal')
    expect(listener).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('treats identical mode writes as no-ops', () => {
    const store = new CanvasModeStore(() => true)
    const listener = vi.fn()
    store.faceOf(A).subscribe(listener)
    store.set(A, 'minimal')
    expect(listener).not.toHaveBeenCalled()
  })

  it('prunes rows that leave the live Session catalog', () => {
    const store = new CanvasModeStore(() => false)
    store.set(A, 'minimal')
    store.set(B, 'minimal')
    store.prune(new Set([B]))
    expect(store.faceOf(B).getSnapshot()).toBe('minimal')
    // A was removed; recreating its row re-samples the wide default.
    expect(store.faceOf(A).getSnapshot()).toBe('editor')
  })
})
