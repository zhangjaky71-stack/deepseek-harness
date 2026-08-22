/** Port-level semantic connection authoring from the Host node catalog. */

import type { CanvasCapabilities, CanvasNodeCatalogEntry, MediaPortType, MediaWorkflow, WorkflowNodeId } from '@deepseek-ai/dsh-canvas/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { nodeCatalogAvailability } from './catalog.ts'
import css from './WorkflowEditor.module.css'

export interface CanvasPortEndpoint {
  readonly nodeId: WorkflowNodeId
  readonly port: string
  readonly type: MediaPortType
}

export function ConnectionPanel({ workflow, catalog, capabilities, disabled, onConnect, t }: {
  readonly workflow: MediaWorkflow
  readonly catalog: readonly CanvasNodeCatalogEntry[]
  readonly capabilities: CanvasCapabilities
  readonly disabled: boolean
  readonly onConnect: (source: CanvasPortEndpoint, target: CanvasPortEndpoint) => void
  readonly t: TranslateNS<'canvas'>
}) {
  const outputs: Array<CanvasPortEndpoint & { label: string }> = []
  const inputs: Array<CanvasPortEndpoint & { label: string }> = []
  for (const node of workflow.nodes) {
    const availability = nodeCatalogAvailability(catalog, capabilities, node)
    if (!availability.available) continue
    const definition = availability.definition
    const label = node.name?.trim() || definition.displayName
    for (const port of definition.outputs) outputs.push({ nodeId: node.id, port: port.name, type: port.type, label: `${label} · ${port.name} (${port.type})` })
    for (const port of definition.inputs) inputs.push({ nodeId: node.id, port: port.name, type: port.type, label: `${label} · ${port.name} (${port.type})` })
  }
  const usable = outputs.length > 0 && inputs.length > 0
  return (
    <section className={css.connectionPanel} aria-label={t('editor.connections')}>
      <div className={css.panelHeader}><h4>{t('editor.connections')}</h4><span>{workflow.edges.length}</span></div>
      <form onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const source = decodeEndpoint(data.get('source'))
        const target = decodeEndpoint(data.get('target'))
        if (source === undefined || target === undefined) return
        onConnect(source, target)
      }}>
        <label><span>{t('editor.connectionSource')}</span><select name="source" disabled={disabled || !usable}>{outputs.map(endpoint => <option key={`${endpoint.nodeId}:${endpoint.port}`} value={encodeEndpoint(endpoint)}>{endpoint.label}</option>)}</select></label>
        <label><span>{t('editor.connectionTarget')}</span><select name="target" disabled={disabled || !usable}>{inputs.map(endpoint => <option key={`${endpoint.nodeId}:${endpoint.port}`} value={encodeEndpoint(endpoint)}>{endpoint.label}</option>)}</select></label>
        <button type="submit" disabled={disabled || !usable}>{t('editor.connect')}</button>
      </form>
      {!usable && <small>{t('editor.connectionEmpty')}</small>}
    </section>
  )
}

function encodeEndpoint(endpoint: CanvasPortEndpoint): string {
  return JSON.stringify({ nodeId: endpoint.nodeId, port: endpoint.port, type: endpoint.type })
}
function decodeEndpoint(value: FormDataEntryValue | null): CanvasPortEndpoint | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const parsed = JSON.parse(value) as Partial<CanvasPortEndpoint>
    if (typeof parsed.nodeId !== 'string' || typeof parsed.port !== 'string' || typeof parsed.type !== 'string') return undefined
    return parsed as CanvasPortEndpoint
  } catch {
    return undefined
  }
}
