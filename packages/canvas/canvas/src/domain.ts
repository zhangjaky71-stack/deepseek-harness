/** Runtime construction, derived state, and pure invariants for the Canvas domain. */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type {
  CanvasAssetRef,
  CanvasErrorCategory,
  CanvasErrorCode,
  CanvasId as CanvasIdType,
  CanvasJsonValue,
  CanvasOutput,
  CanvasProductState,
  CanvasRunId as CanvasRunIdType,
  CanvasRunSnapshot,
  CanvasRunStatus,
  CanvasSnapshot,
  CanvasVariantId as CanvasVariantIdType,
  CreateCanvasSnapshotInput,
  CreateMediaWorkflowInput,
  MediaWorkflow,
  MediaWorkflowEdge,
  MediaWorkflowId as MediaWorkflowIdType,
  MediaWorkflowNode,
  MediaWorkflowNodeType,
  VideoAssetId as VideoAssetIdType,
  VideoAssetRef,
  WorkflowEdgeId as WorkflowEdgeIdType,
  WorkflowNodeId as WorkflowNodeIdType,
} from './types.ts'

/** Current durable Canvas snapshot schema version. */
export const CANVAS_SCHEMA_VERSION = 1
/** Current semantic media-workflow schema version. */
export const MEDIA_WORKFLOW_SCHEMA_VERSION = 1

const NODE_TYPES: ReadonlySet<MediaWorkflowNodeType> = new Set([
  'asset.input', 'prompt', 'image.generate', 'image.edit', 'video.generate', 'video.image-to-video', 'output',
])
const RUN_STATUSES: ReadonlySet<CanvasRunStatus> = new Set([
  'queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted',
])
const ERROR_CATEGORIES: ReadonlySet<CanvasErrorCategory> = new Set([
  'validation', 'conflict', 'permission', 'provider', 'infrastructure', 'interrupted', 'quota',
])
const ERROR_CATEGORY_BY_CODE = {
  CANVAS_INVALID_ID: 'validation',
  CANVAS_INVALID_REVISION: 'validation',
  CANVAS_INVALID_TIMESTAMP: 'validation',
  CANVAS_INVALID_JSON_VALUE: 'validation',
  CANVAS_INVALID_WORKFLOW: 'validation',
  CANVAS_INVALID_ASSET: 'validation',
  CANVAS_INVALID_RUN: 'validation',
  CANVAS_INVALID_OUTPUT: 'validation',
} as const satisfies Record<CanvasErrorCode, CanvasErrorCategory>

/** Domain validation failure with a stable machine-readable code. */
export class CanvasDomainError extends Error {
  override readonly name = 'CanvasDomainError'
  readonly category: CanvasErrorCategory
  readonly code: CanvasErrorCode

  /**
   * Create one Canvas-domain validation failure.
   * @param code - stable Canvas error code.
   * @param message - direct explanation of the invalid value or relationship.
   */
  constructor(code: CanvasErrorCode, message: string) {
    super(message)
    this.code = code
    this.category = ERROR_CATEGORY_BY_CODE[code]
  }
}

/**
 * Brand a Canvas identifier without changing its runtime value.
 * @param id - raw opaque identifier.
 * @returns the same runtime string with the Canvas brand.
 */
export function CanvasId(id: string): CanvasIdType { return id as CanvasIdType }
/**
 * Brand a workflow identifier without changing its runtime value.
 * @param id - raw opaque identifier.
 * @returns the same runtime string with the workflow brand.
 */
export function MediaWorkflowId(id: string): MediaWorkflowIdType { return id as MediaWorkflowIdType }
/**
 * Brand a workflow-node identifier without changing its runtime value.
 * @param id - raw opaque identifier.
 * @returns the same runtime string with the node brand.
 */
export function WorkflowNodeId(id: string): WorkflowNodeIdType { return id as WorkflowNodeIdType }
/**
 * Brand a workflow-edge identifier without changing its runtime value.
 * @param id - raw opaque identifier.
 * @returns the same runtime string with the edge brand.
 */
export function WorkflowEdgeId(id: string): WorkflowEdgeIdType { return id as WorkflowEdgeIdType }
/**
 * Brand a Canvas-run identifier without changing its runtime value.
 * @param id - raw opaque identifier.
 * @returns the same runtime string with the run brand.
 */
export function CanvasRunId(id: string): CanvasRunIdType { return id as CanvasRunIdType }
/**
 * Brand a Canvas-variant identifier without changing its runtime value.
 * @param id - raw opaque identifier.
 * @returns the same runtime string with the variant brand.
 */
export function CanvasVariantId(id: string): CanvasVariantIdType { return id as CanvasVariantIdType }
/**
 * Brand a video-asset identifier without changing its runtime value.
 * @param id - raw opaque identifier.
 * @returns the same runtime string with the video-asset brand.
 */
export function VideoAssetId(id: string): VideoAssetIdType { return id as VideoAssetIdType }

/**
 * Construct a semantic workflow at the current schema version.
 * @param input - workflow identity, label, nodes, edges, and outputs.
 * @returns a validated workflow value detached from caller-owned arrays.
 */
export function createMediaWorkflow(input: CreateMediaWorkflowInput): MediaWorkflow {
  const workflow: MediaWorkflow = {
    id: input.id,
    schemaVersion: MEDIA_WORKFLOW_SCHEMA_VERSION,
    name: input.name,
    nodes: [...(input.nodes ?? [])],
    edges: [...(input.edges ?? [])],
    outputNodeIds: [...(input.outputNodeIds ?? [])],
  }
  assertMediaWorkflow(workflow)
  return workflow
}

/**
 * Construct a fresh Canvas with revision zero before a workflow exists, or revision one when seeded.
 * @param input - stable identity, creation time, and optional initial workflow/variant.
 * @returns a validated fresh Canvas snapshot.
 */
export function createCanvasSnapshot(input: CreateCanvasSnapshotInput): CanvasSnapshot {
  const workflow = input.workflow ?? null
  const base = {
    schemaVersion: CANVAS_SCHEMA_VERSION,
    id: input.id,
    workflowRevision: workflow === null ? 0 : 1,
    runRevision: 0,
    workflow,
    run: null,
    output: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  }
  const snapshot: CanvasSnapshot = input.currentVariantId === undefined
    ? base
    : { ...base, currentVariantId: input.currentVariantId }
  assertCanvasSnapshot(snapshot)
  return snapshot
}

/**
 * Return whether a run lifecycle is terminal.
 * @param status - current Canvas run status.
 * @returns `true` for completed, failed, cancelled, and interrupted runs.
 */
export function isCanvasRunTerminal(status: CanvasRunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'interrupted'
}

/**
 * Derive the product state shown by Minimal and Editor from one authoritative Canvas snapshot.
 * @param snapshot - current Canvas snapshot, or `null` before Canvas creation/after clear.
 * @returns one presentation state without mutating or validating the snapshot.
 */
export function deriveCanvasProductState(snapshot: CanvasSnapshot | null): CanvasProductState {
  if (snapshot === null || snapshot.workflow === null) return 'EMPTY'
  const run = snapshot.run
  if (run?.status === 'queued' || run?.status === 'running') return 'RUNNING'
  const currentRun = run !== null
    && run.workflowId === snapshot.workflow.id
    && run.workflowRevision === snapshot.workflowRevision
  if (currentRun) {
    if (run.status === 'failed') return 'FAILED'
    if (run.status === 'cancelled') return 'CANCELLED'
    if (run.status === 'interrupted') return 'INTERRUPTED'
    if (run.status === 'completed') return 'COMPLETED'
  }
  if (snapshot.output !== null) {
    return snapshot.output.workflowRevision === snapshot.workflowRevision ? 'COMPLETED' : 'DIRTY_READY'
  }
  return 'READY'
}

/**
 * Assert that a value is safe to retain as JSON workflow configuration.
 * @param value - candidate configuration value.
 * @param path - diagnostic path used in thrown errors.
 */
export function assertCanvasJsonValue(value: unknown, path = 'value'): asserts value is CanvasJsonValue {
  assertJsonValue(value, path, new Set<object>())
}

/**
 * Assert scalar and relational invariants owned by the semantic workflow value.
 * @param workflow - semantic workflow to validate.
 */
export function assertMediaWorkflow(workflow: MediaWorkflow): void {
  if (workflow.schemaVersion !== MEDIA_WORKFLOW_SCHEMA_VERSION) fail('CANVAS_INVALID_WORKFLOW', `workflow.schemaVersion must be ${MEDIA_WORKFLOW_SCHEMA_VERSION}`)
  assertId(workflow.id, 'workflow.id')
  if (typeof workflow.name !== 'string') fail('CANVAS_INVALID_WORKFLOW', 'workflow.name must be a string')
  const nodeIds = new Set<string>()
  for (const node of workflow.nodes) {
    assertWorkflowNode(node)
    if (nodeIds.has(node.id)) fail('CANVAS_INVALID_WORKFLOW', `workflow contains duplicate node id ${node.id}`)
    nodeIds.add(node.id)
  }
  const edgeIds = new Set<string>()
  for (const edge of workflow.edges) {
    assertWorkflowEdge(edge, nodeIds)
    if (edgeIds.has(edge.id)) fail('CANVAS_INVALID_WORKFLOW', `workflow contains duplicate edge id ${edge.id}`)
    edgeIds.add(edge.id)
  }
  const outputIds = new Set<string>()
  for (const nodeId of workflow.outputNodeIds) {
    assertId(nodeId, 'workflow.outputNodeIds[]')
    if (!nodeIds.has(nodeId)) fail('CANVAS_INVALID_WORKFLOW', `workflow output node ${nodeId} does not exist`)
    if (outputIds.has(nodeId)) fail('CANVAS_INVALID_WORKFLOW', `workflow contains duplicate output node id ${nodeId}`)
    outputIds.add(nodeId)
  }
}

/**
 * Assert the complete current Canvas value, including revision, run, output, and media-reference relationships.
 * @param snapshot - Canvas snapshot to validate.
 */
export function assertCanvasSnapshot(snapshot: CanvasSnapshot): void {
  if (snapshot.schemaVersion !== CANVAS_SCHEMA_VERSION) fail('CANVAS_INVALID_WORKFLOW', `canvas.schemaVersion must be ${CANVAS_SCHEMA_VERSION}`)
  assertId(snapshot.id, 'canvas.id')
  assertNonNegativeSafeInteger(snapshot.workflowRevision, 'canvas.workflowRevision', 'CANVAS_INVALID_REVISION')
  assertNonNegativeSafeInteger(snapshot.runRevision, 'canvas.runRevision', 'CANVAS_INVALID_REVISION')
  assertTimestamp(snapshot.createdAt, 'canvas.createdAt')
  assertTimestamp(snapshot.updatedAt, 'canvas.updatedAt')
  if (snapshot.updatedAt < snapshot.createdAt) fail('CANVAS_INVALID_TIMESTAMP', 'canvas.updatedAt must not precede canvas.createdAt')
  if (snapshot.currentVariantId !== undefined) assertId(snapshot.currentVariantId, 'canvas.currentVariantId')
  if (snapshot.workflow === null) {
    if (snapshot.workflowRevision !== 0) fail('CANVAS_INVALID_REVISION', 'canvas without a workflow must have workflowRevision 0')
    if (snapshot.run !== null || snapshot.output !== null) fail('CANVAS_INVALID_WORKFLOW', 'canvas without a workflow cannot retain a run or output')
    return
  }
  if (snapshot.workflowRevision < 1) fail('CANVAS_INVALID_REVISION', 'canvas with a workflow must have a positive workflowRevision')
  assertMediaWorkflow(snapshot.workflow)
  if (snapshot.run !== null) assertRun(snapshot.run, snapshot.workflow, snapshot.workflowRevision)
  if (snapshot.output !== null) assertOutput(snapshot.output, snapshot.workflow, snapshot.workflowRevision)
  if (snapshot.run?.status === 'completed') {
    if (snapshot.output === null
      || snapshot.output.runId !== snapshot.run.id
      || snapshot.output.workflowId !== snapshot.run.workflowId
      || snapshot.output.workflowRevision !== snapshot.run.workflowRevision) {
      fail('CANVAS_INVALID_OUTPUT', 'a completed current run must own the current output')
    }
  }
}

function assertWorkflowNode(node: MediaWorkflowNode): void {
  assertId(node.id, 'workflow.nodes[].id')
  if (!NODE_TYPES.has(node.type)) fail('CANVAS_INVALID_WORKFLOW', `unsupported workflow node type ${String(node.type)}`)
  if (node.nodeVersion !== undefined) assertPositiveSafeInteger(node.nodeVersion, 'workflow.nodes[].nodeVersion', 'CANVAS_INVALID_WORKFLOW')
  if (node.name !== undefined && typeof node.name !== 'string') fail('CANVAS_INVALID_WORKFLOW', 'workflow node name must be a string')
  assertCanvasJsonValue(node.config, `workflow.nodes[${node.id}].config`)
}

function assertWorkflowEdge(edge: MediaWorkflowEdge, nodeIds: ReadonlySet<string>): void {
  assertId(edge.id, 'workflow.edges[].id')
  assertId(edge.sourceNodeId, 'workflow.edges[].sourceNodeId')
  assertId(edge.targetNodeId, 'workflow.edges[].targetNodeId')
  assertNonEmptyString(edge.sourcePort, 'workflow.edges[].sourcePort', 'CANVAS_INVALID_WORKFLOW')
  assertNonEmptyString(edge.targetPort, 'workflow.edges[].targetPort', 'CANVAS_INVALID_WORKFLOW')
  if (!nodeIds.has(edge.sourceNodeId)) fail('CANVAS_INVALID_WORKFLOW', `workflow edge ${edge.id} source node does not exist`)
  if (!nodeIds.has(edge.targetNodeId)) fail('CANVAS_INVALID_WORKFLOW', `workflow edge ${edge.id} target node does not exist`)
}

function assertRun(run: CanvasRunSnapshot, workflow: MediaWorkflow, currentRevision: number): void {
  assertId(run.id, 'canvas.run.id')
  assertId(run.workflowId, 'canvas.run.workflowId')
  if (run.workflowId !== workflow.id) fail('CANVAS_INVALID_RUN', 'canvas run must target the current workflow identity')
  assertPositiveSafeInteger(run.workflowRevision, 'canvas.run.workflowRevision', 'CANVAS_INVALID_RUN')
  if (run.workflowRevision > currentRevision) fail('CANVAS_INVALID_RUN', 'canvas run cannot target a future workflow revision')
  if (!RUN_STATUSES.has(run.status)) fail('CANVAS_INVALID_RUN', `unsupported canvas run status ${String(run.status)}`)
  if (run.activeNodeId !== undefined) assertId(run.activeNodeId, 'canvas.run.activeNodeId')
  assertTimestamp(run.startedAt, 'canvas.run.startedAt')
  if (isCanvasRunTerminal(run.status)) {
    if (run.finishedAt === undefined) fail('CANVAS_INVALID_RUN', `terminal run ${run.id} must have finishedAt`)
    assertTimestamp(run.finishedAt, 'canvas.run.finishedAt')
    if (run.finishedAt < run.startedAt) fail('CANVAS_INVALID_RUN', 'canvas run finishedAt must not precede startedAt')
  } else if (run.finishedAt !== undefined) {
    fail('CANVAS_INVALID_RUN', `non-terminal run ${run.id} cannot have finishedAt`)
  }
  if (run.status === 'failed') {
    if (run.error === undefined) fail('CANVAS_INVALID_RUN', `failed run ${run.id} must include an error`)
    assertRunError(run.error)
  } else if (run.error !== undefined) {
    if (run.status !== 'interrupted') fail('CANVAS_INVALID_RUN', `run ${run.id} with status ${run.status} cannot include an error`)
    assertRunError(run.error)
  }
}

function assertRunError(error: NonNullable<CanvasRunSnapshot['error']>): void {
  if (!ERROR_CATEGORIES.has(error.category)) fail('CANVAS_INVALID_RUN', `unsupported canvas run error category ${String(error.category)}`)
  assertNonEmptyString(error.code, 'canvas.run.error.code', 'CANVAS_INVALID_RUN')
  assertNonEmptyString(error.message, 'canvas.run.error.message', 'CANVAS_INVALID_RUN')
}

function assertOutput(output: CanvasOutput, workflow: MediaWorkflow, currentRevision: number): void {
  assertId(output.runId, 'canvas.output.runId')
  assertId(output.workflowId, 'canvas.output.workflowId')
  if (output.workflowId !== workflow.id) fail('CANVAS_INVALID_OUTPUT', 'canvas output must target the current workflow identity')
  assertPositiveSafeInteger(output.workflowRevision, 'canvas.output.workflowRevision', 'CANVAS_INVALID_OUTPUT')
  if (output.workflowRevision > currentRevision) fail('CANVAS_INVALID_OUTPUT', 'canvas output cannot target a future workflow revision')
  if (output.assets.length === 0) fail('CANVAS_INVALID_OUTPUT', 'canvas output must contain at least one asset')
  for (const asset of output.assets) assertAsset(asset)
  if (!Number.isSafeInteger(output.primaryAssetIndex)
    || output.primaryAssetIndex < 0
    || output.primaryAssetIndex >= output.assets.length) {
    fail('CANVAS_INVALID_OUTPUT', 'canvas output primaryAssetIndex is out of range')
  }
}

function assertAsset(asset: CanvasAssetRef): void {
  if (asset.kind === 'image') return assertImageAsset(asset.image)
  if (asset.kind === 'video') return assertVideoAsset(asset.video)
  fail('CANVAS_INVALID_ASSET', `unsupported canvas asset kind ${String((asset as { kind?: unknown }).kind)}`)
}

function assertImageAsset(image: Readonly<ImageAttachmentRef>): void {
  assertId(image.attachmentId, 'canvas.output.assets[].image.attachmentId')
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.mediaType)) fail('CANVAS_INVALID_ASSET', `unsupported image media type ${String(image.mediaType)}`)
  assertNonNegativeSafeInteger(image.bytes, 'canvas.output.assets[].image.bytes', 'CANVAS_INVALID_ASSET')
  assertPositiveSafeInteger(image.width, 'canvas.output.assets[].image.width', 'CANVAS_INVALID_ASSET')
  assertPositiveSafeInteger(image.height, 'canvas.output.assets[].image.height', 'CANVAS_INVALID_ASSET')
  if (image.name !== undefined && typeof image.name !== 'string') fail('CANVAS_INVALID_ASSET', 'image name must be a string')
}

function assertVideoAsset(video: VideoAssetRef): void {
  assertId(video.assetId, 'canvas.output.assets[].video.assetId')
  if (typeof video.mediaType !== 'string' || !video.mediaType.startsWith('video/')) fail('CANVAS_INVALID_ASSET', 'video mediaType must use a video/* MIME type')
  assertNonNegativeSafeInteger(video.bytes, 'canvas.output.assets[].video.bytes', 'CANVAS_INVALID_ASSET')
  if (video.width !== undefined) assertPositiveSafeInteger(video.width, 'canvas.output.assets[].video.width', 'CANVAS_INVALID_ASSET')
  if (video.height !== undefined) assertPositiveSafeInteger(video.height, 'canvas.output.assets[].video.height', 'CANVAS_INVALID_ASSET')
  if (video.durationMs !== undefined) assertPositiveSafeInteger(video.durationMs, 'canvas.output.assets[].video.durationMs', 'CANVAS_INVALID_ASSET')
}

function assertJsonValue(value: unknown, path: string, ancestors: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('CANVAS_INVALID_JSON_VALUE', `${path} contains a non-finite number`)
    return
  }
  if (typeof value !== 'object') fail('CANVAS_INVALID_JSON_VALUE', `${path} is not JSON-safe`)
  if (ancestors.has(value)) fail('CANVAS_INVALID_JSON_VALUE', `${path} contains a cycle`)
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) assertJsonValue(value[index], `${path}[${index}]`, ancestors)
      return
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) fail('CANVAS_INVALID_JSON_VALUE', `${path} must contain only plain JSON objects`)
    for (const [key, nested] of Object.entries(value)) assertJsonValue(nested, `${path}.${key}`, ancestors)
  } finally {
    ancestors.delete(value)
  }
}

function assertId(value: string, path: string): void { assertNonEmptyString(value, path, 'CANVAS_INVALID_ID') }
function assertNonEmptyString(value: unknown, path: string, code: CanvasErrorCode): void {
  if (typeof value !== 'string' || value.length === 0) fail(code, `${path} must be a non-empty string`)
}
function assertTimestamp(value: number, path: string): void { assertNonNegativeSafeInteger(value, path, 'CANVAS_INVALID_TIMESTAMP') }
function assertPositiveSafeInteger(value: number, path: string, code: CanvasErrorCode): void {
  if (!Number.isSafeInteger(value) || value < 1) fail(code, `${path} must be a positive safe integer`)
}
function assertNonNegativeSafeInteger(value: number, path: string, code: CanvasErrorCode): void {
  if (!Number.isSafeInteger(value) || value < 0) fail(code, `${path} must be a non-negative safe integer`)
}
function fail(code: CanvasErrorCode, message: string): never { throw new CanvasDomainError(code, message) }
