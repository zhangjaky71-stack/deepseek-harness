/** Host CanvasService: Session-native Canvas/layout writes, bounded history, Host authorization, feature policy, and Typert exports. */

import { randomUUID } from 'node:crypto'
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
} from './domain.ts'
import { applyCanvasEvent, emptyCanvasFoldState } from './fold.ts'
import type { CanvasFoldState } from './fold.ts'
import type { CanvasChange, CanvasOperation } from './events.ts'
import {
  CanvasSensitiveDataError,
  assertCanvasWorkflowAuditSafe,
  canonicalCanvasAccessContext,
  canvasChangeMeta,
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
  CanvasAuthorizationRequest,
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
  /**
   * @param message - human-readable rejection reason that never contains credential values.
   * @param code - stable machine-readable Canvas service code.
   */
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
  static inject = ['agents']

  private readonly caches = new WeakMap<Session, CanvasCache>()
  private readonly fallbackAuthorization: CanvasAuthorizationPolicy

  /**
   * Create the Canvas Host service and register optional Session projection units.
   * @param ctx - Cordis context with the live Agent registry.
   * @param config - fallback single-user authorization policy used when no `canvasAuthorization` service is mounted.
   */
  constructor(ctx: Context, config: CanvasServiceConfig = {}) {
    super(ctx, 'canvas')
    this.fallbackAuthorization = new CanvasAuthorizationPolicy(config.authorization)
    ctx.inject(['sessionProjections'], (projectionCtx) => {
      registerCanvasProjections(projectionCtx)
    })
  }

  /**
   * Evaluate one Canvas permission through the mounted Host authorization service or the fallback policy.
   * @param request - actor/source/permission request; credential material is not accepted by this shape.
   * @returns allow/deny decision without mutating Canvas state.
   */
  authorize(request: CanvasAuthorizationRequest): CanvasAuthorizationDecision {
    return this.ctx.get('canvasAuthorization')?.authorize(request) ?? this.fallbackAuthorization.authorize(request)
  }

  /**
   * Read the authoritative current Canvas for one live agent. Reads remain available when a feature is disabled
   * so historical workflows can still be decoded and inspected.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @param access - optional explicit actor/source; defaults to the owning Agent through the Host service.
   * @returns detached current snapshot, or `null` before create/after clear.
   */
  get(agent: Agent, access?: CanvasAccessContext): CanvasSnapshot | null {
    const prepared = this.prepare(agent, 'canvas.read', access)
    return this.view(prepared.cache)
  }

  /**
   * Create the session's first/current Canvas with an initial semantic workflow.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @param request - initial workflow and optional variant identity.
   * @param access - optional explicit actor/source; defaults to the owning Agent through the Host service.
   * @returns detached committed Canvas snapshot.
   */
  create(agent: Agent, request: CreateCanvasRequest, access?: CanvasAccessContext): CanvasSnapshot {
    const prepared = this.prepare(agent, 'canvas.edit', access)
    const features = this.featurePolicy()
    features?.assertEnabled('canvas')
    const workflow = cloneWorkflow(request.workflow)
    assertMediaWorkflow(workflow)
    features?.assertWorkflowCreatable(workflow)
    if (request.currentVariantId !== undefined) features?.assertEnabled('variants')
    this.assertWorkflowAuditSafe(workflow)
    if (prepared.cache.state.canvas !== null) {
      throw new CanvasServiceError(`Canvas "${prepared.cache.state.canvas.id}" already exists`, 'CANVAS_ALREADY_EXISTS')
    }
    const now = Date.now()
    const canvas = createCanvasSnapshot({
      id: CanvasId(`canvas-${randomUUID()}`),
      createdAt: now,
      workflow,
      ...request.currentVariantId === undefined ? {} : { currentVariantId: request.currentVariantId },
    })
    const committed = this.commit(agent, prepared.cache, prepared.access, 'create', canvas)
    if (committed === null) throw new Error('Canvas create committed a null tombstone')
    return committed
  }

  /**
   * Replace the complete semantic workflow while preserving its stable workflow identity.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @param ref - expected current workflow identity/revision.
   * @param workflow - complete replacement workflow with the same workflow id.
   * @param access - optional explicit actor/source; defaults to the owning Agent through the Host service.
   * @returns detached committed Canvas snapshot.
   */
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

  /**
   * Apply an ordered operation batch atomically to the current semantic workflow.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @param ref - expected current workflow identity/revision.
   * @param operations - ordered semantic edits; the whole final workflow validates before append.
   * @param access - optional explicit actor/source; defaults to the owning Agent through the Host service.
   * @returns detached committed Canvas snapshot.
   */
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

  /**
   * Select one already-durable output candidate without rerunning a provider.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @param request - current output run identity and candidate index.
   * @param access - optional explicit actor/source; defaults to the owning Agent through the Host service.
   * @returns detached committed Canvas snapshot, or the unchanged snapshot when already primary.
   */
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

  /**
   * Persist editor node positions/viewport independently from semantic workflow revisions.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @param request - layout for the current workflow identity.
   * @param access - optional explicit actor/source; defaults to the owning Agent through the Host service.
   * @returns detached committed layout snapshot.
   */
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
    agent.session.append('canvas/layout-change', change)
    this.sync(agent.session, prepared.cache)
    return structuredClone(layout)
  }

  /**
   * List newest-first run history derived from this Session log.
   * @param agent - exact live Agent whose Session owns the Canvas history.
   * @param request - bounded cursor page request.
   * @param access - optional explicit actor/source; defaults to the owning Agent through the Host service.
   * @returns detached bounded page.
   */
  listRuns(agent: Agent, request: ListCanvasRunsRequest = {}, access?: CanvasAccessContext): CanvasRunHistoryPage {
    this.prepare(agent, 'canvas.history.read', access)
    this.assertFeature('history')
    return listCanvasRunHistory(agent.session.events, request)
  }

  /**
   * Read one run-history entry by durable run id.
   * @param agent - exact live Agent whose Session owns the Canvas history.
   * @param request - exact run id.
   * @param access - optional explicit actor/source; defaults to the owning Agent through the Host service.
   * @returns detached entry or null when absent.
   */
  getRun(agent: Agent, request: GetCanvasRunRequest, access?: CanvasAccessContext): CanvasRunHistoryEntry | null {
    this.prepare(agent, 'canvas.history.read', access)
    this.assertFeature('history')
    return getCanvasRunHistory(agent.session.events, request.runId)
  }

  /**
   * Clear the current Canvas while retaining its append-only Session history and independent layout history.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @param canvasId - identity of the Canvas expected to be current.
   * @param access - optional explicit actor/source; defaults to the owning Agent through the Host service.
   */
  clear(agent: Agent, canvasId: CanvasSnapshot['id'], access?: CanvasAccessContext): void {
    const prepared = this.prepare(agent, 'canvas.edit', access)
    this.assertFeature('canvas')
    const current = prepared.cache.state.canvas
    if (current === null) throw new CanvasServiceError('no current Canvas', 'CANVAS_NOT_FOUND')
    if (current.id !== canvasId) {
      throw new CanvasServiceError(`Canvas "${canvasId}" is not current`, 'CANVAS_NOT_FOUND')
    }
    this.commit(agent, prepared.cache, prepared.access, 'clear', null)
  }

  /** Browser Remote edit; actor/source are fixed by the Host wrapper, not caller-provided. */
  @Remote('editWorkflow')
  remoteExportEditWorkflow(
    agent: Agent,
    ref: WorkflowRef,
    operations: readonly WorkflowEditOperation[],
  ): CanvasWorkflowMutationReceipt {
    return { ref: this.workflowRef(this.editWorkflow(agent, ref, operations, this.browserAccess(agent))) }
  }

  /** Browser Remote full workflow replacement. */
  @Remote('replaceWorkflow')
  remoteExportReplaceWorkflow(agent: Agent, ref: WorkflowRef, workflow: MediaWorkflow): CanvasWorkflowMutationReceipt {
    return { ref: this.workflowRef(this.replaceWorkflow(agent, ref, workflow, this.browserAccess(agent))) }
  }

  /** Browser Remote primary-output selection. */
  @Remote('selectOutput')
  remoteExportSelectOutput(agent: Agent, request: SelectCanvasOutputRequest): CanvasOutputSelectionReceipt {
    const canvas = this.selectOutput(agent, request, this.browserAccess(agent))
    const output = canvas.output
    if (output === null) throw new Error('Canvas output selection committed without an output')
    return { runId: output.runId, primaryAssetIndex: output.primaryAssetIndex }
  }

  /** Browser Remote editor-layout save. */
  @Remote('saveLayout')
  remoteExportSaveLayout(agent: Agent, request: SaveCanvasLayoutRequest): CanvasLayoutMutationReceipt {
    const layout = this.saveLayout(agent, request, this.browserAccess(agent))
    return { workflowId: layout.workflowId, updatedAt: layout.updatedAt }
  }

  /** Browser Remote clear tombstone. */
  @Remote('clear')
  remoteExportClear(agent: Agent, canvasId: CanvasSnapshot['id']): CanvasClearReceipt {
    this.clear(agent, canvasId, this.browserAccess(agent))
    return { canvasId }
  }

  /** Browser Remote bounded run-history page. */
  @Remote('listRuns')
  remoteExportListRuns(agent: Agent, request: ListCanvasRunsRequest): CanvasRunHistoryPage {
    return this.listRuns(agent, request, this.browserAccess(agent))
  }

  /** Browser Remote exact run-history query. */
  @Remote('getRun')
  remoteExportGetRun(agent: Agent, request: GetCanvasRunRequest): CanvasRunHistoryEntry | null {
    return this.getRun(agent, request, this.browserAccess(agent))
  }

  private prepare(agent: Agent, permission: CanvasPermission, access?: CanvasAccessContext): PreparedCanvasAccess {
    this.assertLive(agent)
    const cache = this.cache(agent.session)
    this.sync(agent.session, cache)
    const canonical = this.resolveAccess(agent, access)
    const decision = this.authorize({
      permission,
      actor: canonical.actor,
      source: canonical.source,
      sessionId: String(agent.session.id),
      ...(cache.state.canvas === null ? {} : { canvasId: cache.state.canvas.id }),
      ...(canonical.requestId === undefined ? {} : { requestId: canonical.requestId }),
      ...(canonical.correlationId === undefined ? {} : { correlationId: canonical.correlationId }),
    })
    if (!decision.allowed) {
      throw new CanvasServiceError(
        `Canvas permission "${permission}" denied for ${canonical.actor.kind} actor`,
        'CANVAS_PERMISSION_DENIED',
      )
    }
    return { cache, access: canonical }
  }

  private browserAccess(agent: Agent): CanvasAccessContext {
    return {
      actor: { kind: 'human', id: String(agent.id) },
      source: 'browser-remote',
    }
  }

  private resolveAccess(agent: Agent, access?: CanvasAccessContext): CanvasAccessContext {
    try {
      return canonicalCanvasAccessContext(access ?? {
        actor: { kind: 'agent', id: String(agent.id) },
        source: 'host',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid Canvas access context'
      throw new CanvasServiceError(message, 'CANVAS_INVALID_ACCESS_CONTEXT')
    }
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
    if (ref.canvasId !== current.id || ref.workflowId !== current.workflow.id || ref.workflowRevision !== current.workflowRevision) {
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
    const change: CanvasChange = {
      kind: 'canvas/change',
      version: CANVAS_CHANGE_VERSION,
      operation,
      canvas,
      meta: canvasChangeMeta(access),
    }
    agent.session.append('canvas/change', change)
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
