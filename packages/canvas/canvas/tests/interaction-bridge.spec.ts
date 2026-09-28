import { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CanvasId,
  MediaWorkflowId,
  WorkflowNodeId,
  createCanvasSnapshot,
  createMediaWorkflow,
} from '../src/index.ts'
import type { CanvasInteractionContext, CanvasSnapshot } from '../src/index.ts'
import { CanvasInteractionBridge, CanvasInteractionBridgeError } from '../src/interaction-bridge.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.fiber.dispose()
})

function currentCanvas(revision = 1): CanvasSnapshot {
  const workflow = createMediaWorkflow({
    id: MediaWorkflowId('workflow-bridge'),
    name: 'Bridge workflow',
    nodes: [{ id: WorkflowNodeId('node-a'), type: 'prompt', config: { text: 'coffee' } }],
    outputNodeIds: [WorkflowNodeId('node-a')],
  })
  const base = createCanvasSnapshot({
    id: CanvasId('canvas-bridge'),
    workflow,
    createdAt: 1,
  })
  return { ...base, workflowRevision: revision, updatedAt: revision }
}

function sampled(revision = 1): CanvasInteractionContext {
  return {
    canvasId: CanvasId('canvas-bridge'),
    workflowId: MediaWorkflowId('workflow-bridge'),
    workflowRevision: revision,
    mode: 'editor',
    selectedNodeIds: [WorkflowNodeId('node-a')],
  }
}

function agent(ctx: Context): Agent {
  const id = SessionId('session-bridge')
  return {
    id,
    options: {},
    session: { id, events: [] } as unknown as Session,
    inbox: {} as Agent['inbox'],
    status: 'idle',
    ctx,
    cancel() {},
    whenIdle: async () => {},
    runMaintenance: async task => await task(new AbortController().signal),
    send() {},
    followup() {},
    steer() {},
    inject() {},
  } as Agent
}

function prompt(rpcId: string, text = 'modify this'): UserMessage {
  const base = createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })
  return {
    ...base,
    source: { kind: 'user', rpcId } as UserMessage['source'],
  }
}

async function enter(ctx: Context, subject: Agent, messages: UserMessage[]): Promise<PreStepDecision> {
  return await agentEvents(ctx, subject).waterfall(
    'agent/pre-step',
    { messages, turn: 1, step: 1, signal: new AbortController().signal },
    async () => ({ kind: 'enter', messages }),
  )
}

function contextText(decision: PreStepDecision): string | undefined {
  if (decision.kind !== 'enter') return undefined
  const message = decision.messages.find(candidate => candidate.source.kind === 'plugin'
    && candidate.source.plugin === 'canvas-interaction')
  const block = message?.content[0]
  return block?.type === 'text' ? block.text : undefined
}

describe('CanvasInteractionBridge', () => {
  it('binds staged context to the exact inserted rpc id and places it immediately before that prompt', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const subject = agent(ctx)
    const bridge = new CanvasInteractionBridge(ctx, { get: () => currentCanvas() })
    bridge.stage(subject, { rpcId: 'rpc-a', context: sampled() })

    const wrong = prompt('rpc-b', 'unrelated')
    agentEvents(ctx, subject).emit('agent/inbox/inserted', { message: wrong })
    const wrongDecision = await enter(ctx, subject, [wrong])
    expect(wrongDecision).toEqual({ kind: 'enter', messages: [wrong] })

    const exact = prompt('rpc-a')
    agentEvents(ctx, subject).emit('agent/inbox/inserted', { message: exact })
    const decision = await enter(ctx, subject, [exact])
    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') return
    expect(decision.messages).toHaveLength(2)
    expect(decision.messages[0]?.source).toMatchObject({ kind: 'plugin', plugin: 'canvas-interaction', form: 'snapshot' })
    expect(decision.messages[1]?.id).toBe(exact.id)
    expect(contextText(decision)).toContain('selected nodes: node-a')
  })

  it('uses the same Host-minted browser principal as Canvas Remote/Projection reads', () => {
    const ctx = new Context()
    contexts.push(ctx)
    const subject = agent(ctx)
    let seen: import('../src/types.ts').CanvasAccessContext | undefined
    const bridge = new CanvasInteractionBridge(ctx, {
      get: (_agent, access) => {
        seen = access
        return currentCanvas()
      },
    })
    bridge.stage(subject, { rpcId: 'rpc-browser-principal', context: sampled() })
    expect(seen).toMatchObject({
      actor: { kind: 'human', id: 'host-browser' },
      source: 'browser-remote',
      requestId: 'rpc-browser-principal',
      correlationId: 'rpc-browser-principal',
    })
  })

  it('strictly rejects malformed stage/discard envelopes before business logic', () => {
    const ctx = new Context()
    contexts.push(ctx)
    const subject = agent(ctx)
    let reads = 0
    const bridge = new CanvasInteractionBridge(ctx, {
      get: () => {
        reads += 1
        return currentCanvas()
      },
    })

    for (const invalid of [null, [], { rpcId: 'rpc-a' }, { rpcId: 'rpc-a', context: sampled(), extra: true }]) {
      expect(() => bridge.stage(subject, invalid)).toThrow(
        expect.objectContaining<Partial<CanvasInteractionBridgeError>>({ code: 'CANVAS_INTERACTION_INVALID_CONTEXT' }),
      )
    }
    expect(() => bridge.stage(subject, { rpcId: 'rpc with spaces', context: sampled() })).toThrow(
      expect.objectContaining<Partial<CanvasInteractionBridgeError>>({ code: 'CANVAS_INTERACTION_INVALID_RPC_ID' }),
    )
    expect(() => bridge.discard(subject, null)).toThrow(
      expect.objectContaining<Partial<CanvasInteractionBridgeError>>({ code: 'CANVAS_INTERACTION_INVALID_CONTEXT' }),
    )
    expect(() => bridge.discard(subject, { rpcId: 'rpc-a', extra: true })).toThrow(
      expect.objectContaining<Partial<CanvasInteractionBridgeError>>({ code: 'CANVAS_INTERACTION_INVALID_CONTEXT' }),
    )
    expect(reads).toBe(0)
  })

  it('runs decoded-context policy before Host projection reads', () => {
    const ctx = new Context()
    contexts.push(ctx)
    const subject = agent(ctx)
    let reads = 0
    const bridge = new CanvasInteractionBridge(ctx, {
      get: () => {
        reads += 1
        return currentCanvas()
      },
    })
    expect(() => bridge.stage(subject, { rpcId: 'rpc-policy', context: sampled() }, () => {
      throw new Error('policy rejected decoded context')
    })).toThrow('policy rejected decoded context')
    expect(reads).toBe(0)
  })

  it('discard prevents an unadmitted staged prompt from leaking into later messages', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const subject = agent(ctx)
    const bridge = new CanvasInteractionBridge(ctx, { get: () => currentCanvas() })
    bridge.stage(subject, { rpcId: 'rpc-a', context: sampled() })
    expect(bridge.discard(subject, { rpcId: 'rpc-a' })).toEqual({ discarded: true })
    expect(bridge.discard(subject, { rpcId: 'rpc-a' })).toEqual({ discarded: false })

    const message = prompt('rpc-a')
    agentEvents(ctx, subject).emit('agent/inbox/inserted', { message })
    expect(await enter(ctx, subject, [message])).toEqual({ kind: 'enter', messages: [message] })
  })

  it('drops bound context when downstream pre-step rejects the prompt', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const subject = agent(ctx)
    const bridge = new CanvasInteractionBridge(ctx, { get: () => currentCanvas() })
    bridge.stage(subject, { rpcId: 'rpc-a', context: sampled() })
    const message = prompt('rpc-a')
    agentEvents(ctx, subject).emit('agent/inbox/inserted', { message })

    const rejected = await agentEvents(ctx, subject).waterfall(
      'agent/pre-step',
      { messages: [message], turn: 1, step: 1, signal: new AbortController().signal },
      async () => ({ kind: 'reject' as const }),
    )
    expect(rejected).toEqual({ kind: 'reject' })
    expect(await enter(ctx, subject, [message])).toEqual({ kind: 'enter', messages: [message] })
  })

  it('re-evaluates revision drift when a queued prompt finally enters a step', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const subject = agent(ctx)
    let current: CanvasSnapshot | null = currentCanvas(1)
    const bridge = new CanvasInteractionBridge(ctx, { get: () => current })
    bridge.stage(subject, { rpcId: 'rpc-a', context: sampled(1) })
    const message = prompt('rpc-a')
    agentEvents(ctx, subject).emit('agent/inbox/inserted', { message })

    current = currentCanvas(2)
    const staleText = contextText(await enter(ctx, subject, [message]))
    expect(staleText).toContain('current workflow revision: 2')
    expect(staleText).toContain('context status: STALE')
  })

  it('keeps an admitted prompt usable when Canvas becomes unavailable before claim', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const subject = agent(ctx)
    let current: CanvasSnapshot | null = currentCanvas(1)
    const bridge = new CanvasInteractionBridge(ctx, { get: () => current })
    bridge.stage(subject, { rpcId: 'rpc-a', context: sampled(1) })
    const message = prompt('rpc-a')
    agentEvents(ctx, subject).emit('agent/inbox/inserted', { message })

    current = null
    const unavailable = contextText(await enter(ctx, subject, [message]))
    expect(unavailable).toContain('current workflow revision: unavailable')
    expect(unavailable).toContain('STALE/UNAVAILABLE')
  })
})