/** Browser Canvas plugin: capability-gated view, N11 Remote mutations, and request-local interaction context. */

import type {
  CanvasCapabilities,
  CanvasInteractionDiscardReceipt,
  CanvasInteractionStageReceipt,
  CanvasLayoutMutationReceipt,
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
import { CanvasView } from './CanvasView.tsx'
import { CanvasInteractionStore } from './interaction-store.ts'
import { buildCanvasInteractionContext } from './interaction.ts'
import { CanvasModeStore } from './mode-store.ts'
import { createCanvasEditorStore } from './store.ts'
import { en, NS, zh, type CanvasKey } from './locales.ts'
import type { CanvasLayoutWriteResult, CanvasViewInjected, CanvasWorkflowWriteResult } from '../types.ts'

export type * from '../types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { canvas: CanvasKey }
}

type RemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

interface CanvasInteractionRemote {
  stage(sessionId: SessionId, request: StageCanvasInteractionRequest): Promise<RemoteResult<CanvasInteractionStageReceipt>>
  discard(sessionId: SessionId, request: DiscardCanvasInteractionRequest): Promise<RemoteResult<CanvasInteractionDiscardReceipt>>
}
interface CanvasFeatureRemote { get(): Promise<RemoteResult<CanvasCapabilities>> }
interface CanvasMutationRemote {
  editWorkflow(sessionId: SessionId, ref: NonNullable<ReturnType<typeof workflowRef>>, operations: readonly WorkflowEditOperation[]): Promise<RemoteResult<CanvasWorkflowMutationReceipt>>
  saveLayout(sessionId: SessionId, request: SaveCanvasLayoutRequest): Promise<RemoteResult<CanvasLayoutMutationReceipt>>
}
interface RemoteRoot {
  readonly canvasFeatures: CanvasFeatureRemote
  readonly canvasInteraction: CanvasInteractionRemote
  readonly canvas: CanvasMutationRemote
}

export const inject = ['slots', 'sessions', 'locale', 'conversation']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-canvas: dictionaries')
  const t = ctx.locale.bind(NS)
  const modes = new CanvasModeStore()
  const interactions = new CanvasInteractionStore()

  ctx.inject(['remote.canvasFeatures'], (featureCtx) => {
    const root = featureCtx.get('remote') as RemoteRoot | undefined
    if (root === undefined) throw new Error('ui-canvas: remote service unavailable after remote.canvasFeatures injection')
    let active = true
    featureCtx.effect(() => () => { active = false }, 'ui-canvas: capability request lifetime')
    void root.canvasFeatures.get().then((result) => {
      if (!active) return
      if (!result.ok) { console.error(`[ui-canvas] capability discovery failed: ${result.error.code}: ${result.error.message}`); return }
      const capabilities = result.value
      if (!capabilities.canvas.enabled) return

      featureCtx.inject(['remote.canvas'], (canvasCtx) => {
        const remote = canvasCtx.get('remote') as RemoteRoot | undefined
        if (remote === undefined) throw new Error('ui-canvas: remote service unavailable after remote.canvas injection')
        canvasCtx.slots.inject('conversation.view', () => canvasCtx.slots.register({
          name: 'conversation.view',
          id: 'canvas',
          order: 20,
          locale: NS,
          label: () => t('view.canvas'),
          store: createCanvasEditorStore,
          inject: (sessionId: SessionId): CanvasViewInjected => {
            if (canvasCtx.sessions.binding(sessionId)?.session === undefined) throw new Error(`ui-canvas: session "${sessionId}" is unavailable`)
            return {
              capabilities,
              hooks: { mode: modes.faceOf(sessionId), interaction: interactions.faceOf(sessionId) },
              setMode: mode => { modes.set(sessionId, mode) },
              selectNode: (canvas, nodeId) => { interactions.selectNode(sessionId, canvas, nodeId) },
              selectNodes: (canvas, nodeIds) => { interactions.selectNodes(sessionId, canvas, nodeIds) },
              selectEdge: (canvas, edgeId) => { interactions.selectEdge(sessionId, canvas, edgeId) },
              selectEdges: (canvas, edgeIds) => { interactions.selectEdges(sessionId, canvas, edgeIds) },
              selectOutput: (canvas, assetIndex) => { interactions.selectOutput(sessionId, canvas, assetIndex) },
              setRegion: (canvas, region) => { interactions.setRegion(sessionId, canvas, region) },
              clearSelection: () => { interactions.clear(sessionId) },
              commitOperations: async (operations, expectedWorkflowRevision) =>
                commitOperations(canvasCtx, remote.canvas, sessionId, operations, expectedWorkflowRevision),
              saveLayout: async request => saveLayout(remote.canvas, sessionId, request),
            }
          },
        }, CanvasView))
      })

      featureCtx.inject(['remote.canvasInteraction'], (interactionCtx) => {
        const interactionRemote = interactionCtx.get('remote') as RemoteRoot | undefined
        if (interactionRemote === undefined) throw new Error('ui-canvas: remote service unavailable after remote.canvasInteraction injection')
        interactionCtx.effect(() => interactionCtx.conversation.registerPromptPreparation('canvas-interaction', (sessionId) => {
          const binding = interactionCtx.sessions.binding(sessionId)
          if (binding === undefined) return undefined
          const canvas = binding.session.projections.faceOf('canvas').getSnapshot() as CanvasSnapshot | null | undefined
          const context = buildCanvasInteractionContext(interactions.faceOf(sessionId).getSnapshot(), canvas, modes.faceOf(sessionId).getSnapshot())
          if (context === undefined) return undefined
          const effectiveContext = capabilities.regionEdit.enabled || context.region === undefined ? context : (() => { const { region: _region, ...withoutRegion } = context; return withoutRegion })()
          return {
            prepare: async (rpcId) => {
              const staged = await interactionRemote.canvasInteraction.stage(sessionId, { rpcId, context: effectiveContext })
              if (!staged.ok) throw new Error(`canvas interaction stage failed: ${staged.error.code}: ${staged.error.message}`)
            },
            discard: async (rpcId) => {
              const discarded = await interactionRemote.canvasInteraction.discard(sessionId, { rpcId })
              if (!discarded.ok) throw new Error(`canvas interaction discard failed: ${discarded.error.code}: ${discarded.error.message}`)
            },
          }
        }), 'ui-canvas: prompt interaction context')
      })
    }, (error: unknown) => { if (active) console.error('[ui-canvas] capability discovery failed:', error) })
  })
}

function currentCanvas(ctx: ClientContext, sessionId: SessionId): CanvasSnapshot | null | undefined {
  return ctx.sessions.binding(sessionId)?.session.projections.faceOf('canvas').getSnapshot() as CanvasSnapshot | null | undefined
}

function workflowRef(canvas: CanvasSnapshot | null | undefined) {
  if (canvas?.workflow === null || canvas?.workflow === undefined) return undefined
  return { canvasId: canvas.id, workflowId: canvas.workflow.id, workflowRevision: canvas.workflowRevision }
}

async function commitOperations(
  ctx: ClientContext,
  remote: CanvasMutationRemote,
  sessionId: SessionId,
  operations: readonly WorkflowEditOperation[],
  expectedWorkflowRevision: number,
): Promise<CanvasWorkflowWriteResult> {
  const canvas = currentCanvas(ctx, sessionId)
  const ref = workflowRef(canvas)
  if (ref === undefined) return { ok: false, status: 'save-failed', message: '当前没有可编辑的工作流' }
  if (ref.workflowRevision !== expectedWorkflowRevision) return { ok: false, status: 'conflict', message: '工作流已被其他修改更新' }
  try {
    const result = await remote.editWorkflow(sessionId, ref, operations)
    if (!result.ok) return result.error.code === 'CANVAS_STALE_WORKFLOW_REVISION'
      ? { ok: false, status: 'conflict', message: result.error.message }
      : { ok: false, status: 'save-failed', message: result.error.message }
    return { ok: true, workflowRevision: result.value.ref.workflowRevision }
  } catch (error) {
    return { ok: false, status: 'offline', message: error instanceof Error ? error.message : String(error) }
  }
}

async function saveLayout(remote: CanvasMutationRemote, sessionId: SessionId, request: SaveCanvasLayoutRequest): Promise<CanvasLayoutWriteResult> {
  try {
    const result = await remote.saveLayout(sessionId, request)
    if (!result.ok) return { ok: false, status: 'save-failed', message: result.error.message }
    return { ok: true }
  } catch (error) {
    return { ok: false, status: 'offline', message: error instanceof Error ? error.message : String(error) }
  }
}
