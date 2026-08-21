import { describe, expect, it } from 'vitest'
import { TypertBusinessFailure } from '@deepseek-ai/dsh-typert-protocol'

describe('TypertBusinessFailure', () => {
  it('materializes one frozen wire-safe failure with an open business code', () => {
    const error = new TypertBusinessFailure(
      'Canvas workflow changed; refresh and retry',
      'CANVAS_STALE_WORKFLOW_REVISION',
    )

    expect(error.code).toBe('CANVAS_STALE_WORKFLOW_REVISION')
    expect(error.failure).toEqual({
      code: 'CANVAS_STALE_WORKFLOW_REVISION',
      message: 'Canvas workflow changed; refresh and retry',
      details: {},
    })
    expect(Object.isFrozen(error.failure)).toBe(true)
    expect(Object.isFrozen(error.failure.details)).toBe(true)
  })

  it('rejects unsafe or unbounded public material instead of laundering it onto the wire', () => {
    expect(() => new TypertBusinessFailure('ok', 'BAD CODE')).toThrow('business failure code is not wire-safe')
    expect(() => new TypertBusinessFailure('secret\nheader', 'SAFE_CODE')).toThrow(
      'business failure message is not wire-safe',
    )
    expect(() => new TypertBusinessFailure('x'.repeat(513), 'SAFE_CODE')).toThrow(
      'business failure message is not wire-safe',
    )
  })
})
