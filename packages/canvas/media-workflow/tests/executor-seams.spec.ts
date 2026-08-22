import { afterEach, describe, expect, it } from 'vitest'
import { WorkflowNodeId } from '@deepseek-ai/dsh-canvas'
import type { MediaNodeExecutionOutput, WorkflowRuntimeEvent } from '../src/engine-types.ts'
import type { MediaWorkflowExecutionError } from '../src/engine.ts'
import { snapshotMediaNodeExecutorResult } from '../src/executor.ts'
import {
  SOURCE,
  disposeContexts,
  engineHarness,
  node,
  textOutput,
  workflow,
} from './engine-fixture.ts'

afterEach(disposeContexts)

describe('executor result validation', () => {
  it('detaches and recursively freezes valid outputs', () => {
    const result = snapshotMediaNodeExecutorResult({ outputs: { text: textOutput('ok') } }, SOURCE)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.outputs.text?.value)).toBe(true)
  })

  it('rejects unknown ports, wrong kinds, empty fingerprints, and missing required outputs', () => {
    expect(() => snapshotMediaNodeExecutorResult({ outputs: { bad: textOutput('x') } }, SOURCE)).toThrow('unknown output port')
    expect(() => snapshotMediaNodeExecutorResult({ outputs: { text: { ...textOutput('x'), fingerprint: '' } } }, SOURCE)).toThrow('empty fingerprint')
    expect(() => snapshotMediaNodeExecutorResult({ outputs: {} }, SOURCE)).toThrow('omitted required output')
    const wrongKind = { value: { kind: 'image' }, fingerprint: 'image:x' } as unknown as MediaNodeExecutionOutput
    expect(() => snapshotMediaNodeExecutorResult({ outputs: { text: wrongKind } }, SOURCE)).toThrow('expected text')
  })
})

describe('execution identity, events, and cancellation', () => {
  it('passes an already-resolved identity through fingerprint and executor without model resolution', async () => {
    const { executors, engine } = await engineHarness()
    let observed = ''
    executors.register({ type: 'plugin.custom', version: 1 }, {
      execute(context) {
        observed = context.executionIdentity?.key ?? ''
        return { outputs: { text: textOutput('identity') } }
      },
    })
    const result = await engine.run({
      workflow: workflow([node('custom', 'plugin.custom')], []),
      executionIdentities: new Map([[WorkflowNodeId('custom'), { key: 'provider/model-1' }]]),
    })
    expect(observed).toBe('provider/model-1')
    expect(result.nodes.get(WorkflowNodeId('custom'))?.fingerprint.executionIdentityKey).toBe('provider/model-1')
  })

  it('rejects an empty execution identity before invoking the executor', async () => {
    const { executors, engine } = await engineHarness()
    let calls = 0
    executors.register({ type: 'plugin.custom', version: 1 }, {
      execute: () => { calls += 1; return { outputs: { text: textOutput('x') } } },
    })
    await expect(engine.run({
      workflow: workflow([node('custom', 'plugin.custom')], []),
      executionIdentities: new Map([[WorkflowNodeId('custom'), { key: '   ' }]]),
    })).rejects.toThrow(expect.objectContaining<Partial<MediaWorkflowExecutionError>>({
      code: 'MEDIA_WORKFLOW_INVALID_EXECUTION_IDENTITY',
    }))
    expect(calls).toBe(0)
  })

  it('emits started/completed facts for fresh execution and cache-hit facts when reused', async () => {
    const { executors, engine } = await engineHarness()
    const events: WorkflowRuntimeEvent[] = []
    executors.register({ type: 'plugin.custom', version: 1 }, {
      execute: () => ({ outputs: { text: textOutput('x') } }),
    })
    await engine.run({
      workflow: workflow([node('custom', 'plugin.custom')], []),
      eventSink: { publish: event => { events.push(event) } },
    })
    expect(events.map(event => event.kind)).toEqual(['node-started', 'node-completed'])
  })

  it('fails immediately for a pre-aborted request', async () => {
    const { engine } = await engineHarness()
    const controller = new AbortController()
    controller.abort()
    await expect(engine.run({
      workflow: workflow([node('custom', 'plugin.custom')], []),
      signal: controller.signal,
    })).rejects.toThrow(expect.objectContaining<Partial<MediaWorkflowExecutionError>>({ code: 'MEDIA_WORKFLOW_ABORTED' }))
  })

  it('rechecks cancellation after an executor returns even if the executor ignored the signal', async () => {
    const { executors, engine } = await engineHarness()
    const controller = new AbortController()
    executors.register({ type: 'plugin.custom', version: 1 }, {
      execute: () => {
        controller.abort()
        return { outputs: { text: textOutput('late') } }
      },
    })
    await expect(engine.run({
      workflow: workflow([node('custom', 'plugin.custom')], []),
      signal: controller.signal,
    })).rejects.toThrow(expect.objectContaining<Partial<MediaWorkflowExecutionError>>({ code: 'MEDIA_WORKFLOW_ABORTED' }))
  })

  it('keeps the event sink in-band so a start-event failure prevents executor invocation', async () => {
    const { executors, engine } = await engineHarness()
    let calls = 0
    executors.register({ type: 'plugin.custom', version: 1 }, {
      execute: () => { calls += 1; return { outputs: { text: textOutput('x') } } },
    })
    await expect(engine.run({
      workflow: workflow([node('custom', 'plugin.custom')], []),
      eventSink: { publish: () => { throw new Error('sink unavailable') } },
    })).rejects.toThrow('sink unavailable')
    expect(calls).toBe(0)
  })
})
