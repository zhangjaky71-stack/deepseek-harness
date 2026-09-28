import { afterEach, describe, expect, it } from 'vitest'
import { WorkflowEdgeId, WorkflowNodeId } from '@deepseek-ai/dsh-canvas'
import type { MediaNodeExecutionOutput } from '../src/engine-types.ts'
import type { MediaWorkflowExecutionError } from '../src/engine.ts'
import {
  OPTIONAL_SOURCE,
  chain,
  disposeContexts,
  edge,
  engineHarness,
  node,
  registerTextExecutors,
  textOutput,
  workflow,
} from './engine-fixture.ts'

afterEach(disposeContexts)

describe('MediaWorkflowEngine run', () => {
  it('runs a complete DAG in deterministic topology with normalized immutable config snapshots', async () => {
    const { executors, engine } = await engineHarness()
    const calls: string[] = []
    registerTextExecutors(executors, calls)
    const result = await engine.run({ workflow: chain() })

    expect(calls).toEqual(['a', 'b', 'c'])
    expect(result.nodes.get(WorkflowNodeId('c'))?.outputs.text).toEqual(textOutput('hello!?'))
    expect(result.snapshot.workflow.nodes.find(item => item.id === WorkflowNodeId('b'))?.config).toEqual({ suffix: '!' })
    expect(Object.isFrozen(result.snapshot.workflow)).toBe(true)
    expect(Object.isFrozen(result.snapshot.workflow.nodes[0])).toBe(true)
  })

  it('prepare detaches caller-owned arrays/config before later mutation', async () => {
    const { engine } = await engineHarness()
    const mutableConfig: Record<string, string> = {}
    const nodes = [node('a', 'test.source', { text: 'before' }), node('b', 'test.step', mutableConfig)]
    const edges = [edge('e1', 'a', 'text', 'b', 'input')]
    const prepared = engine.prepare(workflow(nodes, edges))

    mutableConfig.suffix = 'changed'
    nodes.push(node('late', 'test.source'))
    edges.length = 0

    expect(prepared.snapshot.workflow.nodes.map(item => item.id)).toEqual(['a', 'b'])
    expect(prepared.snapshot.workflow.edges.map(item => item.id)).toEqual(['e1'])
    expect(prepared.snapshot.workflow.nodes[1]?.config).toEqual({ suffix: '!' })
  })

  it('requires explicit from-node boundary data and never reruns excluded upstream nodes', async () => {
    const { executors, engine } = await engineHarness()
    const calls: string[] = []
    registerTextExecutors(executors, calls)
    const request = { workflow: chain(), selection: { mode: 'from-node' as const, nodeId: WorkflowNodeId('b') } }

    await expect(engine.run(request)).rejects.toThrow(expect.objectContaining<Partial<MediaWorkflowExecutionError>>({
      code: 'MEDIA_WORKFLOW_BOUNDARY_INPUT_MISSING',
    }))
    expect(calls).toEqual([])

    const result = await engine.run({
      ...request,
      boundaryInputs: new Map([[WorkflowEdgeId('e1'), textOutput('boundary')]]),
    })
    expect(calls).toEqual(['b', 'c'])
    expect(result.nodes.get(WorkflowNodeId('c'))?.outputs.text).toEqual(textOutput('boundary!?'))
  })

  it('rejects a boundary value whose semantic kind disagrees with the target port', async () => {
    const { executors, engine } = await engineHarness()
    registerTextExecutors(executors, [])
    const invalid = { value: { kind: 'image' }, fingerprint: 'image:wrong' } as unknown as MediaNodeExecutionOutput
    await expect(engine.run({
      workflow: chain(),
      selection: { mode: 'from-node', nodeId: WorkflowNodeId('b') },
      boundaryInputs: new Map([[WorkflowEdgeId('e1'), invalid]]),
    })).rejects.toThrow(expect.objectContaining<Partial<MediaWorkflowExecutionError>>({
      code: 'MEDIA_WORKFLOW_INVALID_EXECUTOR_OUTPUT',
    }))
  })

  it('fails when a scheduled source legally omits the output referenced by a downstream edge', async () => {
    const { executors, engine } = await engineHarness()
    executors.register({ type: OPTIONAL_SOURCE.type, version: 1 }, { execute: () => ({ outputs: {} }) })
    executors.register({ type: 'test.step', version: 1 }, { execute: () => ({ outputs: { text: textOutput('unused') } }) })
    const candidate = workflow(
      [node('a', OPTIONAL_SOURCE.type), node('b', 'test.step')],
      [edge('e', 'a', 'text', 'b', 'input')],
    )
    await expect(engine.run({ workflow: candidate })).rejects.toThrow(expect.objectContaining<Partial<MediaWorkflowExecutionError>>({
      code: 'MEDIA_WORKFLOW_OUTPUT_VALUE_MISSING',
    }))
  })

  it('dispatches a custom node solely through Definition + Executor registration', async () => {
    const { executors, engine } = await engineHarness()
    executors.register({ type: 'plugin.custom', version: 1 }, {
      execute: () => ({ outputs: { text: textOutput('custom') } }),
    })
    const result = await engine.run({ workflow: workflow([node('custom', 'plugin.custom')], []) })
    expect(result.nodes.get(WorkflowNodeId('custom'))?.outputs.text).toEqual(textOutput('custom'))
  })

  it('fails after executor disposal without a type switch or fallback', async () => {
    const { executors, engine } = await engineHarness()
    const dispose = executors.register({ type: 'plugin.custom', version: 1 }, {
      execute: () => ({ outputs: { text: textOutput('custom') } }),
    })
    dispose()
    dispose()
    await expect(engine.run({ workflow: workflow([node('custom', 'plugin.custom')], []) })).rejects.toThrow(
      expect.objectContaining<Partial<MediaWorkflowExecutionError>>({ code: 'MEDIA_WORKFLOW_EXECUTOR_NOT_FOUND' }),
    )
  })

  it('rejects duplicate executor registration', async () => {
    const { executors } = await engineHarness()
    const executor = { execute: () => ({ outputs: { text: textOutput('x') } }) }
    executors.register({ type: 'plugin.custom', version: 1 }, executor)
    expect(() => executors.register({ type: 'plugin.custom', version: 1 }, executor)).toThrow('already registered')
  })
})
