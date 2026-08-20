/** Editor node library derived from node types already present in the authoritative workflow. */

import type { MediaWorkflow, MediaWorkflowNode } from '@deepseek-ai/dsh-canvas/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './WorkflowEditor.module.css'

export function NodeLibrary({ workflow, onAdd, t }: {
  readonly workflow: MediaWorkflow
  readonly onAdd: (exemplar: MediaWorkflowNode) => void
  readonly t: TranslateNS<'canvas'>
}) {
  const exemplars = new Map<string, MediaWorkflowNode>()
  for (const node of workflow.nodes) if (!exemplars.has(String(node.type))) exemplars.set(String(node.type), node)
  return (
    <section className={css.library} aria-label={t('editor.library')}>
      <div className={css.panelHeader}><h4>{t('editor.library')}</h4><span>{t('editor.libraryCurrent')}</span></div>
      <div className={css.libraryList}>
        {[...exemplars.values()].map(node => (
          <button key={String(node.type)} type="button" onClick={() => { onAdd(node) }}>
            <strong>＋</strong><span>{node.type}</span>
          </button>
        ))}
      </div>
      <small>{t('editor.libraryCatalogPending')}</small>
    </section>
  )
}
