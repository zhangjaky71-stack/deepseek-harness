import { Context, Service } from '@deepseek-ai/cordis'
import { canonicalCanvasAccessContext } from './audit.ts'
import type {
  CanvasActorKind,
  CanvasAuthorizationConfig,
  CanvasAuthorizationDecision,
  CanvasAuthorizationRequest,
  CanvasPermission,
} from './types.ts'

const ALL_ACTOR_KINDS: readonly CanvasActorKind[] = ['human', 'agent', 'system']
const PERMISSIONS: ReadonlySet<CanvasPermission> = new Set([
  'canvas.read',
  'canvas.edit',
  'canvas.run',
  'canvas.cancel',
  'canvas.history.read',
  'canvas.asset.read',
  'canvas.asset.export',
  'canvas.asset.delete',
  'canvas.workflow.restore',
  'canvas.variant.create',
  'canvas.layout.write',
])
const ACTOR_KINDS: ReadonlySet<CanvasActorKind> = new Set(ALL_ACTOR_KINDS)

function nonEmpty(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${subject} must be a non-empty string`)
  return value
}

/** Pure actor-kind allow-list policy used by Host authorization consumers. */
export class CanvasAuthorizationPolicy {
  private readonly defaultActors: ReadonlySet<CanvasActorKind>
  private readonly permissionActors = new Map<CanvasPermission, ReadonlySet<CanvasActorKind>>()

  /**
   * Create one immutable permission policy.
   * @param config - default actor kinds and optional permission-specific overrides.
   */
  constructor(config: CanvasAuthorizationConfig = {}) {
    const defaultActors = config.defaultActors ?? ALL_ACTOR_KINDS
    if (!Array.isArray(defaultActors)) throw new Error('Canvas defaultActors must be an array')
    this.defaultActors = new Set(defaultActors)
    for (const kind of this.defaultActors) {
      if (!ACTOR_KINDS.has(kind)) throw new Error(`unsupported Canvas actor kind ${String(kind)}`)
    }
    if (config.permissions !== undefined) {
      for (const [permission, kinds] of Object.entries(config.permissions) as [CanvasPermission, readonly CanvasActorKind[]][]) {
        if (!PERMISSIONS.has(permission)) throw new Error(`unsupported Canvas permission ${permission}`)
        if (!Array.isArray(kinds)) throw new Error(`Canvas permission ${permission} actor kinds must be an array`)
        const normalized = new Set<CanvasActorKind>()
        for (const kind of kinds) {
          if (!ACTOR_KINDS.has(kind)) throw new Error(`unsupported Canvas actor kind ${String(kind)}`)
          normalized.add(kind)
        }
        this.permissionActors.set(permission, normalized)
      }
    }
  }

  /**
   * Evaluate one permission without mutating Canvas state.
   * @param request - actor/source/session context plus the requested action.
   * @returns an allow/deny decision with a stable non-sensitive deny reason.
   */
  authorize(request: CanvasAuthorizationRequest): CanvasAuthorizationDecision {
    if (!PERMISSIONS.has(request.permission)) throw new Error(`unsupported Canvas permission ${String(request.permission)}`)
    const canonical = canonicalCanvasAccessContext({
      actor: request.actor,
      source: request.source,
      ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
      ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
    })
    nonEmpty(request.sessionId, 'Canvas authorization sessionId')
    const allowedKinds = this.permissionActors.get(request.permission) ?? this.defaultActors
    return allowedKinds.has(canonical.actor.kind)
      ? { allowed: true }
      : { allowed: false, reason: 'actor-kind-not-allowed' }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    canvasAuthorization: CanvasAuthorizationService
  }
}

/** Optional Cordis Host service that centralizes Canvas authorization for later Remote/Tool/Asset consumers. */
export class CanvasAuthorizationService extends Service {
  private readonly policy: CanvasAuthorizationPolicy

  /**
   * Create the Host authorization service.
   * @param ctx - Cordis context that owns the service lifetime.
   * @param config - actor-kind allow-list policy; omitted means single-user allow-all.
   */
  constructor(ctx: Context, config: CanvasAuthorizationConfig = {}) {
    super(ctx, 'canvasAuthorization')
    this.policy = new CanvasAuthorizationPolicy(config)
  }

  /**
   * Evaluate one Canvas permission.
   * @param request - actor/source/session context plus requested action.
   * @returns allow/deny decision without writing Session state.
   */
  authorize(request: CanvasAuthorizationRequest): CanvasAuthorizationDecision {
    return this.policy.authorize(request)
  }
}

export default CanvasAuthorizationService
