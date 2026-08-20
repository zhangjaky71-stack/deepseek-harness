import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CanvasSnapshot } from '@deepseek-ai/dsh-canvas/client'
import { MinimalCanvas, WorkflowEditorShell } from '../src/client/CanvasView.tsx'

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

  it('Editor is a semantic workflow shell rather than a second Canvas state store', () => {
    const canvas = base({})
    const html = renderToStaticMarkup(<WorkflowEditorShell canvas={canvas} layout={null} t={t} />)
    expect(html).toContain('View workflow')
    expect(html).toContain('prompt')
    expect(html).toContain('editor.placeholder')
  })
})
