/**
 * Session-scoped Canvas domain, durable migration/replay, Host authorization, deployment feature
 * policy, projections/layout, bounded history, one-shot interaction context, and Typert-enabled services.
 * Provider execution, Agent tools, and media assets remain later Canvas layers.
 *
 * @module @deepseek-ai/dsh-canvas
 */

export type * from './types.ts'
export type * from './client.ts'
export type * from './interaction-types.ts'
export type * from './feature-types.ts'
export type * from './events.ts'
export type { CanvasLayoutChange, CanvasLayoutFoldState } from './layout.ts'
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
  CanvasFeatureError,
  resolveCanvasCapabilities,
  canvasFeatureEnabled,
  isVideoWorkflowNode,
  unavailableWorkflowFeatures,
  editUsesDisabledVideo,
} from './features.ts'
export {
  emptyCanvasFoldState,
  cloneCanvasFoldState,
  decodeCanvasChange,
  applyCanvasChange,
  applyCanvasEvent,
  foldCanvas,
} from './fold.ts'
export {
  CANVAS_LAYOUT_CHANGE_VERSION,
  CanvasLayoutError,
  assertCanvasLayoutSnapshot,
  createCanvasLayoutSnapshot,
  decodeCanvasLayoutChange,
  emptyCanvasLayoutFoldState,
  cloneCanvasLayoutFoldState,
  applyCanvasLayoutChange,
  applyCanvasLayoutEvent,
  foldCanvasLayout,
} from './layout.ts'
export { applyCanvasProjection, applyCanvasLayoutProjection } from './projection.ts'
export {
  DEFAULT_CANVAS_HISTORY_PAGE_SIZE,
  MAX_CANVAS_HISTORY_PAGE_SIZE,
  CanvasHistoryQueryError,
  listCanvasRunHistory,
  getCanvasRunHistory,
} from './history.ts'
export {
  CanvasInteractionContextError,
  decodeCanvasInteractionContext,
  resolveCanvasInteractionContext,
  renderCanvasInteractionContext,
} from './interaction.ts'
export { CanvasInteractionBridgeError } from './interaction-bridge.ts'
export { CanvasService, CanvasServiceError } from './runtime.ts'
export { default } from './runtime.ts'
