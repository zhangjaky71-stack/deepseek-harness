/** Browser Canvas plugin: one conversation view over Session Projection plus request-local interaction context. */

import type { CanvasSnapshot } from '@deepseek-ai/dsh-canvas/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-canvas/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { CanvasView } from './CanvasView.tsx'
import { CanvasInteractionStore } from './interaction-store.ts'
import { buildCanvasInteractionContext } from './interaction.ts'
import { CanvasModeStore } from './mode-store.ts'
import { en, NS, zh, type CanvasKey } from './locales.ts'
import type { CanvasViewInjected } from '../types.ts'

export { CanvasView, MinimalCanvas, WorkflowEditorShell, SaveStatus } from './CanvasView.tsx'
export { CanvasInteractionStore } from './interaction-store.ts'
export { buildCanvasInteractionContext, hasCanvasInteractionTarget } from './interaction.ts'
export { CanvasModeStore } from './mode-store.ts'
export { canvasPrimaryAction, deriveCanvasPresentation } from './state.ts'
export type * from '../types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Canvas view shell and product-state copy. */
    canvas: CanvasKey
  }
}

/** Required services: conversation view/input, Session projections, Remote bridge, and locale. */
export const inject = [
  'slots',
  'sessions',
  'locale',
  'conversation',
  'remote',
  'remote.canvasInteraction',
]

/** Register the Canvas conversation tab and one-shot prompt-context provider. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-canvas: dictionaries')
  const t = ctx.locale.bind(NS)
  const modes = new CanvasModeStore()
  const interactions = new CanvasInteractionStore()

  ctx.effect(() => ctx.conversation.registerPromptPreparation('canvas-interaction', (sessionId) => {
    const binding = ctx.sessions.binding(sessionId)
    if (binding === undefined) return undefined
    const canvas = binding.session.projections.faceOf('canvas').getSnapshot() as CanvasSnapshot | null | undefined
    const context = buildCanvasInteractionContext(
      interactions.faceOf(sessionId).getSnapshot(),
      canvas,
      modes.faceOf(sessionId).getSnapshot(),
    )
    if (context === undefined) return undefined
    return {
      prepare: async (rpcId) => {
        const result = await ctx.remote.canvasInteraction.stage(sessionId, { rpcId, context })
        if (!result.ok) {
          throw new Error(`canvas interaction stage failed: ${result.error.code}: ${result.error.message}`)
        }
      },
      discard: async (rpcId) => {
        const result = await ctx.remote.canvasInteraction.discard(sessionId, { rpcId })
        if (!result.ok) {
          throw new Error(`canvas interaction discard failed: ${result.error.code}: ${result.error.message}`)
        }
      },
    }
  }), 'ui-canvas: prompt interaction context')

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'canvas',
    order: 20,
    locale: NS,
    label: () => t('view.canvas'),
    inject: (sessionId: SessionId): CanvasViewInjected => {
      if (ctx.sessions.binding(sessionId)?.session === undefined) {
        throw new Error(`ui-canvas: session "${sessionId}" is unavailable`)
      }
      return {
        hooks: {
          mode: modes.faceOf(sessionId),
          interaction: interactions.faceOf(sessionId),
        },
        setMode: mode => { modes.set(sessionId, mode) },
        selectNode: (canvas, nodeId) => { interactions.selectNode(sessionId, canvas, nodeId) },
        selectEdge: (canvas, edgeId) => { interactions.selectEdge(sessionId, canvas, edgeId) },
        selectOutput: (canvas, assetIndex) => { interactions.selectOutput(sessionId, canvas, assetIndex) },
        setRegion: (canvas, region) => { interactions.setRegion(sessionId, canvas, region) },
        clearSelection: () => { interactions.clear(sessionId) },
      }
    },
  }, CanvasView))
}
