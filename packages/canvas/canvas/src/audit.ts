import type {
  CanvasAccessContext,
  CanvasActor,
  CanvasActorKind,
  CanvasJsonValue,
  CanvasRequestSource,
  CanvasSnapshot,
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
const HOST_BROWSER_ACTOR_ID = 'host-browser'
const MAX_ACTOR_ID_CHARS = 256
const MAX_AUDIT_ID_CHARS = 128
const MAX_DIAGNOSTIC_CODE_CHARS = 128
const MAX_DIAGNOSTIC_MESSAGE_CHARS = 1024
const MAX_ASSET_ID_CHARS = 512
const MAX_ASSET_NAME_CHARS = 512
const MAX_MEDIA_TYPE_CHARS = 128
const AUDIT_ID_PATTERN = /^[A-Za-z0-9._:@/-]+$/
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/
const DATA_URL_BASE64_PATTERN = /^data:[^,]{0,256};base64,/i
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i
const BEARER_VALUE_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}\b/i
const SECRET_PREFIX_PATTERN = /\b(?:sk|rk)[-_][A-Za-z0-9_-]{20,}\b/
const URL_LIKE_REFERENCE_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//
const FORBIDDEN_DURABLE_KEYS = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'headers',
  'requestheaders',
  'responseheaders',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'authtoken',
  'sessiontoken',
  'idtoken',
  'clientsecret',
  'callbacksecret',
  'secretkey',
  'privatekey',
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
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${subject} must be a non-empty string`)
  return value
}

function boundedText(value: unknown, subject: string, maxChars: number, pattern?: RegExp): string {
  const text = nonEmpty(value, subject)
  if (text.length > maxChars) throw new Error(`${subject} must be at most ${maxChars} characters`)
  if (CONTROL_CHAR_PATTERN.test(text)) throw new Error(`${subject} must not contain control characters`)
  if (text.trim() !== text) throw new Error(`${subject} must not contain leading or trailing whitespace`)
  if (pattern !== undefined && !pattern.test(text)) throw new Error(`${subject} contains unsupported characters`)
  return text
}

function canonicalActor(value: unknown): CanvasActor {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Canvas actor must be an object')
  const source = value as Record<string, unknown>
  if (Object.keys(source).sort().join(',') !== 'id,kind') throw new Error('Canvas actor must contain exactly id and kind')
  if (!ACTOR_KINDS.has(source.kind as CanvasActorKind)) throw new Error(`unsupported Canvas actor kind ${String(source.kind)}`)
  const id = boundedText(source.id, 'Canvas actor id', MAX_ACTOR_ID_CHARS)
  switch (source.kind) {
    case 'human': return { kind: 'human', id }
    case 'agent': return { kind: 'agent', id }
    case 'system': return { kind: 'system', id }
    default: throw new Error(`unsupported Canvas actor kind ${String(source.kind)}`)
  }
}

/** Exact Host identities available when binding Canvas request provenance. */
export interface CanvasProvenanceTarget {
  readonly agentId: string
  readonly sessionId: string
}

/**
 * Validate and detach request-scoped actor/source metadata before authorization or audit.
 * Durable request/correlation ids are deliberately bounded and log-safe.
 */
export function canonicalCanvasAccessContext(value: CanvasAccessContext): CanvasAccessContext {
  if (!SOURCES.has(value.source)) throw new Error(`unsupported Canvas request source ${String(value.source)}`)
  const requestId = value.requestId === undefined
    ? undefined
    : boundedText(value.requestId, 'Canvas requestId', MAX_AUDIT_ID_CHARS, AUDIT_ID_PATTERN)
  const correlationId = value.correlationId === undefined
    ? undefined
    : boundedText(value.correlationId, 'Canvas correlationId', MAX_AUDIT_ID_CHARS, AUDIT_ID_PATTERN)
  return {
    actor: canonicalActor(value.actor),
    source: value.source,
    ...(requestId === undefined ? {} : { requestId }),
    ...(correlationId === undefined ? {} : { correlationId }),
  }
}

function provenanceTarget(target: CanvasProvenanceTarget | string): CanvasProvenanceTarget {
  if (typeof target === 'string') {
    const id = nonEmpty(target, 'Canvas target agent id')
    return { agentId: id, sessionId: id }
  }
  return {
    agentId: nonEmpty(target.agentId, 'Canvas target agent id'),
    sessionId: nonEmpty(target.sessionId, 'Canvas target session id'),
  }
}

/**
 * Bind caller metadata to the Host entry point that owns the request.
 * Browser/asset calls use one Host-minted browser principal; the target Session remains a separate
 * authorization resource. Agent Tool/Host Agent attribution remains bound to the exact Agent id.
 * The string target overload preserves existing Agent-owned call sites while newer callers may pass
 * the explicit `{ agentId, sessionId }` pair.
 */
export function assertCanvasAccessProvenance(
  access: CanvasAccessContext,
  target: CanvasProvenanceTarget | string,
): void {
  const resolved = provenanceTarget(target)
  switch (access.source) {
    case 'browser-remote':
      if (access.actor.kind !== 'human' || access.actor.id !== HOST_BROWSER_ACTOR_ID) {
        throw new Error('browser-remote Canvas access must use the Host-minted browser principal')
      }
      return
    case 'agent-tool':
      if (access.actor.kind !== 'agent' || access.actor.id !== resolved.agentId) {
        throw new Error('agent-tool Canvas access must use the exact target Agent identity')
      }
      return
    case 'system-reconciler':
      if (access.actor.kind !== 'system') throw new Error('system-reconciler Canvas access must use a system actor')
      return
    case 'asset-route':
      if (access.actor.kind !== 'human' || access.actor.id !== HOST_BROWSER_ACTOR_ID) {
        throw new Error('asset-route Canvas access must use the Host-minted browser principal')
      }
      return
    case 'host':
      if (access.actor.kind === 'system') return
      if (access.actor.kind === 'agent' && access.actor.id === resolved.agentId) return
      throw new Error('host Canvas access must use the exact target Agent identity or a system actor')
    default:
      access.source satisfies never
  }
}

/** Host-owned default actor for direct Agent-side Canvas calls. */
export function canvasHostAgentAccess(agentId: string): CanvasAccessContext {
  return canonicalCanvasAccessContext({ actor: { kind: 'agent', id: agentId }, source: 'host' })
}

/**
 * Host-owned Browser attribution. The argument proves the Host has already resolved a target Session;
 * it is intentionally not reused as the human principal. Session identity travels separately in the
 * authorization request, while actor identity is one non-spoofable local Browser principal.
 */
export function canvasBrowserAccess(
  sessionId: string,
  requestId?: string,
  correlationId?: string,
): CanvasAccessContext {
  nonEmpty(sessionId, 'Canvas browser target session id')
  return canonicalCanvasAccessContext({
    actor: { kind: 'human', id: HOST_BROWSER_ACTOR_ID },
    source: 'browser-remote',
    ...(requestId === undefined ? {} : { requestId }),
    ...(correlationId === undefined ? {} : { correlationId }),
  })
}

/** Host-owned Agent-tool attribution for later N18 consumers. */
export function canvasAgentToolAccess(
  agentId: string,
  requestId?: string,
  correlationId?: string,
): CanvasAccessContext {
  return canonicalCanvasAccessContext({
    actor: { kind: 'agent', id: agentId },
    source: 'agent-tool',
    ...(requestId === undefined ? {} : { requestId }),
    ...(correlationId === undefined ? {} : { correlationId }),
  })
}

/** Host-owned reconciler attribution for N16/N22 background lifecycle updates. */
export function canvasSystemAccess(
  systemId: string,
  requestId?: string,
  correlationId?: string,
): CanvasAccessContext {
  return canonicalCanvasAccessContext({
    actor: { kind: 'system', id: systemId },
    source: 'system-reconciler',
    ...(requestId === undefined ? {} : { requestId }),
    ...(correlationId === undefined ? {} : { correlationId }),
  })
}

/** Materialize current durable audit metadata by allow-list. */
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

function forbiddenDurableKey(key: string): boolean {
  const normalized = normalizedKey(key)
  if (FORBIDDEN_DURABLE_KEYS.has(normalized)) return true
  if (normalized.endsWith('apikey')) return true
  if (normalized.endsWith('accesstoken') || normalized.endsWith('refreshtoken')) return true
  if (normalized.endsWith('authtoken') || normalized.endsWith('sessiontoken') || normalized.endsWith('idtoken')) return true
  if (normalized.endsWith('clientsecret') || normalized.endsWith('callbacksecret')) return true
  if (normalized.endsWith('secretkey') || normalized.endsWith('privatekey')) return true
  return false
}

function assertSafeDurableString(value: string, path: string, maxChars?: number): void {
  if (maxChars !== undefined && value.length > maxChars) throw new CanvasSensitiveDataError(path)
  if (DATA_URL_BASE64_PATTERN.test(value)) throw new CanvasSensitiveDataError(path)
  if (PRIVATE_KEY_PATTERN.test(value)) throw new CanvasSensitiveDataError(path)
  if (BEARER_VALUE_PATTERN.test(value)) throw new CanvasSensitiveDataError(path)
  if (SECRET_PREFIX_PATTERN.test(value)) throw new CanvasSensitiveDataError(path)
}

function scan(value: CanvasJsonValue, path: string): void {
  if (typeof value === 'string') {
    assertSafeDurableString(value, path)
    return
  }
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${path}[${index}]`))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenDurableKey(key)) throw new CanvasSensitiveDataError(path, key)
    scan(child, `${path}.${key}`)
  }
}

/** Security rejection that names only the prohibited field/path, never the rejected value. */
export class CanvasSensitiveDataError extends Error {
  constructor(readonly path: string, readonly key?: string) {
    super(key === undefined
      ? `Canvas durable value is prohibited at ${path}`
      : `Canvas durable field "${key}" is prohibited at ${path}`)
    this.name = 'CanvasSensitiveDataError'
  }
}

/**
 * Reject obvious credential/header/binary payload fields before a workflow can enter Session history.
 * This structural boundary prevents Harness/Provider credentials from becoming workflow state; it is
 * not a promise to recognize arbitrary secret-looking text deliberately pasted by a user.
 */
export function assertCanvasWorkflowAuditSafe(workflow: MediaWorkflow): void {
  for (const node of workflow.nodes) scan(node.config, `workflow.nodes.${node.id}.config`)
}

/** Require one durable diagnostic/reference string to be bounded, log-safe, and free of explicit credential carriers. */
export function assertCanvasSafeDiagnosticText(
  value: string,
  path: string,
  maxChars = MAX_DIAGNOSTIC_MESSAGE_CHARS,
): void {
  if (value.length === 0 || value.length > maxChars || CONTROL_CHAR_PATTERN.test(value) || value.trim() !== value) {
    throw new CanvasSensitiveDataError(path)
  }
  assertSafeDurableString(value, path, maxChars)
}

function assertOpaqueAssetId(value: string, path: string): void {
  assertCanvasSafeDiagnosticText(value, path, MAX_ASSET_ID_CHARS)
  if (URL_LIKE_REFERENCE_PATTERN.test(value)) throw new CanvasSensitiveDataError(path)
}

/**
 * Validate every current Canvas field that may later receive Host/provider-generated text.
 * Provider raw payloads/errors, bearer/signed URLs, and binary values never belong in the durable snapshot.
 */
export function assertCanvasDurableAuditSafe(canvas: CanvasSnapshot | null): void {
  if (canvas === null) return
  if (canvas.workflow !== null) assertCanvasWorkflowAuditSafe(canvas.workflow)
  if (canvas.run?.error !== undefined) {
    assertCanvasSafeDiagnosticText(canvas.run.error.code, 'canvas.run.error.code', MAX_DIAGNOSTIC_CODE_CHARS)
    assertCanvasSafeDiagnosticText(canvas.run.error.message, 'canvas.run.error.message')
  }
  for (let index = 0; index < (canvas.output?.assets.length ?? 0); index += 1) {
    const asset = canvas.output!.assets[index]!
    if (asset.kind === 'image') {
      assertOpaqueAssetId(asset.image.attachmentId, `canvas.output.assets[${index}].image.attachmentId`)
      if (asset.image.name !== undefined && asset.image.name.length > 0) {
        assertCanvasSafeDiagnosticText(asset.image.name, `canvas.output.assets[${index}].image.name`, MAX_ASSET_NAME_CHARS)
      }
    } else {
      assertOpaqueAssetId(asset.video.assetId, `canvas.output.assets[${index}].video.assetId`)
      assertCanvasSafeDiagnosticText(asset.video.mediaType, `canvas.output.assets[${index}].video.mediaType`, MAX_MEDIA_TYPE_CHARS)
    }
  }
}
