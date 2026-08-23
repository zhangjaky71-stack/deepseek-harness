// @vitest-environment jsdom
/** N11 WorkflowEditor Draft timing over the real editor presentation store. */

import { useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act, Simulate } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CanvasCapabilities,
  CanvasNodeCatalogEntry,
  CanvasSnapshot,
  MediaWorkflow,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/client'
import { WorkflowEditor, type WorkflowEditorProps } from '../src/client/WorkflowEditor.tsx'
import { createCanvasEditorStore } from '../src/client/store.ts'

const t = ((key: string) => key) as never
const capabilities: CanvasCapabilities = {
  canvas: { enabled: true }, editor: { enabled: true }, history: { enabled: true }, video: { enabled: false },
  variants: { enabled: false }, partialRun: { enabled: false }, regionEdit: { enabled: false }, providerFallback: { enabled: false },
}
const definition: CanvasNodeCatalogEntry = {
  type: 'prompt',
  version: 1,
  displayName: 'Prompt',
  inputs: [],
  outputs: [{ name: 'text', type: 'text', required: true }],
  defaultConfig: { text: '' },
  lifecycle: { deprecated: false, creatable: true, executable: true },
  ui: { category: 'Prompt', icon: 'prompt', inspectorKind: 'json' },
}
const workflow: MediaWorkflow = {
  id: 'workflow-autosave' as MediaWorkflow['id'],
  schemaVersion: 1,
  name: 'Autosave',
  nodes: [{ id: 'prompt-1' as WorkflowNodeId, type: 'prompt', nodeVersion: 1, name: 'Prompt', config: { text: 'hello' } }],
  edges: [],
  outputNodeIds: [],
}
const canvas = {
  schemaVersion: 1,
  id: 'canvas-autosave',
  workflowRevision: 1,
  runRevision: 0,
  workflow,
  run: null,
  output: null,
  createdAt: 1,
  updatedAt: 1,
} as CanvasSnapshot & { workflow: MediaWorkflow }
const interaction = {
  anchor: { canvasId: canvas.id, canvasCreatedAt: canvas.createdAt, workflowId: workflow.id, workflowRevision: 1 },
  selectedNodeIds: ['prompt-1' as WorkflowNodeId],
  selectedEdgeIds: [],
  selectedAssetRefs: [],
} as const

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => { root.unmount() })
  host.remove()
  vi.useRealTimers()
})

function renderEditor(commitOperations: WorkflowEditorProps['commitOperations']) {
  const instance = createCanvasEditorStore().create('session-autosave')
  instance.actions.resetGeneration({ canvasId: canvas.id, canvasCreatedAt: canvas.createdAt, workflowId: workflow.id })
  const useStore = (<T,>(selector: (state: ReturnType<typeof instance.getSnapshot>) => T): T => {
    const state = useSyncExternalStore(instance.subscribe, instance.getSnapshot, instance.getSnapshot)
    return selector(state)
  }) as never
  act(() => {
    root.render(<WorkflowEditor
      canvas={canvas}
      layout={null}
      capabilities={capabilities}
      nodeCatalog={[definition]}
      interaction={interaction}
      onSelectNode={() => {}}
      onSelectNodes={() => {}}
      onSelectEdge={() => {}}
      onClearSelection={() => {}}
      commitOperations={commitOperations}
      saveLayout={async () => ({ ok: true, layoutRevision: 1 })}
      useStore={useStore}
      actions={instance.actions}
      t={t}
    />)
  })
  // Selection creates the narrow node Draft in an effect-backed store update.
  act(() => {})
  const input = host.querySelector('input')
  if (!(input instanceof HTMLInputElement)) throw new Error('expected Inspector name input')
  return { input, getSnapshot: instance.getSnapshot }
}

function changeName(input: HTMLInputElement, value: string): void {
  input.value = value
  Simulate.change(input, { target: input })
}

describe('Canvas WorkflowEditor autosave', () => {
  it('debounces typing and does not write a Session revision per character', async () => {
    const commitOperations = vi.fn(async () => ({ ok: true as const, workflowRevision: 2 }))
    const { input } = renderEditor(commitOperations)

    act(() => { changeName(input, 'Prompt A') })
    act(() => { vi.advanceTimersByTime(200) })
    act(() => { changeName(input, 'Prompt AB') })
    act(() => { vi.advanceTimersByTime(449) })
    expect(commitOperations).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve() })
    expect(commitOperations).toHaveBeenCalledTimes(1)
    expect(commitOperations).toHaveBeenCalledWith(
      [{ op: 'rename-node', nodeId: 'prompt-1', name: 'Prompt AB' }],
      1,
    )
  })

  it('saves on blur and suppresses the pending debounce duplicate for the same Draft', async () => {
    let resolveCommit: ((value: { ok: true; workflowRevision: number }) => void) | undefined
    const commitOperations = vi.fn(() => new Promise<{ ok: true; workflowRevision: number }>((resolve) => { resolveCommit = resolve }))
    const { input } = renderEditor(commitOperations)

    act(() => { changeName(input, 'Blurred') })
    await act(async () => { Simulate.blur(input); await Promise.resolve() })
    expect(commitOperations).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(450) })
    expect(commitOperations).toHaveBeenCalledTimes(1)

    await act(async () => { resolveCommit?.({ ok: true, workflowRevision: 2 }); await Promise.resolve() })
  })

  it('keeps an offline write visibly unsaved instead of reporting Saved', async () => {
    const commitOperations = vi.fn(async () => ({ ok: false as const, status: 'offline' as const, message: 'offline' }))
    const { input, getSnapshot } = renderEditor(commitOperations)

    act(() => { changeName(input, 'Offline edit') })
    await act(async () => { vi.advanceTimersByTime(450); await Promise.resolve() })

    expect(commitOperations).toHaveBeenCalledTimes(1)
    expect(getSnapshot().saveStatus).toBe('offline')
    expect(getSnapshot().draft?.dirty).toBe(true)
  })
})
