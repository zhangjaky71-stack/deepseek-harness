/** Session-native Canvas main surface: Minimal result view and semantic Workflow Editor over one Projection. */

import { useEffect } from 'react'
import type { CanvasAssetRef, CanvasSnapshot, MediaWorkflow } from '@deepseek-ai/dsh-canvas/client'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { CanvasInteractionSelection, CanvasMode, CanvasSaveStatus, CanvasViewInjected } from '../types.ts'
import { deriveCanvasPresentation } from './state.ts'
import { interactionForCanvas } from './interaction.ts'
import { createCanvasEditorStore, type CanvasEditorOwner } from './store.ts'
import { WorkflowEditor } from './WorkflowEditor.tsx'
import css from './CanvasView.module.css'

type EditableCanvasSnapshot = CanvasSnapshot & { readonly workflow: MediaWorkflow }
export type CanvasViewProps = PropsRuntime<'shell.main'> & InjectFace<CanvasViewInjected> & PropsLocale<'canvas'> & PropsStore<ReturnType<typeof createCanvasEditorStore>>
function hasWorkflow(canvas: CanvasSnapshot | null): canvas is EditableCanvasSnapshot { return canvas !== null && canvas.workflow !== null }

function editorOwnerOf(canvas: CanvasSnapshot | null | undefined): CanvasEditorOwner | null | undefined {
  if (canvas === undefined) return undefined
  if (!hasWorkflow(canvas)) return null
  return { canvasId: canvas.id, canvasCreatedAt: canvas.createdAt, workflowId: canvas.workflow.id }
}

function sameEditorOwner(left: CanvasEditorOwner | null, right: CanvasEditorOwner | null): boolean {
  if (left === null || right === null) return left === right
  return left.canvasId === right.canvasId
    && left.canvasCreatedAt === right.canvasCreatedAt
    && left.workflowId === right.workflowId
}

export function CanvasView({
  useSession, useProjection, useMode, useInteraction, useStore, actions, capabilities, editorReady, nodeCatalog, setMode,
  selectNode, selectNodes, selectEdge, selectOutput, clearSelection, commitOperations, saveLayout, t,
}: CanvasViewProps) {
  const projectedCanvas = useProjection('canvas')
  const layout = useProjection('canvasLayout')
  const openState = useSession(session => session.openState)
  const mode = useMode(value => value)
  const rawInteraction = useInteraction(value => value)
  const interaction = interactionForCanvas(rawInteraction, projectedCanvas)
  const editorOwner = useStore(state => state.owner)
  const saveStatus = useStore(state => state.saveStatus)
  const projectedOwner = editorOwnerOf(projectedCanvas)
  const ownerReady = projectedOwner !== undefined && sameEditorOwner(editorOwner, projectedOwner)
  const editorAvailable = capabilities.editor.enabled && editorReady
  const effectiveMode: CanvasMode = editorAvailable ? mode : 'minimal'

  useEffect(() => {
    if (projectedOwner === undefined || sameEditorOwner(editorOwner, projectedOwner)) return
    actions.resetGeneration(projectedOwner)
  }, [actions, editorOwner, projectedOwner])

  // Release a stale selection after clear/re-create or workflow replacement. The
  // pure read path already masks it synchronously, so no stale frame is rendered.
  useEffect(() => {
    if (rawInteraction.anchor !== undefined && interaction !== rawInteraction && projectedCanvas !== undefined) clearSelection()
  }, [clearSelection, interaction, projectedCanvas, rawInteraction])

  return <section className={css.root} aria-label={t('view.canvas')}>
    <div className={css.toolbar}>
      {editorAvailable && <div className={css.modeSwitch} role="group" aria-label={t('mode.aria')}>
        <button type="button" className={effectiveMode === 'minimal' ? css.modeActive : css.modeButton} aria-pressed={effectiveMode === 'minimal'} onClick={() => { setMode('minimal') }}>{t('mode.minimal')}</button>
        <button type="button" className={effectiveMode === 'editor' ? css.modeActive : css.modeButton} aria-pressed={effectiveMode === 'editor'} onClick={() => { setMode('editor') }}>{t('mode.editor')}</button>
      </div>}
      {capabilities.editor.enabled && !editorReady && <span className={css.saveStatus}>{t('editor.catalogUnavailable')}</span>}
      <SaveStatus status={saveStatus} t={t} />
    </div>
    {projectedCanvas === undefined
      ? <div className={css.loading} role="status">{t(openState === 'cold' || openState === 'loading' ? 'projection.loading' : 'projection.unavailable')}</div>
      : effectiveMode === 'minimal'
        ? <MinimalCanvas canvas={projectedCanvas} interaction={interaction} onSelectOutput={selectOutput} t={t} />
        : !hasWorkflow(projectedCanvas)
          ? <div className={css.loading}>{t('editor.noWorkflow')}</div>
          : !ownerReady
            ? <div className={css.loading} role="status">{t('editor.preparing')}</div>
            : layout === undefined
              ? <div className={css.loading} role="status">{t('projection.layoutLoading')}</div>
              : <WorkflowEditor canvas={projectedCanvas} layout={layout} capabilities={capabilities} nodeCatalog={nodeCatalog} interaction={interaction}
                  onSelectNode={selectNode} onSelectNodes={selectNodes} onSelectEdge={selectEdge} onClearSelection={clearSelection}
                  commitOperations={commitOperations} saveLayout={saveLayout} useStore={useStore} actions={actions} t={t} />}
  </section>
}

interface BodyProps { readonly canvas: CanvasSnapshot | null; readonly interaction?: CanvasInteractionSelection; readonly onSelectOutput?: (canvas: CanvasSnapshot, assetIndex: number) => void; readonly t: CanvasViewProps['t'] }
export function MinimalCanvas({ canvas, interaction, onSelectOutput, t }: BodyProps) {
  const presentation = deriveCanvasPresentation(canvas)
  return <div className={css.minimal} data-canvas-state={presentation.state}>
    <StateCard canvas={canvas} t={t} /><PrimaryAction state={presentation.state} action={presentation.primaryAction} t={t} />
    {presentation.staleOutput && <p className={css.dirtyNotice}>{t('state.DIRTY_READY.body')}</p>}
    <section className={css.outputSection} aria-label={t('minimal.output')}><h3>{t('minimal.output')}</h3>
      {presentation.showOutput && canvas?.output !== null ? <OutputGrid canvas={canvas} interaction={interaction} onSelectOutput={onSelectOutput} t={t} /> : <div className={css.emptyOutput}>{t('minimal.emptyOutput')}</div>}
    </section>
  </div>
}
function StateCard({ canvas, t }: Pick<BodyProps, 'canvas' | 't'>) {
  const { state } = deriveCanvasPresentation(canvas); const runError = canvas?.run?.error
  return <div className={css.stateCard} role="status" aria-live="polite"><strong>{t(`state.${state}.title`)}</strong><span>{t(`state.${state}.body`)}</span>{runError !== undefined && <small>{runError.message}</small>}</div>
}
function PrimaryAction({ state, action, t }: { readonly state: ReturnType<typeof deriveCanvasPresentation>['state']; readonly action: ReturnType<typeof deriveCanvasPresentation>['primaryAction']; readonly t: CanvasViewProps['t'] }) {
  if (action === 'none') return null
  const key = action === 'cancel' ? 'action.cancel' : action === 'retry' ? 'action.retry' : 'action.run'
  return <button type="button" className={action === 'cancel' ? css.cancelAction : css.primaryAction} disabled title={t('action.unavailable')} data-canvas-action={action} data-canvas-state={state}>{t(key)}</button>
}
function OutputGrid({ canvas, interaction, onSelectOutput, t }: { readonly canvas: CanvasSnapshot; readonly interaction?: CanvasInteractionSelection; readonly onSelectOutput?: (canvas: CanvasSnapshot, assetIndex: number) => void; readonly t: CanvasViewProps['t'] }) {
  const output = canvas.output; if (output === null) return null
  return <div className={css.outputGrid}>{output.assets.map((asset, index) => <AssetCard key={asset.kind === 'image' ? asset.image.attachmentId : asset.video.assetId} asset={asset} primary={index === output.primaryAssetIndex} selected={interaction?.focusedOutput?.runId === output.runId && interaction?.focusedOutput?.assetIndex === index} onSelect={onSelectOutput === undefined ? undefined : () => { onSelectOutput(canvas, index) }} t={t} />)}</div>
}
function AssetCard({ asset, primary, selected, onSelect, t }: { readonly asset: CanvasAssetRef; readonly primary: boolean; readonly selected: boolean; readonly onSelect?: () => void; readonly t: CanvasViewProps['t'] }) {
  const media = asset.kind === 'image' ? asset.image : asset.video; const dimensions = media.width !== undefined && media.height !== undefined ? `${media.width} × ${media.height}` : media.mediaType
  return <button type="button" className={css.assetCard} aria-pressed={selected} data-selected={selected ? 'true' : 'false'} disabled={onSelect === undefined} onClick={onSelect}><div className={css.assetGlyph} aria-hidden="true">{asset.kind === 'image' ? '▧' : '▶'}</div><div><strong>{t(asset.kind === 'image' ? 'asset.image' : 'asset.video')}</strong><span>{dimensions}</span></div>{primary && <em>{t('asset.primary')}</em>}</button>
}
export function SaveStatus({ status, t }: { readonly status: CanvasSaveStatus; readonly t: CanvasViewProps['t'] }) { return <span className={css.saveStatus} data-save-status={status}>{t(`save.${status}`)}</span> }
export function normalizeCanvasMode(value: string): CanvasMode { return value === 'editor' ? 'editor' : 'minimal' }
