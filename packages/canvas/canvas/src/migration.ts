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
  KnownMediaWorkflowNodeType,
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
/** Current durable versions for Canvas-owned V1 semantic node kinds only. Plugin versions are registry-owned. */
export const CORE_MEDIA_WORKFLOW_NODE_VERSIONS: Readonly<Record<KnownMediaWorkflowNodeType, number>> = {
  'asset.input': 1,
  'prompt': 1,
  'image.generate': 1,
  'image.edit': 1,
  'video.generate': 1,
  'video.image-to-video': 1,
  'output': 1,
}

/** Stable failure raised while decoding or migrating durable Canvas values. */
export class CanvasMigrationError extends Error {
  /** Stable machine-readable reason. */
  readonly code: CanvasMigrationErrorCode
  /** Durable value whose version or fields failed decoding. */
  readonly subject: string
  /** Rejected version when the failure is version-related. */
  readonly version?: number

  /**
   * Creates one stable migration failure.
   * @param code Stable machine-readable reason.
   * @param subject Durable value being decoded.
   * @param message Human-readable diagnostic.
   * @param version Rejected schema or Canvas-owned node version when applicable.
   */
  constructor(code: CanvasMigrationErrorCode, subject: string, message: string, version?: number) {
    super(message)
    this.name = 'CanvasMigrationError'
    this.code = code
    this.subject = subject
    if (version !== undefined) this.version = version
  }
}

type UnknownRecord = Record<string, unknown>

const RUN_STATUSES = new Set<CanvasRunStatus>(['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'])
const ERROR_CATEGORIES = new Set<CanvasErrorCategory>([
  'validation',
  'conflict',
  'permission',
  'provider',
  'infrastructure',
  'interrupted',
  'quota',
])
const IMAGE_MEDIA_TYPES = new Set<ImageAttachmentRef['mediaType']>(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function invalid(subject: string, message: string): never {
  throw new CanvasMigrationError('CANVAS_MIGRATION_INVALID_VALUE', subject, message)
}

function record(value: unknown, subject: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(subject, `${subject} must be an object`)
  return value as UnknownRecord
}

function requireAllowedKeys(source: UnknownRecord, allowed: ReadonlySet<string>, subject: string): void {
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) invalid(subject, `${subject} contains unsupported field "${key}"`)
  }
}

function array(value: unknown, subject: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(subject, `${subject} must be an array`)
  return value
}

function string(value: unknown, subject: string): string {
  if (typeof value !== 'string') invalid(subject, `${subject} must be a string`)
  return value
}

function nonEmptyString(value: unknown, subject: string): string {
  const decoded = string(value, subject)
  if (decoded.length === 0) invalid(subject, `${subject} must be non-empty`)
  return decoded
}

function number(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(subject, `${subject} must be a finite number`)
  return value
}

function integer(value: unknown, subject: string): number {
  const decoded = number(value, subject)
  if (!Number.isSafeInteger(decoded)) invalid(subject, `${subject} must be a safe integer`)
  return decoded
}

function nonNegativeInteger(value: unknown, subject: string): number {
  const decoded = integer(value, subject)
  if (decoded < 0) invalid(subject, `${subject} must be a non-negative safe integer`)
  return decoded
}

function positiveInteger(value: unknown, subject: string): number {
  const decoded = integer(value, subject)
  if (decoded < 1) invalid(subject, `${subject} must be a positive safe integer`)
  return decoded
}

function optionalString(value: unknown, subject: string): string | undefined {
  return value === undefined ? undefined : string(value, subject)
}

function optionalNumber(value: unknown, subject: string): number | undefined {
  return value === undefined ? undefined : number(value, subject)
}

function optionalPositiveInteger(value: unknown, subject: string): number | undefined {
  return value === undefined ? undefined : positiveInteger(value, subject)
}

function json(value: unknown, subject: string, ancestors = new Set<object>()): CanvasJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(subject, `${subject} contains a non-finite number`)
    return value
  }
  if (typeof value !== 'object') invalid(subject, `${subject} is not JSON-safe`)
  if (ancestors.has(value)) invalid(subject, `${subject} contains a cycle`)
  const next = new Set(ancestors)
  next.add(value)
  if (Array.isArray(value)) return value.map((item, index) => json(item, `${subject}[${index}]`, next))
  const source = value as UnknownRecord
  const output: Record<string, CanvasJsonValue> = {}
  for (const [key, item] of Object.entries(source)) output[key] = json(item, `${subject}.${key}`, next)
  return output
}

function schemaVersion(value: unknown, current: number, subject: string): number {
  const decoded = integer(value, `${subject}.schemaVersion`)
  if (decoded > current) {
    throw new CanvasMigrationError(
      'CANVAS_UNSUPPORTED_FUTURE_SCHEMA',
      subject,
      `${subject} schema version ${decoded} is newer than supported version ${current}`,
      decoded,
    )
  }
  if (decoded !== current) {
    throw new CanvasMigrationError(
      'CANVAS_UNSUPPORTED_SCHEMA_VERSION',
      subject,
      `${subject} schema version ${decoded} has no migration path to version ${current}`,
      decoded,
    )
  }
  return decoded
}

function coreNodeVersion(value: unknown, current: number, subject: string): number {
  const decoded = value === undefined ? 1 : positiveInteger(value, `${subject}.nodeVersion`)
  if (decoded > current) {
    throw new CanvasMigrationError(
      'CANVAS_UNSUPPORTED_FUTURE_NODE_VERSION',
      subject,
      `${subject} Canvas-owned node version ${decoded} is newer than supported version ${current}`,
      decoded,
    )
  }
  if (decoded !== current) {
    throw new CanvasMigrationError(
      'CANVAS_UNSUPPORTED_NODE_VERSION',
      subject,
      `${subject} Canvas-owned node version ${decoded} has no migration path to version ${current}`,
      decoded,
    )
  }
  return decoded
}

function isCoreNodeType(type: string): type is KnownMediaWorkflowNodeType {
  return Object.prototype.hasOwnProperty.call(CORE_MEDIA_WORKFLOW_NODE_VERSIONS, type)
}

function optionalNodeName(source: UnknownRecord, subject: string): { readonly name?: string } {
  const name = optionalString(source.name, `${subject}.name`)
  return name === undefined ? {} : { name }
}

function migrateNode(value: unknown, index: number): CanvasMigrationResult<MediaWorkflowNode> {
  const subject = `media-workflow.nodes[${index}]`
  const source = record(value, subject)
  requireAllowedKeys(source, new Set(['config', 'id', 'name', 'nodeVersion', 'type']), subject)
  const id = WorkflowNodeId(nonEmptyString(source.id, `${subject}.id`))
  const rawType = nonEmptyString(source.type, `${subject}.type`)
  const configValue = record(source.config, `${subject}.config`)
  const config: Record<string, CanvasJsonValue> = {}
  for (const [key, item] of Object.entries(configValue)) config[key] = json(item, `${subject}.config.${key}`)

  // Frozen pre-registry V1 fixture only. Current writers never emit this retired alias.
  if (rawType === 'image.create') {
    coreNodeVersion(source.nodeVersion, 1, subject)
    return {
      value: { id, type: 'image.generate', nodeVersion: 1, ...optionalNodeName(source, subject), config },
      notices: [
        {
          code: 'CANVAS_DEPRECATED_NODE',
          lifecycle: 'deprecated',
          nodeId: id,
          fromType: rawType,
          toType: 'image.generate',
        },
      ],
    }
  }

  if (isCoreNodeType(rawType)) {
    return {
      value: {
        id,
        type: rawType,
        nodeVersion: coreNodeVersion(source.nodeVersion, CORE_MEDIA_WORKFLOW_NODE_VERSIONS[rawType], subject),
        ...optionalNodeName(source, subject),
        config,
      },
      notices: [],
    }
  }

  const pluginNodeVersion = optionalPositiveInteger(source.nodeVersion, `${subject}.nodeVersion`)
  return {
    value: {
      id,
      type: rawType as MediaWorkflowNodeType,
      ...(pluginNodeVersion === undefined ? {} : { nodeVersion: pluginNodeVersion }),
      ...optionalNodeName(source, subject),
      config,
    },
    notices: [],
  }
}

function migrateEdge(value: unknown, index: number): MediaWorkflowEdge {
  const subject = `media-workflow.edges[${index}]`
  const source = record(value, subject)
  requireAllowedKeys(source, new Set(['id', 'sourceNodeId', 'sourcePort', 'targetNodeId', 'targetPort']), subject)
  return {
    id: WorkflowEdgeId(nonEmptyString(source.id, `${subject}.id`)),
    sourceNodeId: WorkflowNodeId(nonEmptyString(source.sourceNodeId, `${subject}.sourceNodeId`)),
    sourcePort: nonEmptyString(source.sourcePort, `${subject}.sourcePort`),
    targetNodeId: WorkflowNodeId(nonEmptyString(source.targetNodeId, `${subject}.targetNodeId`)),
    targetPort: nonEmptyString(source.targetPort, `${subject}.targetPort`),
  }
}

/**
 * Decodes and migrates one stored workflow without applying current relational invariants.
 * Unknown plugin nodes remain structurally intact; N10/N12 decide current availability and executability.
 * @param value Stored JSON value read from a durable boundary.
 * @returns Current runtime workflow plus non-fatal migration notices.
 */
export function migrateStoredMediaWorkflow(value: unknown): CanvasMigrationResult<MediaWorkflow> {
  const source = record(value, 'media-workflow')
  requireAllowedKeys(source, new Set(['edges', 'id', 'name', 'nodes', 'outputNodeIds', 'schemaVersion']), 'media-workflow')
  schemaVersion(source.schemaVersion, MEDIA_WORKFLOW_SCHEMA_VERSION, 'media-workflow')
  const notices: CanvasMigrationNotice[] = []
  const nodes = array(source.nodes, 'media-workflow.nodes').map((node, index) => {
    const migrated = migrateNode(node, index)
    notices.push(...migrated.notices)
    return migrated.value
  })
  const edges = array(source.edges, 'media-workflow.edges').map(migrateEdge)
  const outputNodeIds = array(source.outputNodeIds, 'media-workflow.outputNodeIds').map((nodeId, index) =>
    WorkflowNodeId(nonEmptyString(nodeId, `media-workflow.outputNodeIds[${index}]`)),
  )
  return {
    value: {
      id: MediaWorkflowId(nonEmptyString(source.id, 'media-workflow.id')),
      schemaVersion: MEDIA_WORKFLOW_SCHEMA_VERSION,
      name: string(source.name, 'media-workflow.name'),
      nodes,
      edges,
      outputNodeIds,
    },
    notices,
  }
}

/**
 * Decodes, migrates, then validates one stored workflow against the current Canvas domain.
 * @param value Stored JSON value read from a durable boundary.
 * @returns Current validated workflow plus non-fatal migration notices.
 */
export function decodeMediaWorkflow(value: unknown): CanvasMigrationResult<MediaWorkflow> {
  const migrated = migrateStoredMediaWorkflow(value)
  assertMediaWorkflow(migrated.value)
  return migrated
}

function decodeRunError(value: unknown, subject: string): CanvasRunError {
  const source = record(value, subject)
  requireAllowedKeys(source, new Set(['category', 'code', 'message']), subject)
  const category = string(source.category, `${subject}.category`)
  if (!ERROR_CATEGORIES.has(category as CanvasErrorCategory)) {
    invalid(`${subject}.category`, `unsupported Canvas error category ${category}`)
  }
  return {
    category: category as CanvasErrorCategory,
    code: nonEmptyString(source.code, `${subject}.code`),
    message: nonEmptyString(source.message, `${subject}.message`),
  }
}

function decodeRun(value: unknown, subject: string): CanvasRunSnapshot {
  const source = record(value, subject)
  requireAllowedKeys(source, new Set(['activeNodeId', 'error', 'finishedAt', 'id', 'startedAt', 'status', 'workflowId', 'workflowRevision']), subject)
  const statusValue = string(source.status, `${subject}.status`)
  if (!RUN_STATUSES.has(statusValue as CanvasRunStatus)) invalid(`${subject}.status`, `unsupported Canvas run status ${statusValue}`)
  const activeNodeId = optionalString(source.activeNodeId, `${subject}.activeNodeId`)
  const finishedAt = source.finishedAt === undefined ? undefined : nonNegativeInteger(source.finishedAt, `${subject}.finishedAt`)
  const error = source.error === undefined ? undefined : decodeRunError(source.error, `${subject}.error`)
  return {
    id: CanvasRunId(nonEmptyString(source.id, `${subject}.id`)),
    status: statusValue as CanvasRunStatus,
    workflowId: MediaWorkflowId(nonEmptyString(source.workflowId, `${subject}.workflowId`)),
    workflowRevision: positiveInteger(source.workflowRevision, `${subject}.workflowRevision`),
    ...(activeNodeId === undefined ? {} : { activeNodeId: WorkflowNodeId(nonEmptyString(activeNodeId, `${subject}.activeNodeId`)) }),
    startedAt: nonNegativeInteger(source.startedAt, `${subject}.startedAt`),
    ...(finishedAt === undefined ? {} : { finishedAt }),
    ...(error === undefined ? {} : { error }),
  }
}

function decodeVideoRef(value: unknown, subject: string): VideoAssetRef {
  const source = record(value, subject)
  requireAllowedKeys(source, new Set(['assetId', 'bytes', 'durationMs', 'height', 'mediaType', 'width']), subject)
  const mediaType = nonEmptyString(source.mediaType, `${subject}.mediaType`)
  if (!mediaType.startsWith('video/')) invalid(`${subject}.mediaType`, `${subject}.mediaType must use a video/* MIME type`)
  const width = optionalPositiveInteger(source.width, `${subject}.width`)
  const height = optionalPositiveInteger(source.height, `${subject}.height`)
  const durationMs = optionalPositiveInteger(source.durationMs, `${subject}.durationMs`)
  return {
    assetId: VideoAssetId(nonEmptyString(source.assetId, `${subject}.assetId`)),
    mediaType,
    bytes: nonNegativeInteger(source.bytes, `${subject}.bytes`),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(durationMs === undefined ? {} : { durationMs }),
  }
}

function decodeImageRef(value: unknown, subject: string): Readonly<ImageAttachmentRef> {
  const source = record(value, subject)
  requireAllowedKeys(source, new Set(['attachmentId', 'bytes', 'height', 'mediaType', 'name', 'width']), subject)
  const name = optionalString(source.name, `${subject}.name`)
  const mediaType = nonEmptyString(source.mediaType, `${subject}.mediaType`) as ImageAttachmentRef['mediaType']
  if (!IMAGE_MEDIA_TYPES.has(mediaType)) invalid(`${subject}.mediaType`, `unsupported image media type ${mediaType}`)
  return {
    attachmentId: nonEmptyString(source.attachmentId, `${subject}.attachmentId`) as ImageAttachmentRef['attachmentId'],
    mediaType,
    bytes: nonNegativeInteger(source.bytes, `${subject}.bytes`),
    width: positiveInteger(source.width, `${subject}.width`),
    height: positiveInteger(source.height, `${subject}.height`),
    ...(name === undefined ? {} : { name }),
  }
}

function decodeAsset(value: unknown, subject: string): CanvasAssetRef {
  const source = record(value, subject)
  const kind = string(source.kind, `${subject}.kind`)
  if (kind === 'image') {
    requireAllowedKeys(source, new Set(['image', 'kind']), subject)
    return { kind, image: decodeImageRef(source.image, `${subject}.image`) }
  }
  if (kind === 'video') {
    requireAllowedKeys(source, new Set(['kind', 'video']), subject)
    return { kind, video: decodeVideoRef(source.video, `${subject}.video`) }
  }
  return invalid(`${subject}.kind`, `unsupported Canvas asset kind ${kind}`)
}

function decodeOutput(value: unknown, subject: string): CanvasOutput {
  const source = record(value, subject)
  requireAllowedKeys(source, new Set(['assets', 'primaryAssetIndex', 'runId', 'workflowId', 'workflowRevision']), subject)
  return {
    runId: CanvasRunId(nonEmptyString(source.runId, `${subject}.runId`)),
    workflowId: MediaWorkflowId(nonEmptyString(source.workflowId, `${subject}.workflowId`)),
    workflowRevision: positiveInteger(source.workflowRevision, `${subject}.workflowRevision`),
    assets: array(source.assets, `${subject}.assets`).map((asset, index) => decodeAsset(asset, `${subject}.assets[${index}]`)),
    primaryAssetIndex: nonNegativeInteger(source.primaryAssetIndex, `${subject}.primaryAssetIndex`),
  }
}

/**
 * Decodes and migrates one stored Canvas snapshot without applying current relational invariants.
 * @param value Stored JSON value read from a durable boundary.
 * @returns Current runtime snapshot plus workflow/node migration notices.
 */
export function migrateStoredCanvasSnapshot(value: unknown): CanvasMigrationResult<CanvasSnapshot> {
  const source = record(value, 'canvas-snapshot')
  requireAllowedKeys(
    source,
    new Set(['createdAt', 'currentVariantId', 'id', 'output', 'run', 'runRevision', 'schemaVersion', 'updatedAt', 'workflow', 'workflowRevision']),
    'canvas-snapshot',
  )
  schemaVersion(source.schemaVersion, CANVAS_SCHEMA_VERSION, 'canvas-snapshot')
  const workflowResult = source.workflow === null
    ? { value: null, notices: [] as readonly CanvasMigrationNotice[] }
    : migrateStoredMediaWorkflow(source.workflow)
  const currentVariantId = optionalString(source.currentVariantId, 'canvas-snapshot.currentVariantId')
  return {
    value: {
      schemaVersion: CANVAS_SCHEMA_VERSION,
      id: CanvasId(nonEmptyString(source.id, 'canvas-snapshot.id')),
      workflowRevision: nonNegativeInteger(source.workflowRevision, 'canvas-snapshot.workflowRevision'),
      runRevision: nonNegativeInteger(source.runRevision, 'canvas-snapshot.runRevision'),
      workflow: workflowResult.value,
      ...(currentVariantId === undefined ? {} : { currentVariantId: CanvasVariantId(nonEmptyString(currentVariantId, 'canvas-snapshot.currentVariantId')) }),
      run: source.run === null ? null : decodeRun(source.run, 'canvas-snapshot.run'),
      output: source.output === null ? null : decodeOutput(source.output, 'canvas-snapshot.output'),
      createdAt: nonNegativeInteger(source.createdAt, 'canvas-snapshot.createdAt'),
      updatedAt: nonNegativeInteger(source.updatedAt, 'canvas-snapshot.updatedAt'),
    },
    notices: workflowResult.notices,
  }
}

/**
 * Decodes, migrates, then validates one stored Canvas snapshot against the current Canvas domain.
 * @param value Stored JSON value read from a durable boundary.
 * @returns Current validated snapshot plus workflow/node migration notices.
 */
export function decodeCanvasSnapshot(value: unknown): CanvasMigrationResult<CanvasSnapshot> {
  const migrated = migrateStoredCanvasSnapshot(value)
  assertCanvasSnapshot(migrated.value)
  return migrated
}

/**
 * Verifies the version field of a durable `canvas/change` envelope.
 * @param value Stored `CanvasChange.version` value.
 * @returns The current supported change version.
 */
export function decodeCanvasChangeVersion(value: unknown): CanvasChangeVersion {
  const decoded = integer(value, 'canvas-change.version')
  if (decoded > CANVAS_CHANGE_VERSION) {
    throw new CanvasMigrationError(
      'CANVAS_UNSUPPORTED_FUTURE_SCHEMA',
      'canvas-change',
      `canvas-change version ${decoded} is newer than supported version ${CANVAS_CHANGE_VERSION}`,
      decoded,
    )
  }
  if (decoded !== CANVAS_CHANGE_VERSION) {
    throw new CanvasMigrationError(
      'CANVAS_UNSUPPORTED_SCHEMA_VERSION',
      'canvas-change',
      `canvas-change version ${decoded} has no migration path to version ${CANVAS_CHANGE_VERSION}`,
      decoded,
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
    new Set(['finishedAt', 'outputs', 'promptSummary', 'runId', 'startedAt', 'status', 'variantId', 'workflowId', 'workflowRevision']),
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
