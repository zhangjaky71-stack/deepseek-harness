import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CanvasCapabilities, CanvasSnapshot } from '@deepseek-ai/dsh-canvas/client'
import { CanvasView } from '../src/client/CanvasView.tsx'

const t = ((key: string) => key) as never

function capabilities(overrides: Partial<Record<keyof CanvasCapabilities, boolean>> = {}): CanvasCapabilities {
  const value = (name: keyof CanvasCapabilities, fallback: boolean) => ({ enabled: overrides[name] ?? fallback })
  return {
    canvas: value('canvas', true),
    editor: value('editor', true),
    history: value('history', true),
    video: value('video', false),
    variants: value('variants', false),
    partialRun: value('partialRun', false),
    regionEdit: value('regionEdit', false),
    providerFallback: value('providerFallback', false),
  }
}

function canvasWithVideo(): CanvasSnapshot {
  return {
    schemaVersion: 1,
    id: 'canvas-feature-ui',
    workflowRevision: 1,
    runRevision: 0,
    workflow: {
      id: 'workflow-feature-ui',
      schemaVersion: 1,
      name: 'Historical video workflow',
      nodes: [{
        id: 'video-node',
        type: 'video.generate',
        nodeVersion: 1,
        config: { prompt: 'historical' },
      }],
      edges: [],
      outputNodeIds: ['video-node'],
    },
    run: null,
    output: null,
    createdAt: 1,
    updatedAt: 1,
  } as unknown as CanvasSnapshot
}

const emptyInteraction = {
  selectedNodeIds: [],
  selectedEdgeIds: [],
  selectedAssetRefs: [],
} as const

const editorState = {
  saveStatus: 'saved' as const,
  draft: null,
  undo: [],
  redo: [],
  clipboard: null,
  localPositions: {},
}

const editorActions = {
  setSaveStatus: () => {}, setDraft: () => {}, setDraftName: () => {}, setDraftConfig: () => {},
  markDraftClean: () => {}, recordCommand: () => {}, completeUndo: () => {}, completeRedo: () => {},
  clearHistory: () => {}, setClipboard: () => {}, setLocalPosition: () => {}, mergeLocalPositions: () => {},
  clearLocalPositions: () => {},
}

function canvasViewProps(
  canvas: CanvasSnapshot | null | undefined,
  openState: 'cold' | 'loading' | 'open' | 'error' = 'open',
  resolvedCapabilities: CanvasCapabilities = capabilities({ editor: false }),
): ComponentProps<typeof CanvasView> {
  return {
    useSession: (selector: (value: { openState: typeof openState }) => unknown) => selector({ openState }),
    useProjection: (key: string) => key === 'canvas' ? canvas : null,
    useMode: (selector: (value: 'minimal' | 'editor') => unknown) => selector('editor'),
    useInteraction: (selector: (value: typeof emptyInteraction) => unknown) => selector(emptyInteraction),
    useStore: (selector: (value: typeof editorState) => unknown) => selector(editorState),
    actions: editorActions,
    capabilities: resolvedCapabilities,
    nodeCatalog: [],
    setMode: () => {},
    selectNode: () => {},
    selectNodes: () => {},
    selectEdge: () => {},
    selectEdges: () => {},
    selectOutput: () => {},
    setRegion: () => {},
    clearSelection: () => {},
    commitOperations: async () => ({ ok: true, workflowRevision: 1 }),
    saveLayout: async () => ({ ok: true, layoutRevision: 1 }),
    t,
  } as unknown as ComponentProps<typeof CanvasView>
}

describe('Canvas feature-capability presentation', () => {
  it('forces Minimal and hides the mode switch when Editor is disabled', () => {
    const html = renderToStaticMarkup(<CanvasView {...canvasViewProps(canvasWithVideo())} />)
    expect(html).not.toContain('mode.editor')
    expect(html).not.toContain('editor.shortcuts')
    expect(html).toContain('minimal.output')
  })

  it('distinguishes a pending Canvas Projection from authoritative absence', () => {
    const loading = renderToStaticMarkup(<CanvasView {...canvasViewProps(undefined, 'loading')} />)
    expect(loading).toContain('projection.loading')
    expect(loading).not.toContain('projection.unavailable')

    const unavailable = renderToStaticMarkup(<CanvasView {...canvasViewProps(undefined, 'open')} />)
    expect(unavailable).toContain('projection.unavailable')
    expect(unavailable).not.toContain('projection.loading')
  })

  it('keeps a historical Video node visible while marking it unavailable in the real Editor path', () => {
    const html = renderToStaticMarkup(
      <CanvasView {...canvasViewProps(canvasWithVideo(), 'open', capabilities({ editor: true, video: false }))} />,
    )
    expect(html).toContain('video.generate')
    expect(html).toContain('data-unavailable="true"')
    expect(html).toContain('feature.unavailable')
  })

  it('does not mark the same Video node unavailable when Video is enabled', () => {
    const html = renderToStaticMarkup(
      <CanvasView {...canvasViewProps(canvasWithVideo(), 'open', capabilities({ editor: true, video: true }))} />,
    )
    expect(html).toContain('video.generate')
    expect(html).not.toContain('data-unavailable="true"')
    expect(html).not.toContain('feature.unavailable')
  })
})
