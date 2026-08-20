/** Per-session browser-local Canvas node/edge/asset/focus selection store. */

import type {
  CanvasRegionSelection,
  CanvasSnapshot,
  WorkflowEdgeId,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  CanvasInteractionAnchor,
  CanvasInteractionSelection,
} from '../types.ts'

const EMPTY_SELECTION: CanvasInteractionSelection = Object.freeze({
  selectedNodeIds: [],
  selectedEdgeIds: [],
  selectedAssetRefs: [],
})

function anchorOf(canvas: CanvasSnapshot): CanvasInteractionAnchor | undefined {
  const workflow = canvas.workflow
  if (workflow === null) return undefined
  return {
    canvasId: canvas.id,
    workflowId: workflow.id,
    workflowRevision: canvas.workflowRevision,
  }
}

/** UI-local ledger keyed strictly by Session identity. */
export class CanvasInteractionStore {
  private readonly rows = new Map<SessionId, SnapshotStore<CanvasInteractionSelection>>()

  /** Stable observable face for one Session's transient Canvas selection. */
  faceOf(sessionId: SessionId): SnapshotStore<CanvasInteractionSelection> {
    return this.row(sessionId)
  }

  /** Select exactly one semantic node and anchor it to the observed workflow revision. */
  selectNode(sessionId: SessionId, canvas: CanvasSnapshot, nodeId: WorkflowNodeId): void {
    const anchor = anchorOf(canvas)
    if (anchor === undefined) return this.clear(sessionId)
    this.row(sessionId).set({
      anchor,
      selectedNodeIds: [nodeId],
      selectedEdgeIds: [],
      selectedAssetRefs: [],
    })
  }

  /** Select exactly one semantic edge. */
  selectEdge(sessionId: SessionId, canvas: CanvasSnapshot, edgeId: WorkflowEdgeId): void {
    const anchor = anchorOf(canvas)
    if (anchor === undefined) return this.clear(sessionId)
    this.row(sessionId).set({
      anchor,
      selectedNodeIds: [],
      selectedEdgeIds: [edgeId],
      selectedAssetRefs: [],
    })
  }

  /**
   * Focus one output candidate. The durable asset ref is copied into the
   * selection too, so it remains meaningful after a later run changes current output.
   */
  selectOutput(sessionId: SessionId, canvas: CanvasSnapshot, assetIndex: number): void {
    const anchor = anchorOf(canvas)
    const output = canvas.output
    const asset = output?.assets[assetIndex]
    if (anchor === undefined || output === null || asset === undefined) return this.clear(sessionId)
    this.row(sessionId).set({
      anchor,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedAssetRefs: [structuredClone(asset)],
      focusedOutput: { runId: output.runId, assetIndex },
    })
  }

  /** Region seam for later mask/inpaint editors. */
  setRegion(sessionId: SessionId, canvas: CanvasSnapshot, region: CanvasRegionSelection): void {
    const anchor = anchorOf(canvas)
    if (anchor === undefined) return this.clear(sessionId)
    this.row(sessionId).set({
      anchor,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedAssetRefs: [structuredClone(region.asset)],
      region: structuredClone(region),
    })
  }

  /** Clear one Session's transient selection without affecting other Sessions. */
  clear(sessionId: SessionId): void {
    this.row(sessionId).set(EMPTY_SELECTION)
  }

  /** Drop one Session row when an owning integration explicitly prunes it. */
  delete(sessionId: SessionId): void {
    this.rows.delete(sessionId)
  }

  private row(sessionId: SessionId): SnapshotStore<CanvasInteractionSelection> {
    let row = this.rows.get(sessionId)
    if (row !== undefined) return row
    row = createSnapshotStore<CanvasInteractionSelection>(EMPTY_SELECTION)
    this.rows.set(sessionId, row)
    return row
  }
}
