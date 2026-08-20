/** Canvas conversation view: Minimal result surface and N11 semantic Workflow Editor over one Projection. */

import type { CanvasAssetRef, CanvasSnapshot, MediaWorkflow } from '@deepseek-ai/dsh-canvas/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { CanvasInteractionSelection, CanvasMode, CanvasSaveStatus, CanvasViewInjected } from '../types.ts'
import { deriveCanvasPresentation } from './state.ts'
import { createCanvasEditorStore } from './store.ts'
import { WorkflowEditor } from './WorkflowEditor.tsx'
import css from './CanvasView.module.css'

type EditableCanvasSnapshot = CanvasSnapshot & { readonly workflow: MediaWorkflow }

/** Full Canvas view props composed by the conversation slot. */
export type CanvasViewProps = ConvViewProps
  & InjectFace<CanvasViewInjected>
  & PropsLocale<'canvas'>
  & PropsStore<ReturnType<typeof createCanvasEditorStore>>

/** Narrow one projected Canvas to the semantic Editor precondition. */
function hasWorkflow(canvas: CanvasSnapshot | null): canvas is EditableCanvasSnapshot {
  return canvas !== null && canvas.workflow !== null
}

/** Canvas tab root. Current business state comes only from Session Projection. */
export function CanvasView({
  useProjection, useMode, useInteraction, useStore, actions, capabilities, setMode,
  selectNode, selectNodes, selectEdge, selectOutput, clearSelection, commitOperations, saveLayout, t,
}: CanvasViewProps) {
  const projectedCanvas = useProjection('canvas')
  const layout = useProjection('canvasLayout')
  const mode = useMode(value => value)
  const interaction = useInteraction(value => value)
  const saveStatus = useStore(state => state.saveStatus)
  const effectiveMode: CanvasMode = capabilities.editor.enabled ? mode : 'minimal'

  return (
    <section className={css.root} aria-label={t('view.canvas')}>
      <div className={css.toolbar}>
        {capabilities.editor.enabled && <div className={css.modeSwitch} role="group" aria-label={t('mode.aria')}>
          <button type="button" className={effectiveMode === 'minimal' ? css.modeActive : css.modeButton} aria-pressed={effectiveMode === 'minimal'} onClick={() => { setMode('minimal') }}>{t('mode.minimal')}</button>
          <button type="button" className={effectiveMode === 'editor' ? css.modeActive : css.modeButton} aria-pressed={effectiveMode === 'editor'} onClick={() => { setMode('editor') }}>{t('mode.editor')}</button>
        </div>}
        <SaveStatus status={saveStatus} t={t} />
      </div>

      {projectedCanvas === undefined
        ? <div className={css.loading} role="status">{t('projection.loading')}</div>
        : effectiveMode === 'minimal'
          ? <MinimalCanvas canvas={projectedCanvas} interaction={interaction} onSelectOutput={selectOutput} t={t} />
          : !hasWorkflow(projectedCanvas)
            ? <div className={css.loading}>{t('editor.noWorkflow')}</div>
            : <WorkflowEditor
                canvas={projectedCanvas}
                layout={layout ?? null}
                capabilities={capabilities}
                interaction={interaction}
                onSelectNode={selectNode}
                onSelectNodes={selectNodes}
                onSelectEdge={selectEdge}
                onClearSelection={clearSelection}
                commitOperations={commitOperations}
                saveLayout={saveLayout}
                useStore={useStore}
                actions={actions}
                t={t}
              />}
    </section>
  )
}

interface BodyProps {
  readonly canvas: CanvasSnapshot | null
  readonly interaction?: CanvasInteractionSelection
  readonly onSelectOutput?: (canvas: CanvasSnapshot, assetIndex: number) => void
  readonly t: CanvasViewProps['t']
}

/** Minimal mode: product state plus generated result only; no DAG detail. */
export function MinimalCanvas({ canvas, interaction, onSelectOutput, t }: BodyProps) {
  const presentation = deriveCanvasPresentation(canvas)
  return <div className={css.minimal} data-canvas-state={presentation.state}>
    <StateCard canvas={canvas} t={t} />
    <PrimaryAction state={presentation.state} action={presentation.primaryAction} t={t} />
    {presentation.staleOutput && <p className={css.dirtyNotice}>{t('state.DIRTY_READY.body')}</p>}
    <section className={css.outputSection} aria-label={t('minimal.output')}>
      <h3>{t('minimal.output')}</h3>
      {presentation.showOutput && canvas?.output !== null
        ? <OutputGrid canvas={canvas} interaction={interaction} onSelectOutput={onSelectOutput} t={t} />
        : <div className={css.emptyOutput}>{t('minimal.emptyOutput')}</div>}
    </section>
  </div>
}

function StateCard({ canvas, t }: Pick<BodyProps, 'canvas' | 't'>) {
  const { state } = deriveCanvasPresentation(canvas)
  const runError = canvas?.run?.error
  return <div className={css.stateCard} role="status" aria-live="polite">
    <strong>{t(`state.${state}.title`)}</strong><span>{t(`state.${state}.body`)}</span>{runError !== undefined && <small>{runError.message}</small>}
  </div>
}

function PrimaryAction({ state, action, t }: {
  readonly state: ReturnType<typeof deriveCanvasPresentation>['state']
  readonly action: ReturnType<typeof deriveCanvasPresentation>['primaryAction']
  readonly t: CanvasViewProps['t']
}) {
  if (action === 'none') return null
  const key = action === 'cancel' ? 'action.cancel' : action === 'retry' ? 'action.retry' : 'action.run'
  return <button type="button" className={action === 'cancel' ? css.cancelAction : css.primaryAction} disabled title={t('action.unavailable')} data-canvas-action={action} data-canvas-state={state}>{t(key)}</button>
}

function OutputGrid({ canvas, interaction, onSelectOutput, t }: {
  readonly canvas: CanvasSnapshot
  readonly interaction?: CanvasInteractionSelection
  readonly onSelectOutput?: (canvas: CanvasSnapshot, assetIndex: number) => void
  readonly t: CanvasViewProps['t']
}) {
  const output = canvas.output
  if (output === null) return null
  return <div className={css.outputGrid}>{output.assets.map((asset, index) => <AssetCard
    key={asset.kind === 'image' ? asset.image.attachmentId : asset.video.assetId}
    asset={asset}
    primary={index === output.primaryAssetIndex}
    selected={interaction?.focusedOutput?.runId === output.runId && interaction?.focusedOutput?.assetIndex === index}
    onSelect={onSelectOutput === undefined ? undefined : () => { onSelectOutput(canvas, index) }}
    t={t}
  />)}</div>
}

function AssetCard({ asset, primary, selected, onSelect, t }: {
  readonly asset: CanvasAssetRef
  readonly primary: boolean
  readonly selected: boolean
  readonly onSelect?: () => void
  readonly t: CanvasViewProps['t']
}) {
  const media = asset.kind === 'image' ? asset.image : asset.video
  const dimensions = media.width !== undefined && media.height !== undefined ? `${media.width} × ${media.height}` : media.mediaType
  return <button type="button" className={css.assetCard} aria-pressed={selected} data-selected={selected ? 'true' : 'false'} disabled={onSelect === undefined} onClick={onSelect}>
    <div className={css.assetGlyph} aria-hidden="true">{asset.kind === 'image' ? '▧' : '▶'}</div>
    <div><strong>{t(asset.kind === 'image' ? 'asset.image' : 'asset.video')}</strong><span>{dimensions}</span></div>
    {primary && <em>{t('asset.primary')}</em>}
  </button>
}

export function SaveStatus({ status, t }: { readonly status: CanvasSaveStatus; readonly t: CanvasViewProps['t'] }) {
  return <span className={css.saveStatus} data-save-status={status}>{t(`save.${status}`)}</span>
}

/** Preference parser retained as a pure internal helper. */
export function normalizeCanvasMode(value: string): CanvasMode { return value === 'editor' ? 'editor' : 'minimal' }
