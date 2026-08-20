/** Node-level Inspector. Draft text is browser-local; the caller owns autosave. */

import type { MediaWorkflowNode } from '@deepseek-ai/dsh-canvas/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { CanvasSaveStatus } from '../types.ts'
import type { CanvasNodeDraft } from './draft.ts'
import css from './WorkflowEditor.module.css'

export interface NodeInspectorProps {
  readonly node: MediaWorkflowNode | undefined
  readonly draft: CanvasNodeDraft | null
  readonly saveStatus: CanvasSaveStatus
  readonly onNameChange: (value: string) => void
  readonly onConfigChange: (value: string) => void
  readonly t: TranslateNS<'canvas'>
}

/** Inspector edits one narrow Draft rather than cloning the workflow. */
export function NodeInspector({ node, draft, saveStatus, onNameChange, onConfigChange, t }: NodeInspectorProps) {
  if (node === undefined || draft === null || draft.nodeId !== node.id) {
    return <section className={css.inspector}><h4>{t('editor.inspector')}</h4><p>{t('editor.inspectorEmpty')}</p></section>
  }
  return (
    <section className={css.inspector} aria-label={t('editor.inspector')}>
      <div className={css.panelHeader}><h4>{t('editor.inspector')}</h4><code>{node.type}</code></div>
      <label className={css.field}>
        <span>{t('editor.nodeName')}</span>
        <input value={draft.nameText} disabled={saveStatus === 'saving'} onChange={event => { onNameChange(event.target.value) }} />
      </label>
      <label className={css.field}>
        <span>{t('editor.nodeConfig')}</span>
        <textarea rows={12} value={draft.configText} disabled={saveStatus === 'saving'} onChange={event => { onConfigChange(event.target.value) }} />
      </label>
      <small>{t('editor.autosaveHint')}</small>
    </section>
  )
}
