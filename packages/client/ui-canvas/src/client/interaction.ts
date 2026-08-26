/** Pure Browser builders from UI-local selection plus current Canvas Projection. */

import type {
  CanvasInteractionContext,
  CanvasSnapshot,
} from '@deepseek-ai/dsh-canvas/client'
import type { CanvasInteractionSelection, CanvasMode } from '../types.ts'

const EMPTY_SELECTION: CanvasInteractionSelection = Object.freeze({
  selectedNodeIds: [],
  selectedEdgeIds: [],
  selectedAssetRefs: [],
})

/** Whether the browser has a concrete deictic target worth attaching to a turn. */
export function hasCanvasInteractionTarget(selection: CanvasInteractionSelection): boolean {
  return selection.selectedNodeIds.length > 0
    || selection.selectedEdgeIds.length > 0
    || selection.selectedAssetRefs.length > 0
    || selection.focusedOutput !== undefined
    || selection.region !== undefined
}

/**
 * Return the selection only when it belongs to the current Canvas generation.
 * Revision-only drift remains visible because it is still the same document;
 * clear/re-create or workflow replacement never rebinds old browser-local state.
 */
export function interactionForCanvas(
  selection: CanvasInteractionSelection,
  canvas: CanvasSnapshot | null | undefined,
): CanvasInteractionSelection {
  const anchor = selection.anchor
  if (anchor === undefined || canvas === null || canvas === undefined || canvas.workflow === null) return EMPTY_SELECTION
  return anchor.canvasId === canvas.id
    && anchor.canvasCreatedAt === canvas.createdAt
    && anchor.workflowId === canvas.workflow.id
    ? selection
    : EMPTY_SELECTION
}

/**
 * Build a detached one-shot snapshot. A selection anchored to a replaced
 * Canvas generation/workflow is dropped rather than rebound to a different
 * document; revision-only drift is preserved so the Host can mark the context stale.
 */
export function buildCanvasInteractionContext(
  selection: CanvasInteractionSelection,
  canvas: CanvasSnapshot | null | undefined,
  mode: CanvasMode,
): CanvasInteractionContext | undefined {
  const currentSelection = interactionForCanvas(selection, canvas)
  if (!hasCanvasInteractionTarget(currentSelection) || canvas === null || canvas === undefined || canvas.workflow === null) {
    return undefined
  }
  const anchor = currentSelection.anchor
  if (anchor === undefined) return undefined

  const focusedOutput = currentSelection.focusedOutput !== undefined
    && canvas.output?.runId === currentSelection.focusedOutput.runId
    && currentSelection.focusedOutput.assetIndex < canvas.output.assets.length
    ? currentSelection.focusedOutput
    : undefined

  return structuredClone({
    canvasId: anchor.canvasId,
    workflowId: anchor.workflowId,
    workflowRevision: anchor.workflowRevision,
    mode,
    ...(currentSelection.selectedNodeIds.length === 0 ? {} : { selectedNodeIds: currentSelection.selectedNodeIds }),
    ...(currentSelection.selectedEdgeIds.length === 0 ? {} : { selectedEdgeIds: currentSelection.selectedEdgeIds }),
    ...(currentSelection.selectedAssetRefs.length === 0 ? {} : { selectedAssetRefs: currentSelection.selectedAssetRefs }),
    ...(focusedOutput === undefined ? {} : { focusedOutput }),
    ...(currentSelection.region === undefined ? {} : { region: currentSelection.region }),
  } satisfies CanvasInteractionContext)
}
