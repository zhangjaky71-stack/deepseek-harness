import { describe, expect, it } from 'vitest'
import {
  CanvasId,
  CanvasMigrationError,
  WorkflowNodeId,
  applyCanvasChange,
  cloneCanvasFoldState,
  decodeCanvasChange,
  emptyCanvasFoldState,
} from '@deepseek-ai/dsh-canvas'
import type { CanvasChange } from '@deepseek-ai/dsh-canvas'
import { createChange, runCompleteChange, runStartChange } from './canvas-fixtures.ts'

describe('Canvas durable fold', () => {
  it('ignores unrelated values and decodes only exact current Canvas envelopes', () => {
    expect(decodeCanvasChange(null)).toBeUndefined()
    expect(decodeCanvasChange({ kind: 'other' })).toBeUndefined()
    const change = createChange()
    expect(decodeCanvasChange(change)).toEqual(change)
    expect(() => decodeCanvasChange({ ...change, extra: true })).toThrow(CanvasMigrationError)
    expect(() => decodeCanvasChange({ ...change, meta: {} })).toThrow(CanvasMigrationError)
  })

  it('applies create, workflow edit, run start/complete, output select, and clear transitions', () => {
    const state = emptyCanvasFoldState()
    const created = createChange()
    applyCanvasChange(state, created)
    const current = state.canvas
    if (current === null || current.workflow === null) throw new Error('expected current workflow')

    const edited: CanvasChange = {
      ...created,
      operation: 'workflow-edit',
      canvas: {
        ...current,
        workflowRevision: 2,
        workflow: { ...current.workflow, name: 'Edited' },
        updatedAt: current.updatedAt + 1,
      },
    }
    applyCanvasChange(state, edited)
    const afterEdit = state.canvas
    if (afterEdit === null) throw new Error('expected edited Canvas')

    const started = runStartChange(afterEdit)
    applyCanvasChange(state, started)
    const running = state.canvas
    if (running === null) throw new Error('expected running Canvas')

    const completed = runCompleteChange(running)
    applyCanvasChange(state, completed)
    const done = state.canvas
    if (done === null || done.output === null) throw new Error('expected completed Canvas')

    const selected: CanvasChange = {
      ...completed,
      operation: 'output-select',
      canvas: {
        ...done,
        output: { ...done.output, primaryAssetIndex: 1 },
        updatedAt: done.updatedAt + 1,
      },
    }
    applyCanvasChange(state, selected)
    expect(state.canvas?.output?.primaryAssetIndex).toBe(1)

    applyCanvasChange(state, {
      kind: 'canvas/change',
      version: 1,
      operation: 'clear',
      canvas: null,
      meta: { schemaVersion: 1 },
    })
    expect(state.canvas).toBeNull()
  })

  it('rejects duplicate/reused Canvas ids and invalid full-snapshot transitions', () => {
    const state = emptyCanvasFoldState()
    const created = createChange()
    applyCanvasChange(state, created)
    expect(() => applyCanvasChange(state, created)).toThrow('Canvas create requires no current Canvas')

    const current = state.canvas
    if (current === null || current.workflow === null) throw new Error('expected current workflow')
    const badRevision: CanvasChange = {
      ...created,
      operation: 'workflow-replace',
      canvas: {
        ...current,
        workflowRevision: current.workflowRevision + 2,
        workflow: { ...current.workflow, name: 'Bad revision' },
        updatedAt: current.updatedAt + 1,
      },
    }
    expect(() => applyCanvasChange(state, badRevision)).toThrow('advance only the semantic workflow revision')

    applyCanvasChange(state, {
      kind: 'canvas/change', version: 1, operation: 'clear', canvas: null, meta: { schemaVersion: 1 },
    })
    expect(() => applyCanvasChange(state, createChange(CanvasId('canvas-fixture')))).toThrow(
      'fresh revision-one Canvas',
    )
  })

  it('rejects run-start while a non-terminal run is current and accepts a new run after completion', () => {
    const state = emptyCanvasFoldState()
    applyCanvasChange(state, createChange())
    const created = state.canvas
    if (created === null) throw new Error('expected created Canvas')
    applyCanvasChange(state, runStartChange(created))
    const running = state.canvas
    if (running === null) throw new Error('expected running Canvas')
    expect(() => applyCanvasChange(state, runStartChange(running))).toThrow('non-terminal run')

    applyCanvasChange(state, runCompleteChange(running))
    const completed = state.canvas
    if (completed === null) throw new Error('expected completed Canvas')
    expect(() => applyCanvasChange(state, runStartChange(completed))).not.toThrow()
  })

  it('rejects output selection that changes anything beyond primary index/updatedAt', () => {
    const state = emptyCanvasFoldState()
    applyCanvasChange(state, createChange())
    const created = state.canvas
    if (created === null) throw new Error('expected created Canvas')
    applyCanvasChange(state, runStartChange(created))
    const running = state.canvas
    if (running === null) throw new Error('expected running Canvas')
    applyCanvasChange(state, runCompleteChange(running))
    const completed = state.canvas
    if (completed === null || completed.output === null) throw new Error('expected completed output')

    const invalid: CanvasChange = {
      kind: 'canvas/change',
      version: 1,
      operation: 'output-select',
      meta: { schemaVersion: 1 },
      canvas: {
        ...completed,
        output: {
          ...completed.output,
          assets: completed.output.assets.slice(1),
          primaryAssetIndex: 0,
        },
        updatedAt: completed.updatedAt + 1,
      },
    }
    expect(() => applyCanvasChange(state, invalid)).toThrow('may only change the primary output index')
  })

  it('clones the mutable replay id set without changing current snapshot identity', () => {
    const state = emptyCanvasFoldState()
    applyCanvasChange(state, createChange())
    const cloned = cloneCanvasFoldState(state)
    cloned.seenCanvasIds.add(CanvasId('another'))
    expect(state.seenCanvasIds.has(CanvasId('another'))).toBe(false)
    expect(cloned.canvas).toBe(state.canvas)
  })

  it('rejects a workflow edit whose final graph still references a removed node', () => {
    const state = emptyCanvasFoldState()
    const created = createChange()
    applyCanvasChange(state, created)
    const current = state.canvas
    if (current === null || current.workflow === null) throw new Error('expected current workflow')
    const nextWorkflow = {
      ...current.workflow,
      nodes: current.workflow.nodes.filter(node => node.id !== WorkflowNodeId('output')),
    }
    const invalid: CanvasChange = {
      ...created,
      operation: 'workflow-edit',
      canvas: {
        ...current,
        workflowRevision: current.workflowRevision + 1,
        workflow: nextWorkflow,
        updatedAt: current.updatedAt + 1,
      },
    }
    expect(() => decodeCanvasChange(invalid)).toThrow()
  })
})
