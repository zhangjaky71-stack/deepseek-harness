/**
 * Session-scoped Canvas domain vocabulary and pure runtime invariants.
 * Stateful Session integration is added by the Canvas service layer.
 *
 * @module @deepseek-ai/dsh-canvas
 */

export type * from './types.ts'
export {
  CANVAS_SCHEMA_VERSION,
  MEDIA_WORKFLOW_SCHEMA_VERSION,
  CanvasDomainError,
  CanvasId,
  MediaWorkflowId,
  WorkflowNodeId,
  WorkflowEdgeId,
  CanvasRunId,
  CanvasVariantId,
  VideoAssetId,
  createMediaWorkflow,
  createCanvasSnapshot,
  isCanvasRunTerminal,
  deriveCanvasProductState,
  assertCanvasJsonValue,
  assertMediaWorkflow,
  assertCanvasSnapshot,
} from './domain.ts'
