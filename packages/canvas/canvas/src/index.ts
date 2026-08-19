/**
 * Session-scoped Canvas domain vocabulary, durable migration/replay, Host authorization, and write service.
 * Provider execution, projections, Remotes, Agent tools, and UI remain later Canvas layers.
 *
 * @module @deepseek-ai/dsh-canvas
 */

export type * from './types.ts'
export type * from './events.ts'
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
export {
  CanvasSensitiveDataError,
  canonicalCanvasAccessContext,
  canvasChangeMeta,
  assertCanvasWorkflowAuditSafe,
} from './audit.ts'
export { CanvasAuthorizationPolicy, CanvasAuthorizationService } from './authorization.ts'
export {
  emptyCanvasFoldState,
  cloneCanvasFoldState,
  decodeCanvasChange,
  applyCanvasChange,
  applyCanvasEvent,
  foldCanvas,
} from './fold.ts'
export { CanvasService, CanvasServiceError } from './runtime.ts'
export { default } from './runtime.ts'
