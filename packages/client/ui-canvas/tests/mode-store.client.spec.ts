import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { CanvasModeStore } from '../src/client/mode-store.ts'

const A = 'session-a' as SessionId
const B = 'session-b' as SessionId

describe('Canvas UI-local mode store', () => {
  it('defaults narrow sessions to Minimal and wide sessions to Editor', () => {
    expect(new CanvasModeStore(() => true).faceOf(A).getSnapshot()).toBe('minimal')
    expect(new CanvasModeStore(() => false).faceOf(A).getSnapshot()).toBe('editor')
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
})
