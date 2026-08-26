/**
 * Projection-identity decorator for the Host ApiProxy.
 *
 * The core gateway deliberately keeps projection values domain-opaque. History
 * tail responses still need one final carrier-owned identity check because a
 * Session can attach or detach while the core handler is awaiting presenter
 * composition. After the core response is built, this decorator recomputes the
 * baseline from the exact carrier that exists now: a matching live Session
 * snapshot, or a matching persisted inspection. If neither source represents
 * the exact returned transcript cut, the projection block is removed entirely.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { inspectApiRemoteSession } from '@deepseek-ai/dsh-api-remotes'
import type { ApiProxy, RpcResponse, SessionProjectionsBlock } from './api/index.ts'
import {
  createApiProxy as createCoreApiProxy,
  type ApiProxyDefaults,
} from './api-proxy.ts'

export { DEFAULT_COLD_BLANK_PROBE_MAX_BYTES, assertJsonArgs } from './api-proxy.ts'
export type { ApiProxyDefaults } from './api-proxy.ts'

/** Fold a detached log through browser read guards using its exact durable identity. */
function detachedProjectionBaseline(
  ctx: Context,
  sessionId: SessionId,
  events: readonly SessionEvent[],
): SessionProjectionsBlock | undefined {
  const registry = ctx.get('sessionProjections')
  if (registry === undefined) return undefined
  return registry.restore(
    {},
    events,
    0,
    { surface: 'browser', sessionId: String(sessionId) },
  ).snapshot
}

/** Last Session seq represented by a detached or live log. */
function logEnd(events: readonly SessionEvent[]): number {
  return events.at(-1)?.seq ?? -1
}

/** Last Session seq represented by one returned history page. */
function pageEnd(entries: readonly { readonly event: { readonly seq: number } }[]): number {
  return entries.at(-1)?.event.seq ?? -1
}

/** Remove a projection baseline whose exact-identity authorization could not be established. */
function withoutProjections<T extends { readonly projections?: unknown }>(value: T): Omit<T, 'projections'> {
  const { projections: _projections, ...rest } = value
  return rest
}

/**
 * Recompute one history-tail baseline against the exact source representing the
 * returned cut now. A live Session wins when it exactly matches the page end;
 * otherwise a persisted inspection may prove the same cut. Any mismatch means
 * the caller has a valid transcript but no safe projection baseline for it.
 */
async function exactTailProjectionBaseline(
  ctx: Context,
  sessionId: SessionId,
  entries: readonly { readonly event: { readonly seq: number } }[],
): Promise<SessionProjectionsBlock | undefined> {
  const expectedEnd = pageEnd(entries)
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined && logEnd(live.events) === expectedEnd) {
    const registry = ctx.get('sessionProjections')
    return registry?.snapshot(live)
  }

  // A live Session may have advanced after the core history page was built.
  // That does not invalidate a persisted source that still represents the
  // exact returned cut; authorize/fold that exact durable cut instead.
  const inspected = await inspectApiRemoteSession(ctx, sessionId)
  if (logEnd(inspected.events) !== expectedEnd) return undefined
  return detachedProjectionBaseline(ctx, sessionId, inspected.events)
}

interface TailProjectionValue {
  readonly events: readonly { readonly event: { readonly seq: number } }[]
  readonly projections?: SessionProjectionsBlock
}

/** Replace or remove a tail page's projections while preserving the complete RPC envelope. */
async function secureTailResponse<T extends TailProjectionValue>(
  ctx: Context,
  sessionId: SessionId,
  response: RpcResponse<T>,
  label: string,
): Promise<RpcResponse<T>> {
  if (!response.result.ok) return response
  const value = response.result.value
  try {
    const projections = await exactTailProjectionBaseline(ctx, sessionId, value.events)
    const secured = projections === undefined
      ? withoutProjections(value)
      : { ...withoutProjections(value), projections }
    return {
      ...response,
      result: { ok: true, value: secured as T },
    }
  } catch (error) {
    ctx.logger.warn(
      `${label}: exact-identity projections for "${sessionId}" failed: ${String(error)}`,
    )
    return {
      ...response,
      result: { ok: true, value: withoutProjections(value) as T },
    }
  }
}

/**
 * Create the Host ApiProxy with exact-identity authorization on Session and
 * subagent history tail baselines. Older pages never carry a baseline. The
 * final recompute is deliberately independent of whether the Session looked
 * live or detached at method admission, closing attach/detach races while the
 * core path awaits presentation composition.
 */
export function createApiProxy(ctx: Context, defaults: ApiProxyDefaults): ApiProxy {
  const core = createCoreApiProxy(ctx, defaults)

  const sessions: ApiProxy['sessions'] = {
    ...core.sessions,
    async history(request) {
      const { sessionId, beforeSeq } = request.payload
      const response = await core.sessions.history(request)
      if (beforeSeq !== undefined || !response.result.ok) return response
      return secureTailResponse(ctx, sessionId, response, 'session.history')
    },
  }

  const subagents: ApiProxy['subagents'] = {
    ...core.subagents,
    async history(request, signal) {
      const { childSessionId, beforeSeq } = request.payload
      const response = await core.subagents.history(request, signal)
      if (beforeSeq !== undefined || !response.result.ok) return response
      return secureTailResponse(ctx, childSessionId, response, 'subagent.history')
    },
  }

  return { ...core, sessions, subagents }
}
