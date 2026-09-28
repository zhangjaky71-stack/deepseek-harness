import { describe, expect, it } from 'vitest'
import { WorkflowEdgeId, WorkflowNodeId } from '@deepseek-ai/dsh-canvas'
import { fingerprintMediaNodeExecution } from '../src/engine.ts'
import { STEP, UNSTABLE, node } from './engine-fixture.ts'

describe('fingerprintMediaNodeExecution', () => {
  it('is stable under input-array reorder', () => {
    const graphNode = node('n', 'test.step', { suffix: '!' })
    const inputs = [
      { edgeId: WorkflowEdgeId('e2'), sourceNodeId: WorkflowNodeId('s2'), sourcePort: 'text', targetPort: 'input', fingerprint: 'two' },
      { edgeId: WorkflowEdgeId('e1'), sourceNodeId: WorkflowNodeId('s1'), sourcePort: 'text', targetPort: 'input', fingerprint: 'one' },
    ]
    const first = fingerprintMediaNodeExecution(graphNode, STEP, { suffix: '!' }, inputs, { key: 'provider/model-a' })
    const second = fingerprintMediaNodeExecution(graphNode, STEP, { suffix: '!' }, [...inputs].reverse(), { key: 'provider/model-a' })
    expect(second.value).toBe(first.value)
    expect(first.executionIdentityKey).toBe('provider/model-a')
  })

  it('changes when normalized config, upstream content, or resolved identity changes', () => {
    const graphNode = node('n', 'test.step', { suffix: '!' })
    const inputs = [{
      edgeId: WorkflowEdgeId('e1'), sourceNodeId: WorkflowNodeId('s1'), sourcePort: 'text', targetPort: 'input', fingerprint: 'one',
    }]
    const base = fingerprintMediaNodeExecution(graphNode, STEP, { suffix: '!' }, inputs, { key: 'model-a' })
    expect(fingerprintMediaNodeExecution(graphNode, STEP, { suffix: '?' }, inputs, { key: 'model-a' }).value).not.toBe(base.value)
    expect(fingerprintMediaNodeExecution(graphNode, STEP, { suffix: '!' }, [{ ...inputs[0]!, fingerprint: 'two' }], { key: 'model-a' }).value).not.toBe(base.value)
    expect(fingerprintMediaNodeExecution(graphNode, STEP, { suffix: '!' }, inputs, { key: 'model-b' }).value).not.toBe(base.value)
  })

  it('marks only intrinsically deterministic definitions cacheable', () => {
    const deterministic = fingerprintMediaNodeExecution(node('d', 'test.step'), STEP, { suffix: '!' }, [])
    const unstable = fingerprintMediaNodeExecution(node('u', 'test.unstable'), UNSTABLE, {}, [])
    expect(deterministic.cacheable).toBe(true)
    expect(unstable.cacheable).toBe(false)
    expect(unstable.executionIdentityKey).toBeUndefined()
  })
})
