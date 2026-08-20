import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CANVAS_CHANGE_VERSION,
  CANVAS_LAYOUT_SCHEMA_VERSION,
  CORE_MEDIA_WORKFLOW_NODE_VERSIONS,
  CanvasDomainError,
  CanvasLayoutError,
  CanvasMigrationError,
  WorkflowNodeId,
  decodeCanvasChangeVersion,
  decodeCanvasLayoutSnapshot,
  decodeCanvasRunHistoryEntry,
  decodeCanvasSnapshot,
  decodeMediaWorkflow,
  migrateStoredCanvasLayoutSnapshot,
  migrateStoredCanvasSnapshot,
  migrateStoredMediaWorkflow,
} from '../src/index.ts'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as unknown
}

function expectMigrationCode(action: () => unknown, code: CanvasMigrationError['code']): void {
  try {
    action()
    throw new Error(`expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(CanvasMigrationError)
    expect((error as CanvasMigrationError).code).toBe(code)
  }
}

describe('Canvas migration boundary', () => {
  it('decodes the frozen workflow-v1 fixture into the current runtime shape', () => {
    const migrated = decodeMediaWorkflow(fixture('workflow-v1.json'))
    expect(migrated.value.schemaVersion).toBe(1)
    expect(migrated.value.nodes.map(node => node.nodeVersion)).toEqual([1, 1, 1])
    expect(migrated.notices).toEqual([])
  })

  it('decodes the frozen snapshot-v1 fixture and validates the nested workflow', () => {
    const migrated = decodeCanvasSnapshot(fixture('snapshot-v1.json'))
    expect(migrated.value.schemaVersion).toBe(1)
    expect(migrated.value.workflow?.id).toBe('workflow-v1')
    expect(migrated.notices).toEqual([])
  })

  it('preserves an unavailable plugin node type, version, and config', () => {
    const migrated = decodeMediaWorkflow(fixture('plugin-node-v1.json'))
    const plugin = migrated.value.nodes[1]
    expect(plugin).toMatchObject({
      id: 'plugin-transform',
      type: 'example.custom-transform',
      nodeVersion: 3,
      config: { strength: 0.8, mode: 'cinematic' },
    })
    expect(migrated.notices).toEqual([])
  })

  it('preserves plugin nodes when a stored Canvas snapshot is rebuilt without the plugin registry', () => {
    const raw = structuredClone(fixture('snapshot-v1.json')) as Record<string, unknown>
    raw.workflow = fixture('plugin-node-v1.json')
    raw.run = null
    raw.output = null
    const migrated = migrateStoredCanvasSnapshot(raw)
    expect(migrated.value.workflow?.nodes[1]).toMatchObject({ type: 'example.custom-transform', nodeVersion: 3 })
    expect(() => decodeCanvasSnapshot(raw)).not.toThrow()
  })

  it('does not interpret an arbitrary plugin node version as a Canvas future version', () => {
    const raw = structuredClone(fixture('plugin-node-v1.json')) as { nodes: Array<Record<string, unknown>> }
    raw.nodes[1]!.nodeVersion = 999
    expect(decodeMediaWorkflow(raw).value.nodes[1]?.nodeVersion).toBe(999)
  })

  it('fails loud for future workflow, snapshot, change, and Canvas-owned node versions', () => {
    const workflow = structuredClone(fixture('workflow-v1.json')) as Record<string, unknown>
    workflow.schemaVersion = 2
    expectMigrationCode(() => decodeMediaWorkflow(workflow), 'CANVAS_UNSUPPORTED_FUTURE_SCHEMA')

    const snapshot = structuredClone(fixture('snapshot-v1.json')) as Record<string, unknown>
    snapshot.schemaVersion = 2
    expectMigrationCode(() => decodeCanvasSnapshot(snapshot), 'CANVAS_UNSUPPORTED_FUTURE_SCHEMA')

    expect(CANVAS_CHANGE_VERSION).toBe(1)
    expectMigrationCode(() => decodeCanvasChangeVersion(2), 'CANVAS_UNSUPPORTED_FUTURE_SCHEMA')

    const nodeWorkflow = structuredClone(fixture('workflow-v1.json')) as { nodes: Array<Record<string, unknown>> }
    nodeWorkflow.nodes[1]!.nodeVersion = 2
    expectMigrationCode(() => decodeMediaWorkflow(nodeWorkflow), 'CANVAS_UNSUPPORTED_FUTURE_NODE_VERSION')
  })

  it('fails loud for an unsupported historical schema version', () => {
    const workflow = structuredClone(fixture('workflow-v1.json')) as Record<string, unknown>
    workflow.schemaVersion = 0
    expectMigrationCode(() => decodeMediaWorkflow(workflow), 'CANVAS_UNSUPPORTED_SCHEMA_VERSION')
    expectMigrationCode(() => decodeCanvasChangeVersion(0), 'CANVAS_UNSUPPORTED_SCHEMA_VERSION')
  })

  it('rejects unsupported fields in current workflow and node schemas', () => {
    const workflow = structuredClone(fixture('workflow-v1.json')) as Record<string, unknown>
    workflow.futureField = 'must bump schemaVersion instead of being silently dropped'
    expectMigrationCode(() => decodeMediaWorkflow(workflow), 'CANVAS_MIGRATION_INVALID_VALUE')

    const nodeWorkflow = structuredClone(fixture('workflow-v1.json')) as { nodes: Array<Record<string, unknown>> }
    nodeWorkflow.nodes[0]!.futureField = true
    expectMigrationCode(() => decodeMediaWorkflow(nodeWorkflow), 'CANVAS_MIGRATION_INVALID_VALUE')
  })

  it('migrates the archived deprecated node and reports its lifecycle without persisting the alias', () => {
    const migrated = decodeMediaWorkflow(fixture('deprecated-node-v1.json'))
    expect(migrated.value.nodes[1]?.type).toBe('image.generate')
    expect(migrated.value.nodes[1]?.nodeVersion).toBe(CORE_MEDIA_WORKFLOW_NODE_VERSIONS['image.generate'])
    expect(migrated.notices).toEqual([
      {
        code: 'CANVAS_DEPRECATED_NODE',
        lifecycle: 'deprecated',
        nodeId: 'legacy-generate',
        fromType: 'image.create',
        toType: 'image.generate',
      },
    ])
  })

  it('is idempotent after a stored workflow has reached current runtime shape', () => {
    const first = migrateStoredMediaWorkflow(fixture('deprecated-node-v1.json'))
    const second = migrateStoredMediaWorkflow(first.value)
    expect(second.value).toEqual(first.value)
    expect(second.notices).toEqual([])

    const pluginFirst = migrateStoredMediaWorkflow(fixture('plugin-node-v1.json'))
    const pluginSecond = migrateStoredMediaWorkflow(pluginFirst.value)
    expect(pluginSecond).toEqual(pluginFirst)
  })

  it('keeps migration structural and lets the N01 invariant reject bad relationships', () => {
    const raw = structuredClone(fixture('workflow-v1.json')) as { edges: Array<Record<string, unknown>> }
    raw.edges[0]!.targetNodeId = 'missing-node'
    expect(migrateStoredMediaWorkflow(raw).value.edges[0]?.targetNodeId).toBe('missing-node')
    expect(() => decodeMediaWorkflow(raw)).toThrow(CanvasDomainError)
  })

  it('separates structural layout migration from current layout invariants', () => {
    const raw = structuredClone(fixture('layout-v1.json')) as { viewport: Record<string, unknown> }
    raw.viewport.zoom = -1
    expect(migrateStoredCanvasLayoutSnapshot(raw).viewport?.zoom).toBe(-1)
    expect(() => decodeCanvasLayoutSnapshot(raw)).toThrow(CanvasLayoutError)
  })

  it('decodes the frozen layout-v1 fixture independently of semantic revisions', () => {
    const layout = decodeCanvasLayoutSnapshot(fixture('layout-v1.json'))
    expect(layout.schemaVersion).toBe(CANVAS_LAYOUT_SCHEMA_VERSION)
    expect(layout.workflowId).toBe('workflow-v1')
    expect(layout.nodePositions[WorkflowNodeId('generate')]).toEqual({ x: 320, y: 96 })
    expect(layout.viewport?.zoom).toBe(0.9)
  })

  it('rejects unsupported current layout fields instead of silently dropping them', () => {
    const raw = structuredClone(fixture('layout-v1.json')) as Record<string, unknown>
    raw.futureField = true
    expectMigrationCode(() => migrateStoredCanvasLayoutSnapshot(raw), 'CANVAS_MIGRATION_INVALID_VALUE')
  })

  it('decodes the frozen run-history compatibility DTO without making it Canvas authority', () => {
    const history = decodeCanvasRunHistoryEntry(fixture('run-history-v1.json'))
    expect(history.runId).toBe('run-v1')
    expect(history.status).toBe('completed')
    expect(history.outputs[0]?.kind).toBe('video')
  })

  it('strictly validates run-history compatibility DTO media and lifecycle fields', () => {
    const badMedia = structuredClone(fixture('run-history-v1.json')) as { outputs: Array<{ video: Record<string, unknown> }> }
    badMedia.outputs[0]!.video.mediaType = 'image/png'
    expectMigrationCode(() => decodeCanvasRunHistoryEntry(badMedia), 'CANVAS_MIGRATION_INVALID_VALUE')

    const missingFinishedAt = structuredClone(fixture('run-history-v1.json')) as Record<string, unknown>
    delete missingFinishedAt.finishedAt
    expectMigrationCode(() => decodeCanvasRunHistoryEntry(missingFinishedAt), 'CANVAS_MIGRATION_INVALID_VALUE')
  })
})
