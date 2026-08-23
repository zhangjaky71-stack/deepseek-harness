/** N11 workflow editor over Session Projection, atomic Host CAS, and independent layout persistence. */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type {
  CanvasCapabilities, CanvasNodeCatalogEntry, CanvasSnapshot, CurrentCanvasLayoutSnapshot, MediaWorkflow,
  SaveCanvasLayoutRequest, WorkflowEdgeId, WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/client'
import type { PropsStore, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { CanvasInteractionSelection, CanvasLayoutWriteResult, CanvasViewInjected, CanvasWorkflowWriteResult } from '../types.ts'
import { mergedLayoutPositions, toCanvasFlow } from './adapters.ts'
import { nodeCatalogAvailability } from './catalog.ts'
import { commandFor, copySelection, createNodeDraft, deleteSelectionOperations, nodeDraftOperations, pasteClipboard, type CanvasNodeDraft } from './draft.ts'
import {
  reconcileLayoutReceipt,
  reconcileProjectedLayoutRevision,
  type CanvasLayoutRevisionClock,
} from './layout-revision.ts'
import { createCanvasEditorStore } from './store.ts'
import { ConnectionPanel, type CanvasPortEndpoint } from './ConnectionPanel.tsx'
import { NodeInspector } from './NodeInspector.tsx'
import { NodeLibrary } from './NodeLibrary.tsx'
import { ValidationPanel } from './ValidationPanel.tsx'
import css from './WorkflowEditor.module.css'

type EditorStoreProps = PropsStore<ReturnType<typeof createCanvasEditorStore>>
type EditableCanvasSnapshot = CanvasSnapshot & { readonly workflow: MediaWorkflow }
export interface WorkflowEditorProps extends EditorStoreProps {
  readonly canvas: EditableCanvasSnapshot
  readonly layout: CurrentCanvasLayoutSnapshot | null
  readonly capabilities: CanvasCapabilities
  readonly nodeCatalog: readonly CanvasNodeCatalogEntry[]
  readonly interaction: CanvasInteractionSelection
  readonly onSelectNode: CanvasViewInjected['selectNode']
  readonly onSelectNodes: CanvasViewInjected['selectNodes']
  readonly onSelectEdge: CanvasViewInjected['selectEdge']
  readonly onClearSelection: CanvasViewInjected['clearSelection']
  readonly commitOperations: CanvasViewInjected['commitOperations']
  readonly saveLayout: CanvasViewInjected['saveLayout']
  readonly t: TranslateNS<'canvas'>
}
interface DragState { readonly nodeId: WorkflowNodeId; readonly startPointerX: number; readonly startPointerY: number; readonly startX: number; readonly startY: number; x: number; y: number }

export function WorkflowEditor(props: WorkflowEditorProps) {
  const { canvas, layout, interaction, actions, useStore, t } = props
  const workflow = canvas.workflow
  const compatibleLayout = layout?.canvasId === canvas.id && layout.workflowId === workflow.id ? layout : null
  const saveStatus = useStore(state => state.saveStatus); const draft = useStore(state => state.draft); const undo = useStore(state => state.undo); const redo = useStore(state => state.redo); const clipboard = useStore(state => state.clipboard); const localPositions = useStore(state => state.localPositions)
  const selectedNodeId = interaction.selectedNodeIds[0]; const selectedNode = selectedNodeId === undefined ? undefined : workflow.nodes.find(node => node.id === selectedNodeId)
  const selectedAvailability = selectedNode === undefined ? undefined : nodeCatalogAvailability(props.nodeCatalog, props.capabilities, selectedNode)
  const selectedReadOnlyReason = selectedAvailability !== undefined && !selectedAvailability.available ? selectedAvailability.reason : undefined
  const flow = toCanvasFlow(workflow, compatibleLayout, localPositions); const drag = useRef<DragState | null>(null)
  const projectedLayoutRevision = compatibleLayout?.layoutRevision ?? 0
  const layoutRevision = useRef<CanvasLayoutRevisionClock>({
    canvasId: canvas.id,
    workflowId: workflow.id,
    revision: projectedLayoutRevision,
  })
  const activeDraftSave = useRef<string | null>(null)
  const syncLayoutRevision = useCallback(() => {
    const next = reconcileProjectedLayoutRevision(
      layoutRevision.current,
      canvas.id,
      workflow.id,
      projectedLayoutRevision,
    )
    layoutRevision.current = next
    return next.revision
  }, [canvas.id, projectedLayoutRevision, workflow.id])
  const setFailure = useCallback((result: Exclude<CanvasWorkflowWriteResult | CanvasLayoutWriteResult, { ok: true }>) => { actions.setSaveStatus(result.status) }, [actions])
  const commitCommand = useCallback(async (command: ReturnType<typeof commandFor>, expectedRevision: number): Promise<CanvasWorkflowWriteResult> => {
    actions.setSaveStatus('saving'); const result = await props.commitOperations(command.forward, expectedRevision)
    if (!result.ok) { setFailure(result); return result }
    actions.recordCommand(command, result.workflowRevision); actions.setSaveStatus('saved'); return result
  }, [actions, props.commitOperations, setFailure])
  const saveDraft = useCallback(async (candidate: CanvasNodeDraft): Promise<void> => {
    if (!candidate.dirty) return
    if (candidate.baseWorkflowRevision !== canvas.workflowRevision) { actions.setSaveStatus('conflict'); return }
    const key = `${candidate.nodeId}:${candidate.baseWorkflowRevision}:${candidate.nameText}\u0000${candidate.configText}`
    if (activeDraftSave.current === key) return
    let operations
    try { operations = nodeDraftOperations(workflow, candidate) } catch { actions.setSaveStatus('save-failed'); return }
    if (operations.length === 0) { actions.markDraftClean(canvas.workflowRevision); actions.setSaveStatus('saved'); return }
    let command
    try { command = commandFor(workflow, t('editor.commandEditNode'), operations) } catch { actions.setSaveStatus('save-failed'); return }
    activeDraftSave.current = key
    try {
      const result = await commitCommand(command, candidate.baseWorkflowRevision)
      if (result.ok) actions.markDraftClean(result.workflowRevision)
    } finally {
      if (activeDraftSave.current === key) activeDraftSave.current = null
    }
  }, [actions, canvas.workflowRevision, commitCommand, t, workflow])

  useLayoutEffect(() => {
    syncLayoutRevision()
  }, [syncLayoutRevision])
  useEffect(() => {
    if (selectedNodeId === undefined || selectedNode === undefined || selectedReadOnlyReason !== undefined) { if (draft !== null) actions.setDraft(null); return }
    const refresh = draft === null || draft.nodeId !== selectedNodeId || (!draft.dirty && draft.baseWorkflowRevision !== canvas.workflowRevision)
    if (refresh) actions.setDraft(createNodeDraft(canvas, selectedNodeId) ?? null)
  }, [actions, canvas, canvas.workflowRevision, draft, selectedNode, selectedNodeId, selectedReadOnlyReason])
  useEffect(() => {
    if (draft === null || !draft.dirty) return
    if (draft.baseWorkflowRevision !== canvas.workflowRevision) { actions.setSaveStatus('conflict'); return }
    const timer = window.setTimeout(() => { void saveDraft(draft) }, 450)
    return () => { window.clearTimeout(timer) }
  }, [actions, canvas.workflowRevision, draft, saveDraft])

  const persistPositions = useCallback(async (positions: SaveCanvasLayoutRequest['nodePositions']) => {
    const canvasId = canvas.id
    const workflowId = workflow.id
    const expectedLayoutRevision = syncLayoutRevision()
    actions.setSaveStatus('saving')
    const result = await props.saveLayout({
      canvasId,
      workflowId,
      expectedLayoutRevision,
      nodePositions: positions,
    })
    if (!result.ok) { setFailure(result); return false }
    const current = layoutRevision.current
    if (current.canvasId !== canvasId || current.workflowId !== workflowId) return false
    layoutRevision.current = reconcileLayoutReceipt(current, canvasId, workflowId, result.layoutRevision)
    actions.clearLocalPositions(); actions.setSaveStatus('saved'); return true
  }, [actions, canvas.id, props.saveLayout, setFailure, syncLayoutRevision, workflow.id])
  const copy = useCallback(() => { actions.setClipboard(copySelection(workflow, interaction.selectedNodeIds, compatibleLayout) ?? null) }, [actions, compatibleLayout, interaction.selectedNodeIds, workflow])
  const paste = useCallback(async () => {
    if (clipboard === null) return
    const plan = pasteClipboard(clipboard); const result = await commitCommand(commandFor(workflow, t('editor.commandPaste'), plan.operations), canvas.workflowRevision)
    if (!result.ok) return
    actions.mergeLocalPositions(plan.positions); await persistPositions({ ...mergedLayoutPositions(workflow, compatibleLayout, localPositions), ...plan.positions } as SaveCanvasLayoutRequest['nodePositions'])
    props.onSelectNodes(canvas, plan.nodeIds)
  }, [actions, canvas, canvas.workflowRevision, clipboard, commitCommand, compatibleLayout, localPositions, persistPositions, props.onSelectNodes, t, workflow])
  const removeSelection = useCallback(async () => {
    const operations = deleteSelectionOperations(workflow, interaction.selectedNodeIds, interaction.selectedEdgeIds); if (operations.length === 0) return
    const result = await commitCommand(commandFor(workflow, t('editor.commandDelete'), operations), canvas.workflowRevision); if (result.ok) props.onClearSelection()
  }, [canvas.workflowRevision, commitCommand, interaction.selectedEdgeIds, interaction.selectedNodeIds, props.onClearSelection, t, workflow])
  const undoOnce = useCallback(async () => {
    const entry = undo.at(-1); if (entry === undefined) return
    if (canvas.workflowRevision !== entry.expectedRevision) { actions.setSaveStatus('conflict'); return }
    actions.setSaveStatus('saving'); const result = await props.commitOperations(entry.command.inverse, entry.expectedRevision)
    if (!result.ok) { setFailure(result); return }
    actions.completeUndo(result.workflowRevision); actions.setSaveStatus('saved')
  }, [actions, canvas.workflowRevision, props.commitOperations, setFailure, undo])
  const redoOnce = useCallback(async () => {
    const entry = redo.at(-1); if (entry === undefined) return
    if (canvas.workflowRevision !== entry.expectedRevision) { actions.setSaveStatus('conflict'); return }
    actions.setSaveStatus('saving'); const result = await props.commitOperations(entry.command.forward, entry.expectedRevision)
    if (!result.ok) { setFailure(result); return }
    actions.completeRedo(result.workflowRevision); actions.setSaveStatus('saved')
  }, [actions, canvas.workflowRevision, props.commitOperations, redo, setFailure])
  const addDefinition = useCallback(async (definition: CanvasNodeCatalogEntry) => {
    const id = `node-${globalThis.crypto.randomUUID()}` as WorkflowNodeId
    const node = { id, type: definition.type, nodeVersion: definition.version, name: definition.displayName, config: structuredClone(definition.defaultConfig) }
    const result = await commitCommand(commandFor(workflow, t('editor.commandAddNode'), [{ op: 'add-node', node }]), canvas.workflowRevision); if (!result.ok) return
    const index = workflow.nodes.length; const position = { x: 36 + (index % 4) * 220, y: 36 + Math.floor(index / 4) * 132 }
    actions.setLocalPosition(String(id), position.x, position.y)
    await persistPositions({ ...mergedLayoutPositions(workflow, compatibleLayout, localPositions), [id]: position } as SaveCanvasLayoutRequest['nodePositions'])
    props.onSelectNode(canvas, id)
  }, [actions, canvas, canvas.workflowRevision, commitCommand, compatibleLayout, localPositions, persistPositions, props.onSelectNode, t, workflow])
  const connect = useCallback(async (source: CanvasPortEndpoint, target: CanvasPortEndpoint) => {
    if (source.nodeId === target.nodeId || source.type !== target.type) { actions.setSaveStatus('save-failed'); return }
    const edge = { id: `edge-${globalThis.crypto.randomUUID()}` as WorkflowEdgeId, sourceNodeId: source.nodeId, sourcePort: source.port, targetNodeId: target.nodeId, targetPort: target.port }
    await commitCommand(commandFor(workflow, t('editor.commandConnect'), [{ op: 'connect', edge }]), canvas.workflowRevision)
  }, [actions, canvas.workflowRevision, commitCommand, t, workflow])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement; if (target.matches('input, textarea, select, [contenteditable="true"]')) return
    const command = event.metaKey || event.ctrlKey
    if (command && event.key.toLowerCase() === 'a') { event.preventDefault(); props.onSelectNodes(canvas, workflow.nodes.map(node => node.id)); return }
    if (command && event.key.toLowerCase() === 'c') { event.preventDefault(); copy(); return }
    if (command && event.key.toLowerCase() === 'v') { event.preventDefault(); void paste(); return }
    if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); void (event.shiftKey ? redoOnce() : undoOnce()); return }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); void removeSelection() }
  }
  const nodeById = new Map(flow.nodes.map(node => [String(node.id), node] as const)); const width = Math.max(760, ...flow.nodes.map(node => node.position.x + 210)); const height = Math.max(440, ...flow.nodes.map(node => node.position.y + 110))
  return <div className={css.editor} tabIndex={0} onKeyDown={onKeyDown}>
    <aside className={css.leftRail}><NodeLibrary catalog={props.nodeCatalog} capabilities={props.capabilities} onAdd={definition => { void addDefinition(definition) }} t={t} /><div className={css.shortcutHelp}>{t('editor.shortcuts')}</div></aside>
    <main className={css.center}>
      <div className={css.commandBar}><button type="button" disabled={undo.length === 0 || saveStatus === 'saving'} onClick={() => { void undoOnce() }}>{t('editor.undo')}</button><button type="button" disabled={redo.length === 0 || saveStatus === 'saving'} onClick={() => { void redoOnce() }}>{t('editor.redo')}</button><button type="button" disabled={interaction.selectedNodeIds.length === 0} onClick={copy}>{t('editor.copy')}</button><button type="button" disabled={clipboard === null || saveStatus === 'saving'} onClick={() => { void paste() }}>{t('editor.paste')}</button><button type="button" disabled={interaction.selectedNodeIds.length === 0 && interaction.selectedEdgeIds.length === 0} onClick={() => { void removeSelection() }}>{t('editor.delete')}</button><span>{workflow.name} · r{canvas.workflowRevision}</span></div>
      <div className={css.graphViewport}><div className={css.graphCanvas} style={{ width, height }}><svg className={css.edges} width={width} height={height} aria-hidden="true">{flow.edges.map(edge => { const source = nodeById.get(String(edge.source)); const target = nodeById.get(String(edge.target)); return source === undefined || target === undefined ? null : <line key={edge.id} x1={source.position.x + 170} y1={source.position.y + 38} x2={target.position.x} y2={target.position.y + 38} /> })}</svg>{flow.nodes.map(node => {
        const selected = interaction.selectedNodeIds.includes(node.id); const availability = nodeCatalogAvailability(props.nodeCatalog, props.capabilities, node); const unavailable = !availability.available
        return <button key={node.id} type="button" className={css.node} data-selected={selected ? 'true' : 'false'} data-unavailable={unavailable ? 'true' : 'false'} style={{ left: node.position.x, top: node.position.y }} onClick={() => { props.onSelectNode(canvas, node.id) }} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { nodeId: node.id, startPointerX: event.clientX, startPointerY: event.clientY, startX: node.position.x, startY: node.position.y, x: node.position.x, y: node.position.y } }} onPointerMove={event => { const active = drag.current; if (active?.nodeId !== node.id) return; active.x = active.startX + event.clientX - active.startPointerX; active.y = active.startY + event.clientY - active.startPointerY; actions.setLocalPosition(String(node.id), active.x, active.y) }} onPointerUp={() => { const active = drag.current; if (active?.nodeId !== node.id) return; drag.current = null; void persistPositions(mergedLayoutPositions(workflow, compatibleLayout, { ...localPositions, [String(node.id)]: { x: active.x, y: active.y } })) }}><strong>{node.label}</strong><span>{node.type}@{node.nodeVersion ?? 1}</span>{unavailable && <em>{t('feature.unavailable')}</em>}</button>
      })}</div></div>
      {workflow.edges.length > 0 && <div className={css.edgeStrip}>{workflow.edges.map(edge => <button key={edge.id} type="button" aria-pressed={interaction.selectedEdgeIds.includes(edge.id)} onClick={() => { props.onSelectEdge(canvas, edge.id) }}>{edge.sourceNodeId} → {edge.targetNodeId}</button>)}</div>}
    </main>
    <aside className={css.rightRail}><NodeInspector node={selectedNode} draft={draft} saveStatus={saveStatus} readOnlyReason={selectedReadOnlyReason} onNameChange={actions.setDraftName} onConfigChange={actions.setDraftConfig} onBlur={() => { if (draft !== null) void saveDraft(draft) }} t={t} /><ConnectionPanel workflow={workflow} catalog={props.nodeCatalog} capabilities={props.capabilities} disabled={saveStatus === 'saving'} onConnect={(source, target) => { void connect(source, target) }} t={t} /><ValidationPanel draft={draft} workflowRevision={canvas.workflowRevision} saveStatus={saveStatus} t={t} /></aside>
  </div>
}