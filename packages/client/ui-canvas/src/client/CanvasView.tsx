/** Canvas conversation view: Minimal result surface and Editor shell over one Projection. */

import type { CanvasAssetRef, CanvasLayoutSnapshot, CanvasSnapshot } from '@deepseek-ai/dsh-canvas/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CanvasMode, CanvasSaveStatus, CanvasViewInjected } from '../types.ts'
import { deriveCanvasPresentation } from './state.ts'
import css from './CanvasView.module.css'

/** Full Canvas view props composed by the conversation slot. */
export type CanvasViewProps = ConvViewProps & InjectFace<CanvasViewInjected> & PropsLocale<'canvas'>

/** Canvas tab root. Current business state comes only from Session Projection. */
export function CanvasView({ useProjection, useMode, setMode, t }: CanvasViewProps) {
  const projectedCanvas = useProjection('canvas')
  const layout = useProjection('canvasLayout')
  const mode = useMode(value => value)

  return (
    <section className={css.root} aria-label={t('view.canvas')}>
      <div className={css.toolbar}>
        <div className={css.modeSwitch} role="group" aria-label={t('mode.aria')}>
          <button
            type="button"
            className={mode === 'minimal' ? css.modeActive : css.modeButton}
            aria-pressed={mode === 'minimal'}
            onClick={() => { setMode('minimal') }}
          >
            {t('mode.minimal')}
          </button>
          <button
            type="button"
            className={mode === 'editor' ? css.modeActive : css.modeButton}
            aria-pressed={mode === 'editor'}
            onClick={() => { setMode('editor') }}
          >
            {t('mode.editor')}
          </button>
        </div>
        <SaveStatus status="saved" t={t} />
      </div>

      {projectedCanvas === undefined
        ? <div className={css.loading} role="status">{t('projection.loading')}</div>
        : mode === 'minimal'
          ? <MinimalCanvas canvas={projectedCanvas} t={t} />
          : <WorkflowEditorShell canvas={projectedCanvas} layout={layout ?? null} t={t} />}
    </section>
  )
}

interface BodyProps {
  readonly canvas: CanvasSnapshot | null
  readonly t: CanvasViewProps['t']
}

/** Minimal mode: product state plus generated result only; no DAG detail. */
export function MinimalCanvas({ canvas, t }: BodyProps) {
  const presentation = deriveCanvasPresentation(canvas)
  return (
    <div className={css.minimal} data-canvas-state={presentation.state}>
      <StateCard canvas={canvas} t={t} />
      <PrimaryAction state={presentation.state} action={presentation.primaryAction} t={t} />
      {presentation.staleOutput && <p className={css.dirtyNotice}>{t('state.DIRTY_READY.body')}</p>}
      <section className={css.outputSection} aria-label={t('minimal.output')}>
        <h3>{t('minimal.output')}</h3>
        {presentation.showOutput && canvas?.output !== null
          ? <OutputGrid canvas={canvas} t={t} />
          : <div className={css.emptyOutput}>{t('minimal.emptyOutput')}</div>}
      </section>
    </div>
  )
}

interface EditorProps extends BodyProps {
  readonly layout: CanvasLayoutSnapshot | null
}

/** Editor mode shell. It intentionally does not implement DAG editing in N07. */
export function WorkflowEditorShell({ canvas, layout, t }: EditorProps) {
  const presentation = deriveCanvasPresentation(canvas)
  const workflow = canvas?.workflow ?? null
  return (
    <div className={css.editor} data-canvas-state={presentation.state}>
      <aside className={css.editorSide}>
        <StateCard canvas={canvas} t={t} />
        <PrimaryAction state={presentation.state} action={presentation.primaryAction} t={t} />
        <dl className={css.metrics}>
          <div><dt>{t('editor.revision')}</dt><dd>{canvas?.workflowRevision ?? 0}</dd></div>
          <div><dt>{t('editor.nodes')}</dt><dd>{workflow?.nodes.length ?? 0}</dd></div>
          <div><dt>{t('editor.edges')}</dt><dd>{workflow?.edges.length ?? 0}</dd></div>
          <div><dt>{t('editor.layout')}</dt><dd>{layout === null ? '—' : Object.keys(layout.nodePositions).length}</dd></div>
        </dl>
      </aside>
      <section className={css.graphShell} aria-label={t('editor.title')}>
        <div className={css.graphHeader}>
          <div>
            <h3>{workflow?.name ?? t('editor.noWorkflow')}</h3>
            <p>{t('editor.placeholder')}</p>
          </div>
        </div>
        {workflow !== null && (
          <div className={css.nodeList}>
            {workflow.nodes.map(node => (
              <article className={css.nodeCard} key={node.id}>
                <strong>{node.name ?? node.type}</strong>
                <span>{node.type}</span>
              </article>
            ))}
          </div>
        )}
        {presentation.showOutput && canvas !== null && <OutputGrid canvas={canvas} t={t} />}
      </section>
    </div>
  )
}

function StateCard({ canvas, t }: BodyProps) {
  const { state } = deriveCanvasPresentation(canvas)
  const runError = canvas?.run?.error
  return (
    <div className={css.stateCard} role="status" aria-live="polite">
      <strong>{t(`state.${state}.title`)}</strong>
      <span>{t(`state.${state}.body`)}</span>
      {runError !== undefined && <small>{runError.message}</small>}
    </div>
  )
}

function PrimaryAction({
  state,
  action,
  t,
}: {
  readonly state: ReturnType<typeof deriveCanvasPresentation>['state']
  readonly action: ReturnType<typeof deriveCanvasPresentation>['primaryAction']
  readonly t: CanvasViewProps['t']
}) {
  if (action === 'none') return null
  const key = action === 'cancel' ? 'action.cancel' : action === 'retry' ? 'action.retry' : 'action.run'
  return (
    <button
      type="button"
      className={action === 'cancel' ? css.cancelAction : css.primaryAction}
      disabled
      title={t('action.unavailable')}
      data-canvas-action={action}
      data-canvas-state={state}
    >
      {t(key)}
    </button>
  )
}

function OutputGrid({ canvas, t }: { readonly canvas: CanvasSnapshot; readonly t: CanvasViewProps['t'] }) {
  const output = canvas.output
  if (output === null) return null
  return (
    <div className={css.outputGrid}>
      {output.assets.map((asset, index) => (
        <AssetCard
          key={asset.kind === 'image' ? asset.image.attachmentId : asset.video.assetId}
          asset={asset}
          primary={index === output.primaryAssetIndex}
          t={t}
        />
      ))}
    </div>
  )
}

function AssetCard({ asset, primary, t }: {
  readonly asset: CanvasAssetRef
  readonly primary: boolean
  readonly t: CanvasViewProps['t']
}) {
  const media = asset.kind === 'image' ? asset.image : asset.video
  const dimensions = media.width !== undefined && media.height !== undefined
    ? `${media.width} × ${media.height}`
    : media.mediaType
  return (
    <article className={css.assetCard}>
      <div className={css.assetGlyph} aria-hidden="true">{asset.kind === 'image' ? '▧' : '▶'}</div>
      <div>
        <strong>{t(asset.kind === 'image' ? 'asset.image' : 'asset.video')}</strong>
        <span>{dimensions}</span>
      </div>
      {primary && <em>{t('asset.primary')}</em>}
    </article>
  )
}

/** N07 save-status skeleton; N11 replaces the fixed `saved` source with draft/autosave state. */
export function SaveStatus({ status, t }: { readonly status: CanvasSaveStatus; readonly t: CanvasViewProps['t'] }) {
  return <span className={css.saveStatus} data-save-status={status}>{t(`save.${status}`)}</span>
}

/** Utility exported for tests and future preference surfaces. */
export function normalizeCanvasMode(value: string): CanvasMode {
  return value === 'editor' ? 'editor' : 'minimal'
}
