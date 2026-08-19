/** Browser Canvas plugin: one conversation view over Session Projection. */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-canvas/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { CanvasView } from './CanvasView.tsx'
import { CanvasModeStore } from './mode-store.ts'
import { en, NS, zh, type CanvasKey } from './locales.ts'
import type { CanvasViewInjected } from '../types.ts'

export { CanvasView, MinimalCanvas, WorkflowEditorShell, SaveStatus } from './CanvasView.tsx'
export { CanvasModeStore } from './mode-store.ts'
export { canvasPrimaryAction, deriveCanvasPresentation } from './state.ts'
export type * from '../types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Canvas view shell and product-state copy. */
    canvas: CanvasKey
  }
}

/** Required services: conversation view slot, Session projection binding, and locale. */
export const inject = ['slots', 'sessions', 'locale']

/** Register the Canvas conversation tab. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-canvas: dictionaries')
  const t = ctx.locale.bind(NS)
  const modes = new CanvasModeStore()

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
        hooks: { mode: modes.faceOf(sessionId) },
        setMode: mode => { modes.set(sessionId, mode) },
      }
    },
  }, CanvasView))
}
