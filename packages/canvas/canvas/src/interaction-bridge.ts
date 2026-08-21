/**
 * Process-local bridge from one Browser send-time Canvas snapshot to the exact
 * ordinary Agent prompt correlated by that prompt's rpc id.
 *
 * The bridge never appends Canvas state. It only stages correlation state and
 * contributes one plugin context message through `agent/pre-step`; the normal
 * Agent loop then records that message beside the corresponding user prompt.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, HarnessError } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { canvasBrowserAccess } from './audit.ts'
import { decodeCanvasChange } from './fold.ts'
import {
  CanvasInteractionContextError,
  decodeCanvasInteractionContext,
  renderCanvasInteractionContext,
  resolveCanvasInteractionContext,
} from './interaction.ts'
import type {
  CanvasInteractionContext,
  CanvasInteractionDiscardReceipt,
  CanvasInteractionStageReceipt,
  DiscardCanvasInteractionRequest,
  ResolvedCanvasInteractionContext,
  StageCanvasInteractionRequest,
} from './interaction-types.ts'
import type { CanvasAccessContext, CanvasAssetRef, CanvasSnapshot } from './types.ts'

const DEFAULT_STAGE_TTL_MS = 30_000
const MAX_RPC_ID_CHARS = 128
const RPC_ID_PATTERN = /^[A-Za-z0-9._:-]+$/

/** Narrow Canvas host face consumed by the process-local bridge. */
export interface CanvasInteractionHost {
  get(agent: Agent, access?: CanvasAccessContext): CanvasSnapshot | null
}

/** Stable stage/bind failures exposed through the Canvas Remote boundary. */
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
  readonly context: CanvasInteractionContext
  readonly expiresAt: number
  readonly timer: ReturnType<typeof setTimeout>
}

interface BoundInteraction {
  readonly agentId: string
  readonly context: CanvasInteractionContext
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

/**
 * Exact-turn Browser selection bridge owned by one CanvasService instance.
 * Disposal follows the Canvas plugin context and clears all process-local rows.
 */
export class CanvasInteractionBridge {
  private readonly staged = new Map<string, StagedInteraction>()
  private readonly bound = new Map<string, BoundInteraction>()

  constructor(
    ctx: Context,
    private readonly host: CanvasInteractionHost,
    private readonly stageTtlMs: number = DEFAULT_STAGE_TTL_MS,
  ) {
    ctx.on('agent/inbox/inserted', ({ agent, message }) => { this.bindInserted(agent, message) })
    ctx.on('agent/inbox/discarded', ({ agent, message }) => { this.dropBound(agent, message) })
    ctx.on('agent/disposed', ({ agent }) => { this.dropAgent(agent) })
    ctx.on('agent/pre-step', async (payload, next) => this.decoratePreStep(payload.agent, payload.messages, next))
    ctx.effect(() => () => {
      for (const entry of this.staged.values()) clearTimeout(entry.timer)
      this.staged.clear()
      this.bound.clear()
    }, 'canvas interaction correlation state')
  }

  /** Stage a detached Browser snapshot after rpc-id mint but before prompt transport. */
  stage(agent: Agent, request: StageCanvasInteractionRequest): CanvasInteractionStageReceipt {
    const rpcId = this.assertRpcId(request.rpcId)
    const context = this.decode(request.context)
    const current = this.host.get(agent, this.browserAccess(agent, rpcId))
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
    this.staged.set(key, {
      agentId: String(agent.id),
      context: structuredClone(context),
      expiresAt,
      timer,
    })
    return { staged: true, expiresAt }
  }

  /** Best-effort rollback when the corresponding ordinary prompt was not admitted. */
  discard(agent: Agent, request: DiscardCanvasInteractionRequest): CanvasInteractionDiscardReceipt {
    const rpcId = this.assertRpcId(request.rpcId)
    const key = this.stageKey(agent, rpcId)
    const entry = this.staged.get(key)
    if (entry === undefined) return { discarded: false }
    clearTimeout(entry.timer)
    this.staged.delete(key)
    return { discarded: true }
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
    return canvasBrowserAccess(String(agent.session.id), rpcId, rpcId)
  }

  /** Every Browser-selected asset must already be a durable Canvas output of this exact Session. */
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
      if (known.get(assetKey(asset))?.has(assetFingerprint(asset)) === true) continue
      throw new CanvasInteractionBridgeError(
        `Canvas interaction asset "${assetKey(asset)}" is not a durable output of this Session`,
        'CANVAS_INTERACTION_UNKNOWN_ASSET',
      )
    }
  }

  /** Bind the staged rpc id to the exact normal user-message identity admitted by the Host. */
  private bindInserted(agent: Agent, message: UserMessage): void {
    const rpcId = sourceRpcId(message)
    if (rpcId === undefined) return
    const stageKey = this.stageKey(agent, rpcId)
    const entry = this.staged.get(stageKey)
    if (entry === undefined) return
    clearTimeout(entry.timer)
    this.staged.delete(stageKey)
    if (Date.now() >= entry.expiresAt) return
    this.bound.set(this.boundKey(agent, message), {
      agentId: String(agent.id),
      context: entry.context,
    })
  }

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
   * Decorate only messages that survive downstream pre-step policy. The plugin
   * context is inserted immediately before the exact matched user prompt.
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

  /** Re-evaluate staleness at execution time without rejecting an already-admitted prompt after Canvas churn. */
  private renderAtClaim(agent: Agent, context: CanvasInteractionContext): string {
    let resolved: ResolvedCanvasInteractionContext
    try {
      const current = this.host.get(agent, this.browserAccess(agent, `claim:${context.canvasId}`))
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
