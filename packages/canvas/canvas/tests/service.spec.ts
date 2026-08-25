import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import CanvasService, {
  CanvasId,
  CanvasRunId,
  CanvasServiceError,
  MediaWorkflowId,
  WorkflowEdgeId,
  WorkflowNodeId,
  foldCanvas,
} from '@deepseek-ai/dsh-canvas'
import { withCanvasWritePermit } from '../src/write-authority.ts'
import {
  baseWorkflow,
  currentWriterChange,
  runStartChange,
  runUpdateChange,
  workflowRef,
} from './canvas-fixtures.ts'

interface StubAgent {
  agent: Agent
  session: Session
}

function stubAgentForSession(session: Session): StubAgent {
  const inbox = new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} })
  const agent: Agent = {
    id: session.id,
    options: {},
    session,
    inbox,
    ctx: new Context(),
    status: 'idle',
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject(input) { inbox.append('next-step', input) },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle() { return Promise.resolve() },
  }
  return { agent, session }
}

async function harness(seed?: readonly SessionEvent[]) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(CanvasService)
  const id = SessionId(`canvas-test-${Math.random()}`)
  const session = ctx.sessions.create(id, seed === undefined ? undefined : { seed })
  const stub = stubAgentForSession(session)
  ctx.agents.register(stub.agent)
  return { ctx, ...stub }
}

function appendCurrentChange(session: Session, change: ReturnType<typeof currentWriterChange>): void {
  withCanvasWritePermit(session, 'canvas/change', change, () => {
    session.append('canvas/change', change)
  })
}

describe('CanvasService durable authority', () => {
  it('creates one Canvas through one full-snapshot Session event and replays it exactly', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_787_100_000_000)
    const { ctx, agent, session } = await harness()

    const canvas = ctx.canvas.create(agent, { workflow: baseWorkflow() })

    expect(canvas.id).toMatch(/^canvas-/)
    expect(canvas.workflowRevision).toBe(1)
    expect(canvas.runRevision).toBe(0)
    expect(session.events.map(event => event.type)).toEqual(['canvas/change'])
    expect(foldCanvas(session.events)).toEqual(canvas)
    expect(ctx.canvas.get(agent)).toEqual(canvas)
    vi.useRealTimers()
  })

  it('cold-replays the same state as the live cache', async () => {
    const first = await harness()
    const created = first.ctx.canvas.create(first.agent, { workflow: baseWorkflow() })
    const edited = first.ctx.canvas.editWorkflow(first.agent, workflowRef(created), [
      { op: 'rename-workflow', name: 'Edited' },
    ])

    const resumed = await harness(first.session.events)
    expect(resumed.ctx.canvas.get(resumed.agent)).toEqual(edited)
    expect(foldCanvas(resumed.session.events)).toEqual(edited)
  })

  it('applies every semantic edit operation as one workflow revision', async () => {
    const { ctx, agent, session } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const generate = WorkflowNodeId('generate')

    const edited = ctx.canvas.editWorkflow(agent, workflowRef(created), [
      { op: 'add-node', node: { id: generate, type: 'image.generate', nodeVersion: 1, config: { count: 1 } } },
      { op: 'rename-node', nodeId: generate, name: 'Generate' },
      { op: 'replace-node-config', nodeId: generate, config: { count: 4 } },
      {
        op: 'connect',
        edge: {
          id: WorkflowEdgeId('prompt-generate'),
          sourceNodeId: WorkflowNodeId('prompt'),
          sourcePort: 'text',
          targetNodeId: generate,
          targetPort: 'prompt',
        },
      },
      { op: 'disconnect', edgeId: WorkflowEdgeId('prompt-output') },
      { op: 'set-output-nodes', nodeIds: [generate] },
      { op: 'rename-workflow', name: 'Four candidates' },
      { op: 'remove-node', nodeId: WorkflowNodeId('output') },
    ])

    expect(edited.workflowRevision).toBe(2)
    expect(edited.workflow?.name).toBe('Four candidates')
    expect(edited.workflow?.nodes.map(node => node.id)).toEqual(['prompt', 'generate'])
    expect(edited.workflow?.nodes[1]).toMatchObject({ name: 'Generate', config: { count: 4 } })
    expect(edited.workflow?.edges.map(edge => edge.id)).toEqual(['prompt-generate'])
    expect(edited.workflow?.outputNodeIds).toEqual(['generate'])
    expect(session.events).toHaveLength(2)
  })

  it('does not publish partial operation batches when a later operation fails', async () => {
    const { ctx, agent, session } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const before = session.events.length

    expect(() => ctx.canvas.editWorkflow(agent, workflowRef(created), [
      { op: 'rename-workflow', name: 'Uncommitted' },
      { op: 'add-node', node: { id: WorkflowNodeId('generate'), type: 'image.generate', nodeVersion: 1, config: {} } },
      { op: 'set-output-nodes', nodeIds: [WorkflowNodeId('generate')] },
      { op: 'remove-node', nodeId: WorkflowNodeId('missing') },
    ])).toThrow(expect.objectContaining({ code: 'CANVAS_INVALID_EDIT' }))

    expect(session.events).toHaveLength(before)
    expect(ctx.canvas.get(agent)).toEqual(created)
  })

  it('suppresses semantic no-op workflow writes instead of manufacturing a revision', async () => {
    const { ctx, agent, session } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const before = session.seq

    const renamedSame = ctx.canvas.editWorkflow(agent, workflowRef(created), [
      { op: 'rename-workflow', name: created.workflow!.name },
    ])
    expect(renamedSame).toEqual(created)
    expect(session.seq).toBe(before)

    const replacedSame = ctx.canvas.replaceWorkflow(agent, workflowRef(created), created.workflow!)
    expect(replacedSame).toEqual(created)
    expect(session.seq).toBe(before)
  })

  it('rejects empty/finally-invalid edits before append', async () => {
    const { ctx, agent, session } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    expect(() => ctx.canvas.editWorkflow(agent, workflowRef(created), [])).toThrow(CanvasServiceError)
    expect(() => ctx.canvas.editWorkflow(agent, workflowRef(created), [
      { op: 'remove-node', nodeId: WorkflowNodeId('output') },
    ])).toThrow(expect.objectContaining({ code: 'CANVAS_INVALID_EDIT' }))
    expect(session.events).toHaveLength(1)
  })

  it('rejects a stale workflow revision but ignores runRevision changes for workflow CAS', async () => {
    const { ctx, agent, session } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const ref = workflowRef(created)
    appendCurrentChange(session, currentWriterChange(runStartChange(created)))

    const edited = ctx.canvas.editWorkflow(agent, ref, [{ op: 'rename-workflow', name: 'While running' }])
    expect(edited.workflowRevision).toBe(2)
    expect(edited.runRevision).toBe(1)
    expect(edited.run?.workflowRevision).toBe(1)

    expect(() => ctx.canvas.editWorkflow(agent, ref, [{ op: 'rename-workflow', name: 'stale' }])).toThrow(
      expect.objectContaining({ code: 'CANVAS_STALE_WORKFLOW_REVISION' }),
    )
  })

  it('classifies Canvas identity, workflow identity, and revision CAS failures separately', async () => {
    const { ctx, agent } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const ref = workflowRef(created)

    expect(() => ctx.canvas.editWorkflow(agent, { ...ref, canvasId: CanvasId('other') }, [
      { op: 'rename-workflow', name: 'x' },
    ])).toThrow(expect.objectContaining({ code: 'CANVAS_NOT_FOUND' }))

    expect(() => ctx.canvas.editWorkflow(agent, { ...ref, workflowId: MediaWorkflowId('other') }, [
      { op: 'rename-workflow', name: 'x' },
    ])).toThrow(expect.objectContaining({ code: 'CANVAS_WORKFLOW_ID_MISMATCH' }))

    expect(() => ctx.canvas.editWorkflow(agent, { ...ref, workflowRevision: ref.workflowRevision + 1 }, [
      { op: 'rename-workflow', name: 'x' },
    ])).toThrow(expect.objectContaining({ code: 'CANVAS_STALE_WORKFLOW_REVISION' }))
  })

  it('replaces a workflow atomically while preserving identity and rejects another workflow id', async () => {
    const { ctx, agent, session } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const replacement = baseWorkflow('Replacement')
    const replaced = ctx.canvas.replaceWorkflow(agent, workflowRef(created), replacement)
    expect(replaced.workflowRevision).toBe(2)
    expect(replaced.workflow?.name).toBe('Replacement')
    expect(session.events).toHaveLength(2)

    const other = { ...baseWorkflow('Other'), id: MediaWorkflowId('workflow-other') }
    expect(() => ctx.canvas.replaceWorkflow(agent, workflowRef(replaced), other)).toThrow(
      expect.objectContaining({ code: 'CANVAS_WORKFLOW_ID_MISMATCH' }),
    )
    expect(session.events).toHaveLength(2)
  })

  it('selects an existing output candidate without changing workflow/run revisions or rerunning', async () => {
    const { ctx, agent, session } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    appendCurrentChange(session, currentWriterChange(runStartChange(created)))
    const running = ctx.canvas.get(agent)
    if (running === null) throw new Error('expected running Canvas')
    appendCurrentChange(session, currentWriterChange(runUpdateChange(running, 'completed')))
    const completed = ctx.canvas.get(agent)
    if (completed === null || completed.output === null) throw new Error('expected completed Canvas output')
    const output = completed.output
    const before = session.events.length

    const selected = ctx.canvas.selectOutput(agent, { runId: output.runId, assetIndex: 1 })
    expect(selected.output?.primaryAssetIndex).toBe(1)
    expect(selected.workflowRevision).toBe(completed.workflowRevision)
    expect(selected.runRevision).toBe(completed.runRevision)
    expect(session.events).toHaveLength(before + 1)

    const same = ctx.canvas.selectOutput(agent, { runId: output.runId, assetIndex: 1 })
    expect(same).toEqual(selected)
    expect(session.events).toHaveLength(before + 1)

    expect(() => ctx.canvas.selectOutput(agent, { runId: CanvasRunId('other-run'), assetIndex: 0 })).toThrow(
      expect.objectContaining({ code: 'CANVAS_OUTPUT_NOT_FOUND' }),
    )
    expect(() => ctx.canvas.selectOutput(agent, { runId: output.runId, assetIndex: 2 })).toThrow(
      expect.objectContaining({ code: 'CANVAS_INVALID_OUTPUT_SELECTION' }),
    )
  })

  it('uses WorkflowRef CAS for clear and refuses to orphan a non-terminal run', async () => {
    const { ctx, agent, session } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const stale = workflowRef(created)
    const edited = ctx.canvas.editWorkflow(agent, stale, [{ op: 'rename-workflow', name: 'new revision' }])

    expect(() => ctx.canvas.clear(agent, stale)).toThrow(
      expect.objectContaining({ code: 'CANVAS_STALE_WORKFLOW_REVISION' }),
    )

    appendCurrentChange(session, currentWriterChange(runStartChange(edited)))
    const running = ctx.canvas.get(agent)
    if (running === null) throw new Error('expected running Canvas')
    expect(() => ctx.canvas.clear(agent, workflowRef(running))).toThrow(
      expect.objectContaining({ code: 'CANVAS_INVALID_EDIT' }),
    )

    appendCurrentChange(session, currentWriterChange(runUpdateChange(running, 'completed')))
    const completed = ctx.canvas.get(agent)
    if (completed === null) throw new Error('expected completed Canvas')
    ctx.canvas.clear(agent, workflowRef(completed))
    expect(ctx.canvas.get(agent)).toBeNull()
    expect(foldCanvas(session.events)).toBeNull()
  })

  it('keeps cache unchanged when Session pre-commit dispatch vetoes the append', async () => {
    const { ctx, agent, session } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    const before = session.seq
    const dispose = ctx.on('internal/dispatch', (_mode, eventName, args) => {
      if (eventName !== 'session/event') return
      const [, event] = args as [Session, SessionEvent]
      if (event.type === 'canvas/change' && event.data.operation === 'workflow-edit') {
        throw new Error('test precommit veto')
      }
    })

    expect(() => ctx.canvas.editWorkflow(agent, workflowRef(created), [
      { op: 'rename-workflow', name: 'must not commit' },
    ])).toThrow('test precommit veto')
    dispose()

    expect(session.seq).toBe(before)
    expect(ctx.canvas.get(agent)).toEqual(created)
    expect(foldCanvas(session.events)).toEqual(created)
  })

  it('requires both the exact live Agent and its exact live SessionStore entry', async () => {
    const { ctx, agent } = await harness()
    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })

    const impostor = stubAgentForSession(agent.session).agent
    expect(() => ctx.canvas.get(impostor)).toThrow(CanvasServiceError)
    expect(() => ctx.canvas.get(impostor)).toThrow(HarnessError)
    expect(() => ctx.canvas.get(impostor)).toThrow(expect.objectContaining({ code: 'CANVAS_AGENT_NOT_LIVE' }))

    const detachedSession = Session.create(SessionId(`detached-${Math.random()}`))
    const detached = stubAgentForSession(detachedSession).agent
    ctx.agents.register(detached)
    expect(() => ctx.canvas.get(detached)).toThrow(
      expect.objectContaining({ code: 'CANVAS_AGENT_NOT_LIVE' }),
    )
    expect(ctx.canvas.get(agent)).toEqual(created)
  })
})
