/** Session-scoped editor presentation store. Semantic workflow state stays in Session Projection. */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { CanvasId, MediaWorkflowId } from '@deepseek-ai/dsh-canvas/client'
import type { CanvasSaveStatus } from '../types.ts'
import type { CanvasClipboard, CanvasEditorCommand, CanvasNodeDraft } from './draft.ts'

const HISTORY_LIMIT = 100

/** Browser-local owner identity for transient editor state. */
export interface CanvasEditorOwner {
  readonly canvasId: CanvasId
  readonly canvasCreatedAt: number
  readonly workflowId: MediaWorkflowId
}

/** Revision fence carried with one undo/redo entry. */
export interface CanvasEditorHistoryEntry {
  readonly command: CanvasEditorCommand
  readonly expectedRevision: number
}

/** Presentation-only Editor state surviving view remounts for one Session. */
export interface CanvasEditorState {
  owner: CanvasEditorOwner | null
  saveStatus: CanvasSaveStatus
  draft: CanvasNodeDraft | null
  undo: readonly CanvasEditorHistoryEntry[]
  redo: readonly CanvasEditorHistoryEntry[]
  clipboard: CanvasClipboard | null
  localPositions: Readonly<Record<string, { readonly x: number; readonly y: number }>>
}

type CanvasEditorActions = {
  resetGeneration: (draft: CanvasEditorState, owner: CanvasEditorOwner | null) => void
  setSaveStatus: (draft: CanvasEditorState, status: CanvasSaveStatus) => void
  setDraft: (draft: CanvasEditorState, value: CanvasNodeDraft | null) => void
  setDraftName: (draft: CanvasEditorState, value: string) => void
  setDraftConfig: (draft: CanvasEditorState, value: string) => void
  markDraftClean: (draft: CanvasEditorState, workflowRevision: number) => void
  recordCommand: (draft: CanvasEditorState, command: CanvasEditorCommand, expectedRevision: number) => void
  completeUndo: (draft: CanvasEditorState, expectedRevision: number) => void
  completeRedo: (draft: CanvasEditorState, expectedRevision: number) => void
  clearHistory: (draft: CanvasEditorState) => void
  setClipboard: (draft: CanvasEditorState, clipboard: CanvasClipboard | null) => void
  setLocalPosition: (draft: CanvasEditorState, nodeId: string, x: number, y: number) => void
  mergeLocalPositions: (draft: CanvasEditorState, positions: Readonly<Record<string, { readonly x: number; readonly y: number }>>) => void
  clearLocalPositions: (draft: CanvasEditorState) => void
}

/** Create the session-scoped Editor store handle declared by the Canvas surface entry. */
export function createCanvasEditorStore(): EngineStoreHandle<CanvasEditorState, CanvasEditorActions> {
  return defineStore({
    init: (): CanvasEditorState => ({
      owner: null,
      saveStatus: 'saved',
      draft: null,
      undo: [],
      redo: [],
      clipboard: null,
      localPositions: {},
    }),
    actions: {
      // Clipboard is intentionally retained across generations: it is an explicit
      // copy payload, unlike drafts/history/layout state that belong to one document.
      resetGeneration: (d, owner) => {
        d.owner = owner
        d.saveStatus = 'saved'
        d.draft = null
        d.undo = []
        d.redo = []
        d.localPositions = {}
      },
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
      recordCommand: (d, command: CanvasEditorCommand, expectedRevision: number) => {
        d.undo = [...d.undo, { command, expectedRevision }].slice(-HISTORY_LIMIT)
        d.redo = []
      },
      completeUndo: (d, expectedRevision: number) => {
        const entry = d.undo.at(-1)
        if (entry === undefined) return
        d.undo = d.undo.slice(0, -1)
        d.redo = [...d.redo, { command: entry.command, expectedRevision }].slice(-HISTORY_LIMIT)
      },
      completeRedo: (d, expectedRevision: number) => {
        const entry = d.redo.at(-1)
        if (entry === undefined) return
        d.redo = d.redo.slice(0, -1)
        d.undo = [...d.undo, { command: entry.command, expectedRevision }].slice(-HISTORY_LIMIT)
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
