/** Installed media-node library projected from the Host registry catalog. */

import type { CanvasCapabilities, CanvasNodeCatalogEntry } from '@deepseek-ai/dsh-canvas/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { catalogEntryCreatable } from './catalog.ts'
import css from './WorkflowEditor.module.css'

export function NodeLibrary({ catalog, capabilities, onAdd, t }: {
  readonly catalog: readonly CanvasNodeCatalogEntry[]
  readonly capabilities: CanvasCapabilities
  readonly onAdd: (definition: CanvasNodeCatalogEntry) => void
  readonly t: TranslateNS<'canvas'>
}) {
  const groups = new Map<string, CanvasNodeCatalogEntry[]>()
  let creatableCount = 0
  for (const definition of catalog) {
    if (!catalogEntryCreatable(definition, capabilities)) continue
    const rows = groups.get(definition.ui.category) ?? []
    rows.push(definition)
    groups.set(definition.ui.category, rows)
    creatableCount += 1
  }
  return (
    <section className={css.library} aria-label={t('editor.library')}>
      <div className={css.panelHeader}><h4>{t('editor.library')}</h4><span>{creatableCount}</span></div>
      {[...groups.entries()].map(([category, definitions]) => (
        <div className={css.libraryGroup} key={category}>
          <strong>{category}</strong>
          <div className={css.libraryList}>
            {definitions.map(definition => (
              <button key={`${String(definition.type)}@${definition.version}`} type="button" onClick={() => { onAdd(definition) }}>
                <strong>＋</strong><span>{definition.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {groups.size === 0 && <small>{t('editor.libraryEmpty')}</small>}
    </section>
  )
}
