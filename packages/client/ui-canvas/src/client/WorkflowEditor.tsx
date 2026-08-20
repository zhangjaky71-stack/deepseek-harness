/** N11 workflow editor over Session Projection, atomic Host CAS, and independent layout persistence. */

import { useCallback, useEffect, useRef } from 'react'
import type {
  CanvasCapabilities,
  CanvasLayoutSnapshot,
  CanvasSnapshot,
  MediaWorkflowNode,
  SaveCanvasLayoutRequest,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/client'
import type { PropsStore, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  CanvasInteractionSelection,
  CanvasLayoutWriteResult,
  CanvasViewInjected,
  CanvasWorkflowWriteResult,
} from '../types.ts'
import { mergedLayoutPositions, toCanvasFlow } from './adapters.ts'
import {
  commandFor,
  copySelection,
  createNodeDraft,
  deleteSelectionOperations,
  nodeDraftOperations,
  pasteClipboard,
} from './draft.ts'
import { createCanvasEditorStore } from './store.ts'
import { NodeInspector } from './NodeInspector.tsx'
import { NodeLibrary } from './NodeLibrary.tsx'
import { ValidationPanel } from './ValidationPanel.tsx'
import css from './WorkflowEditor.module.css'

type EditorStoreProps = PropsStore<ReturnType<typeof createCanvasEditorStore>>

export interface WorkflowEditorProps extends EditorStoreProps {
  readonly canvas: CanvasSnapshot
  readonly layout: CanvasLayoutSnapshot | null
  readonly capabilities: CanvasCapabilities
  readonly interaction: CanvasInteractionSelection
  readonly onSelectNode: CanvasViewInjected['selectNode']
  readonly onSelectNodes: CanvasViewInjected['selectNodes']
  readonly onSelectEdge: CanvasViewInjected['selectEdge']
  readonly onClearSelection: CanvasViewInjected['clearSelection']
  readonly commitOperations: CanvasViewInjected['commitOperations']
  readonly saveLayout: CanvasViewInjected['saveLayout']
  readonly t: TranslateNS<'canvas'>
}

interface DragState {
  readonly nodeId: WorkflowNodeId
  readonly startPointerX: number
  readonly startPointerY: number
  readonly startX: number
  readonly startY: number
  x: number
  y: number
}

/** Semantic Editor: the current workflow always comes from Projection; store state is presentation-only. */
export function WorkflowEditor(props: WorkflowEditorProps) {
  const { canvas, layout, interaction, actions, useStore, t } = props
  const workflow = canvas.workflow
  if (workflow === null) return <div className={css.empty}>{t('editor.noWorkflow')}</div>

  const saveStatus = useStore(state => state.saveStatus)
  const draft = useStore(state => state.draft)
  const undo = useStore(state => state.undo)
  const redo = useStore(state => state.redo)
  const clipboard = useStore(state => state.clipboard)
  const localPositions = useStore(state => state.localPositions)
  const selectedNodeId = interaction.selectedNodeIds[0]
  const selectedNode = selectedNodeId === undefined ? undefined : workflow.nodes.find(node => node.id === selectedNodeId)
  const flow = toCanvasFlow(workflow, layout, localPositions)
  const drag = useRef<DragState | null>(null)

  const setFailure = useCallback((result: Exclude<CanvasWorkflowWriteResult | CanvasLayoutWriteResult, { ok: true }>) => {
    actions.setSaveStatus(result.status)
  }, [actions])

  const commitCommand = useCallback(async (
    command: ReturnType<typeof commandFor>,
    expectedRevision: number,
  ): Promise<CanvasWorkflowWriteResult> => {
    actions.setSaveStatus('saving')
    const result = await props.commitOperations(command.forward, expectedRevision)
    if (!result.ok) { setFailure(result); return result }
    actions.recordCommand(command, result.workflowRevision)
    actions.setSaveStatus('saved')
    return result
  }, [actions, props.commitOperations, setFailure])

  useEffect(() => {
    if (selectedNodeId === undefined) {
      if (draft !== null) actions.setDraft(null)
      return
    }
    const shouldRefresh = draft === null || draft.nodeId !== selectedNodeId || (!draft.dirty && draft.baseWorkflowRevision !== canvas.workflowRevision)
    if (shouldRefresh) actions.setDraft(createNodeDraft(canvas, selectedNodeId) ?? null)
  }, [actions, canvas, canvas.workflowRevision, draft, selectedNodeId])

  useEffect(() => {
    if (draft === null || !draft.dirty) return
    if (draft.baseWorkflowRevision !== canvas.workflowRevision) {
      actions.setSaveStatus('conflict')
      return
    }
    const timer = window.setTimeout(() => {
      let operations
      try { operations = nodeDraftOperations(workflow, draft) } catch { actions.setSaveStatus('save-failed'); return }
      if (operations.length === 0) { actions.markDraftClean(canvas.workflowRevision); actions.setSaveStatus('saved'); return }
      const command = commandFor(workflow, t('editor.commandEditNode'), operations)
      void commitCommand(command, draft.baseWorkflowRevision).then((result) => {
        if (result.ok) actions.markDraftClean(result.workflowRevision)
      })
    }, 450)
    return () => { window.clearTimeout(timer) }
  }, [actions, canvas.workflowRevision, commitCommand, draft, t, workflow])

  const persistPositions = useCallback(async (positions: SaveCanvasLayoutRequest['nodePositions']) => {
    actions.setSaveStatus('saving')
    const result = await props.saveLayout({ workflowId: workflow.id, nodePositions: positions })
    if (!result.ok) { setFailure(result); return false }
    actions.clearLocalPositions()
    actions.setSaveStatus('saved')
    return true
  }, [actions, props.saveLayout, setFailure, workflow.id])

  const copy = useCallback(() => {
    actions.setClipboard(copySelection(workflow, interaction.selectedNodeIds, layout) ?? null)
  }, [actions, interaction.selectedNodeIds, layout, workflow])

  const paste = useCallback(async () => {
    if (clipboard === null) return
    const plan = pasteClipboard(clipboard)
    const command = commandFor(workflow, t('editor.commandPaste'), plan.operations)
    const result = await commitCommand(command, canvas.workflowRevision)
    if (!result.ok) return
    actions.mergeLocalPositions(plan.positions)
    const persisted = mergedLayoutPositions(workflow, layout, localPositions)
    await persistPositions({ ...persisted, ...plan.positions } as SaveCanvasLayoutRequest['nodePositions'])
  }, [actions, canvas.workflowRevision, clipboard, commitCommand, layout, localPositions, persistPositions, t, workflow])

  const removeSelection = useCallback(async () => {
    const operations = deleteSelectionOperations(workflow, interaction.selectedNodeIds, interaction.selectedEdgeIds)
    if (operations.length === 0) return
    const command = commandFor(workflow, t('editor.commandDelete'), operations)
    const result = await commitCommand(command, canvas.workflowRevision)
    if (result.ok) props.onClearSelection()
  }, [canvas.workflowRevision, commitCommand, interaction.selectedEdgeIds, interaction.selectedNodeIds, props.onClearSelection, t, workflow])

  const undoOnce = useCallback(async () => {
    const entry = undo.at(-1)
    if (entry === undefined) return
    if (canvas.workflowRevision !== entry.expectedRevision) { actions.setSaveStatus('conflict'); return }
    actions.setSaveStatus('saving')
    const result = await props.commitOperations(entry.command.inverse, entry.expectedRevision)
    if (!result.ok) { setFailure(result); return }
    actions.completeUndo(result.workflowRevision)
    actions.setSaveStatus('saved')
  }, [actions, canvas.workflowRevision, props.commitOperations, setFailure, undo])

  const redoOnce = useCallback(async () => {
    const entry = redo.at(-1)
    if (entry === undefined) return
    if (canvas.workflowRevision !== entry.expectedRevision) { actions.setSaveStatus('conflict'); return }
    actions.setSaveStatus('saving')
    const result = await props.commitOperations(entry.command.forward, entry.expectedRevision)
    if (!result.ok) { setFailure(result); return }
    actions.completeRedo(result.workflowRevision)
    actions.setSaveStatus('saved')
  }, [actions, canvas.workflowRevision, props.commitOperations, redo, setFailure])

  const addFromExemplar = useCallback(async (source: MediaWorkflowNode) => {
    const id = `node-${globalThis.crypto.randomUUID()}` as WorkflowNodeId
    const node = { ...structuredClone(source), id, name: `${source.name ?? source.type} ${t('editor.copySuffix')}` }
    const command = commandFor(workflow, t('editor.commandAddNode'), [{ op: 'add-node', node }])
    const result = await commitCommand(command, canvas.workflowRevision)
    if (!result.ok) return
    const index = workflow.nodes.length
    const position = { x: 36 + (index % 4) * 220, y: 36 + Math.floor(index / 4) * 132 }
    actions.setLocalPosition(String(id), position.x, position.y)
    await persistPositions({
      ...mergedLayoutPositions(workflow, layout, localPositions),
      [id]: position,
    } as SaveCanvasLayoutRequest['nodePositions'])
  }, [actions, canvas.workflowRevision, commitCommand, layout, localPositions, persistPositions, t, workflow])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.matches('input, textarea, [contenteditable="true"]')) return
    const command = event.metaKey || event.ctrlKey
    if (command && event.key.toLowerCase() === 'a') { event.preventDefault(); props.onSelectNodes(canvas, workflow.nodes.map(node => node.id)); return }
    if (command && event.key.toLowerCase() === 'c') { event.preventDefault(); copy(); return }
    if (command && event.key.toLowerCase() === 'v') { event.preventDefault(); void paste(); return }
    if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); void (event.shiftKey ? redoOnce() : undoOnce()); return }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); void removeSelection() }
  }

  const nodeById = new Map(flow.nodes.map(node => [String(node.id), node] as const))
  const width = Math.max(760, ...flow.nodes.map(node => node.position.x + 210))
  const height = Math.max(440, ...flow.nodes.map(node => node.position.y + 110))

  return (
    <div className={css.editor} tabIndex={0} onKeyDown={onKeyDown}>
      <aside className={css.leftRail}>
        <NodeLibrary workflow={workflow} onAdd={node => { void addFromExemplar(node) }} t={t} />
        <div className={css.shortcutHelp}>{t('editor.shortcuts')}</div>
      </aside>
      <main className={css.center}>
        <div className={css.commandBar}>
          <button type="button" disabled={undo.length === 0 || saveStatus === 'saving'} onClick={() => { void undoOnce() }}>{t('editor.undo')}</button>
          <button type="button" disabled={redo.length === 0 || saveStatus === 'saving'} onClick={() => { void redoOnce() }}>{t('editor.redo')}</button>
          <button type="button" disabled={interaction.selectedNodeIds.length === 0} onClick={copy}>{t('editor.copy')}</button>
          <button type="button" disabled={clipboard === null || saveStatus === 'saving'} onClick={() => { void paste() }}>{t('editor.paste')}</button>
          <button type="button" disabled={interaction.selectedNodeIds.length === 0 && interaction.selectedEdgeIds.length === 0} onClick={() => { void removeSelection() }}>{t('editor.delete')}</button>
          <span>{workflow.name} · r{canvas.workflowRevision}</span>
        </div>
        <div className={css.graphViewport}>
          <div className={css.graphCanvas} style={{ width, height }}>
            <svg className={css.edges} width={width} height={height} aria-hidden="true">
              {flow.edges.map(edge => {
                const source = nodeById.get(String(edge.source)); const target = nodeById.get(String(edge.target))
                if (source === undefined || target === undefined) return null
                return <line key={edge.id} x1={source.position.x + 170} y1={source.position.y + 38} x2={target.position.x} y2={target.position.y + 38} />
              })}
            </svg>
            {flow.nodes.map(node => {
              const selected = interaction.selectedNodeIds.includes(node.id)
              const unavailable = !props.capabilities.video.enabled && (node.type === 'video.generate' || node.type === 'video.image-to-video')
              return (
                <button
                  key={node.id}
                  type="button"
                  className={css.node}
                  data-selected={selected ? 'true' : 'false'}
                  data-unavailable={unavailable ? 'true' : 'false'}
                  style={{ left: node.position.x, top: node.position.y }}
                  onClick={() => { props.onSelectNode(canvas, node.id) }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId)
                    drag.current = { nodeId: node.id, startPointerX: event.clientX, startPointerY: event.clientY, startX: node.position.x, startY: node.position.y, x: node.position.x, y: node.position.y }
                  }}
                  onPointerMove={(event) => {
                    const active = drag.current
                    if (active?.nodeId !== node.id) return
                    active.x = active.startX + event.clientX - active.startPointerX
                    active.y = active.startY + event.clientY - active.startPointerY
                    actions.setLocalPosition(String(node.id), active.x, active.y)
                  }}
                  onPointerUp={() => {
                    const active = drag.current
                    if (active?.nodeId !== node.id) return
                    drag.current = null
                    const positions = mergedLayoutPositions(workflow, layout, { ...localPositions, [String(node.id)]: { x: active.x, y: active.y } })
                    void persistPositions(positions)
                  }}
                >
                  <strong>{node.label}</strong><span>{node.type}</span>{unavailable && <em>{t('feature.unavailable')}</em>}
                </button>
              )
            })}
          </div>
        </div>
        {workflow.edges.length > 0 && <div className={css.edgeStrip}>{workflow.edges.map(edge => <button key={edge.id} type="button" aria-pressed={interaction.selectedEdgeIds.includes(edge.id)} onClick={() => { props.onSelectEdge(canvas, edge.id) }}>{edge.sourceNodeId} → {edge.targetNodeId}</button>)}</div>}
      </main>
      <aside className={css.rightRail}>
        <NodeInspector node={selectedNode} draft={draft} saveStatus={saveStatus} onNameChange={actions.setDraftName} onConfigChange={actions.setDraftConfig} t={t} />
        <ValidationPanel draft={draft} workflowRevision={canvas.workflowRevision} saveStatus={saveStatus} t={t} />
      </aside>
    </div>
  )
}
