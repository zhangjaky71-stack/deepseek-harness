/** Session-scoped editor presentation store. Semantic workflow state stays in Session Projection. */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { CanvasSaveStatus } from '../types.ts'
import type { CanvasClipboard, CanvasEditorCommand, CanvasNodeDraft } from './draft.ts'

const HISTORY_LIMIT = 100

/** Presentation-only Editor state surviving view remounts for one Session. */
export interface CanvasEditorState {
  readonly saveStatus: CanvasSaveStatus
  readonly draft: CanvasNodeDraft | null
  readonly undo: readonly CanvasEditorCommand[]
  readonly redo: readonly CanvasEditorCommand[]
  readonly clipboard: CanvasClipboard | null
  readonly localPositions: Readonly<Record<string, { readonly x: number; readonly y: number }>>
}

type CanvasEditorActions = {
  setSaveStatus: (draft: CanvasEditorState, status: CanvasSaveStatus) => void
  setDraft: (draft: CanvasEditorState, value: CanvasNodeDraft | null) => void
  setDraftName: (draft: CanvasEditorState, value: string) => void
  setDraftConfig: (draft: CanvasEditorState, value: string) => void
  markDraftClean: (draft: CanvasEditorState, workflowRevision: number) => void
  recordCommand: (draft: CanvasEditorState, command: CanvasEditorCommand) => void
  completeUndo: (draft: CanvasEditorState) => void
  completeRedo: (draft: CanvasEditorState) => void
  clearHistory: (draft: CanvasEditorState) => void
  setClipboard: (draft: CanvasEditorState, clipboard: CanvasClipboard | null) => void
  setLocalPosition: (draft: CanvasEditorState, nodeId: string, x: number, y: number) => void
  mergeLocalPositions: (draft: CanvasEditorState, positions: Readonly<Record<string, { readonly x: number; readonly y: number }>>) => void
  clearLocalPositions: (draft: CanvasEditorState) => void
}

/** Create the session-scoped Editor store handle declared by the Canvas view entry. */
export function createCanvasEditorStore(): EngineStoreHandle<CanvasEditorState, CanvasEditorActions> {
  return defineStore({
    init: (): CanvasEditorState => ({
      saveStatus: 'saved',
      draft: null,
      undo: [],
      redo: [],
      clipboard: null,
      localPositions: {},
    }),
    actions: {
      setSaveStatus: (d, status: CanvasSaveStatus) => { d.saveStatus = status },
      setDraft: (d, value: CanvasNodeDraft | null) => { d.draft = value },
      setDraftName: (d, value: string) => {
        if (d.draft === null) return
        d.draft = { ...d.draft, nameText: value, dirty: true }
      },
      setDraftConfig: (d, value: string) => {
        if (d.draft === null) return
        d.draft = { ...d.draft, configText: value, dirty: true }
      },
      markDraftClean: (d, workflowRevision: number) => {
        if (d.draft === null) return
        d.draft = { ...d.draft, baseWorkflowRevision: workflowRevision, dirty: false }
      },
      recordCommand: (d, command: CanvasEditorCommand) => {
        d.undo = [...d.undo, command].slice(-HISTORY_LIMIT)
        d.redo = []
      },
      completeUndo: (d) => {
        const command = d.undo.at(-1)
        if (command === undefined) return
        d.undo = d.undo.slice(0, -1)
        d.redo = [...d.redo, command].slice(-HISTORY_LIMIT)
      },
      completeRedo: (d) => {
        const command = d.redo.at(-1)
        if (command === undefined) return
        d.redo = d.redo.slice(0, -1)
        d.undo = [...d.undo, command].slice(-HISTORY_LIMIT)
      },
      clearHistory: (d) => { d.undo = []; d.redo = [] },
      setClipboard: (d, clipboard: CanvasClipboard | null) => { d.clipboard = clipboard },
      setLocalPosition: (d, nodeId: string, x: number, y: number) => {
        d.localPositions = { ...d.localPositions, [nodeId]: { x, y } }
      },
      mergeLocalPositions: (d, positions) => { d.localPositions = { ...d.localPositions, ...positions } },
      clearLocalPositions: (d) => { d.localPositions = {} },
    },
  })
}
