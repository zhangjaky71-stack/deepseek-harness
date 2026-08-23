import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CanvasCapabilities, CanvasSnapshot } from '@deepseek-ai/dsh-canvas/client'
import { CanvasView, MinimalCanvas } from '../src/client/CanvasView.tsx'

const t = ((key: string) => key) as never
const workflow = {
  id: 'workflow-view', schemaVersion: 1, name: 'View workflow',
  nodes: [{ id: 'prompt', type: 'prompt', nodeVersion: 1, config: { text: 'hello' } }],
  edges: [], outputNodeIds: [],
} as const

function base(overrides: Partial<CanvasSnapshot>): CanvasSnapshot {
  return {
    schemaVersion: 1,
    id: 'canvas-view',
    workflowRevision: 1,
    runRevision: 0,
    workflow,
    run: null,
    output: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as CanvasSnapshot
}

const capabilities: CanvasCapabilities = {
  canvas: { enabled: true }, editor: { enabled: true }, history: { enabled: true }, video: { enabled: false },
  variants: { enabled: false }, partialRun: { enabled: false }, regionEdit: { enabled: false }, providerFallback: { enabled: false },
}
const interaction = { selectedNodeIds: [], selectedEdgeIds: [], selectedAssetRefs: [] } as const
const editorState = { saveStatus: 'saved' as const, draft: null, undo: [], redo: [], clipboard: null, localPositions: {} }
const actions = {
  setSaveStatus: () => {}, setDraft: () => {}, setDraftName: () => {}, setDraftConfig: () => {},
  markDraftClean: () => {}, recordCommand: () => {}, completeUndo: () => {}, completeRedo: () => {},
  clearHistory: () => {}, setClipboard: () => {}, setLocalPosition: () => {}, mergeLocalPositions: () => {}, clearLocalPositions: () => {},
}

function editorProps(canvas: CanvasSnapshot): ComponentProps<typeof CanvasView> {
  return {
    useSession: selector => selector({ openState: 'open' } as never),
    useProjection: (key: string) => key === 'canvas' ? canvas : null,
    useMode: (selector: (value: 'minimal' | 'editor') => unknown) => selector('editor'),
    useInteraction: (selector: (value: typeof interaction) => unknown) => selector(interaction),
    useStore: (selector: (value: typeof editorState) => unknown) => selector(editorState),
    actions,
    capabilities,
    nodeCatalog: [],
    setMode: () => {}, selectNode: () => {}, selectNodes: () => {}, selectEdge: () => {}, selectEdges: () => {},
    selectOutput: () => {}, setRegion: () => {}, clearSelection: () => {},
    commitOperations: async () => ({ ok: true, workflowRevision: 1 }),
    saveLayout: async () => ({ ok: true, layoutRevision: 1 }),
    t,
  } as unknown as ComponentProps<typeof CanvasView>
}

describe('Canvas view shells', () => {
  it('RUNNING renders only the Cancel primary control and never Run', () => {
    const canvas = base({
      runRevision: 1,
      run: { id: 'run-live', status: 'running', workflowId: workflow.id, workflowRevision: 1, startedAt: 2 },
    })
    const html = renderToStaticMarkup(<MinimalCanvas canvas={canvas} t={t} />)
    expect(html).toContain('data-canvas-action="cancel"')
    expect(html).not.toContain('data-canvas-action="run"')
    expect(html).not.toContain('data-canvas-action="retry"')
  })

  it('DIRTY_READY retains and labels the prior output', () => {
    const canvas = base({
      workflowRevision: 2,
      runRevision: 1,
      run: {
        id: 'run-old', status: 'completed', workflowId: workflow.id,
        workflowRevision: 1, startedAt: 2, finishedAt: 3,
      },
      output: {
        runId: 'run-old', workflowId: workflow.id, workflowRevision: 1,
        assets: [{ kind: 'video', video: { assetId: 'video-old', mediaType: 'video/mp4', bytes: 100 } }],
        primaryAssetIndex: 0,
      },
    })
    const html = renderToStaticMarkup(<MinimalCanvas canvas={canvas} t={t} />)
    expect(html).toContain('data-canvas-state="DIRTY_READY"')
    expect(html).toContain('asset.video')
    expect(html).toContain('state.DIRTY_READY.body')
  })

  it('Editor renders the projected semantic workflow through the real editor path', () => {
    const html = renderToStaticMarkup(<CanvasView {...editorProps(base({}))} />)
    expect(html).toContain('View workflow')
    expect(html).toContain('prompt')
    expect(html).toContain('editor.shortcuts')
    expect(html).not.toContain('editor.placeholder')
  })
})
