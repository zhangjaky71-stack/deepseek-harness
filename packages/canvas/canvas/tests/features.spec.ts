import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import CanvasService, {
  CanvasFeatureError,
  CanvasVariantId,
  MediaWorkflowId,
  WorkflowNodeId,
  createMediaWorkflow,
  resolveCanvasCapabilities,
} from '@deepseek-ai/dsh-canvas'
import type { CanvasAccessContext, MediaWorkflow } from '@deepseek-ai/dsh-canvas'
import CanvasFeatureService from '../src/feature-service.ts'
import { baseWorkflow, workflowRef } from './canvas-fixtures.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.dispose()
})

function videoWorkflow(): MediaWorkflow {
  const video = WorkflowNodeId('video')
  return createMediaWorkflow({
    id: MediaWorkflowId('workflow-video'),
    name: 'Historical video workflow',
    nodes: [{
      id: video,
      type: 'video.generate',
      nodeVersion: 1,
      config: { prompt: 'slow cinematic coffee pour' },
    }],
    edges: [],
    outputNodeIds: [video],
  })
}

function stubAgent(ctx: Context, rawId: string): Agent {
  const session = ctx.sessions.create(SessionId(rawId))
  const inbox = new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} })
  return {
    id: session.id,
    options: {},
    session,
    inbox,
    ctx: new Context(),
    status: 'idle',
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject(input) { inbox.append('next-step', input) },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle() { return Promise.resolve() },
  } as Agent
}

async function canvasHarness() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(CanvasService)
  const agent = stubAgent(ctx, `canvas-feature-${Math.random()}`)
  ctx.agents.register(agent)
  return { ctx, agent }
}

const browserAccess: CanvasAccessContext = {
  actor: { kind: 'human', id: 'browser-user' },
  source: 'browser-remote',
}

describe('Canvas deployment feature policy', () => {
  it('resolves shipped defaults and folds every child through canvas.enabled', () => {
    expect(resolveCanvasCapabilities()).toEqual({
      canvas: { enabled: true },
      editor: { enabled: true },
      history: { enabled: true },
      video: { enabled: false },
      variants: { enabled: false },
      partialRun: { enabled: false },
      regionEdit: { enabled: false },
      providerFallback: { enabled: false },
    })
    expect(resolveCanvasCapabilities({
      canvas: { enabled: false },
      editor: { enabled: true },
      video: { enabled: true },
    })).toEqual({
      canvas: { enabled: false },
      editor: { enabled: false },
      history: { enabled: false },
      video: { enabled: false },
      variants: { enabled: false },
      partialRun: { enabled: false },
      regionEdit: { enabled: false },
      providerFallback: { enabled: false },
    })
  })

  it('keeps a historical video workflow readable while blocking execution and new video use', async () => {
    const { ctx, agent } = await canvasHarness()
    const created = ctx.canvas.create(agent, { workflow: videoWorkflow() })
    await ctx.plugin(CanvasFeatureService, { video: { enabled: false } })

    expect(ctx.canvas.get(agent)?.workflow).toEqual(created.workflow)
    expect(() => ctx.canvasFeatures.assertWorkflowExecutable(created.workflow!)).toThrow(
      expect.objectContaining<Partial<CanvasFeatureError>>({ code: 'CANVAS_FEATURE_DISABLED', feature: 'video' }),
    )

    const removed = ctx.canvas.editWorkflow(agent, workflowRef(created), [
      { op: 'remove-node', nodeId: WorkflowNodeId('video') },
      { op: 'set-output-nodes', nodeIds: [] },
    ])
    expect(removed.workflow?.nodes).toEqual([])

    const before = agent.session.seq
    expect(() => ctx.canvas.editWorkflow(agent, workflowRef(removed), [{
      op: 'add-node',
      node: {
        id: WorkflowNodeId('video-new'),
        type: 'video.generate',
        nodeVersion: 1,
        config: { prompt: 'new video' },
      },
    }])).toThrow(expect.objectContaining<Partial<CanvasFeatureError>>({ feature: 'video' }))
    expect(agent.session.seq).toBe(before)
  })

  it('blocks Browser editor mutations while preserving Host/Agent semantic edits', async () => {
    const { ctx, agent } = await canvasHarness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    await ctx.plugin(CanvasFeatureService, { editor: { enabled: false } })

    const beforeBrowser = agent.session.seq
    expect(() => ctx.canvas.editWorkflow(
      agent,
      workflowRef(created),
      [{ op: 'rename-workflow', name: 'Browser denied' }],
      browserAccess,
    )).toThrow(expect.objectContaining<Partial<CanvasFeatureError>>({ feature: 'editor' }))
    expect(agent.session.seq).toBe(beforeBrowser)

    const hostEdited = ctx.canvas.editWorkflow(
      agent,
      workflowRef(created),
      [{ op: 'rename-workflow', name: 'Agent edit allowed' }],
    )
    expect(hostEdited.workflow?.name).toBe('Agent edit allowed')
  })

  it('gates history, variants, and new Canvas writes without making existing state unreadable', async () => {
    const { ctx, agent } = await canvasHarness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    await ctx.plugin(CanvasFeatureService, {
      canvas: { enabled: false },
      history: { enabled: true },
      variants: { enabled: true },
    })

    expect(ctx.canvas.get(agent)).toEqual(created)
    expect(() => ctx.canvas.clear(agent, workflowRef(created))).toThrow(
      expect.objectContaining<Partial<CanvasFeatureError>>({ feature: 'canvas' }),
    )
    expect(() => ctx.canvas.listRuns(agent)).toThrow(
      expect.objectContaining<Partial<CanvasFeatureError>>({ feature: 'history' }),
    )

    const { ctx: variantCtx, agent: variantAgent } = await canvasHarness()
    await variantCtx.plugin(CanvasFeatureService, { variants: { enabled: false } })
    expect(() => variantCtx.canvas.create(variantAgent, {
      workflow: baseWorkflow(),
      currentVariantId: CanvasVariantId('variant-disabled'),
    })).toThrow(expect.objectContaining<Partial<CanvasFeatureError>>({ feature: 'variants' }))
  })

  it('returns a detached read-only capability snapshot over the global Remote method', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(CanvasFeatureService, { editor: { enabled: false }, history: { enabled: false } })
    const first = ctx.canvasFeatures.remoteExportGet()
    const second = ctx.canvasFeatures.remoteExportGet()
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.editor.enabled).toBe(false)
    expect(first.history.enabled).toBe(false)
  })
})
