/** Pure Browser builder from UI-local selection plus current Canvas Projection. */

import type {
  CanvasInteractionContext,
  CanvasSnapshot,
} from '@deepseek-ai/dsh-canvas/client'
import type { CanvasInteractionSelection, CanvasMode } from '../types.ts'

/** Whether the browser has a concrete deictic target worth attaching to a turn. */
export function hasCanvasInteractionTarget(selection: CanvasInteractionSelection): boolean {
  return selection.selectedNodeIds.length > 0
    || selection.selectedEdgeIds.length > 0
    || selection.selectedAssetRefs.length > 0
    || selection.focusedOutput !== undefined
    || selection.region !== undefined
}

/**
 * Build a detached one-shot snapshot. A selection anchored to a replaced
 * Canvas/workflow is dropped rather than rebound to a different document;
 * revision-only drift is preserved so the Host can mark the context stale.
 */
export function buildCanvasInteractionContext(
  selection: CanvasInteractionSelection,
  canvas: CanvasSnapshot | null | undefined,
  mode: CanvasMode,
): CanvasInteractionContext | undefined {
  if (!hasCanvasInteractionTarget(selection) || canvas === null || canvas === undefined || canvas.workflow === null) {
    return undefined
  }
  const anchor = selection.anchor
  if (anchor === undefined || anchor.canvasId !== canvas.id || anchor.workflowId !== canvas.workflow.id) return undefined

  const focusedOutput = selection.focusedOutput !== undefined
    && canvas.output?.runId === selection.focusedOutput.runId
    && selection.focusedOutput.assetIndex < canvas.output.assets.length
    ? selection.focusedOutput
    : undefined

  return structuredClone({
    canvasId: anchor.canvasId,
    workflowId: anchor.workflowId,
    workflowRevision: anchor.workflowRevision,
    mode,
    ...(selection.selectedNodeIds.length === 0 ? {} : { selectedNodeIds: selection.selectedNodeIds }),
    ...(selection.selectedEdgeIds.length === 0 ? {} : { selectedEdgeIds: selection.selectedEdgeIds }),
    ...(selection.selectedAssetRefs.length === 0 ? {} : { selectedAssetRefs: selection.selectedAssetRefs }),
    ...(focusedOutput === undefined ? {} : { focusedOutput }),
    ...(selection.region === undefined ? {} : { region: selection.region }),
  } satisfies CanvasInteractionContext)
}
