from pathlib import Path
import json


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected} matches, got {count}: {old[:120]!r}')
    p.write_text(text.replace(old, new, expected))


# History errors remain Host errors. Remote wrappers deliberately expose only safe allowlisted failures.
replace(
    'packages/canvas/canvas/src/history.ts',
    "import { TypertBusinessFailure } from '@deepseek-ai/dsh-typert-protocol'",
    "import { HarnessError } from '@deepseek-ai/dsh-llm'",
)
replace(
    'packages/canvas/canvas/src/history.ts',
    'export class CanvasHistoryQueryError extends TypertBusinessFailure {',
    'export class CanvasHistoryQueryError extends HarnessError {',
)
replace(
    'packages/canvas/canvas/src/history.ts',
    """function cursorFor(startSeq: number): CanvasHistoryCursor {
  return `run:${startSeq}` as CanvasHistoryCursor
}
""",
    """function cursorFor(startSeq: number): CanvasHistoryCursor {
  return `run:${startSeq}` as CanvasHistoryCursor
}

function historyRecord(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CanvasHistoryQueryError(`${subject} must be an object`)
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== null && prototype !== Object.prototype) {
    throw new CanvasHistoryQueryError(`${subject} must be a plain object`)
  }
  return value as Record<string, unknown>
}

function historyKeys(source: Record<string, unknown>, allowed: readonly string[], required: readonly string[], subject: string): void {
  const accepted = new Set(allowed)
  for (const key of Object.keys(source)) {
    if (!accepted.has(key)) throw new CanvasHistoryQueryError(`${subject} contains an unsupported field`)
  }
  for (const key of required) {
    if (!Object.hasOwn(source, key)) throw new CanvasHistoryQueryError(`${subject} is missing a required field`)
  }
}

function historyId(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CanvasHistoryQueryError(`${subject} must be a non-empty string`)
  }
  return value
}

/** Validate the weak SRC boundary before a history resource is authorized. */
export function validateListCanvasRunsRequest(value: unknown): ListCanvasRunsRequest {
  const source = historyRecord(value, 'Canvas run-history request')
  historyKeys(source, ['canvasId', 'cursor', 'limit'], ['canvasId'], 'Canvas run-history request')
  if (source.cursor !== undefined && typeof source.cursor !== 'string') {
    throw new CanvasHistoryQueryError('Canvas run-history cursor must be a string')
  }
  if (source.limit !== undefined && typeof source.limit !== 'number') {
    throw new CanvasHistoryQueryError('Canvas run-history limit must be a number')
  }
  return {
    canvasId: historyId(source.canvasId, 'Canvas run-history canvasId') as ListCanvasRunsRequest['canvasId'],
    ...(source.cursor === undefined ? {} : { cursor: source.cursor as CanvasHistoryCursor }),
    ...(source.limit === undefined ? {} : { limit: source.limit }),
  }
}

/** Validate the weak SRC boundary before an exact Run resource is authorized. */
export function validateGetCanvasRunRequest(value: unknown): GetCanvasRunRequest {
  const source = historyRecord(value, 'Canvas run-history lookup')
  historyKeys(source, ['canvasId', 'runId'], ['canvasId', 'runId'], 'Canvas run-history lookup')
  return {
    canvasId: historyId(source.canvasId, 'Canvas run-history canvasId') as GetCanvasRunRequest['canvasId'],
    runId: historyId(source.runId, 'Canvas run-history runId') as GetCanvasRunRequest['runId'],
  }
}
""",
)

# Canvas Host errors retain native semantics; Remote methods explicitly map only allowlisted codes.
replace(
    'packages/canvas/canvas/src/runtime.ts',
    "import type { Session } from '@deepseek-ai/dsh-session'\nimport { Remote, TypertBusinessFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'",
    "import { HarnessError } from '@deepseek-ai/dsh-llm'\nimport type { Session } from '@deepseek-ai/dsh-session'\nimport { Remote, TypertBusinessFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'",
)
replace(
    'packages/canvas/canvas/src/runtime.ts',
    "import { CanvasRunHistoryIndex } from './history.ts'",
    "import { CanvasRunHistoryIndex, validateGetCanvasRunRequest, validateListCanvasRunsRequest } from './history.ts'",
)
replace(
    'packages/canvas/canvas/src/runtime.ts',
    'export class CanvasServiceError extends TypertBusinessFailure {',
    'export class CanvasServiceError extends HarnessError {',
)
replace(
    'packages/canvas/canvas/src/runtime.ts',
    """interface CanvasCache {
  readonly state: CanvasFoldState
  readonly history: CanvasRunHistoryIndex
  observedSeq: number
}""",
    """interface CanvasCache {
  state: CanvasFoldState
  history: CanvasRunHistoryIndex
  observedSeq: number
}""",
)
replace(
    'packages/canvas/canvas/src/runtime.ts',
    """function invalidEdit(message: string): never {
  throw new CanvasServiceError(message, 'CANVAS_INVALID_EDIT')
}
""",
    """function invalidEdit(message: string): never {
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
  for (const key of Object.keys(source)) if (!allowed.has(key)) invalidEdit(`Canvas layout request contains unsupported field "${key}"`)
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
""",
)

# Make each edit operation's weak SRC shape exact before feature/plugin code sees it.
for old, new in [
    ("      case 'add-node': {\n        const node", "      case 'add-node': {\n        exactKeys(operation, ['op', 'node'], `Canvas workflow edit operation ${index}`)\n        const node"),
    ("      case 'remove-node':\n        editString", "      case 'remove-node':\n        exactKeys(operation, ['op', 'nodeId'], `Canvas workflow edit operation ${index}`)\n        editString"),
    ("      case 'replace-node-config':\n        editString", "      case 'replace-node-config':\n        exactKeys(operation, ['op', 'nodeId', 'config'], `Canvas workflow edit operation ${index}`)\n        editString"),
    ("      case 'rename-node':\n        editString", "      case 'rename-node':\n        exactKeys(operation, ['op', 'nodeId', 'name'], `Canvas workflow edit operation ${index}`)\n        editString"),
    ("      case 'connect': {\n        const edge", "      case 'connect': {\n        exactKeys(operation, ['op', 'edge'], `Canvas workflow edit operation ${index}`)\n        const edge"),
    ("      case 'disconnect':\n        editString", "      case 'disconnect':\n        exactKeys(operation, ['op', 'edgeId'], `Canvas workflow edit operation ${index}`)\n        editString"),
    ("      case 'set-output-nodes':\n        if", "      case 'set-output-nodes':\n        exactKeys(operation, ['op', 'nodeIds'], `Canvas workflow edit operation ${index}`)\n        if"),
    ("      case 'rename-workflow':\n        editString", "      case 'rename-workflow':\n        exactKeys(operation, ['op', 'name'], `Canvas workflow edit operation ${index}`)\n        editString"),
]:
    replace('packages/canvas/canvas/src/runtime.ts', old, new)
replace(
    'packages/canvas/canvas/src/runtime.ts',
    """        const edge = editRecord(operation.edge, `Canvas workflow edit operation ${index}.edge`)
        for (const field of ['id', 'sourceNodeId', 'sourcePort', 'targetNodeId', 'targetPort'] as const) {""",
    """        const edge = editRecord(operation.edge, `Canvas workflow edit operation ${index}.edge`)
        exactKeys(edge, ['id', 'sourceNodeId', 'sourcePort', 'targetNodeId', 'targetPort'], `Canvas workflow edit operation ${index}.edge`)
        for (const field of ['id', 'sourceNodeId', 'sourcePort', 'targetNodeId', 'targetPort'] as const) {""",
)

replace(
    'packages/canvas/canvas/src/runtime.ts',
    "    const current = this.expectCurrentWorkflow(prepared.cache, ref)\n    if (replacement.id !== current.workflow.id) {",
    "    const current = this.expectCurrentWorkflow(prepared.cache, workflowRefInput(ref))\n    if (replacement.id !== current.workflow.id) {",
)
replace(
    'packages/canvas/canvas/src/runtime.ts',
    """    const replacement = cloneWorkflow(workflow)
    assertMediaWorkflow(replacement)
    features?.assertWorkflowCreatable(replacement)""",
    """    const replacement = cloneWorkflow(workflow)
    try {
      assertMediaWorkflow(replacement)
    } catch (error) {
      if (error instanceof CanvasDomainError) invalidEdit('Canvas replacement workflow is invalid')
      throw error
    }
    features?.assertWorkflowCreatable(replacement)""",
)
replace(
    'packages/canvas/canvas/src/runtime.ts',
    "    const current = this.expectCurrentWorkflow(prepared.cache, ref)\n    const validatedOperations = workflowEditOperations(operations)",
    "    const current = this.expectCurrentWorkflow(prepared.cache, workflowRefInput(ref))\n    const validatedOperations = workflowEditOperations(operations)",
)
replace(
    'packages/canvas/canvas/src/runtime.ts',
    """  selectOutput(agent: Agent, request: SelectCanvasOutputRequest, access?: CanvasAccessContext): CanvasSnapshot {
    const prepared = this.prepare(agent, 'canvas.edit', access)
    this.assertFeature('canvas')
    const current = prepared.cache.state.canvas""",
    """  selectOutput(agent: Agent, request: SelectCanvasOutputRequest, access?: CanvasAccessContext): CanvasSnapshot {
    const validatedRequest = selectOutputInput(request)
    const prepared = this.prepare(agent, 'canvas.edit', access)
    this.assertFeature('canvas')
    const current = prepared.cache.state.canvas""",
)
# Restrict request substitutions to selectOutput only.
runtime_path = Path('packages/canvas/canvas/src/runtime.ts')
text = runtime_path.read_text()
start = text.index('  selectOutput(agent: Agent')
end = text.index('\n  saveLayout(agent: Agent', start)
block = text[start:end]
for old, new in [('request.runId', 'validatedRequest.runId'), ('request.assetIndex', 'validatedRequest.assetIndex')]:
    if old not in block:
        raise SystemExit(f'runtime selectOutput: missing {old!r}')
    block = block.replace(old, new)
text = text[:start] + block + text[end:]
runtime_path.write_text(text)

replace(
    'packages/canvas/canvas/src/runtime.ts',
    """  saveLayout(agent: Agent, request: SaveCanvasLayoutRequest, access?: CanvasAccessContext): CurrentCanvasLayoutSnapshot {
    const prepared = this.prepare(agent, 'canvas.layout.write', access)""",
    """  saveLayout(agent: Agent, request: SaveCanvasLayoutRequest, access?: CanvasAccessContext): CurrentCanvasLayoutSnapshot {
    const validatedRequest = saveLayoutInput(request)
    const prepared = this.prepare(agent, 'canvas.layout.write', access)""",
)
text = runtime_path.read_text()
start = text.index('  saveLayout(agent: Agent')
end = text.index('\n  listRuns(agent: Agent', start)
block = text[start:end]
for old, new in [
    ('request.canvasId', 'validatedRequest.canvasId'),
    ('request.workflowId', 'validatedRequest.workflowId'),
    ('request.expectedLayoutRevision', 'validatedRequest.expectedLayoutRevision'),
    ('request.nodePositions', 'validatedRequest.nodePositions'),
    ('      request,\n', '      validatedRequest,\n'),
]:
    if old not in block:
        raise SystemExit(f'runtime saveLayout: missing {old!r}')
    block = block.replace(old, new)
runtime_path.write_text(text[:start] + block + text[end:])

replace(
    'packages/canvas/canvas/src/runtime.ts',
    """  listRuns(agent: Agent, request: ListCanvasRunsRequest, access?: CanvasAccessContext): CanvasRunHistoryPage {
    const prepared = this.prepare(
      agent,
      'canvas.history.read',
      access,
      { kind: 'canvas', canvasId: request.canvasId },
    )
    this.assertFeature('history')
    return prepared.cache.history.list(request)
  }""",
    """  listRuns(agent: Agent, request: ListCanvasRunsRequest, access?: CanvasAccessContext): CanvasRunHistoryPage {
    const validatedRequest = validateListCanvasRunsRequest(request)
    const prepared = this.prepare(
      agent,
      'canvas.history.read',
      access,
      { kind: 'canvas', canvasId: validatedRequest.canvasId },
    )
    this.assertFeature('history')
    return prepared.cache.history.list(validatedRequest)
  }""",
)
replace(
    'packages/canvas/canvas/src/runtime.ts',
    """  getRun(agent: Agent, request: GetCanvasRunRequest, access?: CanvasAccessContext): CanvasRunHistoryEntry | null {
    const prepared = this.prepare(
      agent,
      'canvas.history.read',
      access,
      { kind: 'run', canvasId: request.canvasId, runId: request.runId },
    )
    this.assertFeature('history')
    return prepared.cache.history.get(request)
  }""",
    """  getRun(agent: Agent, request: GetCanvasRunRequest, access?: CanvasAccessContext): CanvasRunHistoryEntry | null {
    const validatedRequest = validateGetCanvasRunRequest(request)
    const prepared = this.prepare(
      agent,
      'canvas.history.read',
      access,
      { kind: 'run', canvasId: validatedRequest.canvasId, runId: validatedRequest.runId },
    )
    this.assertFeature('history')
    return prepared.cache.history.get(validatedRequest)
  }""",
)
replace(
    'packages/canvas/canvas/src/runtime.ts',
    "    const current = this.expectCurrentWorkflow(prepared.cache, ref)\n    if (current.run !== null",
    "    const validatedRef = workflowRefInput(ref)\n    const current = this.expectCurrentWorkflow(prepared.cache, validatedRef)\n    if (current.run !== null",
)

# Explicitly map only allowlisted Canvas errors at every Browser Remote boundary.
runtime = Path('packages/canvas/canvas/src/runtime.ts')
text = runtime.read_text()
remote_replacements = {
    "    return { ref: this.workflowRef(this.editWorkflow(agent, ref, operations, this.browserAccess(agent))) }":
    """    return remoteCanvasCall(() => ({
      ref: this.workflowRef(this.editWorkflow(agent, ref, operations, this.browserAccess(agent))),
    }))""",
    "    return { ref: this.workflowRef(this.replaceWorkflow(agent, ref, workflow, this.browserAccess(agent))) }":
    """    return remoteCanvasCall(() => ({
      ref: this.workflowRef(this.replaceWorkflow(agent, ref, workflow, this.browserAccess(agent))),
    }))""",
    """    const canvas = this.selectOutput(agent, request, this.browserAccess(agent))
    const output = canvas.output
    if (output === null) throw new Error('Canvas output selection committed without an output')
    return { runId: output.runId, primaryAssetIndex: output.primaryAssetIndex }""":
    """    return remoteCanvasCall(() => {
      const canvas = this.selectOutput(agent, request, this.browserAccess(agent))
      const output = canvas.output
      if (output === null) throw new Error('Canvas output selection committed without an output')
      return { runId: output.runId, primaryAssetIndex: output.primaryAssetIndex }
    })""",
    """    const layout = this.saveLayout(agent, request, this.browserAccess(agent))
    return {
      canvasId: layout.canvasId,
      workflowId: layout.workflowId,
      layoutRevision: layout.layoutRevision,
      updatedAt: layout.updatedAt,
    }""":
    """    return remoteCanvasCall(() => {
      const layout = this.saveLayout(agent, request, this.browserAccess(agent))
      return {
        canvasId: layout.canvasId,
        workflowId: layout.workflowId,
        layoutRevision: layout.layoutRevision,
        updatedAt: layout.updatedAt,
      }
    })""",
    """    this.clear(agent, ref, this.browserAccess(agent))
    return { canvasId: ref.canvasId }""":
    """    return remoteCanvasCall(() => {
      const validatedRef = workflowRefInput(ref)
      this.clear(agent, validatedRef, this.browserAccess(agent))
      return { canvasId: validatedRef.canvasId }
    })""",
    "    return this.listRuns(agent, request, this.browserAccess(agent))":
    "    return remoteCanvasCall(() => this.listRuns(agent, request, this.browserAccess(agent)))",
    "    return this.getRun(agent, request, this.browserAccess(agent))":
    "    return remoteCanvasCall(() => this.getRun(agent, request, this.browserAccess(agent)))",
}
for old, new in remote_replacements.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'runtime remote patch expected 1, got {count}: {old[:100]!r}')
    text = text.replace(old, new, 1)
runtime.write_text(text)

# Cache derived state atomically: validate Canvas fold and History index on clones before publication.
replace(
    'packages/canvas/canvas/src/runtime.ts',
    """  private sync(session: Session, cache: CanvasCache): void {
    for (const event of session.events.slice(cache.observedSeq)) {
      applyCanvasEvent(cache.state, event)
      cache.history.apply(event)
      cache.observedSeq += 1
    }
  }""",
    """  private sync(session: Session, cache: CanvasCache): void {
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
  }""",
)

# Gateway preserves only explicit Typert business failures and never leaks ordinary Error.message.
replace(
    'packages/api/gateway/src/index.ts',
    "  remoteMethods,\n  TypertLookupFailure,",
    "  remoteMethods,\n  TypertBusinessFailure,\n  TypertLookupFailure,",
)
replace(
    'packages/api/gateway/src/index.ts',
    """  if (error instanceof TypertLookupFailure) {
    return { ok: false, error: error.failure as ConnectionRpcError }
  }
  return {
    ok: false,
    error: {
      code: 'internal',
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  }""",
    """  if (error instanceof TypertBusinessFailure) {
    return { ok: false, error: error.failure as ConnectionRpcError }
  }
  if (error instanceof TypertLookupFailure) {
    return { ok: false, error: error.failure as ConnectionRpcError }
  }
  return {
    ok: false,
    error: {
      code: 'internal',
      message: 'Remote request failed',
      details: {},
    },
  }""",
)

# Shipped base composition mounts the invariant registry and the Canvas companion.
replace(
    'packages/bundle/base/cordis.patch.yml',
    """    - id: session
      name: '@deepseek-ai/dsh-session'

    - id: typert""",
    """    - id: session
      name: '@deepseek-ai/dsh-session'

    - id: invariants
      name: '@deepseek-ai/dsh-invariants'

    - id: typert""",
)
replace(
    'packages/bundle/base/cordis.patch.yml',
    """    - id: canvas
      name: '@deepseek-ai/dsh-canvas'

    # Request-local Browser Canvas selection""",
    """    - id: canvas
      name: '@deepseek-ai/dsh-canvas'

    # Package-owned pre-commit/replay checks make the Canvas write permit a
    # shipped invariant instead of a test-only convention.
    - id: canvas-invariant
      name: '@deepseek-ai/dsh-canvas/invariant'

    # Request-local Browser Canvas selection""",
)
manifest_path = Path('packages/bundle/base/package.json')
manifest = json.loads(manifest_path.read_text())
manifest['dependencies']['@deepseek-ai/dsh-invariants'] = 'workspace:^'
manifest.get('peerDependencies', {}).pop('@deepseek-ai/dsh-invariants', None)
manifest.get('devDependencies', {}).pop('@deepseek-ai/dsh-invariants', None)
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')

replace(
    'packages/bundle/base/tests/base.spec.ts',
    """    expect(rows.filter(row => row.id === 'canvas-features')).toHaveLength(1)
    expect(rows.find(row => row.id === 'canvas-features')?.name).toBe('@deepseek-ai/dsh-canvas/feature-service')""",
    """    expect(rows.filter(row => row.id === 'invariants')).toHaveLength(1)
    expect(rows.find(row => row.id === 'invariants')?.name).toBe('@deepseek-ai/dsh-invariants')
    expect(rows.filter(row => row.id === 'canvas-features')).toHaveLength(1)
    expect(rows.find(row => row.id === 'canvas-features')?.name).toBe('@deepseek-ai/dsh-canvas/feature-service')""",
)
replace(
    'packages/bundle/base/tests/base.spec.ts',
    """    expect(rows.filter(row => row.id === 'canvas')).toHaveLength(1)
    expect(rows.filter(row => row.id === 'canvas-interaction')).toHaveLength(1)""",
    """    expect(rows.filter(row => row.id === 'canvas')).toHaveLength(1)
    expect(rows.filter(row => row.id === 'canvas-invariant')).toHaveLength(1)
    expect(rows.find(row => row.id === 'canvas-invariant')?.name).toBe('@deepseek-ai/dsh-canvas/invariant')
    expect(rows.filter(row => row.id === 'canvas-interaction')).toHaveLength(1)""",
)
replace(
    'packages/bundle/base/tests/base.spec.ts',
    """    const interactionIndex = rows.findIndex(row => row.id === 'canvas-interaction')
    expect(featureIndex).toBeLessThan(registryIndex)""",
    """    const canvasIndex = rows.findIndex(row => row.id === 'canvas')
    const invariantIndex = rows.findIndex(row => row.id === 'canvas-invariant')
    const interactionIndex = rows.findIndex(row => row.id === 'canvas-interaction')
    expect(featureIndex).toBeLessThan(registryIndex)""",
)
replace(
    'packages/bundle/base/tests/base.spec.ts',
    """    expect(builtinsIndex).toBeLessThan(interactionIndex)

    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-canvas', 'workspace:^')""",
    """    expect(builtinsIndex).toBeLessThan(interactionIndex)
    expect(canvasIndex).toBeLessThan(invariantIndex)
    expect(invariantIndex).toBeLessThan(interactionIndex)

    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-canvas', 'workspace:^')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-invariants', 'workspace:^')""",
)

# Keep the built-LIB HTTP smoke useful under the exact-live Session contract.
replace(
    'packages/api/remotes/tests/built-lib.e2e.ts',
    'const { Session, SessionId } = await import(urls.session)',
    'const { default: SessionStore, SessionId } = await import(urls.session)',
)
replace(
    'packages/api/remotes/tests/built-lib.e2e.ts',
    """      await host.plugin(TypertRegistry)
      await host.plugin(AgentRegistry)
      await host.plugin(TypertRemoteService)""",
    """      await host.plugin(TypertRegistry)
      await host.plugin(SessionStore)
      await host.plugin(AgentRegistry)
      await host.plugin(TypertRemoteService)""",
)
replace(
    'packages/api/remotes/tests/built-lib.e2e.ts',
    'const session = new Session(SessionId(rawId))',
    'const session = host.sessions.create(SessionId(rawId))',
)
