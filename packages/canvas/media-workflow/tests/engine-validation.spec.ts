import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  MediaWorkflowId,
  WorkflowEdgeId,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas'
import type {
  MediaPortType,
  MediaWorkflow,
  MediaWorkflowEdge,
  MediaWorkflowNode,
  WorkflowNodeId as WorkflowNodeIdType,
} from '@deepseek-ai/dsh-canvas/types'
import { z } from 'zod'
import type { MediaNodeDefinition, MediaNodePortDefinition } from '../src/types.ts'
import MediaNodeRegistry from '../src/registry.ts'
import {
  MediaWorkflowValidationError,
  assertValidMediaWorkflow,
  planMediaWorkflowExecution,
  validateMediaWorkflow,
} from '../src/engine.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.dispose()
})

const jsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const configSchema = z.record(z.string(), jsonScalar)

const port = (name: string, type: MediaPortType, required = true, multiple = false): MediaNodePortDefinition => ({
  name,
  type,
  required,
  ...(multiple ? { multiple: true } : {}),
})

function definition(
  type: string,
  inputs: readonly MediaNodePortDefinition[],
  outputs: readonly MediaNodePortDefinition[],
  overrides: Partial<MediaNodeDefinition> = {},
): MediaNodeDefinition {
  return {
    type,
    version: 1,
    displayName: type,
    inputs,
    outputs,
    configSchema,
    defaultConfig: {},
    execution: { deterministic: true, supportsPartialRun: true },
    lifecycle: { deprecated: false, creatable: true, executable: true },
    ui: { category: 'test', icon: 'test', inspectorKind: 'test' },
    ...overrides,
  }
}

const SOURCE = definition('test.source', [], [port('text', 'text')])
const IMAGE_SOURCE = definition('test.image-source', [], [port('image', 'image')])
const STEP = definition('test.step', [port('input', 'text')], [port('text', 'text')])
const MULTI = definition('test.multi', [port('items', 'text', true, true)], [port('text', 'text')])
const NO_PARTIAL = definition('test.no-partial', [port('input', 'text')], [port('text', 'text')], {
  execution: { deterministic: true, supportsPartialRun: false },
})

async function registryHarness(definitions: readonly MediaNodeDefinition[] = [SOURCE, IMAGE_SOURCE, STEP, MULTI, NO_PARTIAL]) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(MediaNodeRegistry)
  for (const item of definitions) ctx.mediaNodes.register(item)
  return ctx.mediaNodes
}

const node = (id: string, type: string, config: Readonly<Record<string, string | number | boolean | null>> = {}): MediaWorkflowNode => ({
  id: WorkflowNodeId(id),
  type,
  nodeVersion: 1,
  config,
})

const edge = (
  id: string,
  sourceNodeId: string,
  sourcePort: string,
  targetNodeId: string,
  targetPort: string,
): MediaWorkflowEdge => ({
  id: WorkflowEdgeId(id),
  sourceNodeId: WorkflowNodeId(sourceNodeId),
  sourcePort,
  targetNodeId: WorkflowNodeId(targetNodeId),
  targetPort,
})

function workflow(
  nodes: readonly MediaWorkflowNode[],
  edges: readonly MediaWorkflowEdge[],
  outputNodeIds: readonly WorkflowNodeIdType[],
): MediaWorkflow {
  return {
    id: MediaWorkflowId('workflow-test'),
    schemaVersion: 1,
    name: 'Workflow test',
    nodes,
    edges,
    outputNodeIds,
  }
}

function chain(stepType = 'test.step'): MediaWorkflow {
  return workflow(
    [node('a', 'test.source'), node('b', stepType), node('c', 'test.step')],
    [edge('e1', 'a', 'text', 'b', 'input'), edge('e2', 'b', 'text', 'c', 'input')],
    [WorkflowNodeId('c')],
  )
}

const codes = (result: ReturnType<typeof validateMediaWorkflow>) => result.diagnostics.map(item => item.code)

describe('validateMediaWorkflow', () => {
  it('accepts a valid DAG and derives stable topology independent of node/edge array order', async () => {
    const registry = await registryHarness()
    const first = workflow(
      [node('b', 'test.source'), node('c', 'test.multi'), node('a', 'test.source')],
      [edge('z', 'b', 'text', 'c', 'items'), edge('a', 'a', 'text', 'c', 'items')],
      [WorkflowNodeId('c')],
    )
    const second = workflow(
      [...first.nodes].reverse(),
      [...first.edges].reverse(),
      first.outputNodeIds,
    )
    expect(validateMediaWorkflow(first, registry)).toMatchObject({ valid: true, topologicalNodeIds: ['a', 'b', 'c'] })
    expect(validateMediaWorkflow(second, registry).topologicalNodeIds).toEqual(['a', 'b', 'c'])
  })

  it('reports duplicate and dangling structure including output identities', async () => {
    const registry = await registryHarness()
    const candidate = workflow(
      [node('a', 'test.source'), node('a', 'test.source')],
      [
        edge('e', 'missing-source', 'text', 'a', 'input'),
        edge('e', 'a', 'text', 'missing-target', 'input'),
        edge('e2', 'a', 'text', 'missing-target', 'input'),
      ],
      [WorkflowNodeId('ghost'), WorkflowNodeId('ghost')],
    )
    expect(codes(validateMediaWorkflow(candidate, registry))).toEqual(expect.arrayContaining([
      'MEDIA_WORKFLOW_DUPLICATE_NODE_ID',
      'MEDIA_WORKFLOW_DUPLICATE_EDGE_ID',
      'MEDIA_WORKFLOW_UNKNOWN_SOURCE_NODE',
      'MEDIA_WORKFLOW_UNKNOWN_TARGET_NODE',
      'MEDIA_WORKFLOW_UNKNOWN_OUTPUT_NODE',
      'MEDIA_WORKFLOW_DUPLICATE_OUTPUT_NODE',
    ]))
  })

  it('reports unknown definitions, invalid config, and intrinsic non-executability', async () => {
    const strict = definition('test.strict', [], [port('text', 'text')], {
      configSchema: z.object({ count: z.number().int().min(1) }).catchall(jsonScalar),
      lifecycle: { deprecated: false, creatable: true, executable: false },
    })
    const registry = await registryHarness([strict])
    const candidate = workflow(
      [node('known', 'test.strict', { count: 0 }), node('unknown', 'test.unknown')],
      [],
      [WorkflowNodeId('known')],
    )
    expect(codes(validateMediaWorkflow(candidate, registry))).toEqual(expect.arrayContaining([
      'MEDIA_WORKFLOW_INVALID_NODE_CONFIG',
      'MEDIA_WORKFLOW_NODE_NOT_EXECUTABLE',
      'MEDIA_WORKFLOW_UNKNOWN_NODE_DEFINITION',
    ]))
  })

  it('reports unknown ports, incompatible types, multiplicity, and missing required inputs', async () => {
    const registry = await registryHarness()
    const candidate = workflow(
      [
        node('text1', 'test.source'),
        node('text2', 'test.source'),
        node('image', 'test.image-source'),
        node('target', 'test.step'),
        node('unwired', 'test.step'),
      ],
      [
        edge('unknown-source-port', 'text1', 'missing', 'target', 'input'),
        edge('unknown-target-port', 'text1', 'text', 'target', 'missing'),
        edge('wrong-type', 'image', 'image', 'target', 'input'),
        edge('one', 'text1', 'text', 'target', 'input'),
        edge('two', 'text2', 'text', 'target', 'input'),
      ],
      [WorkflowNodeId('target')],
    )
    expect(codes(validateMediaWorkflow(candidate, registry))).toEqual(expect.arrayContaining([
      'MEDIA_WORKFLOW_UNKNOWN_SOURCE_PORT',
      'MEDIA_WORKFLOW_UNKNOWN_TARGET_PORT',
      'MEDIA_WORKFLOW_PORT_TYPE_MISMATCH',
      'MEDIA_WORKFLOW_INPUT_MULTIPLICITY',
      'MEDIA_WORKFLOW_MISSING_REQUIRED_INPUT',
    ]))
  })

  it('reports a cycle and no-output workflows', async () => {
    const registry = await registryHarness()
    const cyclic = workflow(
      [node('a', 'test.step'), node('b', 'test.step')],
      [edge('ab', 'a', 'text', 'b', 'input'), edge('ba', 'b', 'text', 'a', 'input')],
      [],
    )
    const result = validateMediaWorkflow(cyclic, registry)
    expect(codes(result)).toEqual(expect.arrayContaining(['MEDIA_WORKFLOW_CYCLE', 'MEDIA_WORKFLOW_NO_OUTPUT']))
    expect(result.valid).toBe(false)
  })

  it('warns for a valid node that cannot reach a declared output', async () => {
    const registry = await registryHarness()
    const candidate = workflow(
      [node('used', 'test.source'), node('out', 'test.step'), node('unused', 'test.source')],
      [edge('used-out', 'used', 'text', 'out', 'input')],
      [WorkflowNodeId('out')],
    )
    const result = validateMediaWorkflow(candidate, registry)
    expect(result.valid).toBe(true)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      code: 'MEDIA_WORKFLOW_UNREACHABLE_NODE',
      nodeId: 'unused',
    }))
  })

  it('assertValidMediaWorkflow throws only blocking diagnostics and captures exact definitions', async () => {
    const registry = await registryHarness()
    const valid = assertValidMediaWorkflow(chain(), registry)
    expect(valid.definitions.get(WorkflowNodeId('b'))?.type).toBe('test.step')
    expect(() => assertValidMediaWorkflow(workflow([node('x', 'test.unknown')], [], [WorkflowNodeId('x')]), registry))
      .toThrow(MediaWorkflowValidationError)
  })
})

describe('planMediaWorkflowExecution', () => {
  it('plans all nodes in deterministic topological order', async () => {
    const registry = await registryHarness()
    const validated = assertValidMediaWorkflow(chain(), registry)
    expect(planMediaWorkflowExecution(validated)).toEqual({
      workflowId: MediaWorkflowId('workflow-test'),
      selection: { mode: 'all' },
      scheduledNodeIds: ['a', 'b', 'c'],
      targetNodeIds: ['c'],
      boundaryInputs: [],
    })
  })

  it('selected includes the requested targets and their required upstream closure', async () => {
    const registry = await registryHarness()
    const plan = planMediaWorkflowExecution(assertValidMediaWorkflow(chain(), registry), {
      mode: 'selected',
      nodeIds: [WorkflowNodeId('b'), WorkflowNodeId('b')],
    })
    expect(plan.scheduledNodeIds).toEqual(['a', 'b'])
    expect(plan.targetNodeIds).toEqual(['b'])
    expect(plan.boundaryInputs).toEqual([])
  })

  it('from-node executes the seed and descendants while exposing unscheduled upstream boundaries', async () => {
    const registry = await registryHarness()
    const plan = planMediaWorkflowExecution(assertValidMediaWorkflow(chain(), registry), {
      mode: 'from-node',
      nodeId: WorkflowNodeId('b'),
    })
    expect(plan.scheduledNodeIds).toEqual(['b', 'c'])
    expect(plan.targetNodeIds).toEqual(['b'])
    expect(plan.boundaryInputs).toEqual([{
      edgeId: WorkflowEdgeId('e1'),
      sourceNodeId: WorkflowNodeId('a'),
      sourcePort: 'text',
      targetNodeId: WorkflowNodeId('b'),
      targetPort: 'input',
    }])
  })

  it('downstream excludes seed nodes and treats their outgoing values as boundary inputs', async () => {
    const registry = await registryHarness()
    const plan = planMediaWorkflowExecution(assertValidMediaWorkflow(chain(), registry), {
      mode: 'downstream',
      nodeIds: [WorkflowNodeId('b')],
    })
    expect(plan.scheduledNodeIds).toEqual(['c'])
    expect(plan.boundaryInputs.map(item => item.edgeId)).toEqual(['e2'])
  })

  it('rejects empty/unknown partial targets', async () => {
    const registry = await registryHarness()
    const validated = assertValidMediaWorkflow(chain(), registry)
    expect(() => planMediaWorkflowExecution(validated, { mode: 'selected', nodeIds: [] })).toThrow(
      expect.objectContaining<Partial<MediaWorkflowValidationError>>({
        diagnostics: [expect.objectContaining({ code: 'MEDIA_WORKFLOW_INVALID_PARTIAL_TARGET' })],
      }),
    )
    expect(() => planMediaWorkflowExecution(validated, {
      mode: 'from-node',
      nodeId: WorkflowNodeId('ghost'),
    })).toThrow(MediaWorkflowValidationError)
  })

  it('rejects a scheduled definition that opts out of partial execution', async () => {
    const registry = await registryHarness()
    const validated = assertValidMediaWorkflow(chain('test.no-partial'), registry)
    expect(() => planMediaWorkflowExecution(validated, {
      mode: 'from-node',
      nodeId: WorkflowNodeId('b'),
    })).toThrow(expect.objectContaining<Partial<MediaWorkflowValidationError>>({
      diagnostics: [expect.objectContaining({ code: 'MEDIA_WORKFLOW_PARTIAL_RUN_UNSUPPORTED', nodeId: 'b' })],
    }))
  })
})
