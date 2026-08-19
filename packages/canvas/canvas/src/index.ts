/**
 * Session-scoped Canvas domain vocabulary, pure runtime invariants, and durable migration seam.
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
export {
  CANVAS_CHANGE_VERSION,
  CANVAS_LAYOUT_SCHEMA_VERSION,
  MEDIA_WORKFLOW_NODE_VERSIONS,
  CanvasMigrationError,
  migrateStoredMediaWorkflow,
  decodeMediaWorkflow,
  migrateStoredCanvasSnapshot,
  decodeCanvasSnapshot,
  decodeCanvasChangeVersion,
  decodeCanvasLayoutSnapshot,
  decodeCanvasRunHistoryEntry,
} from './migration.ts'
