/** N11 session-scoped editor store semantics. */

import { describe, expect, it } from 'vitest'
import { createCanvasEditorStore } from '../src/client/store.ts'

const command = {
  id: 'cmd-1',
  label: 'rename',
  forward: [{ op: 'rename-workflow' as const, name: 'B' }],
  inverse: [{ op: 'rename-workflow' as const, name: 'A' }],
}

describe('Canvas editor store', () => {
  it('moves commands between undo and redo only after the caller confirms a Remote write', () => {
    const instance = createCanvasEditorStore().create('session-1')
    instance.actions.recordCommand(command)
    expect(instance.getSnapshot().undo).toHaveLength(1)
    instance.actions.completeUndo()
    expect(instance.getSnapshot().undo).toHaveLength(0)
    expect(instance.getSnapshot().redo).toHaveLength(1)
    instance.actions.completeRedo()
    expect(instance.getSnapshot().undo).toHaveLength(1)
    expect(instance.getSnapshot().redo).toHaveLength(0)
  })

  it('tracks explicit save states and transient node positions without semantic workflow state', () => {
    const instance = createCanvasEditorStore().create('session-2')
    instance.actions.setSaveStatus('saving')
    instance.actions.setLocalPosition('node-a', 12, 34)
    expect(instance.getSnapshot()).toMatchObject({
      saveStatus: 'saving',
      localPositions: { 'node-a': { x: 12, y: 34 } },
    })
    expect(instance.getSnapshot()).not.toHaveProperty('workflow')
  })
})
