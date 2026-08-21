import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import { Inbox } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  CANVAS_CHANGE_VERSION,
  MediaWorkflowId,
  WorkflowEdgeId,
  WorkflowNodeId,
  createMediaWorkflow,
} from '@deepseek-ai/dsh-canvas'
import { describe, expect, it } from 'vitest'

function workflow() {
  const prompt = WorkflowNodeId('prompt')
  const output = WorkflowNodeId('output')
  return createMediaWorkflow({
    id: MediaWorkflowId('real-composition-workflow'),
    name: 'REAL composition workflow',
    nodes: [
      { id: prompt, type: 'prompt', nodeVersion: 1, config: { text: 'make an image' } },
      { id: output, type: 'output', nodeVersion: 1, config: {} },
    ],
    edges: [{
      id: WorkflowEdgeId('prompt-output'),
      sourceNodeId: prompt,
      sourcePort: 'text',
      targetNodeId: output,
      targetPort: 'input',
    }],
    outputNodeIds: [output],
  })
}

function registerLiveAgent(ctx: Context, rawId: string): Agent {
  const session = ctx.sessions.create(SessionId(rawId))
  const inbox = new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} })
  const status: AgentStatus = 'idle'
  const agent: Agent = {
    id: session.id,
    options: {},
    session,
    inbox,
    ctx,
    get status() { return status },
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject(input) { inbox.append('next-step', input) },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle() { return Promise.resolve() },
  }
  ctx.agents.register(agent)
  return agent
}

async function bootCanvasComposition(): Promise<Context> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-canvas-real-composition-'))
  const config = join(dir, 'cordis.yml')
  writeFileSync(config, [
    "- id: session",
    "  name: '@deepseek-ai/dsh-session'",
    "- id: invariants",
    "  name: '@deepseek-ai/dsh-invariants'",
    "- id: agent",
    "  name: '@deepseek-ai/dsh-agent'",
    "- id: session-projection",
    "  name: '@deepseek-ai/dsh-session-projection'",
    "- id: canvas",
    "  name: '@deepseek-ai/dsh-canvas'",
    "- id: canvas-invariant",
    "  name: '@deepseek-ai/dsh-canvas/invariant'",
    '',
  ].join('\n'))

  const ctx = new Context()
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
  await ctx.loader.await()
  return ctx
}

describe('Canvas REAL Loader composition', () => {
  it('mounts the package invariant so direct current writes fail while CanvasService commits succeed', async () => {
    const ctx = await bootCanvasComposition()
    try {
      const agent = registerLiveAgent(ctx, 'canvas-real-composition-agent')
      const created = ctx.canvas.create(agent, { workflow: workflow() })
      if (created.workflow === null) throw new Error('expected current workflow')

      const bypass = {
        kind: 'canvas/change' as const,
        version: CANVAS_CHANGE_VERSION,
        operation: 'workflow-edit' as const,
        canvas: {
          ...created,
          workflowRevision: created.workflowRevision + 1,
          workflow: { ...created.workflow, name: 'bypassed workflow' },
          updatedAt: created.updatedAt + 1,
        },
        meta: {
          schemaVersion: 2 as const,
          actor: { kind: 'agent' as const, id: String(agent.id) },
          source: 'host' as const,
        },
      }

      expect(() => agent.session.append('canvas/change', bypass)).toThrow(
        /current Canvas durable writes must be committed by CanvasService/,
      )
      expect(ctx.canvas.get(agent)?.workflowRevision).toBe(1)

      const edited = ctx.canvas.editWorkflow(
        agent,
        {
          canvasId: created.id,
          workflowId: created.workflow.id,
          workflowRevision: created.workflowRevision,
        },
        [{ op: 'rename-workflow', name: 'committed workflow' }],
      )
      expect(edited.workflowRevision).toBe(2)
      expect(edited.workflow?.name).toBe('committed workflow')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
