/** Host CanvasService: Session-native Canvas/layout writes, bounded history, Host authorization, feature policy, and Typert exports. */

import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
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
import { getCanvasRunHistory, listCanvasRunHistory } from './history.ts'
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
  CanvasLayoutSnapshot,
  CanvasPermission,
  CanvasRunHistoryEntry,
  CanvasServiceConfig,
  CanvasServiceErrorCode,
  CanvasSnapshot,
  CreateCanvasRequest,
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
  // oxlint-disable-next-line typescript/no-useless-constructor -- narrows HarnessError's string code
  constructor(message: string, code: CanvasServiceErrorCode) {
    super(message, code)
  }
}

interface CanvasCache {
  readonly state: CanvasFoldState
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

function normalizeExternalAuthorizationDecision(value: unknown): CanvasAuthorizationDecision {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { allowed: false, reason: 'policy-unavailable', policyCode: 'authorization-service-invalid-response' }
  }
  const decision = value as { allowed?: unknown; reason?: unknown }
  if (decision.allowed === true) return { allowed: true }
  if (decision.allowed === false && (decision.reason === 'denied' || decision.reason === 'policy-unavailable')) {
    return { allowed: false, reason: decision.reason }
  }
  return { allowed: false, reason: 'policy-unavailable', policyCode: 'authorization-service-invalid-response' }
}

function applyWorkflowOperations(current: MediaWorkflow, operations: readonly WorkflowEditOperation[]): MediaWorkflow {
  if (operations.length === 0) invalidEdit('Canvas workflow edit requires at least one operation')
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
      default:
        operation satisfies never
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
      registerCanvasProjections(projectionCtx, sessionId => this.canBrowserReadProjection(sessionId))
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
    assertMediaWorkflow(replacement)
    features?.assertWorkflowCreatable(replacement)
    this.assertWorkflowAuditSafe(replacement)
    const current = this.expectCurrentWorkflow(prepared.cache, ref)
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
    const current = this.expectCurrentWorkflow(prepared.cache, ref)
    features?.assertWorkflowEditable(current.workflow, operations)
    const workflow = applyWorkflowOperations(current.workflow, operations)
    this.assertWorkflowAuditSafe(workflow)
    return this.commitWorkflow(agent, prepared, current, 'workflow-edit', workflow)
  }

  selectOutput(agent: Agent, request: SelectCanvasOutputRequest, access?: CanvasAccessContext): CanvasSnapshot {
    const prepared = this.prepare(agent, 'canvas.edit', access)
    this.assertFeature('canvas')
    const current = prepared.cache.state.canvas
    if (current === null) throw new CanvasServiceError('no current Canvas', 'CANVAS_NOT_FOUND')
    const output = current.output
    if (output === null || output.runId !== request.runId) {
      throw new CanvasServiceError(`Canvas output for run "${request.runId}" is not current`, 'CANVAS_OUTPUT_NOT_FOUND')
    }
    if (!Number.isSafeInteger(request.assetIndex) || request.assetIndex < 0 || request.assetIndex >= output.assets.length) {
      throw new CanvasServiceError(`Canvas output index ${request.assetIndex} is out of range`, 'CANVAS_INVALID_OUTPUT_SELECTION')
    }
    if (output.primaryAssetIndex === request.assetIndex) return this.viewRequired(prepared.cache)
    const canvas: CanvasSnapshot = {
      ...current,
      output: { ...output, primaryAssetIndex: request.assetIndex },
      updatedAt: this.nextMutationTime(current),
    }
    assertCanvasSnapshot(canvas)
    const committed = this.commit(agent, prepared.cache, prepared.access, 'output-select', canvas)
    if (committed === null) throw new Error('Canvas output-select committed a null tombstone')
    return committed
  }

  saveLayout(agent: Agent, request: SaveCanvasLayoutRequest, access?: CanvasAccessContext): CanvasLayoutSnapshot {
    const prepared = this.prepare(agent, 'canvas.layout.write', access)
    this.assertFeature('editor')
    const current = prepared.cache.state.canvas
    if (current === null || current.workflow === null) {
      throw new CanvasServiceError('no current Canvas workflow', 'CANVAS_NOT_FOUND')
    }
    if (request.workflowId !== current.workflow.id) {
      throw new CanvasLayoutError(
        `Canvas layout workflow "${request.workflowId}" does not match current workflow "${current.workflow.id}"`,
        'CANVAS_LAYOUT_WORKFLOW_MISMATCH',
      )
    }
    const nodeIds = new Set(current.workflow.nodes.map(node => String(node.id)))
    for (const nodeId of Object.keys(request.nodePositions)) {
      if (!nodeIds.has(nodeId)) {
        throw new CanvasLayoutError(`Canvas layout references unknown node "${nodeId}"`, 'CANVAS_INVALID_LAYOUT')
      }
    }
    const previous = foldCanvasLayout(agent.session.events)
    const layout = createCanvasLayoutSnapshot(
      request,
      Math.max(Date.now(), previous?.workflowId === request.workflowId ? previous.updatedAt : 0),
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

  listRuns(agent: Agent, request: ListCanvasRunsRequest = {}, access?: CanvasAccessContext): CanvasRunHistoryPage {
    this.prepare(agent, 'canvas.history.read', access)
    this.assertFeature('history')
    return listCanvasRunHistory(agent.session.events, request)
  }

  getRun(agent: Agent, request: GetCanvasRunRequest, access?: CanvasAccessContext): CanvasRunHistoryEntry | null {
    this.prepare(agent, 'canvas.history.read', access)
    this.assertFeature('history')
    return getCanvasRunHistory(agent.session.events, request.runId)
  }

  /**
   * Clear the current Canvas using the same workflow CAS fence as semantic edits.
   * A non-terminal run must be cancelled/interrupted and durably terminal before clear.
   */
  clear(agent: Agent, ref: WorkflowRef, access?: CanvasAccessContext): void {
    const prepared = this.prepare(agent, 'canvas.edit', access)
    this.assertFeature('canvas')
    const current = this.expectCurrentWorkflow(prepared.cache, ref)
    if (current.run !== null && !isCanvasRunTerminal(current.run.status)) {
      throw new CanvasServiceError('Canvas cannot be cleared while its current run is non-terminal', 'CANVAS_INVALID_EDIT')
    }
    this.commit(agent, prepared.cache, prepared.access, 'clear', null)
  }

  @Remote('editWorkflow')
  remoteExportEditWorkflow(
    agent: Agent,
    ref: WorkflowRef,
    operations: readonly WorkflowEditOperation[],
  ): CanvasWorkflowMutationReceipt {
    return { ref: this.workflowRef(this.editWorkflow(agent, ref, operations, this.browserAccess(agent))) }
  }

  @Remote('replaceWorkflow')
  remoteExportReplaceWorkflow(agent: Agent, ref: WorkflowRef, workflow: MediaWorkflow): CanvasWorkflowMutationReceipt {
    return { ref: this.workflowRef(this.replaceWorkflow(agent, ref, workflow, this.browserAccess(agent))) }
  }

  @Remote('selectOutput')
  remoteExportSelectOutput(agent: Agent, request: SelectCanvasOutputRequest): CanvasOutputSelectionReceipt {
    const canvas = this.selectOutput(agent, request, this.browserAccess(agent))
    const output = canvas.output
    if (output === null) throw new Error('Canvas output selection committed without an output')
    return { runId: output.runId, primaryAssetIndex: output.primaryAssetIndex }
  }

  @Remote('saveLayout')
  remoteExportSaveLayout(agent: Agent, request: SaveCanvasLayoutRequest): CanvasLayoutMutationReceipt {
    const layout = this.saveLayout(agent, request, this.browserAccess(agent))
    return { workflowId: layout.workflowId, updatedAt: layout.updatedAt }
  }

  @Remote('clear')
  remoteExportClear(agent: Agent, ref: WorkflowRef): CanvasClearReceipt {
    this.clear(agent, ref, this.browserAccess(agent))
    return { canvasId: ref.canvasId }
  }

  @Remote('listRuns')
  remoteExportListRuns(agent: Agent, request: ListCanvasRunsRequest): CanvasRunHistoryPage {
    return this.listRuns(agent, request, this.browserAccess(agent))
  }

  @Remote('getRun')
  remoteExportGetRun(agent: Agent, request: GetCanvasRunRequest): CanvasRunHistoryEntry | null {
    return this.getRun(agent, request, this.browserAccess(agent))
  }

  private prepare(agent: Agent, permission: CanvasPermission, access?: CanvasAccessContext): PreparedCanvasAccess {
    this.assertLive(agent)
    const cache = this.cache(agent.session)
    this.sync(agent.session, cache)
    const canonical = this.resolveAccess(agent, access)
    this.assertAuthorized(agent, cache, canonical, permission)
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

  private canBrowserReadProjection(sessionId: string | undefined): boolean {
    if (sessionId === undefined) {
      if (this.ctx.get('canvasAuthorization') !== undefined || this.authorizationMode === 'required-external') return false
      const access = canvasBrowserAccess('detached-session')
      return this.fallbackAuthorization.authorize({
        permission: 'canvas.read',
        actor: access.actor,
        source: access.source,
        sessionId: 'detached-session',
        resource: { kind: 'session' },
      }).allowed
    }
    const access = canvasBrowserAccess(sessionId)
    return this.authorize({
      permission: 'canvas.read',
      actor: access.actor,
      source: access.source,
      sessionId,
      resource: { kind: 'session' },
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
    for (const event of session.events) applyCanvasEvent(state, event)
    cache = { state, observedSeq: session.seq }
    this.caches.set(session, cache)
    return cache
  }

  private sync(session: Session, cache: CanvasCache): void {
    for (const event of session.events.slice(cache.observedSeq)) {
      applyCanvasEvent(cache.state, event)
      cache.observedSeq += 1
    }
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

    // CanvasService owns its own transition correctness even when the optional
    // package invariant companion is not mounted. Preflight against a detached
    // fold state, then append; only the committed Session event advances cache.
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
