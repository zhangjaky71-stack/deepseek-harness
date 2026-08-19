import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CANVAS_CHANGE_VERSION,
  CANVAS_LAYOUT_SCHEMA_VERSION,
  MEDIA_WORKFLOW_NODE_VERSIONS,
  CanvasDomainError,
  CanvasMigrationError,
  decodeCanvasChangeVersion,
  decodeCanvasLayoutSnapshot,
  decodeCanvasRunHistoryEntry,
  decodeCanvasSnapshot,
  decodeMediaWorkflow,
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

  it('fails loud for future workflow, snapshot, change, and node versions', () => {
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

  it('migrates the archived deprecated node and reports its lifecycle without persisting the alias', () => {
    const migrated = decodeMediaWorkflow(fixture('deprecated-node-v1.json'))
    expect(migrated.value.nodes[1]?.type).toBe('image.generate')
    expect(migrated.value.nodes[1]?.nodeVersion).toBe(MEDIA_WORKFLOW_NODE_VERSIONS['image.generate'])
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
  })

  it('keeps migration structural and lets the N01 invariant reject bad relationships', () => {
    const raw = structuredClone(fixture('workflow-v1.json')) as { edges: Array<Record<string, unknown>> }
    raw.edges[0]!.targetNodeId = 'missing-node'
    expect(migrateStoredMediaWorkflow(raw).value.edges[0]?.targetNodeId).toBe('missing-node')
    expect(() => decodeMediaWorkflow(raw)).toThrow(CanvasDomainError)
  })

  it('decodes the frozen layout-v1 fixture independently of semantic revisions', () => {
    const layout = decodeCanvasLayoutSnapshot(fixture('layout-v1.json'))
    expect(layout.schemaVersion).toBe(CANVAS_LAYOUT_SCHEMA_VERSION)
    expect(layout.workflowId).toBe('workflow-v1')
    expect(layout.nodePositions.generate).toEqual({ x: 320, y: 96 })
    expect(layout.viewport?.zoom).toBe(0.9)
  })

  it('decodes the frozen run-history-v1 DTO without making it Canvas authority', () => {
    const history = decodeCanvasRunHistoryEntry(fixture('run-history-v1.json'))
    expect(history.runId).toBe('run-v1')
    expect(history.status).toBe('completed')
    expect(history.outputs[0]?.kind).toBe('video')
  })
})
