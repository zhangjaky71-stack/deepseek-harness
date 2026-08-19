/** Host CanvasService: the single same-session write path over durable Canvas events. */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import {
  CANVAS_CHANGE_VERSION,
} from './migration.ts'
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
import type {
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
   * @param message - human-readable rejection reason.
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

/** Session-backed Canvas write service (`ctx.canvas`). */
export class CanvasService extends Service {
  static inject = ['agents']

  private readonly caches = new WeakMap<Session, CanvasCache>()

  constructor(ctx: Context) {
    super(ctx, 'canvas')
  }

  /**
   * Read the authoritative current Canvas for one live agent.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @returns detached current snapshot, or `null` before create/after clear.
   */
  get(agent: Agent): CanvasSnapshot | null {
    this.assertLive(agent)
    const cache = this.cache(agent.session)
    this.sync(agent.session, cache)
    return this.view(cache)
  }

  /**
   * Create the session's first/current Canvas with an initial semantic workflow.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @param request - initial workflow and optional variant identity.
   * @returns detached committed Canvas snapshot.
   */
  create(agent: Agent, request: CreateCanvasRequest): CanvasSnapshot {
    const workflow = cloneWorkflow(request.workflow)
    assertMediaWorkflow(workflow)
    const cache = this.prepareMutation(agent)
    if (cache.state.canvas !== null) {
      throw new CanvasServiceError(`Canvas "${cache.state.canvas.id}" already exists`, 'CANVAS_ALREADY_EXISTS')
    }
    const now = Date.now()
    const canvas = createCanvasSnapshot({
      id: CanvasId(`canvas-${randomUUID()}`),
      createdAt: now,
      workflow,
      ...request.currentVariantId === undefined ? {} : { currentVariantId: request.currentVariantId },
    })
    const committed = this.commit(agent, cache, 'create', canvas)
    if (committed === null) throw new Error('Canvas create committed a null tombstone')
    return committed
  }

  /**
   * Replace the complete semantic workflow while preserving its stable workflow identity.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @param ref - expected current workflow identity/revision.
   * @param workflow - complete replacement workflow with the same workflow id.
   * @returns detached committed Canvas snapshot.
   */
  replaceWorkflow(agent: Agent, ref: WorkflowRef, workflow: MediaWorkflow): CanvasSnapshot {
    const replacement = cloneWorkflow(workflow)
    assertMediaWorkflow(replacement)
    const cache = this.prepareMutation(agent)
    const current = this.expectCurrentWorkflow(cache, ref)
    if (replacement.id !== current.workflow.id) {
      throw new CanvasServiceError(
        `replacement workflow "${replacement.id}" does not match current workflow "${current.workflow.id}"`,
        'CANVAS_WORKFLOW_ID_MISMATCH',
      )
    }
    return this.commitWorkflow(agent, cache, current, 'workflow-replace', replacement)
  }

  /**
   * Apply an ordered operation batch atomically to the current semantic workflow.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @param ref - expected current workflow identity/revision.
   * @param operations - ordered semantic edits; the whole final workflow validates before append.
   * @returns detached committed Canvas snapshot.
   */
  editWorkflow(agent: Agent, ref: WorkflowRef, operations: readonly WorkflowEditOperation[]): CanvasSnapshot {
    const cache = this.prepareMutation(agent)
    const current = this.expectCurrentWorkflow(cache, ref)
    const workflow = applyWorkflowOperations(current.workflow, operations)
    return this.commitWorkflow(agent, cache, current, 'workflow-edit', workflow)
  }

  /**
   * Select one already-durable output candidate without rerunning a provider.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @param request - current output run identity and candidate index.
   * @returns detached committed Canvas snapshot, or the unchanged snapshot when already primary.
   */
  selectOutput(agent: Agent, request: SelectCanvasOutputRequest): CanvasSnapshot {
    const cache = this.prepareMutation(agent)
    const current = cache.state.canvas
    if (current === null) throw new CanvasServiceError('no current Canvas', 'CANVAS_NOT_FOUND')
    const output = current.output
    if (output === null || output.runId !== request.runId) {
      throw new CanvasServiceError(`Canvas output for run "${request.runId}" is not current`, 'CANVAS_OUTPUT_NOT_FOUND')
    }
    if (!Number.isSafeInteger(request.assetIndex) || request.assetIndex < 0 || request.assetIndex >= output.assets.length) {
      throw new CanvasServiceError(`Canvas output index ${request.assetIndex} is out of range`, 'CANVAS_INVALID_OUTPUT_SELECTION')
    }
    if (output.primaryAssetIndex === request.assetIndex) return this.viewRequired(cache)
    const canvas: CanvasSnapshot = {
      ...current,
      output: { ...output, primaryAssetIndex: request.assetIndex },
      updatedAt: this.nextMutationTime(current),
    }
    assertCanvasSnapshot(canvas)
    const committed = this.commit(agent, cache, 'output-select', canvas)
    if (committed === null) throw new Error('Canvas output-select committed a null tombstone')
    return committed
  }

  /**
   * Clear the current Canvas while retaining its append-only Session history.
   * @param agent - exact live Agent whose Session owns the Canvas.
   * @param canvasId - identity of the Canvas expected to be current.
   */
  clear(agent: Agent, canvasId: CanvasSnapshot['id']): void {
    const cache = this.prepareMutation(agent)
    const current = cache.state.canvas
    if (current === null) throw new CanvasServiceError('no current Canvas', 'CANVAS_NOT_FOUND')
    if (current.id !== canvasId) {
      throw new CanvasServiceError(`Canvas "${canvasId}" is not current`, 'CANVAS_NOT_FOUND')
    }
    this.commit(agent, cache, 'clear', null)
  }

  private prepareMutation(agent: Agent): CanvasCache {
    this.assertLive(agent)
    const cache = this.cache(agent.session)
    this.sync(agent.session, cache)
    return cache
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
    cache: CanvasCache,
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
    const committed = this.commit(agent, cache, operation, canvas)
    if (committed === null) throw new Error(`Canvas ${operation} committed a null tombstone`)
    return committed
  }

  private nextMutationTime(current: CanvasSnapshot): number {
    return Math.max(Date.now(), current.updatedAt)
  }

  private commit(
    agent: Agent,
    cache: CanvasCache,
    operation: CanvasOperation,
    canvas: CanvasSnapshot | null,
  ): CanvasSnapshot | null {
    const change: CanvasChange = {
      kind: 'canvas/change',
      version: CANVAS_CHANGE_VERSION,
      operation,
      canvas,
      meta: { schemaVersion: 1 },
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
