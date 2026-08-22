import { Context } from '@deepseek-ai/cordis'
import { MediaWorkflowId, WorkflowEdgeId, WorkflowNodeId } from '@deepseek-ai/dsh-canvas'
import type { MediaPortType, MediaWorkflow, MediaWorkflowEdge, MediaWorkflowNode } from '@deepseek-ai/dsh-canvas/types'
import { z } from 'zod'
import type { MediaNodeDefinition, MediaNodePortDefinition } from '../src/types.ts'
import MediaNodeRegistry from '../src/registry.ts'
import { MediaNodeExecutorRegistry, MediaWorkflowEngine } from '../src/engine.ts'
import type { MediaNodeExecutionCache, MediaNodeExecutionOutput } from '../src/engine-types.ts'

export const contexts: Context[] = []
export async function disposeContexts(): Promise<void> {
  while (contexts.length > 0) await contexts.pop()!.fiber.dispose()
}

const jsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const configSchema = z.record(z.string(), jsonScalar)
const defaultingConfigSchema = z.object({ suffix: z.string().default('!') }).catchall(jsonScalar)

export const port = (name: string, type: MediaPortType, required = true, multiple = false): MediaNodePortDefinition => ({
  name, type, required, ...(multiple ? { multiple: true } : {}),
})

export function definition(
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

export const SOURCE = definition('test.source', [], [port('text', 'text')])
export const OPTIONAL_SOURCE = definition('test.optional-source', [], [port('text', 'text', false)])
export const STEP = definition('test.step', [port('input', 'text')], [port('text', 'text')], {
  configSchema: defaultingConfigSchema,
  defaultConfig: { suffix: '!' },
})
export const UNSTABLE = definition('test.unstable', [], [port('text', 'text')], {
  execution: { deterministic: false, supportsPartialRun: true },
})
export const CUSTOM = definition('plugin.custom', [], [port('text', 'text')])

export const node = (id: string, type: string, config: Readonly<Record<string, string | number | boolean | null>> = {}): MediaWorkflowNode => ({
  id: WorkflowNodeId(id), type, nodeVersion: 1, config,
})

export const edge = (id: string, sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort: string): MediaWorkflowEdge => ({
  id: WorkflowEdgeId(id), sourceNodeId: WorkflowNodeId(sourceNodeId), sourcePort, targetNodeId: WorkflowNodeId(targetNodeId), targetPort,
})

export function workflow(nodes: readonly MediaWorkflowNode[], edges: readonly MediaWorkflowEdge[], output = nodes.at(-1)?.id): MediaWorkflow {
  return {
    id: MediaWorkflowId('workflow-execution'), schemaVersion: 1, name: 'Execution', nodes, edges,
    outputNodeIds: output === undefined ? [] : [output],
  }
}

export function chain(stepConfig: Readonly<Record<string, string | number | boolean | null>> = {}): MediaWorkflow {
  return workflow(
    [node('a', 'test.source', { text: 'hello' }), node('b', 'test.step', stepConfig), node('c', 'test.step', { suffix: '?' })],
    [edge('e1', 'a', 'text', 'b', 'input'), edge('e2', 'b', 'text', 'c', 'input')],
  )
}

export const textOutput = (text: string, fingerprint = `text:${text}`): MediaNodeExecutionOutput => ({
  value: { kind: 'text', text }, fingerprint,
})

export async function engineHarness(
  definitions: readonly MediaNodeDefinition[] = [SOURCE, OPTIONAL_SOURCE, STEP, UNSTABLE, CUSTOM],
  cache?: MediaNodeExecutionCache,
) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(MediaNodeRegistry)
  for (const item of definitions) ctx.mediaNodes.register(item)
  const executors = new MediaNodeExecutorRegistry()
  return { ctx, executors, engine: new MediaWorkflowEngine(ctx.mediaNodes, executors, cache) }
}

export function registerTextExecutors(executors: MediaNodeExecutorRegistry, calls: string[]): void {
  executors.register({ type: 'test.source', version: 1 }, {
    execute(context) {
      calls.push(context.nodeId)
      const current = context.workflow.nodes.find(item => item.id === context.nodeId)!
      const text = String(current.config.text ?? 'source')
      return { outputs: { text: textOutput(text) } }
    },
  })
  executors.register({ type: 'test.step', version: 1 }, {
    execute(context) {
      calls.push(context.nodeId)
      const input = context.inputs.input?.[0]?.value
      if (input?.kind !== 'text') throw new Error('test step expected text')
      const current = context.workflow.nodes.find(item => item.id === context.nodeId)!
      return { outputs: { text: textOutput(`${input.text}${String(current.config.suffix ?? '')}`) } }
    },
  })
}
