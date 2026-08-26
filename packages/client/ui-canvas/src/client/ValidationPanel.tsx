/** Local Draft validation and revision-conflict presentation. Host remains final validator. */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { CanvasSaveStatus } from '../types.ts'
import type { CanvasNodeDraft } from './draft.ts'
import { parseNodeConfig } from './draft.ts'
import css from './WorkflowEditor.module.css'

export function ValidationPanel({ draft, workflowRevision, saveStatus, t }: {
  readonly draft: CanvasNodeDraft | null
  readonly workflowRevision: number
  readonly saveStatus: CanvasSaveStatus
  readonly t: TranslateNS<'canvas'>
}) {
  let issue: string | undefined
  if (draft !== null && draft.dirty && draft.baseWorkflowRevision !== workflowRevision) issue = t('editor.validationRevision')
  if (issue === undefined && draft !== null) {
    try { parseNodeConfig(draft.configText) } catch (error) { issue = error instanceof Error ? error.message : String(error) }
  }
  if (issue === undefined && saveStatus === 'conflict') issue = t('editor.validationConflict')
  return (
    <section className={css.validation} data-valid={issue === undefined ? 'true' : 'false'}>
      <strong>{issue === undefined ? t('editor.validationOk') : t('editor.validationIssue')}</strong>
      {issue !== undefined && <span>{issue}</span>}
    </section>
  )
}
