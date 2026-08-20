/** Canvas conversation view: capability-gated Minimal result surface and Editor shell over one Projection. */

import type { CanvasAssetRef, CanvasCapabilities, CanvasLayoutSnapshot, CanvasSnapshot } from '@deepseek-ai/dsh-canvas/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  CanvasInteractionSelection,
  CanvasMode,
  CanvasSaveStatus,
  CanvasViewInjected,
} from '../types.ts'
import { deriveCanvasPresentation } from './state.ts'
import css from './CanvasView.module.css'

/** Full Canvas view props composed by the conversation slot. */
export type CanvasViewProps = ConvViewProps & InjectFace<CanvasViewInjected> & PropsLocale<'canvas'>

/** Canvas tab root. Current business state comes only from Session Projection. */
export function CanvasView({
  useProjection,
  useMode,
  useInteraction,
  capabilities,
  setMode,
  selectNode,
  selectEdge,
  selectOutput,
  clearSelection,
  t,
}: CanvasViewProps) {
  const projectedCanvas = useProjection('canvas')
  const layout = useProjection('canvasLayout')
  const mode = useMode(value => value)
  const interaction = useInteraction(value => value)
  const effectiveMode: CanvasMode = capabilities.editor.enabled ? mode : 'minimal'

  return (
    <section className={css.root} aria-label={t('view.canvas')}>
      <div className={css.toolbar}>
        {capabilities.editor.enabled && (
          <div className={css.modeSwitch} role="group" aria-label={t('mode.aria')}>
            <button
              type="button"
              className={effectiveMode === 'minimal' ? css.modeActive : css.modeButton}
              aria-pressed={effectiveMode === 'minimal'}
              onClick={() => { setMode('minimal') }}
            >
              {t('mode.minimal')}
            </button>
            <button
              type="button"
              className={effectiveMode === 'editor' ? css.modeActive : css.modeButton}
              aria-pressed={effectiveMode === 'editor'}
              onClick={() => { setMode('editor') }}
            >
              {t('mode.editor')}
            </button>
          </div>
        )}
        <SaveStatus status="saved" t={t} />
      </div>

      {projectedCanvas === undefined
        ? <div className={css.loading} role="status">{t('projection.loading')}</div>
        : effectiveMode === 'minimal'
          ? (
            <MinimalCanvas
              canvas={projectedCanvas}
              interaction={interaction}
              onSelectOutput={selectOutput}
              t={t}
            />
          )
          : (
            <WorkflowEditorShell
              canvas={projectedCanvas}
              layout={layout ?? null}
              capabilities={capabilities}
              interaction={interaction}
              onSelectNode={selectNode}
              onSelectEdge={selectEdge}
              onSelectOutput={selectOutput}
              onClearSelection={clearSelection}
              t={t}
            />
          )}
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
  return (
    <div className={css.minimal} data-canvas-state={presentation.state}>
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
  )
}

interface EditorProps extends BodyProps {
  readonly layout: CanvasLayoutSnapshot | null
  readonly capabilities?: CanvasCapabilities
  readonly onSelectNode?: CanvasViewInjected['selectNode']
  readonly onSelectEdge?: CanvasViewInjected['selectEdge']
  readonly onClearSelection?: CanvasViewInjected['clearSelection']
}

function videoNodeUnavailable(type: string, capabilities: CanvasCapabilities | undefined): boolean {
  if (capabilities?.video.enabled !== false) return false
  return type === 'video.generate' || type === 'video.image-to-video'
}

/** Editor mode shell. Disabled historical feature nodes remain visible but unavailable. */
export function WorkflowEditorShell({
  canvas,
  layout,
  capabilities,
  interaction,
  onSelectNode,
  onSelectEdge,
  onSelectOutput,
  onClearSelection,
  t,
}: EditorProps) {
  const presentation = deriveCanvasPresentation(canvas)
  const workflow = canvas?.workflow ?? null
  const selectedNodes = new Set(interaction?.selectedNodeIds ?? [])
  const selectedEdges = new Set(interaction?.selectedEdgeIds ?? [])
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
          {onClearSelection !== undefined && (
            <button type="button" className={css.clearSelection} onClick={onClearSelection}>
              ×
            </button>
          )}
        </div>
        {workflow !== null && (
          <>
            <div className={css.nodeList}>
              {workflow.nodes.map((node) => {
                const unavailable = videoNodeUnavailable(node.type, capabilities)
                return (
                  <button
                    type="button"
                    className={css.nodeCard}
                    key={node.id}
                    aria-pressed={selectedNodes.has(node.id)}
                    data-selected={selectedNodes.has(node.id) ? 'true' : 'false'}
                    data-unavailable={unavailable ? 'true' : 'false'}
                    onClick={() => { if (canvas !== null) onSelectNode?.(canvas, node.id) }}
                  >
                    <strong>{node.name ?? node.type}</strong>
                    <span>{node.type}</span>
                    {unavailable && <em className={css.unavailableBadge}>{t('feature.unavailable')}</em>}
                  </button>
                )
              })}
            </div>
            {workflow.edges.length > 0 && (
              <div className={css.edgeList} aria-label={t('editor.edges')}>
                {workflow.edges.map(edge => (
                  <button
                    type="button"
                    className={css.edgeCard}
                    key={edge.id}
                    aria-pressed={selectedEdges.has(edge.id)}
                    data-selected={selectedEdges.has(edge.id) ? 'true' : 'false'}
                    onClick={() => { if (canvas !== null) onSelectEdge?.(canvas, edge.id) }}
                  >
                    <span>{edge.sourceNodeId}</span>
                    <strong>→</strong>
                    <span>{edge.targetNodeId}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {presentation.showOutput && canvas !== null && (
          <OutputGrid canvas={canvas} interaction={interaction} onSelectOutput={onSelectOutput} t={t} />
        )}
      </section>
    </div>
  )
}

function StateCard({ canvas, t }: Pick<BodyProps, 'canvas' | 't'>) {
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

function OutputGrid({ canvas, interaction, onSelectOutput, t }: {
  readonly canvas: CanvasSnapshot
  readonly interaction?: CanvasInteractionSelection
  readonly onSelectOutput?: (canvas: CanvasSnapshot, assetIndex: number) => void
  readonly t: CanvasViewProps['t']
}) {
  const output = canvas.output
  if (output === null) return null
  return (
    <div className={css.outputGrid}>
      {output.assets.map((asset, index) => (
        <AssetCard
          key={asset.kind === 'image' ? asset.image.attachmentId : asset.video.assetId}
          asset={asset}
          primary={index === output.primaryAssetIndex}
          selected={interaction?.focusedOutput?.runId === output.runId && interaction?.focusedOutput?.assetIndex === index}
          onSelect={onSelectOutput === undefined ? undefined : () => { onSelectOutput(canvas, index) }}
          t={t}
        />
      ))}
    </div>
  )
}

function AssetCard({ asset, primary, selected, onSelect, t }: {
  readonly asset: CanvasAssetRef
  readonly primary: boolean
  readonly selected: boolean
  readonly onSelect?: () => void
  readonly t: CanvasViewProps['t']
}) {
  const media = asset.kind === 'image' ? asset.image : asset.video
  const dimensions = media.width !== undefined && media.height !== undefined
    ? `${media.width} × ${media.height}`
    : media.mediaType
  return (
    <button
      type="button"
      className={css.assetCard}
      aria-pressed={selected}
      data-selected={selected ? 'true' : 'false'}
      disabled={onSelect === undefined}
      onClick={onSelect}
    >
      <div className={css.assetGlyph} aria-hidden="true">{asset.kind === 'image' ? '▧' : '▶'}</div>
      <div>
        <strong>{t(asset.kind === 'image' ? 'asset.image' : 'asset.video')}</strong>
        <span>{dimensions}</span>
      </div>
      {primary && <em>{t('asset.primary')}</em>}
    </button>
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
