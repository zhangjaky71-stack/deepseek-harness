/** Browser Canvas plugin: Host-capability-gated conversation view plus request-local interaction context. */

import type {
  CanvasCapabilities,
  CanvasInteractionDiscardReceipt,
  CanvasInteractionStageReceipt,
  CanvasSnapshot,
  DiscardCanvasInteractionRequest,
  StageCanvasInteractionRequest,
} from '@deepseek-ai/dsh-canvas/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
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

type RemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

/** Structural slice of the generated Canvas interaction Remote. */
interface CanvasInteractionRemote {
  stage(
    sessionId: SessionId,
    request: StageCanvasInteractionRequest,
  ): Promise<RemoteResult<CanvasInteractionStageReceipt>>
  discard(
    sessionId: SessionId,
    request: DiscardCanvasInteractionRequest,
  ): Promise<RemoteResult<CanvasInteractionDiscardReceipt>>
}

/** Deployment-global read-only Canvas capability Remote. */
interface CanvasFeatureRemote {
  get(): Promise<RemoteResult<CanvasCapabilities>>
}

interface RemoteRoot {
  readonly canvasFeatures: CanvasFeatureRemote
  readonly canvasInteraction: CanvasInteractionRemote
}

/** Required services before the plugin can await Host capability discovery. */
export const inject = ['slots', 'sessions', 'locale', 'conversation']

/** Register the Canvas conversation tab only after Host feature discovery succeeds. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-canvas: dictionaries')
  const t = ctx.locale.bind(NS)
  const modes = new CanvasModeStore()
  const interactions = new CanvasInteractionStore()

  // The Browser never guesses deployment capability. If the generated feature
  // Remote is missing, rejected, or disabled, no Canvas tab is registered.
  ctx.inject(['remote.canvasFeatures'], (featureCtx) => {
    const remote = featureCtx.get('remote') as RemoteRoot | undefined
    if (remote === undefined) throw new Error('ui-canvas: remote service unavailable after remote.canvasFeatures injection')
    let active = true
    featureCtx.effect(() => () => { active = false }, 'ui-canvas: capability request lifetime')
    void remote.canvasFeatures.get().then((result) => {
      if (!active) return
      if (!result.ok) {
        console.error(`[ui-canvas] capability discovery failed: ${result.error.code}: ${result.error.message}`)
        return
      }
      const capabilities = result.value
      if (!capabilities.canvas.enabled) return

      featureCtx.slots.inject('conversation.view', () => featureCtx.slots.register({
        name: 'conversation.view',
        id: 'canvas',
        order: 20,
        locale: NS,
        label: () => t('view.canvas'),
        inject: (sessionId: SessionId): CanvasViewInjected => {
          if (featureCtx.sessions.binding(sessionId)?.session === undefined) {
            throw new Error(`ui-canvas: session "${sessionId}" is unavailable`)
          }
          return {
            capabilities,
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

      // Interaction staging is subordinate to Canvas enablement but its Remote
      // readiness stays independent from Projection/view registration.
      featureCtx.inject(['remote.canvasInteraction'], (interactionCtx) => {
        const interactionRemote = interactionCtx.get('remote') as RemoteRoot | undefined
        if (interactionRemote === undefined) {
          throw new Error('ui-canvas: remote service unavailable after remote.canvasInteraction injection')
        }
        interactionCtx.effect(() => interactionCtx.conversation.registerPromptPreparation('canvas-interaction', (sessionId) => {
          const binding = interactionCtx.sessions.binding(sessionId)
          if (binding === undefined) return undefined
          const canvas = binding.session.projections.faceOf('canvas').getSnapshot() as CanvasSnapshot | null | undefined
          const context = buildCanvasInteractionContext(
            interactions.faceOf(sessionId).getSnapshot(),
            canvas,
            modes.faceOf(sessionId).getSnapshot(),
          )
          if (context === undefined) return undefined
          const effectiveContext = capabilities.regionEdit.enabled || context.region === undefined
            ? context
            : (() => {
                const { region: _region, ...withoutRegion } = context
                return withoutRegion
              })()
          return {
            prepare: async (rpcId) => {
              const staged = await interactionRemote.canvasInteraction.stage(sessionId, { rpcId, context: effectiveContext })
              if (!staged.ok) {
                throw new Error(`canvas interaction stage failed: ${staged.error.code}: ${staged.error.message}`)
              }
            },
            discard: async (rpcId) => {
              const discarded = await interactionRemote.canvasInteraction.discard(sessionId, { rpcId })
              if (!discarded.ok) {
                throw new Error(`canvas interaction discard failed: ${discarded.error.code}: ${discarded.error.message}`)
              }
            },
          }
        }), 'ui-canvas: prompt interaction context')
      })
    }, (error: unknown) => {
      if (!active) return
      console.error('[ui-canvas] capability discovery failed:', error)
    })
  })
}
