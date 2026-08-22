/** Host CanvasService: Session-native Canvas/layout writes, bounded history, Host authorization, feature policy, and Typert exports. */

import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { Remote, TypertBusinessFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { CANVAS_CHANGE_VERSION } from './migration.ts'
import {
  CanvasId,
  CanvasDomainError,
  assertCanvasSnapshot,
  assertMediaWorkflow,
  createCanvasSnapshot,
  isCanvasRunTerminal,
} from './domain.ts'
import {
  applyCanvasChange,
  applyCanvasEvent,
  cloneCanvasFoldState,
  emptyCanvasFoldState,
} from './fold.ts'
import type { CanvasFoldState } from './fold.ts'
import type { CanvasChange, CanvasOperation } from './events.ts'
import {
  CanvasSensitiveDataError,
  assertCanvasAccessProvenance,
  assertCanvasDurableAuditSafe,
  assertCanvasWorkflowAuditSafe,
  canonicalCanvasAccessContext,
  canvasBrowserAccess,
  canvasChangeMeta,
  canvasHostAgentAccess,
} from './audit.ts'
import { CanvasAuthorizationPolicy } from './authorization.ts'
import {
  CANVAS_LAYOUT_CHANGE_VERSION,
  CanvasLayoutError,
  createCanvasLayoutSnapshot,
  foldCanvasLayout,
} from './layout.ts'
import type { CanvasLayoutChange } from './layout.ts'
import { registerCanvasProjections } from './projection.ts'
import {
  CanvasRunHistoryIndex,
  validateGetCanvasRunRequest,
  validateListCanvasRunsRequest,
} from './history.ts'
import type { CanvasFeatureService } from './feature-service.ts'
import type { CanvasFeatureName } from './feature-types.ts'
import { withCanvasWritePermit } from './write-authority.ts'
import type {
  CanvasClearReceipt,
  CanvasLayoutMutationReceipt,
  CanvasOutputSelectionReceipt,
  CanvasRunHistoryPage,
  CanvasWorkflowMutationReceipt,
  GetCanvasRunRequest,
  ListCanvasRunsRequest,
  SaveCanvasLayoutRequest,
} from './client.ts'
import type {
  CanvasAccessContext,
  CanvasAuthorizationDecision,
  CanvasAuthorizationMode,
  CanvasAuthorizationRequest,
  CanvasAuthorizationResource,
  CanvasPermission,
  CanvasRunHistoryEntry,
  CanvasServiceConfig,
  CanvasServiceErrorCode,
  CanvasSnapshot,
  CreateCanvasRequest,
  CurrentCanvasLayoutSnapshot,
  MediaWorkflow,
  MediaWorkflowEdge,
  MediaWorkflowNode,
  SelectCanvasOutputRequest,
  WorkflowEditOperation,
  WorkflowRef,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    canvas: CanvasService
  }
}

/** Error returned by CanvasService before a mutation reaches the Session commit point. */
export class CanvasServiceError extends HarnessError {
  constructor(message: string, code: CanvasServiceErrorCode) {
    super(message, code)
  }
}

interface CanvasCache {
  state: CanvasFoldState
  history: CanvasRunHistoryIndex
  observedSeq: number
}

interface PreparedCanvasAccess {
  readonly cache: CanvasCache
  readonly access: CanvasAccessContext
}

type CurrentWorkflowCanvas = CanvasSnapshot & { readonly workflow: MediaWorkflow }

function cloneWorkflow(workflow: MediaWorkflow): MediaWorkflow {
  return structuredClone(workflow)
}

function cloneNode(node: MediaWorkflowNode): MediaWorkflowNode {
  return structuredClone(node)
}

function cloneEdge(edge: MediaWorkflowEdge): MediaWorkflowEdge {
  return { ...edge }
}

function invalidEdit(message: string): never {
  throw new CanvasServiceError(message, 'CANVAS_INVALID_EDIT')
}

const CANVAS_REMOTE_SAFE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  CANVAS_AGENT_NOT_LIVE: 'Canvas session is no longer active',
  CANVAS_NOT_FOUND: 'Canvas was not found',
  CANVAS_ALREADY_EXISTS: 'Canvas already exists',
  CANVAS_STALE_WORKFLOW_REVISION: 'Canvas workflow changed; refresh and retry',
  CANVAS_WORKFLOW_ID_MISMATCH: 'Canvas workflow does not match the current workflow',
  CANVAS_INVALID_EDIT: 'Canvas edit request is invalid',
  CANVAS_OUTPUT_NOT_FOUND: 'Canvas output is not current',
  CANVAS_INVALID_OUTPUT_SELECTION: 'Canvas output selection is invalid',
  CANVAS_PERMISSION_DENIED: 'Canvas permission denied',
  CANVAS_AUTHORIZATION_FAILED: 'Canvas authorization is unavailable',
  CANVAS_INVALID_ACCESS_CONTEXT: 'Canvas access context is invalid',
  CANVAS_SENSITIVE_DATA: 'Canvas request contains data that cannot be persisted',
  CANVAS_INVALID_LAYOUT: 'Canvas layout request is invalid',
  CANVAS_LAYOUT_CANVAS_MISMATCH: 'Canvas layout belongs to another Canvas generation',
  CANVAS_LAYOUT_WORKFLOW_MISMATCH: 'Canvas layout belongs to another workflow',
  CANVAS_STALE_LAYOUT_REVISION: 'Canvas layout changed; refresh and retry',
  CANVAS_FEATURE_DISABLED: 'Canvas feature is disabled',
  CANVAS_INVALID_HISTORY_QUERY: 'Canvas history request is invalid',
})

function remoteCanvasCall<T>(call: () => T): T {
  try {
    return call()
  } catch (error) {
    if (error instanceof HarnessError) {
      const code = String(error.code)
      const message = CANVAS_REMOTE_SAFE_MESSAGES[code]
      if (message !== undefined) throw new TypertBusinessFailure(message, code)
    }
    throw error
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

function editString(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.length === 0) invalidEdit(`${subject} must be a non-empty string`)
  return value
}

function editRecord(value: unknown, subject: string): Record<string, unknown> {
  if (!isPlainRecord(value)) invalidEdit(`${subject} must be a plain object`)
  return value
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], subject: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...allowed].sort()
  if (actual.join(',') !== expected.join(',')) invalidEdit(`${subject} has unsupported or missing fields`)
}

function nonEmptyId(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.length === 0) invalidEdit(`${subject} must be a non-empty string`)
  return value
}

function workflowRefInput(value: unknown): WorkflowRef {
  const source = editRecord(value, 'Canvas workflow ref')
  exactKeys(source, ['canvasId', 'workflowId', 'workflowRevision'], 'Canvas workflow ref')
  const revision = source.workflowRevision
  if (!Number.isSafeInteger(revision) || (revision as number) < 1) {
    invalidEdit('Canvas workflow ref workflowRevision must be a positive safe integer')
  }
  return {
    canvasId: nonEmptyId(source.canvasId, 'Canvas workflow ref canvasId') as WorkflowRef['canvasId'],
    workflowId: nonEmptyId(source.workflowId, 'Canvas workflow ref workflowId') as WorkflowRef['workflowId'],
    workflowRevision: revision as number,
  }
}

function selectOutputInput(value: unknown): SelectCanvasOutputRequest {
  const source = editRecord(value, 'Canvas output-selection request')
  exactKeys(source, ['assetIndex', 'runId'], 'Canvas output-selection request')
  if (!Number.isSafeInteger(source.assetIndex) || (source.assetIndex as number) < 0) {
    invalidEdit('Canvas output-selection assetIndex must be a non-negative safe integer')
  }
  return {
    runId: nonEmptyId(source.runId, 'Canvas output-selection runId') as SelectCanvasOutputRequest['runId'],
    assetIndex: source.assetIndex as number,
  }
}

function finiteNumber(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalidEdit(`${subject} must be finite`)
  return value
}

function saveLayoutInput(value: unknown): SaveCanvasLayoutRequest {
  const source = editRecord(value, 'Canvas layout request')
  const allowed = new Set(['canvasId', 'workflowId', 'expectedLayoutRevision', 'nodePositions', 'viewport'])
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) invalidEdit(`Canvas layout request contains unsupported field "${key}"`)
  }
  for (const key of ['canvasId', 'workflowId', 'expectedLayoutRevision', 'nodePositions'] as const) {
    if (!Object.hasOwn(source, key)) invalidEdit(`Canvas layout request is missing ${key}`)
  }
  if (!Number.isSafeInteger(source.expectedLayoutRevision) || (source.expectedLayoutRevision as number) < 0) {
    invalidEdit('Canvas layout expectedLayoutRevision must be a non-negative safe integer')
  }
  const positions = editRecord(source.nodePositions, 'Canvas layout nodePositions')
  const nodePositions: Record<string, { x: number; y: number }> = {}
  for (const [nodeId, candidate] of Object.entries(positions)) {
    if (nodeId.length === 0) invalidEdit('Canvas layout node id must be non-empty')
    const point = editRecord(candidate, `Canvas layout node "${nodeId}" position`)
    exactKeys(point, ['x', 'y'], `Canvas layout node "${nodeId}" position`)
    nodePositions[nodeId] = {
      x: finiteNumber(point.x, `Canvas layout node "${nodeId}" x`),
      y: finiteNumber(point.y, `Canvas layout node "${nodeId}" y`),
    }
  }
  let viewport: SaveCanvasLayoutRequest['viewport']
  if (source.viewport !== undefined) {
    const raw = editRecord(source.viewport, 'Canvas layout viewport')
    exactKeys(raw, ['x', 'y', 'zoom'], 'Canvas layout viewport')
    const zoom = finiteNumber(raw.zoom, 'Canvas layout viewport zoom')
    if (zoom <= 0) invalidEdit('Canvas layout viewport zoom must be positive')
    viewport = {
      x: finiteNumber(raw.x, 'Canvas layout viewport x'),
      y: finiteNumber(raw.y, 'Canvas layout viewport y'),
      zoom,
    }
  }
  return {
    canvasId: nonEmptyId(source.canvasId, 'Canvas layout canvasId') as SaveCanvasLayoutRequest['canvasId'],
    workflowId: nonEmptyId(source.workflowId, 'Canvas layout workflowId') as SaveCanvasLayoutRequest['workflowId'],
    expectedLayoutRevision: source.expectedLayoutRevision as number,
    nodePositions: nodePositions as SaveCanvasLayoutRequest['nodePositions'],
    ...(viewport === undefined ? {} : { viewport }),
  }
}

/**
 * Validate the SRC-mode Host boundary before any feature/plugin can inspect a
 * workflow edit. Generated Typert schemas remain an earlier, stricter boundary
 * when available; this guard makes source-mode behavior fail loud as well.
 */
function workflowEditOperations(value: unknown): readonly WorkflowEditOperation[] {
  if (!Array.isArray(value) || value.length === 0) {
    invalidEdit('Canvas workflow edit requires at least one operation')
  }
  for (const [index, candidate] of value.entries()) {
    const operation = editRecord(candidate, `Canvas workflow edit operation ${index}`)
    const op = editString(operation.op, `Canvas workflow edit operation ${index}.op`)
    switch (op) {
      case 'add-node': {
        exactKeys(operation, ['op', 'node'], `Canvas workflow edit operation ${index}`)
        const node = editRecord(operation.node, `Canvas workflow edit operation ${index}.node`)
        editString(node.id, `Canvas workflow edit operation ${index}.node.id`)
        editString(node.type, `Canvas workflow edit operation ${index}.node.type`)
        editRecord(node.config, `Canvas workflow edit operation ${index}.node.config`)
        break
      }
      case 'remove-node':
        exactKeys(operation, ['op', 'nodeId'], `Canvas workflow edit operation ${index}`)
        editString(operation.nodeId, `Canvas workflow edit operation ${index}.nodeId`)
        break
      case 'replace-node-config':
        exactKeys(operation, ['op', 'nodeId', 'config'], `Canvas workflow edit operation ${index}`)
        editString(operation.nodeId, `Canvas workflow edit operation ${index}.nodeId`)
        editRecord(operation.config, `Canvas workflow edit operation ${index}.config`)
        break
      case 'rename-node':
        exactKeys(operation, ['op', 'nodeId', 'name'], `Canvas workflow edit operation ${index}`)
        editString(operation.nodeId, `Canvas workflow edit operation ${index}.nodeId`)
        editString(operation.name, `Canvas workflow edit operation ${index}.name`)
        break
      case 'connect': {
        exactKeys(operation, ['op', 'edge'], `Canvas workflow edit operation ${index}`)
        const edge = editRecord(operation.edge, `Canvas workflow edit operation ${index}.edge`)
        exactKeys(edge, ['id', 'sourceNodeId', 'sourcePort', 'targetNodeId', 'targetPort'], `Canvas workflow edit operation ${index}.edge`)
        for (const field of ['id', 'sourceNodeId', 'sourcePort', 'targetNodeId', 'targetPort'] as const) {
          editString(edge[field], `Canvas workflow edit operation ${index}.edge.${field}`)
        }
        break
      }
      case 'disconnect':
        exactKeys(operation, ['op', 'edgeId'], `Canvas workflow edit operation ${index}`)
        editString(operation.edgeId, `Canvas workflow edit operation ${index}.edgeId`)
        break
      case 'set-output-nodes':
        exactKeys(operation, ['op', 'nodeIds'], `Canvas workflow edit operation ${index}`)
        if (!Array.isArray(operation.nodeIds)) {
          invalidEdit(`Canvas workflow edit operation ${index}.nodeIds must be an array`)
        }
        for (const [nodeIndex, nodeId] of operation.nodeIds.entries()) {
          editString(nodeId, `Canvas workflow edit operation ${index}.nodeIds[${nodeIndex}]`)
        }
        break
      case 'rename-workflow':
        exactKeys(operation, ['op', 'name'], `Canvas workflow edit operation ${index}`)
        editString(operation.name, `Canvas workflow edit operation ${index}.name`)
        break
      default:
        invalidEdit(`Canvas workflow edit operation ${index}.op is unsupported`)
    }
  }
  return value as readonly WorkflowEditOperation[]
}

function nodeIndex(nodes: readonly MediaWorkflowNode[], nodeId: MediaWorkflowNode['id']): number {
  return nodes.findIndex(node => node.id === nodeId)
}

function edgeIndex(edges: readonly MediaWorkflowEdge[], edgeId: MediaWorkflowEdge['id']): number {
  return edges.findIndex(edge => edge.id === edgeId)
}

function authorizationMode(value: unknown): CanvasAuthorizationMode {
  if (value === undefined || value === 'single-user-fallback') return 'single-user-fallback'
  if (value === 'required-external') return 'required-external'
  throw new Error(`unsupported Canvas authorizationMode ${String(value)}`)
}

function invalidExternalAuthorizationDecision(): CanvasAuthorizationDecision {
  return { allowed: false, reason: 'policy-unavailable', policyCode: 'authorization-service-invalid-response' }
}

function normalizeExternalAuthorizationDecision(value: unknown): CanvasAuthorizationDecision {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalidExternalAuthorizationDecision()
  }
  const decision = value as Record<string, unknown>
  const keys = Object.keys(decision).sort()
  if (decision.allowed === true) {
    return keys.length === 1 && keys[0] === 'allowed'
      ? { allowed: true }
      : invalidExternalAuthorizationDecision()
  }
  if (decision.allowed !== false || (decision.reason !== 'denied' && decision.reason !== 'policy-unavailable')) {
    return invalidExternalAuthorizationDecision()
  }
  const hasPolicyCode = Object.hasOwn(decision, 'policyCode')
  const expectedKeys = hasPolicyCode ? ['allowed', 'policyCode', 'reason'] : ['allowed', 'reason']
  if (keys.join(',') !== expectedKeys.join(',')) return invalidExternalAuthorizationDecision()
  if (!hasPolicyCode) return { allowed: false, reason: decision.reason }
  const policyCode = decision.policyCode
  if (
    typeof policyCode !== 'string'
    || policyCode.length === 0
    || policyCode.length > 128
    || policyCode.trim() !== policyCode
    || /[\u0000-\u001f\u007f]/.test(policyCode)
    || !/^[A-Za-z0-9._:@/-]+$/.test(policyCode)
  ) {
    return invalidExternalAuthorizationDecision()
  }
  return { allowed: false, reason: decision.reason, policyCode }
}

function applyWorkflowOperations(current: MediaWorkflow, operations: readonly WorkflowEditOperation[]): MediaWorkflow {
  let name = current.name
  const nodes = current.nodes.map(cloneNode)
  const edges = current.edges.map(cloneEdge)
  let outputNodeIds = [...current.outputNodeIds]

  for (const operation of operations) {
    switch (operation.op) {
      case 'add-node':
        nodes.push(cloneNode(operation.node))
        break
      case 'remove-node': {
        const index = nodeIndex(nodes, operation.nodeId)
        if (index < 0) invalidEdit(`Canvas workflow node "${operation.nodeId}" does not exist`)
        nodes.splice(index, 1)
        break
      }
      case 'replace-node-config': {
        const index = nodeIndex(nodes, operation.nodeId)
        if (index < 0) invalidEdit(`Canvas workflow node "${operation.nodeId}" does not exist`)
        const node = nodes[index]!
        nodes[index] = { ...node, config: structuredClone(operation.config) }
        break
      }
      case 'rename-node': {
        const index = nodeIndex(nodes, operation.nodeId)
        if (index < 0) invalidEdit(`Canvas workflow node "${operation.nodeId}" does not exist`)
        const node = nodes[index]!
        nodes[index] = { ...node, name: operation.name }
        break
      }
      case 'connect':
        edges.push(cloneEdge(operation.edge))
        break
      case 'disconnect': {
        const index = edgeIndex(edges, operation.edgeId)
        if (index < 0) invalidEdit(`Canvas workflow edge "${operation.edgeId}" does not exist`)
        edges.splice(index, 1)
        break
      }
      case 'set-output-nodes':
        outputNodeIds = [...operation.nodeIds]
        break
      case 'rename-workflow':
        name = operation.name
        break
    }
  }

  const workflow: MediaWorkflow = {
    id: current.id,
    schemaVersion: current.schemaVersion,
    name,
    nodes,
    edges,
    outputNodeIds,
  }
  try {
    assertMediaWorkflow(workflow)
  } catch (error) {
    if (error instanceof CanvasDomainError) invalidEdit(error.message)
    throw error
  }
  return workflow
}

/** Session-backed Canvas write/query service (`ctx.canvas`) and Typert namespace `canvas`. */
export class CanvasService extends TypertRemoteService {
  static inject = ['agents', 'sessions']

  private readonly caches = new WeakMap<Session, CanvasCache>()
  private readonly fallbackAuthorization: CanvasAuthorizationPolicy
  private readonly authorizationMode: CanvasAuthorizationMode

  constructor(ctx: Context, config: CanvasServiceConfig = {}) {
    super(ctx, 'canvas')
    this.fallbackAuthorization = new CanvasAuthorizationPolicy(config.authorization)
    this.authorizationMode = authorizationMode(config.authorizationMode)
    ctx.inject(['sessionProjections'], (projectionCtx) => {
      registerCanvasProjections(projectionCtx, (sessionId, value) => this.canBrowserReadProjection(sessionId, value))
    })
  }

  authorize(request: CanvasAuthorizationRequest): CanvasAuthorizationDecision {
    const external = this.ctx.get('canvasAuthorization')
    if (external === undefined) {
      if (this.authorizationMode === 'required-external') {
        return { allowed: false, reason: 'policy-unavailable', policyCode: 'external-service-required' }
      }
      return this.fallbackAuthorization.authorize(request)
    }
    try {
      return normalizeExternalAuthorizationDecision(external.authorize(request))
    } catch {
      return { allowed: false, reason: 'policy-unavailable', policyCode: 'authorization-service-error' }
    }
  }

  get(agent: Agent, access?: CanvasAccessContext): CanvasSnapshot | null {
    const prepared = this.prepare(agent, 'canvas.read', access)
    return this.view(prepared.cache)
  }

  create(agent: Agent, request: CreateCanvasRequest, access?: CanvasAccessContext): CanvasSnapshot {
    const prepared = this.prepare(agent, 'canvas.edit', access)
    const features = this.featurePolicy()
    features?.assertEnabled('canvas')
    const workflow = cloneWorkflow(request.workflow)
    assertMediaWorkflow(workflow)
    features?.assertWorkflowCreatable(workflow)
    this.assertWorkflowAuditSafe(workflow)
    if (prepared.cache.state.canvas !== null) {
      throw new CanvasServiceError(`Canvas "${prepared.cache.state.canvas.id}" already exists`, 'CANVAS_ALREADY_EXISTS')
    }
    const canvasId = CanvasId(`canvas-${randomUUID()}`)
    if (request.currentVariantId !== undefined) {
      features?.assertEnabled('variants')
      this.assertAuthorized(
        agent,
        prepared.cache,
        prepared.access,
        'canvas.variant.create',
        { kind: 'variant', canvasId, variantId: request.currentVariantId },
      )
    }
    const now = Date.now()
    const canvas = createCanvasSnapshot({
      id: canvasId,
      createdAt: now,
      workflow,
      ...request.currentVariantId === undefined ? {} : { currentVariantId: request.currentVariantId },
    })
    const committed = this.commit(agent, prepared.cache, prepared.access, 'create', canvas)
    if (committed === null) throw new Error('Canvas create committed a null tombstone')
    return committed
  }

  replaceWorkflow(agent: Agent, ref: WorkflowRef, workflow: MediaWorkflow, access?: CanvasAccessContext): CanvasSnapshot {
    const prepared = this.prepare(agent, 'canvas.edit', access)
    const features = this.featurePolicy()
    features?.assertEnabled('canvas')
    this.assertBrowserEditorEnabled(prepared.access, features)
    const replacement = cloneWorkflow(workflow)
    try {
      assertMediaWorkflow(replacement)
    } catch (error) {
      if (error instanceof CanvasDomainError) invalidEdit('Canvas replacement workflow is invalid')
      throw error
    }
    features?.assertWorkflowCreatable(replacement)
    this.assertWorkflowAuditSafe(replacement)
    const current = this.expectCurrentWorkflow(prepared.cache, workflowRefInput(ref))
    if (replacement.id !== current.workflow.id) {
      throw new CanvasServiceError(
        `replacement workflow "${replacement.id}" does not match current workflow "${current.workflow.id}"`,
        'CANVAS_WORKFLOW_ID_MISMATCH',
      )
    }
    return this.commitWorkflow(agent, prepared, current, 'workflow-replace', replacement)
  }

  editWorkflow(
    agent: Agent,
    ref: WorkflowRef,
    operations: readonly WorkflowEditOperation[],
    access?: CanvasAccessContext,
  ): CanvasSnapshot {
    const prepared = this.prepare(agent, 'canvas.edit', access)
    const features = this.featurePolicy()
    features?.assertEnabled('canvas')
    this.assertBrowserEditorEnabled(prepared.access, features)
    const current = this.expectCurrentWorkflow(prepared.cache, workflowRefInput(ref))
    const validatedOperations = workflowEditOperations(operations)
    features?.assertWorkflowEditable(current.workflow, validatedOperations)
    const workflow = applyWorkflowOperations(current.workflow, validatedOperations)
    this.assertWorkflowAuditSafe(workflow)
    return this.commitWorkflow(agent, prepared, current, 'workflow-edit', workflow)
  }

  selectOutput(agent: Agent, request: SelectCanvasOutputRequest, access?: CanvasAccessContext): CanvasSnapshot {
    const validatedRequest = selectOutputInput(request)
    const prepared = this.prepare(agent, 'canvas.edit', access)
    this.assertFeature('canvas')
    const current = prepared.cache.state.canvas
    if (current === null) throw new CanvasServiceError('no current Canvas', 'CANVAS_NOT_FOUND')
    const output = current.output
    if (output === null || output.runId !== validatedRequest.runId) {
      throw new CanvasServiceError(`Canvas output for run "${validatedRequest.runId}" is not current`, 'CANVAS_OUTPUT_NOT_FOUND')
    }
    if (!Number.isSafeInteger(validatedRequest.assetIndex)
      || validatedRequest.assetIndex < 0
      || validatedRequest.assetIndex >= output.assets.length) {
      throw new CanvasServiceError(
        `Canvas output index ${validatedRequest.assetIndex} is out of range`,
        'CANVAS_INVALID_OUTPUT_SELECTION',
      )
    }
    if (output.primaryAssetIndex === validatedRequest.assetIndex) return this.viewRequired(prepared.cache)
    const canvas: CanvasSnapshot = {
      ...current,
      output: { ...output, primaryAssetIndex: validatedRequest.assetIndex },
      updatedAt: this.nextMutationTime(current),
    }
    assertCanvasSnapshot(canvas)
    const committed = this.commit(agent, prepared.cache, prepared.access, 'output-select', canvas)
    if (committed === null) throw new Error('Canvas output-select committed a null tombstone')
    return committed
  }

  saveLayout(agent: Agent, request: SaveCanvasLayoutRequest, access?: CanvasAccessContext): CurrentCanvasLayoutSnapshot {
    const validatedRequest = saveLayoutInput(request)
    const prepared = this.prepare(agent, 'canvas.layout.write', access)
    this.assertFeature('editor')
    const current = prepared.cache.state.canvas
    if (current === null || current.workflow === null) {
      throw new CanvasServiceError('no current Canvas workflow', 'CANVAS_NOT_FOUND')
    }
    if (validatedRequest.canvasId !== current.id) {
      throw new CanvasLayoutError(
        `Canvas layout canvas "${validatedRequest.canvasId}" does not match current Canvas "${current.id}"`,
        'CANVAS_LAYOUT_CANVAS_MISMATCH',
      )
    }
    if (validatedRequest.workflowId !== current.workflow.id) {
      throw new CanvasLayoutError(
        `Canvas layout workflow "${validatedRequest.workflowId}" does not match current workflow "${current.workflow.id}"`,
        'CANVAS_LAYOUT_WORKFLOW_MISMATCH',
      )
    }
    const previous = foldCanvasLayout(agent.session.events)
    const currentLayoutRevision = previous?.canvasId === current.id && previous.workflowId === current.workflow.id
      ? previous.layoutRevision
      : 0
    if (validatedRequest.expectedLayoutRevision !== currentLayoutRevision) {
      throw new CanvasLayoutError(
        `stale Canvas layout revision ${validatedRequest.expectedLayoutRevision}; current revision is ${currentLayoutRevision}`,
        'CANVAS_STALE_LAYOUT_REVISION',
      )
    }
    const nodeIds = new Set(current.workflow.nodes.map(node => String(node.id)))
    for (const nodeId of Object.keys(validatedRequest.nodePositions)) {
      if (!nodeIds.has(nodeId)) {
        throw new CanvasLayoutError(`Canvas layout references unknown node "${nodeId}"`, 'CANVAS_INVALID_LAYOUT')
      }
    }
    const layout = createCanvasLayoutSnapshot(
      validatedRequest,
      Math.max(Date.now(), previous?.updatedAt ?? 0),
    )
    const change: CanvasLayoutChange = {
      kind: 'canvas/layout-change',
      version: CANVAS_LAYOUT_CHANGE_VERSION,
      layout,
      meta: canvasChangeMeta(prepared.access),
    }
    withCanvasWritePermit(agent.session, 'canvas/layout-change', change, () => {
      agent.session.append('canvas/layout-change', change)
    })
    this.sync(agent.session, prepared.cache)
    return structuredClone(layout)
  }

  listRuns(agent: Agent, request: ListCanvasRunsRequest, access?: CanvasAccessContext): CanvasRunHistoryPage {
    const validatedRequest = validateListCanvasRunsRequest(request)
    const prepared = this.prepare(
      agent,
      'canvas.history.read',
      access,
      { kind: 'canvas', canvasId: validatedRequest.canvasId },
    )
    this.assertFeature('history')
    return prepared.cache.history.list(validatedRequest)
  }

  getRun(agent: Agent, request: GetCanvasRunRequest, access?: CanvasAccessContext): CanvasRunHistoryEntry | null {
    const validatedRequest = validateGetCanvasRunRequest(request)
    const prepared = this.prepare(
      agent,
      'canvas.history.read',
      access,
      { kind: 'run', canvasId: validatedRequest.canvasId, runId: validatedRequest.runId },
    )
    this.assertFeature('history')
    return prepared.cache.history.get(validatedRequest)
  }

  clear(agent: Agent, ref: WorkflowRef, access?: CanvasAccessContext): void {
    const prepared = this.prepare(agent, 'canvas.edit', access)
    this.assertFeature('canvas')
    const validatedRef = workflowRefInput(ref)
    const current = this.expectCurrentWorkflow(prepared.cache, validatedRef)
    if (current.run !== null && !isCanvasRunTerminal(current.run.status)) {
      throw new CanvasServiceError('Canvas cannot be cleared while its current run is non-terminal', 'CANVAS_INVALID_EDIT')
    }
    this.commit(agent, prepared.cache, prepared.access, 'clear', null)
  }

  /** Re-evaluate live Browser projection visibility after an external ACL decision changes. */
  refreshBrowserProjectionVisibility(sessionId: string): boolean {
    const session = this.ctx.sessions.get(sessionId as Session['id'])
    const projections = this.ctx.get('sessionProjections')
    if (session === undefined || projections === undefined) return false
    projections.refreshBrowserVisibility(session, ['canvas', 'canvasLayout'])
    return true
  }

  @Remote('editWorkflow')
  remoteExportEditWorkflow(
    agent: Agent,
    ref: WorkflowRef,
    operations: readonly WorkflowEditOperation[],
  ): CanvasWorkflowMutationReceipt {
    return remoteCanvasCall(() => ({
      ref: this.workflowRef(this.editWorkflow(agent, ref, operations, this.browserAccess(agent))),
    }))
  }

  @Remote('replaceWorkflow')
  remoteExportReplaceWorkflow(agent: Agent, ref: WorkflowRef, workflow: MediaWorkflow): CanvasWorkflowMutationReceipt {
    return remoteCanvasCall(() => ({
      ref: this.workflowRef(this.replaceWorkflow(agent, ref, workflow, this.browserAccess(agent))),
    }))
  }

  @Remote('selectOutput')
  remoteExportSelectOutput(agent: Agent, request: SelectCanvasOutputRequest): CanvasOutputSelectionReceipt {
    return remoteCanvasCall(() => {
      const canvas = this.selectOutput(agent, request, this.browserAccess(agent))
      const output = canvas.output
      if (output === null) throw new Error('Canvas output selection committed without an output')
      return { runId: output.runId, primaryAssetIndex: output.primaryAssetIndex }
    })
  }

  @Remote('saveLayout')
  remoteExportSaveLayout(agent: Agent, request: SaveCanvasLayoutRequest): CanvasLayoutMutationReceipt {
    return remoteCanvasCall(() => {
      const layout = this.saveLayout(agent, request, this.browserAccess(agent))
      return {
        canvasId: layout.canvasId,
        workflowId: layout.workflowId,
        layoutRevision: layout.layoutRevision,
        updatedAt: layout.updatedAt,
      }
    })
  }

  @Remote('clear')
  remoteExportClear(agent: Agent, ref: WorkflowRef): CanvasClearReceipt {
    return remoteCanvasCall(() => {
      const validatedRef = workflowRefInput(ref)
      this.clear(agent, validatedRef, this.browserAccess(agent))
      return { canvasId: validatedRef.canvasId }
    })
  }

  @Remote('listRuns')
  remoteExportListRuns(agent: Agent, request: ListCanvasRunsRequest): CanvasRunHistoryPage {
    return remoteCanvasCall(() => this.listRuns(agent, request, this.browserAccess(agent)))
  }

  @Remote('getRun')
  remoteExportGetRun(agent: Agent, request: GetCanvasRunRequest): CanvasRunHistoryEntry | null {
    return remoteCanvasCall(() => this.getRun(agent, request, this.browserAccess(agent)))
  }

  private prepare(
    agent: Agent,
    permission: CanvasPermission,
    access?: CanvasAccessContext,
    resource?: CanvasAuthorizationResource,
  ): PreparedCanvasAccess {
    this.assertLive(agent)
    const cache = this.cache(agent.session)
    this.sync(agent.session, cache)
    const canonical = this.resolveAccess(agent, access)
    this.assertAuthorized(agent, cache, canonical, permission, resource)
    return { cache, access: canonical }
  }

  private assertAuthorized(
    agent: Agent,
    cache: CanvasCache,
    access: CanvasAccessContext,
    permission: CanvasPermission,
    resource: CanvasAuthorizationResource = this.authorizationResource(cache, permission),
  ): void {
    const decision = this.authorize({
      permission,
      actor: access.actor,
      source: access.source,
      sessionId: String(agent.session.id),
      resource,
      ...(access.requestId === undefined ? {} : { requestId: access.requestId }),
      ...(access.correlationId === undefined ? {} : { correlationId: access.correlationId }),
    })
    if (!decision.allowed) {
      if (decision.reason === 'policy-unavailable') {
        throw new CanvasServiceError('Canvas authorization policy is unavailable', 'CANVAS_AUTHORIZATION_FAILED')
      }
      throw new CanvasServiceError(`Canvas permission "${permission}" denied`, 'CANVAS_PERMISSION_DENIED')
    }
  }

  private authorizationResource(cache: CanvasCache, permission: CanvasPermission): CanvasAuthorizationResource {
    const canvas = cache.state.canvas
    if (canvas === null) return { kind: 'session' }
    if (permission === 'canvas.layout.write' && canvas.workflow !== null) {
      return { kind: 'layout', canvasId: canvas.id, workflowId: canvas.workflow.id }
    }
    if ((permission === 'canvas.run' || permission === 'canvas.cancel') && canvas.run !== null) {
      return { kind: 'run', canvasId: canvas.id, runId: canvas.run.id }
    }
    if (permission === 'canvas.variant.create' && canvas.currentVariantId !== undefined) {
      return { kind: 'variant', canvasId: canvas.id, variantId: canvas.currentVariantId }
    }
    if ((permission === 'canvas.edit' || permission === 'canvas.workflow.restore') && canvas.workflow !== null) {
      return { kind: 'workflow', canvasId: canvas.id, workflowId: canvas.workflow.id }
    }
    return { kind: 'canvas', canvasId: canvas.id }
  }

  private projectionAuthorizationResource(value: unknown): CanvasAuthorizationResource {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const source = value as Record<string, unknown>
      if (typeof source.canvasId === 'string' && source.canvasId.length > 0) {
        return { kind: 'canvas', canvasId: CanvasId(source.canvasId) }
      }
      if (typeof source.id === 'string' && source.id.length > 0 && Object.hasOwn(source, 'workflowRevision')) {
        return { kind: 'canvas', canvasId: CanvasId(source.id) }
      }
    }
    return { kind: 'session' }
  }

  private browserAccess(agent: Agent): CanvasAccessContext {
    return canvasBrowserAccess(String(agent.session.id))
  }

  private resolveAccess(agent: Agent, access?: CanvasAccessContext): CanvasAccessContext {
    try {
      const canonical = canonicalCanvasAccessContext(access ?? canvasHostAgentAccess(String(agent.id)))
      assertCanvasAccessProvenance(canonical, {
        agentId: String(agent.id),
        sessionId: String(agent.session.id),
      })
      return canonical
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid Canvas access context'
      throw new CanvasServiceError(message, 'CANVAS_INVALID_ACCESS_CONTEXT')
    }
  }

  private canBrowserReadProjection(sessionId: string | undefined, value: unknown): boolean {
    if (sessionId === undefined) {
      if (this.ctx.get('canvasAuthorization') !== undefined || this.authorizationMode === 'required-external') return false
      const access = canvasBrowserAccess('detached-session')
      return this.fallbackAuthorization.authorize({
        permission: 'canvas.read',
        actor: access.actor,
        source: access.source,
        sessionId: 'detached-session',
        resource: this.projectionAuthorizationResource(value),
      }).allowed
    }
    const session = this.ctx.sessions.get(sessionId as Session['id'])
    const access = canvasBrowserAccess(sessionId)
    if (session === undefined) {
      return this.authorize({
        permission: 'canvas.read',
        actor: access.actor,
        source: access.source,
        sessionId,
        resource: this.projectionAuthorizationResource(value),
      }).allowed
    }
    const cache = this.cache(session)
    this.sync(session, cache)
    return this.authorize({
      permission: 'canvas.read',
      actor: access.actor,
      source: access.source,
      sessionId,
      resource: this.authorizationResource(cache, 'canvas.read'),
    }).allowed
  }

  private featurePolicy(): CanvasFeatureService | undefined {
    return this.ctx.get('canvasFeatures')
  }

  private assertFeature(feature: CanvasFeatureName): void {
    this.featurePolicy()?.assertEnabled(feature)
  }

  private assertBrowserEditorEnabled(access: CanvasAccessContext, features: CanvasFeatureService | undefined): void {
    if (access.source === 'browser-remote') features?.assertEnabled('editor')
  }

  private assertWorkflowAuditSafe(workflow: MediaWorkflow): void {
    try {
      assertCanvasWorkflowAuditSafe(workflow)
    } catch (error) {
      if (error instanceof CanvasSensitiveDataError) {
        throw new CanvasServiceError(error.message, 'CANVAS_SENSITIVE_DATA')
      }
      throw error
    }
  }

  private assertDurableAuditSafe(canvas: CanvasSnapshot | null): void {
    try {
      assertCanvasDurableAuditSafe(canvas)
    } catch (error) {
      if (error instanceof CanvasSensitiveDataError) {
        throw new CanvasServiceError(error.message, 'CANVAS_SENSITIVE_DATA')
      }
      throw error
    }
  }

  private workflowRef(canvas: CanvasSnapshot): WorkflowRef {
    if (canvas.workflow === null) throw new Error(`Canvas "${canvas.id}" lacks a workflow`)
    return {
      canvasId: canvas.id,
      workflowId: canvas.workflow.id,
      workflowRevision: canvas.workflowRevision,
    }
  }

  private expectCurrentWorkflow(cache: CanvasCache, ref: WorkflowRef): CurrentWorkflowCanvas {
    const current = cache.state.canvas
    if (current === null) throw new CanvasServiceError('no current Canvas', 'CANVAS_NOT_FOUND')
    /* v8 ignore next -- every CanvasService create and strict Canvas fold requires an initial workflow. */
    if (current.workflow === null) throw new Error(`Canvas "${current.id}" cache lacks a workflow`)
    if (ref.canvasId !== current.id) {
      throw new CanvasServiceError(`Canvas "${ref.canvasId}" is not current`, 'CANVAS_NOT_FOUND')
    }
    if (ref.workflowId !== current.workflow.id) {
      throw new CanvasServiceError(
        `workflow "${ref.workflowId}" does not match current workflow "${current.workflow.id}"`,
        'CANVAS_WORKFLOW_ID_MISMATCH',
      )
    }
    if (ref.workflowRevision !== current.workflowRevision) {
      throw new CanvasServiceError(
        `stale Canvas workflow ref revision ${ref.workflowRevision}; current revision is ${current.workflowRevision}`,
        'CANVAS_STALE_WORKFLOW_REVISION',
      )
    }
    return current as CurrentWorkflowCanvas
  }

  private assertLive(agent: Agent): void {
    if (this.ctx.agents.get(agent.id) !== agent) {
      throw new CanvasServiceError(`agent "${agent.id}" is not live in this registry`, 'CANVAS_AGENT_NOT_LIVE')
    }
    const sessions = this.ctx.get('sessions')
    if (sessions?.get(agent.session.id) !== agent.session) {
      throw new CanvasServiceError(`session "${agent.session.id}" is not live in this store`, 'CANVAS_AGENT_NOT_LIVE')
    }
  }

  private cache(session: Session): CanvasCache {
    let cache = this.caches.get(session)
    if (cache !== undefined) return cache
    const state = emptyCanvasFoldState()
    const history = new CanvasRunHistoryIndex()
    for (const event of session.events) {
      applyCanvasEvent(state, event)
      history.apply(event)
    }
    cache = { state, history, observedSeq: session.seq }
    this.caches.set(session, cache)
    return cache
  }

  private sync(session: Session, cache: CanvasCache): void {
    const events = session.events.slice(cache.observedSeq)
    if (events.length === 0) return
    const stagedState = cloneCanvasFoldState(cache.state)
    const stagedHistory = cache.history.clone()
    for (const event of events) {
      applyCanvasEvent(stagedState, event)
      stagedHistory.apply(event)
    }
    cache.state = stagedState
    cache.history = stagedHistory
    cache.observedSeq += events.length
  }

  private commitWorkflow(
    agent: Agent,
    prepared: PreparedCanvasAccess,
    current: CurrentWorkflowCanvas,
    operation: 'workflow-edit' | 'workflow-replace',
    workflow: MediaWorkflow,
  ): CanvasSnapshot {
    if (isDeepStrictEqual(workflow, current.workflow)) return this.viewRequired(prepared.cache)
    const canvas: CanvasSnapshot = {
      ...current,
      workflowRevision: current.workflowRevision + 1,
      workflow,
      updatedAt: this.nextMutationTime(current),
    }
    assertCanvasSnapshot(canvas)
    const committed = this.commit(agent, prepared.cache, prepared.access, operation, canvas)
    if (committed === null) throw new Error(`Canvas ${operation} committed a null tombstone`)
    return committed
  }

  private nextMutationTime(current: CanvasSnapshot): number {
    return Math.max(Date.now(), current.updatedAt)
  }

  private commit(
    agent: Agent,
    cache: CanvasCache,
    access: CanvasAccessContext,
    operation: CanvasOperation,
    canvas: CanvasSnapshot | null,
  ): CanvasSnapshot | null {
    this.assertDurableAuditSafe(canvas)
    const change: CanvasChange = {
      kind: 'canvas/change',
      version: CANVAS_CHANGE_VERSION,
      operation,
      canvas,
      meta: canvasChangeMeta(access),
    }
    const staged = cloneCanvasFoldState(cache.state)
    applyCanvasChange(staged, change)
    withCanvasWritePermit(agent.session, 'canvas/change', change, () => {
      agent.session.append('canvas/change', change)
    })
    this.sync(agent.session, cache)
    return this.view(cache)
  }

  private view(cache: CanvasCache): CanvasSnapshot | null {
    return cache.state.canvas === null ? null : structuredClone(cache.state.canvas)
  }

  private viewRequired(cache: CanvasCache): CanvasSnapshot {
    const canvas = this.view(cache)
    if (canvas === null) throw new Error('Canvas cache unexpectedly became empty')
    return canvas
  }
}

export default CanvasService
