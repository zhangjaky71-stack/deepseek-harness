/**
 * Process-local bridge from one Browser send-time Canvas snapshot to the exact
 * Agent prompt correlated by the ordinary prompt rpc id.
 *
 * Durable Canvas state remains owned by `@deepseek-ai/dsh-canvas`; this service
 * stores only short-lived correlation state. The model-visible context is
 * emitted through `agent/pre-step`, after which the normal Agent loop writes it
 * to the Session log beside the user prompt.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import {
  CanvasInteractionContextError,
  decodeCanvasChange,
  decodeCanvasInteractionContext,
  renderCanvasInteractionContext,
  resolveCanvasInteractionContext,
} from '@deepseek-ai/dsh-canvas'
import type {
  CanvasAccessContext,
  CanvasAssetRef,
  CanvasInteractionContext,
  ResolvedCanvasInteractionContext,
} from '@deepseek-ai/dsh-canvas'
import { createUserMessage, HarnessError } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CanvasInteractionConfig,
  CanvasInteractionDiscardReceipt,
  CanvasInteractionStageReceipt,
  DiscardCanvasInteractionRequest,
  StageCanvasInteractionRequest,
} from './types.ts'

export type * from './types.ts'

const DEFAULT_STAGE_TTL_MS = 30_000
const MAX_STAGE_TTL_MS = 5 * 60_000
const MAX_RPC_ID_CHARS = 128
const RPC_ID_PATTERN = /^[A-Za-z0-9._:-]+$/

/** Stable Host bridge failure returned by Remote admission. */
export class CanvasInteractionBridgeError extends HarnessError {
  constructor(
    message: string,
    code:
      | 'CANVAS_INTERACTION_INVALID_RPC_ID'
      | 'CANVAS_INTERACTION_CONFLICT'
      | 'CANVAS_INTERACTION_UNKNOWN_ASSET'
      | 'CANVAS_INTERACTION_INVALID_CONTEXT',
  ) {
    super(message, code)
  }
}

interface StagedInteraction {
  readonly agentId: string
  readonly rpcId: string
  readonly context: CanvasInteractionContext
  readonly expiresAt: number
  readonly timer: ReturnType<typeof setTimeout>
}

interface BoundInteraction {
  readonly agentId: string
  readonly rpcId: string
  readonly context: CanvasInteractionContext
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    canvasInteraction: CanvasInteractionService
  }
}

function assetKey(asset: CanvasAssetRef): string {
  return asset.kind === 'image'
    ? `image:${asset.image.attachmentId}`
    : `video:${asset.video.assetId}`
}

function assetFingerprint(asset: CanvasAssetRef): string {
  return JSON.stringify(asset)
}

function selectedAssets(context: CanvasInteractionContext): readonly CanvasAssetRef[] {
  const assets = [...(context.selectedAssetRefs ?? [])]
  if (context.region !== undefined) {
    assets.push(context.region.asset)
    if (context.region.maskAsset !== undefined) assets.push(context.region.maskAsset)
  }
  return assets
}

function sourceRpcId(message: UserMessage): string | undefined {
  const source = message.source as { kind?: unknown; rpcId?: unknown }
  return source.kind === 'user' && typeof source.rpcId === 'string' ? source.rpcId : undefined
}

/** Host service and Typert namespace `canvasInteraction`. */
export class CanvasInteractionService extends TypertRemoteService {
  static inject = ['agents', 'canvas']

  private readonly stageTtlMs: number
  private readonly staged = new Map<string, StagedInteraction>()
  private readonly bound = new Map<string, BoundInteraction>()

  constructor(ctx: Context, config: CanvasInteractionConfig = {}) {
    super(ctx, 'canvasInteraction')
    const requestedTtl = config.stageTtlMs ?? DEFAULT_STAGE_TTL_MS
    if (!Number.isSafeInteger(requestedTtl) || requestedTtl <= 0 || requestedTtl > MAX_STAGE_TTL_MS) {
      throw new Error(`canvas-interaction.stageTtlMs must be an integer in [1, ${MAX_STAGE_TTL_MS}]`)
    }
    this.stageTtlMs = requestedTtl

    ctx.on('agent/inbox/inserted', ({ agent, message }) => {
      this.bindInserted(agent, message)
    })
    ctx.on('agent/inbox/discarded', ({ agent, message }) => {
      this.dropBound(agent, message)
    })
    ctx.on('agent/disposed', ({ agent }) => {
      this.dropAgent(agent)
    })
    ctx.on('agent/pre-step', async (payload, next) => this.decoratePreStep(payload.agent, payload.messages, next))

    ctx.effect(() => () => {
      for (const entry of this.staged.values()) clearTimeout(entry.timer)
      this.staged.clear()
      this.bound.clear()
    }, 'canvas interaction correlation state')
  }

  /** Stage a detached Browser snapshot against an rpc id minted immediately before prompt transport. */
  stage(agent: Agent, request: StageCanvasInteractionRequest): CanvasInteractionStageReceipt {
    const rpcId = this.assertRpcId(request.rpcId)
    const context = this.decode(request.context)
    const current = this.ctx.canvas.get(agent, this.browserAccess(agent, rpcId))
    resolveCanvasInteractionContext(context, current)
    this.assertAssetsBelongToSession(agent, context)

    const key = this.stageKey(agent, rpcId)
    const previous = this.staged.get(key)
    if (previous !== undefined) {
      if (JSON.stringify(previous.context) !== JSON.stringify(context)) {
        throw new CanvasInteractionBridgeError(
          `Canvas interaction rpc id "${rpcId}" is already staged with different context`,
          'CANVAS_INTERACTION_CONFLICT',
        )
      }
      clearTimeout(previous.timer)
    }

    const expiresAt = Date.now() + this.stageTtlMs
    const timer = setTimeout(() => {
      const currentEntry = this.staged.get(key)
      if (currentEntry?.expiresAt === expiresAt) this.staged.delete(key)
    }, this.stageTtlMs)
    timer.unref?.()
    this.staged.set(key, {
      agentId: String(agent.id),
      rpcId,
      context: structuredClone(context),
      expiresAt,
      timer,
    })
    return { staged: true, expiresAt }
  }

  /**
   * Best-effort rollback before prompt admission. Once the Host has already
   * inserted and bound the ordinary user message, discard deliberately cannot
   * retract its context; that accepted prompt owns the correlation now.
   */
  discard(agent: Agent, request: DiscardCanvasInteractionRequest): CanvasInteractionDiscardReceipt {
    const rpcId = this.assertRpcId(request.rpcId)
    const key = this.stageKey(agent, rpcId)
    const entry = this.staged.get(key)
    if (entry === undefined) return { discarded: false }
    clearTimeout(entry.timer)
    this.staged.delete(key)
    return { discarded: true }
  }

  /** Browser Remote stage; Agent resolution is supplied by Typert, not caller payload. */
  @Remote('stage')
  remoteExportStage(agent: Agent, request: StageCanvasInteractionRequest): CanvasInteractionStageReceipt {
    return this.stage(agent, request)
  }

  /** Browser Remote rollback for a prompt that failed before Host admission. */
  @Remote('discard')
  remoteExportDiscard(agent: Agent, request: DiscardCanvasInteractionRequest): CanvasInteractionDiscardReceipt {
    return this.discard(agent, request)
  }

  private assertRpcId(value: string): string {
    if (
      typeof value !== 'string'
      || value.length === 0
      || value.length > MAX_RPC_ID_CHARS
      || !RPC_ID_PATTERN.test(value)
    ) {
      throw new CanvasInteractionBridgeError(
        'Canvas interaction rpcId must be a bounded transport correlation id',
        'CANVAS_INTERACTION_INVALID_RPC_ID',
      )
    }
    return value
  }

  private decode(value: unknown): CanvasInteractionContext {
    try {
      return decodeCanvasInteractionContext(value)
    } catch (error) {
      if (error instanceof CanvasInteractionContextError) {
        throw new CanvasInteractionBridgeError(error.message, 'CANVAS_INTERACTION_INVALID_CONTEXT')
      }
      throw error
    }
  }

  private browserAccess(agent: Agent, rpcId: string): CanvasAccessContext {
    return {
      actor: { kind: 'human', id: String(agent.id) },
      source: 'browser-remote',
      requestId: rpcId,
      correlationId: rpcId,
    }
  }

  /**
   * Prove every Browser-selected durable asset is already present in a
   * historical Canvas output from this exact Session. Matching uses the full
   * immutable reference, not only its opaque id.
   */
  private assertAssetsBelongToSession(agent: Agent, context: CanvasInteractionContext): void {
    const requested = selectedAssets(context)
    if (requested.length === 0) return
    const known = new Map<string, Set<string>>()
    for (const event of agent.session.events) {
      if (event.type !== 'canvas/change') continue
      const change = decodeCanvasChange(event.data)
      for (const asset of change?.canvas?.output?.assets ?? []) {
        const key = assetKey(asset)
        const fingerprints = known.get(key) ?? new Set<string>()
        fingerprints.add(assetFingerprint(asset))
        known.set(key, fingerprints)
      }
    }
    for (const asset of requested) {
      const fingerprints = known.get(assetKey(asset))
      if (fingerprints?.has(assetFingerprint(asset)) === true) continue
      throw new CanvasInteractionBridgeError(
        `Canvas interaction asset "${assetKey(asset)}" is not a durable output of this Session`,
        'CANVAS_INTERACTION_UNKNOWN_ASSET',
      )
    }
  }

  /** Exact rpc-id bind at the moment the normal prompt reaches the Agent inbox. */
  private bindInserted(agent: Agent, message: UserMessage): void {
    const rpcId = sourceRpcId(message)
    if (rpcId === undefined) return
    const stageKey = this.stageKey(agent, rpcId)
    const entry = this.staged.get(stageKey)
    if (entry === undefined) return
    if (Date.now() >= entry.expiresAt) {
      clearTimeout(entry.timer)
      this.staged.delete(stageKey)
      return
    }
    clearTimeout(entry.timer)
    this.staged.delete(stageKey)
    this.bound.set(this.boundKey(agent, message), {
      agentId: String(agent.id),
      rpcId,
      context: entry.context,
    })
  }

  /** A discarded inbox message can no longer consume its bound context. */
  private dropBound(agent: Agent, message: UserMessage): void {
    this.bound.delete(this.boundKey(agent, message))
  }

  private dropAgent(agent: Agent): void {
    const agentId = String(agent.id)
    for (const [key, entry] of this.staged) {
      if (entry.agentId !== agentId) continue
      clearTimeout(entry.timer)
      this.staged.delete(key)
    }
    for (const [key, entry] of this.bound) {
      if (entry.agentId === agentId) this.bound.delete(key)
    }
  }

  /**
   * Run after downstream pre-step policy. Only messages that survive into the
   * final enter decision receive context; rejected or removed messages have
   * their bound snapshots dropped rather than leaking to later turns.
   */
  private async decoratePreStep(
    agent: Agent,
    claimed: readonly UserMessage[],
    next: () => Promise<PreStepDecision>,
  ): Promise<PreStepDecision> {
    let decision: PreStepDecision
    try {
      decision = await next()
    } catch (error) {
      this.dropClaimed(agent, claimed)
      throw error
    }
    if (decision.kind === 'reject') {
      this.dropClaimed(agent, claimed)
      return decision
    }

    const finalIds = new Set(decision.messages.map(message => String(message.id)))
    for (const message of claimed) {
      if (!finalIds.has(String(message.id))) this.dropBound(agent, message)
    }

    let changed = false
    const messages: UserMessage[] = []
    for (const message of decision.messages) {
      const key = this.boundKey(agent, message)
      const bound = this.bound.get(key)
      if (bound === undefined) {
        messages.push(message)
        continue
      }
      this.bound.delete(key)
      const text = this.renderAtClaim(agent, bound.context)
      messages.push(createUserMessage({
        content: [{ type: 'text', text }],
        source: {
          kind: 'plugin',
          plugin: 'canvas-interaction',
          form: 'snapshot',
          sections: [{ name: 'Canvas interaction', text }],
        },
      }))
      messages.push(message)
      changed = true
    }
    return changed ? { kind: 'enter', messages } : decision
  }

  private dropClaimed(agent: Agent, claimed: readonly UserMessage[]): void {
    for (const message of claimed) this.dropBound(agent, message)
  }

  /** Re-evaluate staleness at execution time without failing an admitted prompt after later Canvas churn. */
  private renderAtClaim(agent: Agent, context: CanvasInteractionContext): string {
    let resolved: ResolvedCanvasInteractionContext
    try {
      const current = this.ctx.canvas.get(agent, this.browserAccess(agent, `claim:${context.canvasId}`))
      resolved = resolveCanvasInteractionContext(context, current)
    } catch {
      resolved = {
        context: structuredClone(context),
        currentWorkflowRevision: null,
        stale: true,
      }
    }
    return renderCanvasInteractionContext(resolved)
  }

  private stageKey(agent: Agent, rpcId: string): string {
    return `${agent.id}\u0000${rpcId}`
  }

  private boundKey(agent: Agent, message: UserMessage): string {
    return `${agent.id}\u0000${message.id}`
  }
}

export default CanvasInteractionService
