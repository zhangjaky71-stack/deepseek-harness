/** N11 session-scoped editor store semantics. */

import { describe, expect, it } from 'vitest'
import { createCanvasEditorStore } from '../src/client/store.ts'

const command = { id:'cmd-1', label:'rename', forward:[{ op:'rename-workflow' as const, name:'B' }], inverse:[{ op:'rename-workflow' as const, name:'A' }] }

describe('Canvas editor store', () => {
  it('revision-fences undo and redo entries after confirmed Remote writes', () => {
    const instance = createCanvasEditorStore().create('session-1')
    instance.actions.recordCommand(command, 4)
    expect(instance.getSnapshot().undo[0]?.expectedRevision).toBe(4)
    instance.actions.completeUndo(5)
    expect(instance.getSnapshot().redo[0]?.expectedRevision).toBe(5)
    instance.actions.completeRedo(6)
    expect(instance.getSnapshot().undo[0]?.expectedRevision).toBe(6)
  })

  it('tracks explicit save states and transient node positions without semantic workflow state', () => {
    const instance = createCanvasEditorStore().create('session-2')
    instance.actions.setSaveStatus('conflict')
    instance.actions.setLocalPosition('node-a', 12, 34)
    expect(instance.getSnapshot()).toMatchObject({ saveStatus:'conflict', localPositions:{ 'node-a':{ x:12, y:34 } } })
    expect(instance.getSnapshot()).not.toHaveProperty('workflow')
  })
})
