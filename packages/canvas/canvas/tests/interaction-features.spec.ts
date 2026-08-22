import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import CanvasService, { CanvasFeatureError } from '@deepseek-ai/dsh-canvas'
import type { StageCanvasInteractionRequest } from '@deepseek-ai/dsh-canvas'
import CanvasFeatureService from '../src/feature-service.ts'
import CanvasInteractionService from '../src/interaction-service.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.dispose()
})

function stubAgent(ctx: Context): Agent {
  const session = Session.create(SessionId('canvas-region-feature'))
  return {
    id: session.id,
    options: {},
    session,
    inbox: {} as Agent['inbox'],
    ctx,
    status: 'idle',
    send() {},
    followup() {},
    steer() {},
    inject() {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle() { return Promise.resolve() },
  } as Agent
}

describe('Canvas interaction feature policy', () => {
  it('rejects direct region staging while regionEdit is disabled', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(CanvasFeatureService, { regionEdit: { enabled: false } })
    await ctx.plugin(CanvasService)
    await ctx.plugin(CanvasInteractionService)
    const agent = stubAgent(ctx)
    ctx.agents.register(agent)

    const request = {
      rpcId: 'region-disabled',
      context: {
        canvasId: 'canvas-region',
        workflowId: 'workflow-region',
        workflowRevision: 1,
        region: {
          asset: {
            kind: 'image',
            image: {
              attachmentId: 'not-even-host-resolved',
              mediaType: 'image/png',
              bytes: 1,
              width: 1,
              height: 1,
            },
          },
          normalizedBounds: { x: 0, y: 0, width: 1, height: 1 },
        },
      },
    } as unknown as StageCanvasInteractionRequest

    expect(() => ctx.canvasInteraction.remoteExportStage(agent, request)).toThrow(
      expect.objectContaining<Partial<CanvasFeatureError>>({ code: 'CANVAS_FEATURE_DISABLED', feature: 'regionEdit' }),
    )
  })

  it('rejects malformed Remote payloads before nested property access', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(CanvasFeatureService)
    await ctx.plugin(CanvasService)
    await ctx.plugin(CanvasInteractionService)
    const agent = stubAgent(ctx)
    ctx.agents.register(agent)

    expect(() => ctx.canvasInteraction.remoteExportStage(agent, null as unknown as StageCanvasInteractionRequest)).toThrow(
      expect.objectContaining({ code: 'CANVAS_INTERACTION_INVALID_CONTEXT' }),
    )
  })
})