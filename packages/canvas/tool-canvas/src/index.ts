/** Model-facing Canvas command tool. It logs high-level orchestration intent; Infinite Canvas owns execution. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { CanvasCommandId } from './types.ts'
import type { CanvasGenerateCommand } from './types.ts'
export type * from './types.ts'

export const name = 'tool-canvas'
export const inject = ['tools']

/** No deployment configuration is required for the Phase 1 command bridge. */
export interface Config {}

function normalizedPrompt(value: string): string {
  const prompt = value.trim()
  if (prompt.length === 0) throw new Error('canvas requires a non-empty prompt')
  return prompt
}

/** Register the high-level `canvas` tool. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'canvas',
    description: 'Send a high-level command to the user-visible Infinite Canvas. Phase 1 supports image generation through the Canvas workflow runtime.',
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
        description: 'Generation prompt to place into the Canvas workflow.',
      },
      nodeId: {
        type: 'string',
        description: 'Optional existing Canvas generator node id. Omit to create an active generator workflow.',
      },
      model: {
        type: 'string',
        description: 'Optional Canvas model id.',
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
        text: `Canvas accepted ${value.action} command ${value.commandId}.`,
      }],
    },
    execute(args, exec) {
      if (!exec.agent) throw new Error('canvas requires an owning agent session')
      const commandId = CanvasCommandId(`canvas_${randomUUID()}`)
      const command: CanvasGenerateCommand = {
        commandId,
        action: 'generate',
        prompt: normalizedPrompt(args.prompt),
        target: args.nodeId === undefined
          ? { kind: 'active' }
          : { kind: 'node', nodeId: args.nodeId },
        ...(args.model === undefined ? {} : { model: args.model }),
      }
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
