import { describe, expect, it } from 'vitest'
import { ProjectionValueStore } from '../src/client/sessions/projection-store.ts'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    'test/visibility': string
  }
}

const control = (
  generation: number,
  present: boolean,
  value?: unknown,
): unknown => present
  ? { __dshSessionProjectionV1: { generation, present: true, value } }
  : { __dshSessionProjectionV1: { generation, present: false } }

describe('ProjectionValueStore live visibility generations', () => {
  it('revokes and restores one key at the same durable Session seq', () => {
    const store = new ProjectionValueStore()
    store.seed({ asOfSeq: 7, values: { 'test/visibility': 'visible' } })

    store.apply('test/visibility', control(1, false), 7)
    expect(store.get('test/visibility')).toBeUndefined()

    store.apply('test/visibility', control(2, true, 'visible-again'), 7)
    expect(store.get('test/visibility')).toBe('visible-again')
  })

  it('drops stale visibility generations at an equal durable seq', () => {
    const store = new ProjectionValueStore()
    store.seed({ asOfSeq: 4, values: { 'test/visibility': 'baseline' } })
    store.apply('test/visibility', control(3, false), 4)
    store.apply('test/visibility', control(2, true, 'stale-allow'), 4)
    expect(store.get('test/visibility')).toBeUndefined()
  })

  it('does not let an equal-seq stale baseline resurrect a live revocation', () => {
    const store = new ProjectionValueStore()
    store.seed({ asOfSeq: 9, values: { 'test/visibility': 'baseline' } })
    store.apply('test/visibility', control(1, false), 9)
    store.seed({ asOfSeq: 9, values: { 'test/visibility': 'stale-baseline' } })
    expect(store.get('test/visibility')).toBeUndefined()
  })

  it('lets a fresh mux generation baseline reassert authority at the same seq', () => {
    const store = new ProjectionValueStore()
    store.seed({ asOfSeq: 9, values: { 'test/visibility': 'baseline' } })
    store.apply('test/visibility', control(1, false), 9)
    expect(store.get('test/visibility')).toBeUndefined()

    store.truncate(9)
    store.seed({ asOfSeq: 9, values: { 'test/visibility': 'fresh-baseline' } })
    expect(store.get('test/visibility')).toBe('fresh-baseline')
  })

  it('keeps durable higher-seq ordering stronger than an older visibility refresh', () => {
    const store = new ProjectionValueStore()
    store.apply('test/visibility', 'newer-domain-value', 12)
    store.apply('test/visibility', control(99, false), 11)
    expect(store.get('test/visibility')).toBe('newer-domain-value')
  })

  it('supports the empty-log watermark used by capability/ACL refresh', () => {
    const store = new ProjectionValueStore()
    store.seed({ asOfSeq: -1, values: { 'test/visibility': 'empty-log-value' } })
    store.apply('test/visibility', control(1, false), -1)
    expect(store.get('test/visibility')).toBeUndefined()
  })
})
