/** N11 Editor presentation over exact Host catalog metadata. */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  CanvasCapabilities,
  CanvasNodeCatalogEntry,
  MediaWorkflow,
  MediaWorkflowNode,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/client'
import { ConnectionPanel } from '../src/client/ConnectionPanel.tsx'
import { NodeInspector } from '../src/client/NodeInspector.tsx'
import { NodeLibrary } from '../src/client/NodeLibrary.tsx'

const t = ((key: string) => key) as never

function capabilities(video = false): CanvasCapabilities {
  return {
    canvas: { enabled: true }, editor: { enabled: true }, history: { enabled: true }, video: { enabled: video },
    variants: { enabled: false }, partialRun: { enabled: false }, regionEdit: { enabled: false }, providerFallback: { enabled: false },
  }
}

function definition(
  type: string,
  version: number,
  overrides: Partial<CanvasNodeCatalogEntry> = {},
): CanvasNodeCatalogEntry {
  return {
    type,
    version,
    displayName: `${type} v${version}`,
    inputs: [],
    outputs: [],
    defaultConfig: {},
    lifecycle: { deprecated: false, creatable: true, executable: true },
    ui: { category: 'Plugin', icon: 'plugin', inspectorKind: 'json' },
    ...overrides,
  }
}

function node(type: string, version: number, id = `${type}-${version}`): MediaWorkflowNode {
  return { id: id as WorkflowNodeId, type, nodeVersion: version, config: {} }
}

describe('Canvas Editor catalog-driven components', () => {
  it('renders a missing historical definition as a read-only Inspector diagnostic', () => {
    const historical = node('plugin.removed', 3)
    const html = renderToStaticMarkup(<NodeInspector
      node={historical}
      draft={null}
      saveStatus="saved"
      readOnlyReason="definition-missing"
      onNameChange={() => {}}
      onConfigChange={() => {}}
      onBlur={() => {}}
      t={t}
    />)
    expect(html).toContain('data-read-only="true"')
    expect(html).toContain('plugin.removed@3')
    expect(html).toContain('editor.nodeDefinitionMissing')
    expect(html).toContain('editor.nodeReadOnly')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<textarea')
  })

  it('uses the exact node version when projecting connectable ports', () => {
    const source = node('plugin.source', 1, 'source')
    const target = node('plugin.target', 1, 'target')
    const workflow: MediaWorkflow = {
      id: 'workflow-editor-catalog' as MediaWorkflow['id'],
      schemaVersion: 1,
      name: 'Exact ports',
      nodes: [source, target],
      edges: [],
      outputNodeIds: [],
    }
    const catalog: CanvasNodeCatalogEntry[] = [
      definition('plugin.source', 2, { outputs: [{ name: 'new-port', type: 'image', required: true }] }),
      definition('plugin.source', 1, { outputs: [{ name: 'legacy-port', type: 'image', required: true }] }),
      definition('plugin.target', 1, { inputs: [{ name: 'image', type: 'image', required: true }] }),
    ]
    const html = renderToStaticMarkup(<ConnectionPanel
      workflow={workflow}
      catalog={catalog}
      capabilities={capabilities()}
      disabled={false}
      onConnect={() => {}}
      t={t}
    />)
    expect(html).toContain('legacy-port')
    expect(html).not.toContain('new-port')
    expect(html).toContain('plugin.target v1 · image')
  })

  it('does not offer feature-disabled definitions in the Node Library', () => {
    const catalog = [
      definition('plugin.image', 1, { displayName: 'Image plugin' }),
      definition('plugin.video', 1, { displayName: 'Video plugin', feature: 'video' }),
    ]
    const html = renderToStaticMarkup(<NodeLibrary catalog={catalog} capabilities={capabilities(false)} onAdd={() => {}} t={t} />)
    expect(html).toContain('Image plugin')
    expect(html).not.toContain('Video plugin')
    expect(html).toContain('<span>1</span>')
  })
})
