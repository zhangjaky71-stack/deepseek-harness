/** Host validation and model-facing rendering for one-shot Canvas interaction context. */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type {
  CanvasAssetRef,
  CanvasRunId,
  CanvasSnapshot,
  VideoAssetRef,
} from './types.ts'
import type {
  CanvasInteractionContext,
  CanvasRegionSelection,
  ResolvedCanvasInteractionContext,
} from './interaction-types.ts'

/** Stable request-admission failure for malformed or impossible Canvas interaction context. */
export class CanvasInteractionContextError extends Error {
  constructor(readonly code: 'CANVAS_INVALID_INTERACTION_CONTEXT', message: string) {
    super(message)
    this.name = 'CanvasInteractionContextError'
  }
}

type UnknownRecord = Record<string, unknown>
const MAX_SELECTION_ITEMS = 64

function fail(message: string): never {
  throw new CanvasInteractionContextError('CANVAS_INVALID_INTERACTION_CONTEXT', message)
}

function record(value: unknown, subject: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${subject} must be an object`)
  return value as UnknownRecord
}

function exact(source: UnknownRecord, allowed: readonly string[], subject: string): void {
  const allow = new Set(allowed)
  for (const key of Object.keys(source)) if (!allow.has(key)) fail(`${subject}.${key} is not allowed`)
}

function string(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${subject} must be a non-empty string`)
  return value
}

function finite(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${subject} must be a finite number`)
  return value
}

function integer(value: unknown, subject: string): number {
  const decoded = finite(value, subject)
  if (!Number.isSafeInteger(decoded) || decoded < 0) fail(`${subject} must be a non-negative safe integer`)
  return decoded
}

function optionalStrings(value: unknown, subject: string): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > MAX_SELECTION_ITEMS) fail(`${subject} must be an array with at most ${MAX_SELECTION_ITEMS} items`)
  const result = value.map((item, index) => string(item, `${subject}[${index}]`))
  if (new Set(result).size !== result.length) fail(`${subject} must not contain duplicate ids`)
  return result
}

function parseImageRef(value: unknown, subject: string): Readonly<ImageAttachmentRef> {
  const source = record(value, subject)
  exact(source, ['attachmentId', 'mediaType', 'bytes', 'width', 'height', 'name'], subject)
  const name = source.name === undefined ? undefined : string(source.name, `${subject}.name`)
  return {
    attachmentId: string(source.attachmentId, `${subject}.attachmentId`) as ImageAttachmentRef['attachmentId'],
    mediaType: string(source.mediaType, `${subject}.mediaType`) as ImageAttachmentRef['mediaType'],
    bytes: finite(source.bytes, `${subject}.bytes`),
    width: finite(source.width, `${subject}.width`),
    height: finite(source.height, `${subject}.height`),
    ...(name === undefined ? {} : { name }),
  }
}

function parseVideoRef(value: unknown, subject: string): VideoAssetRef {
  const source = record(value, subject)
  exact(source, ['assetId', 'mediaType', 'bytes', 'width', 'height', 'durationMs'], subject)
  return {
    assetId: string(source.assetId, `${subject}.assetId`) as VideoAssetRef['assetId'],
    mediaType: string(source.mediaType, `${subject}.mediaType`),
    bytes: finite(source.bytes, `${subject}.bytes`),
    ...(source.width === undefined ? {} : { width: finite(source.width, `${subject}.width`) }),
    ...(source.height === undefined ? {} : { height: finite(source.height, `${subject}.height`) }),
    ...(source.durationMs === undefined ? {} : { durationMs: finite(source.durationMs, `${subject}.durationMs`) }),
  }
}

function parseAsset(value: unknown, subject: string): CanvasAssetRef {
  const source = record(value, subject)
  exact(source, ['kind', 'image', 'video'], subject)
  const kind = string(source.kind, `${subject}.kind`)
  if (kind === 'image') {
    if (source.image === undefined || source.video !== undefined) fail(`${subject} must contain image only`)
    return { kind, image: parseImageRef(source.image, `${subject}.image`) }
  }
  if (kind === 'video') {
    if (source.video === undefined || source.image !== undefined) fail(`${subject} must contain video only`)
    return { kind, video: parseVideoRef(source.video, `${subject}.video`) }
  }
  return fail(`${subject}.kind must be image or video`)
}

function parseAssets(value: unknown, subject: string): readonly CanvasAssetRef[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > MAX_SELECTION_ITEMS) fail(`${subject} must be an array with at most ${MAX_SELECTION_ITEMS} items`)
  return value.map((item, index) => parseAsset(item, `${subject}[${index}]`))
}

function parseRegion(value: unknown, subject: string): CanvasRegionSelection | undefined {
  if (value === undefined) return undefined
  const source = record(value, subject)
  exact(source, ['asset', 'normalizedBounds', 'maskAsset'], subject)
  let normalizedBounds: CanvasRegionSelection['normalizedBounds']
  if (source.normalizedBounds !== undefined) {
    const bounds = record(source.normalizedBounds, `${subject}.normalizedBounds`)
    exact(bounds, ['x', 'y', 'width', 'height'], `${subject}.normalizedBounds`)
    normalizedBounds = {
      x: finite(bounds.x, `${subject}.normalizedBounds.x`),
      y: finite(bounds.y, `${subject}.normalizedBounds.y`),
      width: finite(bounds.width, `${subject}.normalizedBounds.width`),
      height: finite(bounds.height, `${subject}.normalizedBounds.height`),
    }
    if (
      normalizedBounds.x < 0 || normalizedBounds.y < 0
      || normalizedBounds.width <= 0 || normalizedBounds.height <= 0
      || normalizedBounds.x + normalizedBounds.width > 1
      || normalizedBounds.y + normalizedBounds.height > 1
    ) fail(`${subject}.normalizedBounds must stay inside normalized [0,1] coordinates`)
  }
  return {
    asset: parseAsset(source.asset, `${subject}.asset`),
    ...(normalizedBounds === undefined ? {} : { normalizedBounds }),
    ...(source.maskAsset === undefined ? {} : { maskAsset: parseAsset(source.maskAsset, `${subject}.maskAsset`) }),
  }
}

/** Strictly decode one Browser-supplied Canvas interaction snapshot. */
export function decodeCanvasInteractionContext(value: unknown): CanvasInteractionContext {
  const source = record(value, 'canvas-interaction')
  exact(source, [
    'canvasId', 'workflowId', 'workflowRevision', 'mode', 'selectedNodeIds', 'selectedEdgeIds',
    'selectedAssetRefs', 'focusedOutput', 'region',
  ], 'canvas-interaction')
  const mode = source.mode
  if (mode !== undefined && mode !== 'minimal' && mode !== 'editor') fail('canvas-interaction.mode must be minimal or editor')
  const selectedNodeIds = optionalStrings(source.selectedNodeIds, 'canvas-interaction.selectedNodeIds')
  const selectedEdgeIds = optionalStrings(source.selectedEdgeIds, 'canvas-interaction.selectedEdgeIds')
  const selectedAssetRefs = parseAssets(source.selectedAssetRefs, 'canvas-interaction.selectedAssetRefs')
  let focusedOutput: CanvasInteractionContext['focusedOutput']
  if (source.focusedOutput !== undefined) {
    const focused = record(source.focusedOutput, 'canvas-interaction.focusedOutput')
    exact(focused, ['runId', 'assetIndex'], 'canvas-interaction.focusedOutput')
    focusedOutput = {
      runId: string(focused.runId, 'canvas-interaction.focusedOutput.runId') as CanvasRunId,
      assetIndex: integer(focused.assetIndex, 'canvas-interaction.focusedOutput.assetIndex'),
    }
  }
  return {
    canvasId: string(source.canvasId, 'canvas-interaction.canvasId') as CanvasInteractionContext['canvasId'],
    workflowId: string(source.workflowId, 'canvas-interaction.workflowId') as CanvasInteractionContext['workflowId'],
    workflowRevision: integer(source.workflowRevision, 'canvas-interaction.workflowRevision'),
    ...(mode === undefined ? {} : { mode }),
    ...(selectedNodeIds === undefined ? {} : { selectedNodeIds: selectedNodeIds as CanvasInteractionContext['selectedNodeIds'] }),
    ...(selectedEdgeIds === undefined ? {} : { selectedEdgeIds: selectedEdgeIds as CanvasInteractionContext['selectedEdgeIds'] }),
    ...(selectedAssetRefs === undefined ? {} : { selectedAssetRefs }),
    ...(focusedOutput === undefined ? {} : { focusedOutput }),
    ...(source.region === undefined ? {} : { region: parseRegion(source.region, 'canvas-interaction.region') as CanvasRegionSelection }),
  }
}

function assetKey(asset: CanvasAssetRef): string {
  return asset.kind === 'image' ? `image:${asset.image.attachmentId}` : `video:${asset.video.assetId}`
}

/**
 * Resolve a decoded interaction snapshot against the current Host Canvas.
 * Same-revision semantic selections are membership-checked. Stale revisions stay admissible
 * so the Agent can observe staleness and re-read before mutating. Durable asset references
 * remain meaningful even when a later run changes the current output.
 */
export function resolveCanvasInteractionContext(
  context: CanvasInteractionContext,
  canvas: CanvasSnapshot | null,
): ResolvedCanvasInteractionContext {
  if (canvas === null || canvas.workflow === null) fail('canvas-interaction has no current Host Canvas workflow')
  if (canvas.id !== context.canvasId) fail('canvas-interaction.canvasId does not match the current Host Canvas')
  if (canvas.workflow.id !== context.workflowId) fail('canvas-interaction.workflowId does not match the current Host workflow')
  const stale = canvas.workflowRevision !== context.workflowRevision
  if (!stale) {
    const nodeIds = new Set(canvas.workflow.nodes.map(node => String(node.id)))
    for (const nodeId of context.selectedNodeIds ?? []) {
      if (!nodeIds.has(String(nodeId))) fail(`canvas-interaction selected node "${nodeId}" is not in the current workflow`)
    }
    const edgeIds = new Set(canvas.workflow.edges.map(edge => String(edge.id)))
    for (const edgeId of context.selectedEdgeIds ?? []) {
      if (!edgeIds.has(String(edgeId))) fail(`canvas-interaction selected edge "${edgeId}" is not in the current workflow`)
    }
  }
  if (context.focusedOutput !== undefined) {
    const output = canvas.output
    if (output === null || output.runId !== context.focusedOutput.runId) fail('canvas-interaction focused output is not current')
    if (context.focusedOutput.assetIndex >= output.assets.length) fail('canvas-interaction focused output index is out of range')
  }
  return { context: structuredClone(context), currentWorkflowRevision: canvas.workflowRevision, stale }
}

/** Stable, compact model-facing rendering for one resolved selection/focus snapshot. */
export function renderCanvasInteractionContext(resolved: ResolvedCanvasInteractionContext): string {
  const { context } = resolved
  const lines = [
    'Canvas interaction context for this user turn:',
    `- canvas: ${context.canvasId}`,
    `- workflow: ${context.workflowId}`,
    `- selected workflow revision: ${context.workflowRevision}`,
    `- current workflow revision: ${resolved.currentWorkflowRevision}`,
    `- context status: ${resolved.stale ? 'STALE — call canvas_read before acting on selected workflow targets' : 'current'}`,
  ]
  if (context.mode !== undefined) lines.push(`- UI mode: ${context.mode}`)
  if ((context.selectedNodeIds?.length ?? 0) > 0) lines.push(`- selected nodes: ${context.selectedNodeIds!.join(', ')}`)
  if ((context.selectedEdgeIds?.length ?? 0) > 0) lines.push(`- selected edges: ${context.selectedEdgeIds!.join(', ')}`)
  if ((context.selectedAssetRefs?.length ?? 0) > 0) lines.push(`- selected assets: ${context.selectedAssetRefs!.map(assetKey).join(', ')}`)
  if (context.focusedOutput !== undefined) {
    lines.push(`- focused output: run ${context.focusedOutput.runId}, candidate ${context.focusedOutput.assetIndex + 1}`)
  }
  if (context.region !== undefined) {
    const bounds = context.region.normalizedBounds
    lines.push(`- selected region asset: ${assetKey(context.region.asset)}`)
    if (bounds !== undefined) lines.push(`- normalized region: x=${bounds.x}, y=${bounds.y}, width=${bounds.width}, height=${bounds.height}`)
    if (context.region.maskAsset !== undefined) lines.push(`- region mask: ${assetKey(context.region.maskAsset)}`)
  }
  lines.push('Interpret deictic references such as “this”, “this image”, “this node”, “here”, “这个”, “这张”, and “这里” against this snapshot. Do not invent a target when a selection field is absent.')
  return lines.join('\n')
}
