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
/** Current durable version for every semantic workflow node kind. */
export const MEDIA_WORKFLOW_NODE_VERSIONS: Readonly<Record<MediaWorkflowNodeType, number>> = {
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
   * @param version Rejected schema or node version when applicable.
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
const NODE_TYPES = new Set<MediaWorkflowNodeType>(Object.keys(MEDIA_WORKFLOW_NODE_VERSIONS) as MediaWorkflowNodeType[])

function invalid(subject: string, message: string): never {
  throw new CanvasMigrationError('CANVAS_MIGRATION_INVALID_VALUE', subject, message)
}

function record(value: unknown, subject: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(subject, `${subject} must be an object`)
  return value as UnknownRecord
}

function array(value: unknown, subject: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(subject, `${subject} must be an array`)
  return value
}

function string(value: unknown, subject: string): string {
  if (typeof value !== 'string') invalid(subject, `${subject} must be a string`)
  return value
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

function optionalString(value: unknown, subject: string): string | undefined {
  return value === undefined ? undefined : string(value, subject)
}

function optionalNumber(value: unknown, subject: string): number | undefined {
  return value === undefined ? undefined : number(value, subject)
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

function nodeVersion(value: unknown, current: number, subject: string): number {
  const decoded = value === undefined ? 1 : integer(value, `${subject}.nodeVersion`)
  if (decoded > current) {
    throw new CanvasMigrationError(
      'CANVAS_UNSUPPORTED_FUTURE_NODE_VERSION',
      subject,
      `${subject} node version ${decoded} is newer than supported version ${current}`,
      decoded,
    )
  }
  if (decoded !== current) {
    throw new CanvasMigrationError(
      'CANVAS_UNSUPPORTED_NODE_VERSION',
      subject,
      `${subject} node version ${decoded} has no migration path to version ${current}`,
      decoded,
    )
  }
  return decoded
}

function optionalNodeName(source: UnknownRecord, subject: string): { readonly name?: string } {
  const name = optionalString(source.name, `${subject}.name`)
  return name === undefined ? {} : { name }
}

function migrateNode(value: unknown, index: number): CanvasMigrationResult<MediaWorkflowNode> {
  const subject = `media-workflow.nodes[${index}]`
  const source = record(value, subject)
  const id = WorkflowNodeId(string(source.id, `${subject}.id`))
  const rawType = string(source.type, `${subject}.type`)
  const configValue = record(source.config, `${subject}.config`)
  const config: Record<string, CanvasJsonValue> = {}
  for (const [key, item] of Object.entries(configValue)) config[key] = json(item, `${subject}.config.${key}`)

  // Frozen pre-registry V1 fixture only. Current writers never emit this retired alias.
  if (rawType === 'image.create') {
    nodeVersion(source.nodeVersion, 1, subject)
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

  if (!NODE_TYPES.has(rawType as MediaWorkflowNodeType)) invalid(`${subject}.type`, `unsupported workflow node type ${rawType}`)
  const type = rawType as MediaWorkflowNodeType
  const current = MEDIA_WORKFLOW_NODE_VERSIONS[type]
  return {
    value: {
      id,
      type,
      nodeVersion: nodeVersion(source.nodeVersion, current, subject),
      ...optionalNodeName(source, subject),
      config,
    },
    notices: [],
  }
}

function migrateEdge(value: unknown, index: number): MediaWorkflowEdge {
  const subject = `media-workflow.edges[${index}]`
  const source = record(value, subject)
  return {
    id: WorkflowEdgeId(string(source.id, `${subject}.id`)),
    sourceNodeId: WorkflowNodeId(string(source.sourceNodeId, `${subject}.sourceNodeId`)),
    sourcePort: string(source.sourcePort, `${subject}.sourcePort`),
    targetNodeId: WorkflowNodeId(string(source.targetNodeId, `${subject}.targetNodeId`)),
    targetPort: string(source.targetPort, `${subject}.targetPort`),
  }
}

/**
 * Decodes and migrates one stored workflow without applying current relational invariants.
 * @param value Stored JSON value read from a durable boundary.
 * @returns Current runtime workflow plus non-fatal migration notices.
 */
export function migrateStoredMediaWorkflow(value: unknown): CanvasMigrationResult<MediaWorkflow> {
  const source = record(value, 'media-workflow')
  schemaVersion(source.schemaVersion, MEDIA_WORKFLOW_SCHEMA_VERSION, 'media-workflow')
  const notices: CanvasMigrationNotice[] = []
  const nodes = array(source.nodes, 'media-workflow.nodes').map((node, index) => {
    const migrated = migrateNode(node, index)
    notices.push(...migrated.notices)
    return migrated.value
  })
  const edges = array(source.edges, 'media-workflow.edges').map(migrateEdge)
  const outputNodeIds = array(source.outputNodeIds, 'media-workflow.outputNodeIds').map((nodeId, index) =>
    WorkflowNodeId(string(nodeId, `media-workflow.outputNodeIds[${index}]`)),
  )
  return {
    value: {
      id: MediaWorkflowId(string(source.id, 'media-workflow.id')),
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
  const category = string(source.category, `${subject}.category`)
  if (!ERROR_CATEGORIES.has(category as CanvasErrorCategory)) {
    invalid(`${subject}.category`, `unsupported Canvas error category ${category}`)
  }
  return {
    category: category as CanvasErrorCategory,
    code: string(source.code, `${subject}.code`),
    message: string(source.message, `${subject}.message`),
  }
}

function decodeRun(value: unknown, subject: string): CanvasRunSnapshot {
  const source = record(value, subject)
  const statusValue = string(source.status, `${subject}.status`)
  if (!RUN_STATUSES.has(statusValue as CanvasRunStatus)) invalid(`${subject}.status`, `unsupported Canvas run status ${statusValue}`)
  const activeNodeId = optionalString(source.activeNodeId, `${subject}.activeNodeId`)
  const finishedAt = optionalNumber(source.finishedAt, `${subject}.finishedAt`)
  const error = source.error === undefined ? undefined : decodeRunError(source.error, `${subject}.error`)
  return {
    id: CanvasRunId(string(source.id, `${subject}.id`)),
    status: statusValue as CanvasRunStatus,
    workflowId: MediaWorkflowId(string(source.workflowId, `${subject}.workflowId`)),
    workflowRevision: integer(source.workflowRevision, `${subject}.workflowRevision`),
    ...(activeNodeId === undefined ? {} : { activeNodeId: WorkflowNodeId(activeNodeId) }),
    startedAt: number(source.startedAt, `${subject}.startedAt`),
    ...(finishedAt === undefined ? {} : { finishedAt }),
    ...(error === undefined ? {} : { error }),
  }
}

function decodeVideoRef(value: unknown, subject: string): VideoAssetRef {
  const source = record(value, subject)
  const width = optionalNumber(source.width, `${subject}.width`)
  const height = optionalNumber(source.height, `${subject}.height`)
  const durationMs = optionalNumber(source.durationMs, `${subject}.durationMs`)
  return {
    assetId: VideoAssetId(string(source.assetId, `${subject}.assetId`)),
    mediaType: string(source.mediaType, `${subject}.mediaType`),
    bytes: number(source.bytes, `${subject}.bytes`),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(durationMs === undefined ? {} : { durationMs }),
  }
}

function decodeImageRef(value: unknown, subject: string): Readonly<ImageAttachmentRef> {
  const source = record(value, subject)
  const name = optionalString(source.name, `${subject}.name`)
  return {
    attachmentId: string(source.attachmentId, `${subject}.attachmentId`) as ImageAttachmentRef['attachmentId'],
    mediaType: string(source.mediaType, `${subject}.mediaType`) as ImageAttachmentRef['mediaType'],
    bytes: number(source.bytes, `${subject}.bytes`),
    width: number(source.width, `${subject}.width`),
    height: number(source.height, `${subject}.height`),
    ...(name === undefined ? {} : { name }),
  }
}

function decodeAsset(value: unknown, subject: string): CanvasAssetRef {
  const source = record(value, subject)
  const kind = string(source.kind, `${subject}.kind`)
  if (kind === 'image') return { kind, image: decodeImageRef(source.image, `${subject}.image`) }
  if (kind === 'video') return { kind, video: decodeVideoRef(source.video, `${subject}.video`) }
  return invalid(`${subject}.kind`, `unsupported Canvas asset kind ${kind}`)
}

function decodeOutput(value: unknown, subject: string): CanvasOutput {
  const source = record(value, subject)
  return {
    runId: CanvasRunId(string(source.runId, `${subject}.runId`)),
    workflowId: MediaWorkflowId(string(source.workflowId, `${subject}.workflowId`)),
    workflowRevision: integer(source.workflowRevision, `${subject}.workflowRevision`),
    assets: array(source.assets, `${subject}.assets`).map((asset, index) => decodeAsset(asset, `${subject}.assets[${index}]`)),
    primaryAssetIndex: integer(source.primaryAssetIndex, `${subject}.primaryAssetIndex`),
  }
}

/**
 * Decodes and migrates one stored Canvas snapshot without applying current relational invariants.
 * @param value Stored JSON value read from a durable boundary.
 * @returns Current runtime snapshot plus workflow/node migration notices.
 */
export function migrateStoredCanvasSnapshot(value: unknown): CanvasMigrationResult<CanvasSnapshot> {
  const source = record(value, 'canvas-snapshot')
  schemaVersion(source.schemaVersion, CANVAS_SCHEMA_VERSION, 'canvas-snapshot')
  const workflowResult =
    source.workflow === null
      ? { value: null, notices: [] as readonly CanvasMigrationNotice[] }
      : migrateStoredMediaWorkflow(source.workflow)
  const currentVariantId = optionalString(source.currentVariantId, 'canvas-snapshot.currentVariantId')
  return {
    value: {
      schemaVersion: CANVAS_SCHEMA_VERSION,
      id: CanvasId(string(source.id, 'canvas-snapshot.id')),
      workflowRevision: integer(source.workflowRevision, 'canvas-snapshot.workflowRevision'),
      runRevision: integer(source.runRevision, 'canvas-snapshot.runRevision'),
      workflow: workflowResult.value,
      ...(currentVariantId === undefined ? {} : { currentVariantId: CanvasVariantId(currentVariantId) }),
      run: source.run === null ? null : decodeRun(source.run, 'canvas-snapshot.run'),
      output: source.output === null ? null : decodeOutput(source.output, 'canvas-snapshot.output'),
      createdAt: number(source.createdAt, 'canvas-snapshot.createdAt'),
      updatedAt: number(source.updatedAt, 'canvas-snapshot.updatedAt'),
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
 * Verifies the version field of a future durable `canvas/change` envelope.
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
 * Decodes one independently persisted Canvas editor layout at the current schema version.
 * @param value Stored layout JSON value.
 * @returns Current layout value.
 */
export function decodeCanvasLayoutSnapshot(value: unknown): CanvasLayoutSnapshot {
  const source = record(value, 'canvas-layout')
  schemaVersion(source.schemaVersion, CANVAS_LAYOUT_SCHEMA_VERSION, 'canvas-layout')
  const positions = record(source.nodePositions, 'canvas-layout.nodePositions')
  const nodePositions: Record<string, { readonly x: number; readonly y: number }> = {}
  for (const [nodeId, positionValue] of Object.entries(positions)) {
    const position = record(positionValue, `canvas-layout.nodePositions.${nodeId}`)
    nodePositions[nodeId] = {
      x: number(position.x, `canvas-layout.nodePositions.${nodeId}.x`),
      y: number(position.y, `canvas-layout.nodePositions.${nodeId}.y`),
    }
  }
  const viewportSource = source.viewport === undefined ? undefined : record(source.viewport, 'canvas-layout.viewport')
  const viewport =
    viewportSource === undefined
      ? undefined
      : {
          x: number(viewportSource.x, 'canvas-layout.viewport.x'),
          y: number(viewportSource.y, 'canvas-layout.viewport.y'),
          zoom: number(viewportSource.zoom, 'canvas-layout.viewport.zoom'),
        }
  return {
    schemaVersion: CANVAS_LAYOUT_SCHEMA_VERSION,
    workflowId: MediaWorkflowId(string(source.workflowId, 'canvas-layout.workflowId')),
    nodePositions: nodePositions as CanvasLayoutSnapshot['nodePositions'],
    ...(viewport === undefined ? {} : { viewport }),
    updatedAt: number(source.updatedAt, 'canvas-layout.updatedAt'),
  }
}

/**
 * Decodes one run-history DTO without creating a second durable authority.
 * @param value Stored or indexed history-entry JSON value.
 * @returns Current history entry.
 */
export function decodeCanvasRunHistoryEntry(value: unknown): CanvasRunHistoryEntry {
  const source = record(value, 'canvas-run-history')
  const statusValue = string(source.status, 'canvas-run-history.status')
  if (!RUN_STATUSES.has(statusValue as CanvasRunStatus)) {
    invalid('canvas-run-history.status', `unsupported Canvas run status ${statusValue}`)
  }
  const variantId = optionalString(source.variantId, 'canvas-run-history.variantId')
  const finishedAt = optionalNumber(source.finishedAt, 'canvas-run-history.finishedAt')
  const promptSummary = optionalString(source.promptSummary, 'canvas-run-history.promptSummary')
  return {
    runId: CanvasRunId(string(source.runId, 'canvas-run-history.runId')),
    ...(variantId === undefined ? {} : { variantId: CanvasVariantId(variantId) }),
    workflowId: MediaWorkflowId(string(source.workflowId, 'canvas-run-history.workflowId')),
    workflowRevision: integer(source.workflowRevision, 'canvas-run-history.workflowRevision'),
    status: statusValue as CanvasRunStatus,
    outputs: array(source.outputs, 'canvas-run-history.outputs').map((asset, index) =>
      decodeAsset(asset, `canvas-run-history.outputs[${index}]`),
    ),
    startedAt: number(source.startedAt, 'canvas-run-history.startedAt'),
    ...(finishedAt === undefined ? {} : { finishedAt }),
    ...(promptSummary === undefined ? {} : { promptSummary }),
  }
}
