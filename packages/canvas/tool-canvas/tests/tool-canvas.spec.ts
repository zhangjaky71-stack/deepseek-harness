import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'

import * as tool from '../src/index.ts'

/** Parent Agent backed by a real Session; the Canvas tool owns no separate state. */
function agentWithSession(id = 'canvas-parent'): Agent & { session: Session } {
  const session = Session.create(SessionId(id))
  return { id: SessionId(id), session } as unknown as Agent & { session: Session }
}

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(tool)
  return ctx
}

let callCounter = 0
function callCanvas(
  ctx: Context,
  args: unknown,
  options: { agent?: Agent | undefined; signal?: AbortSignal } = {},
) {
  const agent = 'agent' in options ? options.agent : agentWithSession()
  return ctx.tools.execute({
    signal: options.signal ?? new AbortController().signal,
    callId: CallId(`canvas-call-${++callCounter}`),
    name: 'canvas',
    arguments: args,
    ...agent === undefined ? {} : { agent },
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

describe('dsh-tool-canvas', () => {
  it('registers the Phase 1 generate schema', async () => {
    const ctx = await setup()
    const schema = ctx.tools.schemas().find(candidate => candidate.name === 'canvas')
    expect(schema).toBeDefined()
    const properties = (schema!.parameters as { properties?: Record<string, { required?: boolean; enum?: string[] }> }).properties ?? {}
    expect(Object.keys(properties)).toEqual(['action', 'prompt', 'nodeId', 'model'])
    expect(properties.action?.required).toBe(true)
    expect(properties.action?.enum).toEqual(['generate'])
    expect(properties.prompt?.required).toBe(true)
  })

  it('appends one durable active-target command to the calling session', async () => {
    const ctx = await setup()
    const agent = agentWithSession('canvas-active')
    const result = await callCanvas(ctx, {
      action: 'generate',
      prompt: '  cinematic coffee poster  ',
      model: '  image-model-v1  ',
    }, { agent })

    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected canvas success')
    expect(result.value.accepted).toBe(true)
    expect(result.value.commandId).toMatch(/^canvas_/)
    expect(text(result)).toContain('Canvas queued generate command')

    const event = agent.session.events.findLast(candidate => candidate.type === 'canvas/command')
    expect(event?.data.command).toEqual({
      commandId: result.value.commandId,
      action: 'generate',
      prompt: 'cinematic coffee poster',
      target: { kind: 'active' },
      model: 'image-model-v1',
    })
  })

  it('addresses an explicit generator node after trimming the id', async () => {
    const ctx = await setup()
    const agent = agentWithSession('canvas-node')
    const result = await callCanvas(ctx, {
      action: 'generate',
      prompt: 'portrait',
      nodeId: '  gen-42  ',
    }, { agent })

    expect(result.isError).toBe(false)
    const event = agent.session.events.findLast(candidate => candidate.type === 'canvas/command')
    expect(event?.data.command.target).toEqual({ kind: 'node', nodeId: 'gen-42' })
    expect(event?.data.command.model).toBeUndefined()
  })

  it('rejects an empty prompt without appending a command', async () => {
    const ctx = await setup()
    const agent = agentWithSession('canvas-empty')
    const result = await callCanvas(ctx, { action: 'generate', prompt: '   ' }, { agent })
    expect(result.isError).toBe(true)
    expect(agent.session.events.some(candidate => candidate.type === 'canvas/command')).toBe(false)
  })

  it('treats blank optional strings as omitted', async () => {
    const ctx = await setup()
    const agent = agentWithSession('canvas-optionals')
    const result = await callCanvas(ctx, {
      action: 'generate',
      prompt: 'poster',
      nodeId: '   ',
      model: '   ',
    }, { agent })
    expect(result.isError).toBe(false)
    const event = agent.session.events.findLast(candidate => candidate.type === 'canvas/command')
    expect(event?.data.command.target).toEqual({ kind: 'active' })
    expect(event?.data.command.model).toBeUndefined()
  })

  it('requires the tool execution to carry an owning Agent', async () => {
    const ctx = await setup()
    const result = await callCanvas(ctx, { action: 'generate', prompt: 'poster' }, { agent: undefined })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('owning agent session')
  })

  it('does not append when the execution signal is already aborted', async () => {
    const ctx = await setup()
    const agent = agentWithSession('canvas-aborted')
    const controller = new AbortController()
    controller.abort()
    const result = await callCanvas(ctx, { action: 'generate', prompt: 'poster' }, {
      agent,
      signal: controller.signal,
    })
    expect(result.isError).toBe(true)
    expect(agent.session.events.some(candidate => candidate.type === 'canvas/command')).toBe(false)
  })
})
