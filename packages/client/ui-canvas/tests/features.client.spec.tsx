import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CanvasCapabilities, CanvasSnapshot } from '@deepseek-ai/dsh-canvas/client'
import { CanvasView, WorkflowEditorShell } from '../src/client/CanvasView.tsx'

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
  } as CanvasSnapshot
}

const emptyInteraction = {
  selectedNodeIds: [],
  selectedEdgeIds: [],
  selectedAssetRefs: [],
} as const

describe('Canvas feature-capability presentation', () => {
  it('forces Minimal and hides the mode switch when Editor is disabled', () => {
    const canvas = canvasWithVideo()
    const props = {
      useProjection: (key: string) => key === 'canvas' ? canvas : null,
      useMode: (selector: (value: 'minimal' | 'editor') => unknown) => selector('editor'),
      useInteraction: (selector: (value: typeof emptyInteraction) => unknown) => selector(emptyInteraction),
      capabilities: capabilities({ editor: false }),
      setMode: () => {},
      selectNode: () => {},
      selectEdge: () => {},
      selectOutput: () => {},
      setRegion: () => {},
      clearSelection: () => {},
      t,
    } as unknown as ComponentProps<typeof CanvasView>

    const html = renderToStaticMarkup(<CanvasView {...props} />)
    expect(html).not.toContain('mode.editor')
    expect(html).not.toContain('editor.title')
    expect(html).toContain('minimal.output')
  })

  it('keeps a historical Video node visible while marking it unavailable', () => {
    const html = renderToStaticMarkup(
      <WorkflowEditorShell
        canvas={canvasWithVideo()}
        layout={null}
        capabilities={capabilities({ video: false })}
        t={t}
      />,
    )
    expect(html).toContain('video.generate')
    expect(html).toContain('data-unavailable="true"')
    expect(html).toContain('feature.unavailable')
  })

  it('does not mark the same Video node unavailable when Video is enabled', () => {
    const html = renderToStaticMarkup(
      <WorkflowEditorShell
        canvas={canvasWithVideo()}
        layout={null}
        capabilities={capabilities({ video: true })}
        t={t}
      />,
    )
    expect(html).toContain('video.generate')
    expect(html).not.toContain('data-unavailable="true"')
    expect(html).not.toContain('feature.unavailable')
  })
})
