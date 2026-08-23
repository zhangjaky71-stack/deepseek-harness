import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  CANVAS_SCHEMA_VERSION,
  MEDIA_WORKFLOW_SCHEMA_VERSION,
  CanvasId,
  CanvasRunId,
  CanvasVariantId,
  MediaWorkflowId,
  VideoAssetId,
  WorkflowEdgeId,
  WorkflowNodeId,
  assertCanvasSnapshot,
  assertMediaWorkflow,
} from './domain.ts'
import type {
  CanvasAssetRef,
  CanvasChangeVersion,
  CanvasErrorCategory,
  CanvasJsonValue,
  CanvasLayoutSnapshot,
  CanvasMigrationErrorCode,
  CanvasMigrationNotice,
  CanvasMigrationResult,
  CanvasOutput,
  CanvasRunError,
  CanvasRunHistoryEntry,
  CanvasRunSnapshot,
  CanvasRunStatus,
  CanvasSnapshot,
  MediaWorkflow,
  MediaWorkflowEdge,
  MediaWorkflowNode,
  MediaWorkflowNodeType,
  VideoAssetRef,
} from './types.ts'

/** Current durable Canvas change-envelope version; N03 owns the envelope fields. */
export const CANVAS_CHANGE_VERSION: CanvasChangeVersion = 1
/** Current separately persisted editor-layout schema version. */
export const CANVAS_LAYOUT_SCHEMA_VERSION = 1

type CanvasCoreMediaWorkflowNodeType =
  | 'asset.input'
  | 'prompt'
  | 'image.generate'
  | 'image.edit'
  | 'video.generate'
  | 'video.image-to-video'
  | 'output'

/** Current durable versions for Canvas-owned V1 semantic node kinds only. Plugin versions are registry-owned. */
export const CORE_MEDIA_WORKFLOW_NODE_VERSIONS: Readonly<Record<CanvasCoreMediaWorkflowNodeType, number>> = {
  'asset.input': 1,
  'prompt': 1,
  'image.generate': 1,
  'image.edit': 1,
  'video.generate': 1,
  'video.image-to-video': 1,
  'output': 1,
}

const RUN_STATUSES: ReadonlySet<string> = new Set([
  'queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted',
])

const ERROR_CATEGORIES: ReadonlySet<string> = new Set([
  'validation', 'conflict', 'permission', 'provider', 'infrastructure', 'interrupted', 'quota',
])

const CORE_NODE_TYPES: ReadonlySet<string> = new Set(Object.keys(CORE_MEDIA_WORKFLOW_NODE_VERSIONS))
const HISTORICAL_NODE_TYPES: ReadonlySet<string> = new Set(['image.create'])

function invalid(subject: string, message: string): never {
  throw new CanvasMigrationError('CANVAS_MIGRATION_INVALID_VALUE', subject, message)
}

function record(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(subject, `${subject} must be an object`)
  return value as Record<string, unknown>
}

function array(value: unknown, subject: string): unknown[] {
  if (!Array.isArray(value)) invalid(subject, `${subject} must be an array`)
  return value
}

function string(value: unknown, subject: string): string {
  if (typeof value !== 'string') invalid(subject, `${subject} must be a string`)
  return value
}

function nonEmptyString(value: unknown, subject: string): string {
  const result = string(value, subject)
  if (result.length === 0) invalid(subject, `${subject} must be non-empty`)
  return result
}

function optionalString(value: unknown, subject: string): string | undefined {
  return value === undefined ? undefined : string(value, subject)
}

function number(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(subject, `${subject} must be a finite number`)
  return value
}

function nonNegativeInteger(value: unknown, subject: string): number {
  const result = number(value, subject)
  if (!Number.isSafeInteger(result) || result < 0) invalid(subject, `${subject} must be a non-negative safe integer`)
  return result
}

function positiveInteger(value: unknown, subject: string): number {
  const result = number(value, subject)
  if (!Number.isSafeInteger(result) || result < 1) invalid(subject, `${subject} must be a positive safe integer`)
  return result
}

function boolean(value: unknown, subject: string): boolean {
  if (typeof value !== 'boolean') invalid(subject, `${subject} must be a boolean`)
  return value
}

function requireAllowedKeys(source: Record<string, unknown>, allowed: ReadonlySet<string>, subject: string): void {
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) invalid(subject, `${subject} contains unsupported field "${key}"`)
  }
}

function jsonValue(value: unknown, subject: string): CanvasJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(subject, `${subject} contains a non-finite number`)
    return value
  }
  if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${subject}[${index}]`))
  if (typeof value === 'object') {
    const output: Record<string, CanvasJsonValue> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) output[key] = jsonValue(item, `${subject}.${key}`)
    return output
  }
  return invalid(subject, `${subject} must be JSON-compatible`)
}

function optionalPositiveInteger(value: unknown, subject: string): number | undefined {
  return value === undefined ? undefined : positiveInteger(value, subject)
}

function optionalNonNegativeInteger(value: unknown, subject: string): number | undefined {
  return value === undefined ? undefined : nonNegativeInteger(value, subject)
}

function schemaVersion(value: unknown, current: number, subject: string): number {
  const version = nonNegativeInteger(value, `${subject}.schemaVersion`)
  if (version > current) throw new CanvasMigrationError('CANVAS_UNSUPPORTED_FUTURE_SCHEMA', subject, `${subject} schema ${version} is newer than supported ${current}`)
  if (version < 1) throw new CanvasMigrationError('CANVAS_UNSUPPORTED_SCHEMA_VERSION', subject, `${subject} schema ${version} is not supported`)
  return version
}

function nodeVersion(type: string, value: unknown, nodeId: string): number {
  const version = positiveInteger(value, `workflow node ${nodeId}.nodeVersion`)
  if (!CORE_NODE_TYPES.has(type)) return version
  const supported = CORE_MEDIA_WORKFLOW_NODE_VERSIONS[type as CanvasCoreMediaWorkflowNodeType]
  if (version > supported) {
    throw new CanvasMigrationError(
      'CANVAS_UNSUPPORTED_FUTURE_NODE_VERSION',
      `workflow node ${nodeId}`,
      `node ${nodeId} type ${type} version ${version} is newer than supported ${supported}`,
    )
  }
  return version
}

function decodeNode(value: unknown, notices: CanvasMigrationNotice[]): MediaWorkflowNode {
  const source = record(value, 'workflow-node')
  requireAllowedKeys(source, new Set(['config', 'id', 'name', 'nodeVersion', 'type']), 'workflow-node')
  const id = WorkflowNodeId(nonEmptyString(source.id, 'workflow-node.id'))
  let type = nonEmptyString(source.type, `workflow-node ${id}.type`)
  const name = optionalString(source.name, `workflow-node ${id}.name`)
  let version = nodeVersion(type, source.nodeVersion, String(id))
  let config = jsonValue(source.config, `workflow-node ${id}.config`)
  if (HISTORICAL_NODE_TYPES.has(type)) {
    if (type === 'image.create') {
      notices.push({
        code: 'CANVAS_DEPRECATED_NODE',
        lifecycle: 'deprecated',
        nodeId: String(id),
        fromType: type,
        toType: 'image.generate',
      })
      type = 'image.generate'
      version = CORE_MEDIA_WORKFLOW_NODE_VERSIONS['image.generate']
      config = record(config, `workflow-node ${id}.config`) as CanvasJsonValue
    }
  }
  return {
    id,
    type: type as MediaWorkflowNodeType,
    nodeVersion: version,
    ...(name === undefined ? {} : { name }),
    config: config as MediaWorkflowNode['config'],
  }
}

function decodeEdge(value: unknown): MediaWorkflowEdge {
  const source = record(value, 'workflow-edge')
  requireAllowedKeys(source, new Set(['id', 'sourceNodeId', 'sourcePort', 'targetNodeId', 'targetPort']), 'workflow-edge')
  return {
    id: WorkflowEdgeId(nonEmptyString(source.id, 'workflow-edge.id')),
    sourceNodeId: WorkflowNodeId(nonEmptyString(source.sourceNodeId, 'workflow-edge.sourceNodeId')),
    sourcePort: nonEmptyString(source.sourcePort, 'workflow-edge.sourcePort'),
    targetNodeId: WorkflowNodeId(nonEmptyString(source.targetNodeId, 'workflow-edge.targetNodeId')),
    targetPort: nonEmptyString(source.targetPort, 'workflow-edge.targetPort'),
  }
}

function decodeWorkflowStructural(value: unknown, notices: CanvasMigrationNotice[]): MediaWorkflow {
  const source = record(value, 'media-workflow')
  requireAllowedKeys(source, new Set(['edges', 'id', 'name', 'nodes', 'outputNodeIds', 'schemaVersion']), 'media-workflow')
  schemaVersion(source.schemaVersion, MEDIA_WORKFLOW_SCHEMA_VERSION, 'media-workflow')
  return {
    id: MediaWorkflowId(nonEmptyString(source.id, 'media-workflow.id')),
    schemaVersion: MEDIA_WORKFLOW_SCHEMA_VERSION,
    name: nonEmptyString(source.name, 'media-workflow.name'),
    nodes: array(source.nodes, 'media-workflow.nodes').map(item => decodeNode(item, notices)),
    edges: array(source.edges, 'media-workflow.edges').map(decodeEdge),
    outputNodeIds: array(source.outputNodeIds, 'media-workflow.outputNodeIds').map((item, index) =>
      WorkflowNodeId(nonEmptyString(item, `media-workflow.outputNodeIds[${index}]`)),
    ),
  }
}

function decodeError(value: unknown): CanvasRunError {
  const source = record(value, 'canvas-run-error')
  requireAllowedKeys(source, new Set(['category', 'code', 'details', 'message', 'retryable']), 'canvas-run-error')
  const category = string(source.category, 'canvas-run-error.category')
  if (!ERROR_CATEGORIES.has(category)) invalid('canvas-run-error.category', `unsupported Canvas error category ${category}`)
  return {
    category: category as CanvasErrorCategory,
    code: nonEmptyString(source.code, 'canvas-run-error.code'),
    message: string(source.message, 'canvas-run-error.message'),
    retryable: boolean(source.retryable, 'canvas-run-error.retryable'),
    ...(source.details === undefined ? {} : { details: jsonValue(source.details, 'canvas-run-error.details') }),
  }
}

function decodeImage(value: unknown, subject: string): ImageAttachmentRef {
  const source = record(value, subject)
  requireAllowedKeys(source, new Set(['attachmentId', 'bytes', 'height', 'mediaType', 'name', 'sha256', 'width']), subject)
  const mediaType = string(source.mediaType, `${subject}.mediaType`)
  if (!mediaType.startsWith('image/')) invalid(`${subject}.mediaType`, 'image mediaType must start with image/')
  return {
    attachmentId: nonEmptyString(source.attachmentId, `${subject}.attachmentId`) as ImageAttachmentRef['attachmentId'],
    mediaType,
    bytes: nonNegativeInteger(source.bytes, `${subject}.bytes`),
    ...(source.name === undefined ? {} : { name: string(source.name, `${subject}.name`) }),
    ...(source.width === undefined ? {} : { width: positiveInteger(source.width, `${subject}.width`) }),
    ...(source.height === undefined ? {} : { height: positiveInteger(source.height, `${subject}.height`) }),
    ...(source.sha256 === undefined ? {} : { sha256: string(source.sha256, `${subject}.sha256`) }),
  }
}

function decodeVideo(value: unknown, subject: string): VideoAssetRef {
  const source = record(value, subject)
  requireAllowedKeys(source, new Set(['assetId', 'bytes', 'durationMs', 'height', 'mediaType', 'sha256', 'width']), subject)
  const mediaType = string(source.mediaType, `${subject}.mediaType`)
  if (!mediaType.startsWith('video/')) invalid(`${subject}.mediaType`, 'video mediaType must start with video/')
  return {
    assetId: VideoAssetId(nonEmptyString(source.assetId, `${subject}.assetId`)),
    mediaType,
    bytes: nonNegativeInteger(source.bytes, `${subject}.bytes`),
    ...(source.width === undefined ? {} : { width: positiveInteger(source.width, `${subject}.width`) }),
    ...(source.height === undefined ? {} : { height: positiveInteger(source.height, `${subject}.height`) }),
    ...(source.durationMs === undefined ? {} : { durationMs: nonNegativeInteger(source.durationMs, `${subject}.durationMs`) }),
    ...(source.sha256 === undefined ? {} : { sha256: string(source.sha256, `${subject}.sha256`) }),
  }
}

function decodeAsset(value: unknown, subject: string): CanvasAssetRef {
  const source = record(value, subject)
  requireAllowedKeys(source, new Set(['image', 'kind', 'video']), subject)
  const kind = string(source.kind, `${subject}.kind`)
  if (kind === 'image') {
    if (source.video !== undefined) invalid(subject, `${subject} image cannot include video`)
    return { kind: 'image', image: decodeImage(source.image, `${subject}.image`) }
  }
  if (kind === 'video') {
    if (source.image !== undefined) invalid(subject, `${subject} video cannot include image`)
    return { kind: 'video', video: decodeVideo(source.video, `${subject}.video`) }
  }
  return invalid(`${subject}.kind`, `unsupported Canvas asset kind ${kind}`)
}

function decodeRun(value: unknown): CanvasRunSnapshot {
  const source = record(value, 'canvas-run')
  requireAllowedKeys(
    source,
    new Set(['error', 'finishedAt', 'id', 'startedAt', 'status', 'variantId', 'workflowId', 'workflowRevision']),
    'canvas-run',
  )
  const statusValue = string(source.status, 'canvas-run.status')
  if (!RUN_STATUSES.has(statusValue)) invalid('canvas-run.status', `unsupported Canvas run status ${statusValue}`)
  const status = statusValue as CanvasRunStatus
  const variantId = optionalString(source.variantId, 'canvas-run.variantId')
  const finishedAt = optionalNonNegativeInteger(source.finishedAt, 'canvas-run.finishedAt')
  const error = source.error === undefined ? undefined : decodeError(source.error)
  const startedAt = nonNegativeInteger(source.startedAt, 'canvas-run.startedAt')
  const terminal = status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'interrupted'
  if (terminal && finishedAt === undefined) invalid('canvas-run.finishedAt', `terminal run ${String(source.id)} must include finishedAt`)
  if (!terminal && finishedAt !== undefined) invalid('canvas-run.finishedAt', `non-terminal run ${String(source.id)} cannot include finishedAt`)
  if (finishedAt !== undefined && finishedAt < startedAt) invalid('canvas-run.finishedAt', 'canvas-run.finishedAt must not precede startedAt')
  if (error !== undefined && status !== 'failed') invalid('canvas-run.error', 'canvas-run.error is allowed only for failed runs')
  return {
    id: CanvasRunId(nonEmptyString(source.id, 'canvas-run.id')),
    status,
    workflowId: MediaWorkflowId(nonEmptyString(source.workflowId, 'canvas-run.workflowId')),
    workflowRevision: positiveInteger(source.workflowRevision, 'canvas-run.workflowRevision'),
    startedAt,
    ...(variantId === undefined ? {} : { variantId: CanvasVariantId(nonEmptyString(variantId, 'canvas-run.variantId')) }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
    ...(error === undefined ? {} : { error }),
  }
}

function decodeOutput(value: unknown): CanvasOutput {
  const source = record(value, 'canvas-output')
  requireAllowedKeys(source, new Set(['assets', 'primaryAssetIndex', 'runId', 'workflowId', 'workflowRevision']), 'canvas-output')
  return {
    runId: CanvasRunId(nonEmptyString(source.runId, 'canvas-output.runId')),
    workflowId: MediaWorkflowId(nonEmptyString(source.workflowId, 'canvas-output.workflowId')),
    workflowRevision: positiveInteger(source.workflowRevision, 'canvas-output.workflowRevision'),
    assets: array(source.assets, 'canvas-output.assets').map((asset, index) => decodeAsset(asset, `canvas-output.assets[${index}]`)),
    primaryAssetIndex: nonNegativeInteger(source.primaryAssetIndex, 'canvas-output.primaryAssetIndex'),
  }
}

function decodeCanvasStructural(value: unknown, notices: CanvasMigrationNotice[]): CanvasSnapshot {
  const source = record(value, 'canvas-snapshot')
  requireAllowedKeys(
    source,
    new Set(['createdAt', 'id', 'output', 'run', 'runRevision', 'schemaVersion', 'updatedAt', 'workflow', 'workflowRevision']),
    'canvas-snapshot',
  )
  schemaVersion(source.schemaVersion, CANVAS_SCHEMA_VERSION, 'canvas-snapshot')
  return {
    schemaVersion: CANVAS_SCHEMA_VERSION,
    id: CanvasId(nonEmptyString(source.id, 'canvas-snapshot.id')),
    workflowRevision: nonNegativeInteger(source.workflowRevision, 'canvas-snapshot.workflowRevision'),
    runRevision: nonNegativeInteger(source.runRevision, 'canvas-snapshot.runRevision'),
    workflow: source.workflow === null ? null : decodeWorkflowStructural(source.workflow, notices),
    run: source.run === null ? null : decodeRun(source.run),
    output: source.output === null ? null : decodeOutput(source.output),
    createdAt: nonNegativeInteger(source.createdAt, 'canvas-snapshot.createdAt'),
    updatedAt: nonNegativeInteger(source.updatedAt, 'canvas-snapshot.updatedAt'),
  }
}

/** Error thrown when durable Canvas data cannot be migrated safely. */
export class CanvasMigrationError extends Error {
  override readonly name = 'CanvasMigrationError'

  constructor(
    readonly code: CanvasMigrationErrorCode,
    readonly subject: string,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Migrates one persisted MediaWorkflow into the current runtime shape.
 * The migration is deliberately structural. The caller decides when to apply
 * current semantic invariants through `assertMediaWorkflow`.
 * @param value Persisted workflow JSON.
 * @returns Current workflow plus lifecycle notices.
 */
export function migrateStoredMediaWorkflow(value: unknown): CanvasMigrationResult<MediaWorkflow> {
  const notices: CanvasMigrationNotice[] = []
  const workflow = decodeWorkflowStructural(value, notices)
  return { value: workflow, notices }
}

/**
 * Decodes and fully validates one persisted MediaWorkflow.
 * @param value Persisted workflow JSON.
 * @returns Current workflow plus migration notices.
 */
export function decodeMediaWorkflow(value: unknown): CanvasMigrationResult<MediaWorkflow> {
  const migrated = migrateStoredMediaWorkflow(value)
  try {
    assertMediaWorkflow(migrated.value)
  } catch (error) {
    if (error instanceof CanvasMigrationError) throw error
    const message = error instanceof Error ? error.message : 'invalid media workflow'
    invalid('media-workflow', message)
  }
  return migrated
}

/**
 * Migrates one stored Canvas snapshot structurally to the current runtime shape.
 * Semantic invariants are checked by {@link decodeCanvasSnapshot}; replay code may use this
 * structural form first and let the Session-event transition contract validate relationships.
 * @param value Persisted Canvas snapshot JSON.
 * @returns Current structural snapshot plus migration notices.
 */
export function migrateStoredCanvasSnapshot(value: unknown): CanvasMigrationResult<CanvasSnapshot> {
  const notices: CanvasMigrationNotice[] = []
  const snapshot = decodeCanvasStructural(value, notices)
  return { value: snapshot, notices }
}

/**
 * Decodes and validates one stored Canvas snapshot into current runtime shape.
 * @param value Persisted Canvas snapshot JSON.
 * @returns Current snapshot plus migration notices.
 */
export function decodeCanvasSnapshot(value: unknown): CanvasMigrationResult<CanvasSnapshot> {
  const migrated = migrateStoredCanvasSnapshot(value)
  try {
    assertCanvasSnapshot(migrated.value)
  } catch (error) {
    if (error instanceof CanvasMigrationError) throw error
    const message = error instanceof Error ? error.message : 'invalid Canvas snapshot'
    invalid('canvas-snapshot', message)
  }
  return migrated
}

/**
 * Decodes one stored Canvas change-envelope version.
 * @param value Durable envelope version.
 * @returns Current version when readable.
 */
export function decodeCanvasChangeVersion(value: unknown): CanvasChangeVersion {
  const decoded = nonNegativeInteger(value, 'canvas-change.version')
  if (decoded > CANVAS_CHANGE_VERSION) {
    throw new CanvasMigrationError(
      'CANVAS_UNSUPPORTED_FUTURE_SCHEMA',
      'canvas-change',
      `Canvas change version ${decoded} is newer than supported ${CANVAS_CHANGE_VERSION}`,
    )
  }
  if (decoded < 1) {
    throw new CanvasMigrationError(
      'CANVAS_UNSUPPORTED_SCHEMA_VERSION',
      'canvas-change',
      `Canvas change version ${decoded} is not supported`,
    )
  }
  return CANVAS_CHANGE_VERSION
}

/**
 * Structurally decodes one stored editor layout at the current schema version.
 * Current layout relationships are validated by `decodeCanvasLayoutSnapshot()` in `layout.ts`.
 * @param value Stored layout JSON value.
 * @returns Current structural layout value.
 */
export function migrateStoredCanvasLayoutSnapshot(value: unknown): CanvasLayoutSnapshot {
  const source = record(value, 'canvas-layout')
  requireAllowedKeys(source, new Set(['nodePositions', 'schemaVersion', 'updatedAt', 'viewport', 'workflowId']), 'canvas-layout')
  schemaVersion(source.schemaVersion, CANVAS_LAYOUT_SCHEMA_VERSION, 'canvas-layout')
  const positions = record(source.nodePositions, 'canvas-layout.nodePositions')
  const nodePositions: Record<string, { readonly x: number; readonly y: number }> = {}
  for (const [nodeId, positionValue] of Object.entries(positions)) {
    if (nodeId.length === 0) invalid('canvas-layout.nodePositions', 'canvas layout node id must be non-empty')
    const position = record(positionValue, `canvas-layout.nodePositions.${nodeId}`)
    requireAllowedKeys(position, new Set(['x', 'y']), `canvas-layout.nodePositions.${nodeId}`)
    nodePositions[nodeId] = {
      x: number(position.x, `canvas-layout.nodePositions.${nodeId}.x`),
      y: number(position.y, `canvas-layout.nodePositions.${nodeId}.y`),
    }
  }
  const viewportSource = source.viewport === undefined ? undefined : record(source.viewport, 'canvas-layout.viewport')
  if (viewportSource !== undefined) requireAllowedKeys(viewportSource, new Set(['x', 'y', 'zoom']), 'canvas-layout.viewport')
  const viewport = viewportSource === undefined
    ? undefined
    : {
        x: number(viewportSource.x, 'canvas-layout.viewport.x'),
        y: number(viewportSource.y, 'canvas-layout.viewport.y'),
        zoom: number(viewportSource.zoom, 'canvas-layout.viewport.zoom'),
      }
  return {
    schemaVersion: CANVAS_LAYOUT_SCHEMA_VERSION,
    workflowId: MediaWorkflowId(nonEmptyString(source.workflowId, 'canvas-layout.workflowId')),
    nodePositions: nodePositions as CanvasLayoutSnapshot['nodePositions'],
    ...(viewport === undefined ? {} : { viewport }),
    updatedAt: nonNegativeInteger(source.updatedAt, 'canvas-layout.updatedAt'),
  }
}

/**
 * Decodes one run-history compatibility DTO derived from Session history.
 * This decoder does not create a second durable authority; any cache using this DTO must remain rebuildable.
 * @param value Run-history JSON value at an API or rebuildable-cache boundary.
 * @returns Validated current history entry.
 */
export function decodeCanvasRunHistoryEntry(value: unknown): CanvasRunHistoryEntry {
  const source = record(value, 'canvas-run-history')
  requireAllowedKeys(
    source,
    new Set(['canvasId', 'finishedAt', 'outputs', 'promptSummary', 'runId', 'startedAt', 'status', 'variantId', 'workflowId', 'workflowRevision']),
    'canvas-run-history',
  )
  const statusValue = string(source.status, 'canvas-run-history.status')
  if (!RUN_STATUSES.has(statusValue as CanvasRunStatus)) invalid('canvas-run-history.status', `unsupported Canvas run status ${statusValue}`)
  const status = statusValue as CanvasRunStatus
  const variantId = optionalString(source.variantId, 'canvas-run-history.variantId')
  const finishedAt = source.finishedAt === undefined ? undefined : nonNegativeInteger(source.finishedAt, 'canvas-run-history.finishedAt')
  const promptSummary = optionalString(source.promptSummary, 'canvas-run-history.promptSummary')
  const startedAt = nonNegativeInteger(source.startedAt, 'canvas-run-history.startedAt')
  const terminal = status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'interrupted'
  if (terminal && finishedAt === undefined) invalid('canvas-run-history.finishedAt', `terminal history entry ${String(source.runId)} must include finishedAt`)
  if (!terminal && finishedAt !== undefined) invalid('canvas-run-history.finishedAt', `non-terminal history entry ${String(source.runId)} cannot include finishedAt`)
  if (finishedAt !== undefined && finishedAt < startedAt) invalid('canvas-run-history.finishedAt', 'canvas-run-history.finishedAt must not precede startedAt')
  return {
    canvasId: CanvasId(nonEmptyString(source.canvasId, 'canvas-run-history.canvasId')),
    runId: CanvasRunId(nonEmptyString(source.runId, 'canvas-run-history.runId')),
    ...(variantId === undefined ? {} : { variantId: CanvasVariantId(nonEmptyString(variantId, 'canvas-run-history.variantId')) }),
    workflowId: MediaWorkflowId(nonEmptyString(source.workflowId, 'canvas-run-history.workflowId')),
    workflowRevision: positiveInteger(source.workflowRevision, 'canvas-run-history.workflowRevision'),
    status,
    outputs: array(source.outputs, 'canvas-run-history.outputs').map((asset, index) =>
      decodeAsset(asset, `canvas-run-history.outputs[${index}]`),
    ),
    startedAt,
    ...(finishedAt === undefined ? {} : { finishedAt }),
    ...(promptSummary === undefined ? {} : { promptSummary }),
  }
}