/** Browser Canvas plugin: dynamic main surface, graceful capability degradation, Remote mutations, and request-local interaction context. */

import type {
  CanvasCapabilities,
  CanvasInteractionDiscardReceipt,
  CanvasInteractionStageReceipt,
  CanvasLayoutMutationReceipt,
  CanvasNodeCatalogEntry,
  CanvasSnapshot,
  CanvasWorkflowMutationReceipt,
  DiscardCanvasInteractionRequest,
  SaveCanvasLayoutRequest,
  StageCanvasInteractionRequest,
  WorkflowEditOperation,
} from '@deepseek-ai/dsh-canvas/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-canvas/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { CanvasView } from './CanvasView.tsx'
import { CanvasInteractionStore } from './interaction-store.ts'
import { buildCanvasInteractionContext } from './interaction.ts'
import { CanvasModeStore } from './mode-store.ts'
import { createCanvasEditorStore } from './store.ts'
import { en, NS, zh, type CanvasKey } from './locales.ts'
import type { CanvasLayoutWriteResult, CanvasViewInjected, CanvasWorkflowWriteResult } from '../types.ts'

export type * from '../types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { canvas: CanvasKey } }

type RemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

interface CanvasInteractionRemote {
  stage(sessionId: SessionId, request: StageCanvasInteractionRequest): Promise<RemoteResult<CanvasInteractionStageReceipt>>
  discard(sessionId: SessionId, request: DiscardCanvasInteractionRequest): Promise<RemoteResult<CanvasInteractionDiscardReceipt>>
}
interface CanvasFeatureRemote {
  get(): Promise<RemoteResult<CanvasCapabilities>>
  listNodes(): Promise<RemoteResult<readonly CanvasNodeCatalogEntry[]>>
}
interface CanvasMutationRemote {
  editWorkflow(sessionId: SessionId, ref: NonNullable<ReturnType<typeof workflowRef>>, operations: readonly WorkflowEditOperation[]): Promise<RemoteResult<CanvasWorkflowMutationReceipt>>
  saveLayout(sessionId: SessionId, request: SaveCanvasLayoutRequest): Promise<RemoteResult<CanvasLayoutMutationReceipt>>
}
interface RemoteRoot {
  readonly canvasFeatures?: CanvasFeatureRemote
  readonly canvasInteraction?: CanvasInteractionRemote
  readonly canvas?: CanvasMutationRemote
}

export const inject = ['slots', 'sessions', 'locale', 'conversation']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-canvas: dictionaries')
  const modes = new CanvasModeStore()
  const interactions = new CanvasInteractionStore()

  // Mode and interaction rows deliberately survive view remounts, but not a
  // Session leaving the client catalog or a plugin/HMR replacement.
  ctx.effect(() => {
    const prune = () => {
      const snapshot = ctx.sessions.getListSnapshot()
      const live = new Set<SessionId>(snapshot.items.map(item => item.sessionId))
      if (snapshot.current !== undefined) live.add(snapshot.current)
      modes.prune(live)
      interactions.prune(live)
    }
    const off = ctx.sessions.subscribe(prune)
    prune()
    return () => {
      off()
      modes.clearAll()
      interactions.clearAll()
    }
  }, 'ui-canvas: local session-state lifetime')

  ctx.inject(['remote.canvasFeatures'], (featureCtx) => {
    const featureRemote = (featureCtx.get('remote') as RemoteRoot | undefined)?.canvasFeatures
    if (featureRemote === undefined) throw new Error('ui-canvas: canvasFeatures unavailable after remote.canvasFeatures injection')
    let active = true
    let mutationRemote: CanvasMutationRemote | undefined
    featureCtx.effect(() => () => { active = false }, 'ui-canvas: capability request lifetime')

    // Mutation availability is optional for rendering. Minimal remains readable
    // from Session Projection while this service is absent or reconnecting.
    featureCtx.inject(['remote.canvas'], (mutationCtx) => {
      const remote = (mutationCtx.get('remote') as RemoteRoot | undefined)?.canvas
      if (remote === undefined) throw new Error('ui-canvas: Canvas mutation Remote unavailable after remote.canvas injection')
      mutationRemote = remote
      mutationCtx.effect(() => () => {
        if (mutationRemote === remote) mutationRemote = undefined
      }, 'ui-canvas: mutation Remote lifetime')
    })

    void (async () => {
      try {
        const result = await featureRemote.get()
        if (!active) return
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
        const capabilities = result.value
        if (!capabilities.canvas.enabled) return

        let nodeCatalog: readonly CanvasNodeCatalogEntry[] = []
        let editorReady = capabilities.editor.enabled
        if (capabilities.editor.enabled) {
          try {
            const catalog = await featureRemote.listNodes()
            if (!catalog.ok) throw new Error(`${catalog.error.code}: ${catalog.error.message}`)
            nodeCatalog = catalog.value
          } catch (error) {
            editorReady = false
            console.error('[ui-canvas] node catalog discovery failed; Editor disabled:', error)
          }
        }
        if (!active) return

        // Desktop/main Canvas ownership lives here, not in ui-layout. The slot
        // contribution disappears with this plugin or the shell declaration.
        featureCtx.slots.inject('shell.main', () => featureCtx.slots.register({
          name: 'shell.main', locale: NS, store: createCanvasEditorStore,
          inject: (sessionId: SessionId): CanvasViewInjected => {
            if (featureCtx.sessions.binding(sessionId)?.session === undefined) throw new Error(`ui-canvas: session "${sessionId}" is unavailable`)
            return {
              capabilities, editorReady, nodeCatalog,
              hooks: { mode: modes.faceOf(sessionId), interaction: interactions.faceOf(sessionId) },
              setMode: mode => { modes.set(sessionId, mode) },
              selectNode: (canvas, nodeId) => { interactions.selectNode(sessionId, canvas, nodeId) },
              selectNodes: (canvas, nodeIds) => { interactions.selectNodes(sessionId, canvas, nodeIds) },
              selectEdge: (canvas, edgeId) => { interactions.selectEdge(sessionId, canvas, edgeId) },
              selectEdges: (canvas, edgeIds) => { interactions.selectEdges(sessionId, canvas, edgeIds) },
              selectOutput: (canvas, assetIndex) => { interactions.selectOutput(sessionId, canvas, assetIndex) },
              setRegion: (canvas, region) => { interactions.setRegion(sessionId, canvas, region) },
              clearSelection: () => { interactions.clear(sessionId) },
              commitOperations: async (operations, expectedWorkflowRevision) => commitOperations(featureCtx, mutationRemote, sessionId, operations, expectedWorkflowRevision),
              saveLayout: async request => saveLayout(mutationRemote, sessionId, request),
            }
          },
        }, CanvasView))

        featureCtx.inject(['remote.canvasInteraction'], (interactionCtx) => {
          const interactionRemote = (interactionCtx.get('remote') as RemoteRoot | undefined)?.canvasInteraction
          if (interactionRemote === undefined) throw new Error('ui-canvas: interaction Remote unavailable after remote.canvasInteraction injection')
          interactionCtx.effect(() => interactionCtx.conversation.registerPromptPreparation('canvas-interaction', (sessionId) => {
            const binding = interactionCtx.sessions.binding(sessionId)
            if (binding === undefined) return undefined
            const canvas = binding.session.projections.faceOf('canvas').getSnapshot() as CanvasSnapshot | null | undefined
            const context = buildCanvasInteractionContext(interactions.faceOf(sessionId).getSnapshot(), canvas, modes.faceOf(sessionId).getSnapshot())
            if (context === undefined) return undefined
            const effectiveContext = capabilities.regionEdit.enabled || context.region === undefined ? context : (() => { const { region: _region, ...withoutRegion } = context; return withoutRegion })()
            return {
              prepare: async (rpcId) => {
                const staged = await interactionRemote.stage(sessionId, { rpcId, context: effectiveContext })
                if (!staged.ok) throw new Error(`canvas interaction stage failed: ${staged.error.code}`)
              },
              discard: async (rpcId) => {
                const discarded = await interactionRemote.discard(sessionId, { rpcId })
                if (!discarded.ok) throw new Error(`canvas interaction discard failed: ${discarded.error.code}`)
              },
            }
          }), 'ui-canvas: prompt interaction context')
        })
      } catch (error) {
        if (active) console.error('[ui-canvas] capability discovery failed:', error)
      }
    })()
  })
}

function currentCanvas(ctx: ClientContext, sessionId: SessionId): CanvasSnapshot | null | undefined {
  return ctx.sessions.binding(sessionId)?.session.projections.faceOf('canvas').getSnapshot() as CanvasSnapshot | null | undefined
}
function workflowRef(canvas: CanvasSnapshot | null | undefined) {
  if (canvas?.workflow === null || canvas?.workflow === undefined) return undefined
  return { canvasId: canvas.id, workflowId: canvas.workflow.id, workflowRevision: canvas.workflowRevision }
}
async function commitOperations(ctx: ClientContext, remote: CanvasMutationRemote | undefined, sessionId: SessionId, operations: readonly WorkflowEditOperation[], expectedWorkflowRevision: number): Promise<CanvasWorkflowWriteResult> {
  const ref = workflowRef(currentCanvas(ctx, sessionId))
  if (ref === undefined) return { ok: false, status: 'save-failed', message: 'CANVAS_NO_EDITABLE_WORKFLOW' }
  if (ref.workflowRevision !== expectedWorkflowRevision) return { ok: false, status: 'conflict', message: 'CANVAS_LOCAL_WORKFLOW_REVISION_CONFLICT' }
  if (remote === undefined) return { ok: false, status: 'offline', message: 'CANVAS_MUTATION_REMOTE_UNAVAILABLE' }
  try {
    const result = await remote.editWorkflow(sessionId, ref, operations)
    if (!result.ok) return result.error.code === 'CANVAS_STALE_WORKFLOW_REVISION'
      ? { ok: false, status: 'conflict', message: result.error.code }
      : { ok: false, status: 'save-failed', message: result.error.code }
    return { ok: true, workflowRevision: result.value.ref.workflowRevision }
  } catch {
    return { ok: false, status: 'offline', message: 'CANVAS_MUTATION_TRANSPORT_ERROR' }
  }
}
async function saveLayout(remote: CanvasMutationRemote | undefined, sessionId: SessionId, request: SaveCanvasLayoutRequest): Promise<CanvasLayoutWriteResult> {
  if (remote === undefined) return { ok: false, status: 'offline', message: 'CANVAS_MUTATION_REMOTE_UNAVAILABLE' }
  try {
    const result = await remote.saveLayout(sessionId, request)
    if (!result.ok) return result.error.code === 'CANVAS_STALE_LAYOUT_REVISION'
      || result.error.code === 'CANVAS_LAYOUT_CANVAS_MISMATCH'
      || result.error.code === 'CANVAS_LAYOUT_WORKFLOW_MISMATCH'
      ? { ok: false, status: 'conflict', message: result.error.code }
      : { ok: false, status: 'save-failed', message: result.error.code }
    return { ok: true, layoutRevision: result.value.layoutRevision }
  } catch {
    return { ok: false, status: 'offline', message: 'CANVAS_MUTATION_TRANSPORT_ERROR' }
  }
}
