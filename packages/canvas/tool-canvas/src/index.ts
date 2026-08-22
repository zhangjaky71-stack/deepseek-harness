/** Model-facing Canvas command tool. It logs high-level orchestration intent; Infinite Canvas owns execution. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { CanvasCommandId, CanvasGenerateCommand } from './types.ts'
export type * from './types.ts'

export const name = 'tool-canvas'
export const inject = ['tools']

/** No deployment configuration is required for the Phase 1 command bridge. */
export interface Config {}

function normalizedRequired(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`canvas requires a non-empty ${label}`)
  return normalized
}

function normalizedOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  return normalized.length === 0 ? undefined : normalized
}

/** Register the high-level `canvas` tool. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'canvas',
    description: 'Send a high-level image-generation command to the user-visible Infinite Canvas in the Web app. The browser must have a classic canvas open; Canvas remains authoritative for model/provider execution.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['generate'],
        description: 'Canvas action. Phase 1 currently supports generate.',
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'Generation prompt to place into a prompt node feeding the Canvas image generator.',
      },
      nodeId: {
        type: 'string',
        description: 'Optional existing Canvas image-generator node id. Omit to use the selected generator or create a prompt + generator pair.',
      },
      model: {
        type: 'string',
        description: 'Optional Canvas image model id. Canvas validates the provider/model combination when it executes.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          accepted: { type: 'boolean', required: true },
          commandId: { type: 'string', required: true },
          action: { type: 'string', required: true, enum: ['generate'] },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Canvas queued ${value.action} command ${value.commandId}.`,
      }],
    },
    execute(args, exec) {
      exec.signal.throwIfAborted()
      if (!exec.agent) throw new Error('canvas requires an owning agent session')
      const prompt = normalizedRequired(args.prompt, 'prompt')
      const nodeId = normalizedOptional(args.nodeId)
      const model = normalizedOptional(args.model)
      const commandId = `canvas_${randomUUID()}` as CanvasCommandId
      const command: CanvasGenerateCommand = {
        commandId,
        action: 'generate',
        prompt,
        target: nodeId === undefined
          ? { kind: 'active' }
          : { kind: 'node', nodeId },
        ...(model === undefined ? {} : { model }),
      }
      exec.signal.throwIfAborted()
      exec.agent.session.append('canvas/command', { command })
      return Promise.resolve({ accepted: true as const, commandId, action: command.action })
    },
    presentCall: args => ({
      card: 'generic',
      title: 'Canvas command',
      kind: 'other',
      rawInput: args,
    }),
  }))
}
