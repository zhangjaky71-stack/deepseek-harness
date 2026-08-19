import type {
  CanvasAccessContext,
  CanvasActor,
  CanvasActorKind,
  CanvasJsonValue,
  CanvasRequestSource,
  MediaWorkflow,
} from './types.ts'
import type { CanvasChangeMetaV2 } from './events.ts'

const ACTOR_KINDS: ReadonlySet<CanvasActorKind> = new Set(['human', 'agent', 'system'])
const SOURCES: ReadonlySet<CanvasRequestSource> = new Set([
  'host',
  'browser-remote',
  'agent-tool',
  'system-reconciler',
  'asset-route',
])
const FORBIDDEN_DURABLE_KEYS = new Set([
  'authorization',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'clientsecret',
  'callbacksecret',
  'credential',
  'credentials',
  'password',
  'bearertoken',
  'binary',
  'base64',
  'dataurl',
  'blob',
  'filebytes',
  'imagebytes',
  'videobytes',
  'audiobytes',
])

function nonEmpty(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${subject} must be a non-empty string`)
  return value
}

function canonicalActor(value: unknown): CanvasActor {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Canvas actor must be an object')
  const source = value as Record<string, unknown>
  if (Object.keys(source).sort().join(',') !== 'id,kind') throw new Error('Canvas actor must contain exactly id and kind')
  if (!ACTOR_KINDS.has(source.kind as CanvasActorKind)) throw new Error(`unsupported Canvas actor kind ${String(source.kind)}`)
  const id = nonEmpty(source.id, 'Canvas actor id')
  switch (source.kind) {
    case 'human': return { kind: 'human', id }
    case 'agent': return { kind: 'agent', id }
    case 'system': return { kind: 'system', id }
    default: throw new Error(`unsupported Canvas actor kind ${String(source.kind)}`)
  }
}

/**
 * Validate and detach request-scoped actor/source metadata before authorization or audit.
 * @param value - explicit access metadata supplied by a Host caller.
 * @returns canonical access metadata containing only approved fields.
 */
export function canonicalCanvasAccessContext(value: CanvasAccessContext): CanvasAccessContext {
  if (!SOURCES.has(value.source)) throw new Error(`unsupported Canvas request source ${String(value.source)}`)
  const requestId = value.requestId === undefined ? undefined : nonEmpty(value.requestId, 'Canvas requestId')
  const correlationId = value.correlationId === undefined ? undefined : nonEmpty(value.correlationId, 'Canvas correlationId')
  return {
    actor: canonicalActor(value.actor),
    source: value.source,
    ...(requestId === undefined ? {} : { requestId }),
    ...(correlationId === undefined ? {} : { correlationId }),
  }
}

/**
 * Materialize the current durable audit metadata shape.
 * @param access - canonicalizable actor/source metadata.
 * @returns metadata v2 containing only approved audit fields; caller extras are discarded.
 */
export function canvasChangeMeta(access: CanvasAccessContext): CanvasChangeMetaV2 {
  const canonical = canonicalCanvasAccessContext(access)
  return {
    schemaVersion: 2,
    actor: canonical.actor,
    source: canonical.source,
    ...(canonical.requestId === undefined ? {} : { requestId: canonical.requestId }),
    ...(canonical.correlationId === undefined ? {} : { correlationId: canonical.correlationId }),
  }
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replaceAll(/[-_\s]/g, '')
}

function scan(value: CanvasJsonValue, path: string): void {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${path}[${index}]`))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_DURABLE_KEYS.has(normalizedKey(key))) throw new CanvasSensitiveDataError(path, key)
    scan(child, `${path}.${key}`)
  }
}

/** Security rejection that names only the prohibited field/path, never the rejected value. */
export class CanvasSensitiveDataError extends Error {
  /**
   * @param path - semantic workflow location containing the prohibited key.
   * @param key - rejected key name; its value is intentionally omitted from diagnostics.
   */
  constructor(readonly path: string, readonly key: string) {
    super(`Canvas durable workflow field "${key}" is prohibited at ${path}`)
    this.name = 'CanvasSensitiveDataError'
  }
}

/**
 * Reject obvious credential/header/binary payload fields before a workflow can enter Session history.
 * @param workflow - already JSON-safe semantic workflow candidate.
 */
export function assertCanvasWorkflowAuditSafe(workflow: MediaWorkflow): void {
  for (const node of workflow.nodes) scan(node.config, `workflow.nodes.${node.id}.config`)
}
