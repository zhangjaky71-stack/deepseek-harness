import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkflowNodeId } from '@deepseek-ai/dsh-canvas'
import {
  admitCanvasRun,
  type CanvasRunAdmissionAuthorities,
  type CanvasRunAdmissionGovernance,
} from '../src/index.ts'
import {
  admissionHarness,
  disposeContexts,
  generateNodeId,
  imageModelRequest,
  workflowWithUnscheduledVideo,
} from './admission-fixture.ts'

afterEach(disposeContexts)

function authoritiesWith(
  authorities: CanvasRunAdmissionAuthorities,
  overrides: Partial<CanvasRunAdmissionGovernance>,
): CanvasRunAdmissionAuthorities {
  return {
    ...authorities,
    governance: { ...authorities.governance, ...overrides },
  }
}

describe('admitCanvasRun', () => {
  it('returns immutable execution evidence only after every governance gate succeeds', async () => {
    const { authorities, request } = await admissionHarness()
    const order: string[] = []
    const release = vi.fn()
    const governed = authoritiesWith(authorities, {
      cost: { estimate: () => { order.push('cost'); return { kind: 'estimated', currency: 'USD', amountMinor: 25 } } },
      quota: { check: () => { order.push('quota'); return { allowed: true } } },
      approval: { request: () => { order.push('approval'); return { outcome: 'approved' } } },
      idempotency: { check: () => { order.push('idempotency'); return { status: 'new' } } },
      concurrency: {
        acquire: async () => { order.push('concurrency'); return { release } },
      },
    })

    const permit = await admitCanvasRun(request, governed)
    expect(order).toEqual(['cost', 'quota', 'approval', 'idempotency', 'concurrency'])
    expect(permit.evidence.plan.scheduledNodeIds).toEqual([
      WorkflowNodeId('prompt'),
      generateNodeId,
      WorkflowNodeId('output'),
    ])
    expect(permit.evidence.executionIdentities.get(generateNodeId)).toEqual({
      key: 'admission-provider/image@1',
    })
    expect(permit.evidence.costEstimate).toEqual({ kind: 'estimated', currency: 'USD', amountMinor: 25 })
    expect(Object.isFrozen(permit.evidence.workflow)).toBe(true)
    expect(Object.isFrozen(permit.evidence.workflow.nodes)).toBe(true)
    permit.lease.release()
    expect(release).toHaveBeenCalledOnce()
  })

  it('denies browser execution at N04 authorization before cost or concurrency policy runs', async () => {
    const { authorities, request } = await admissionHarness({ authorizationActors: ['agent'] })
    const cost = vi.fn(() => ({ kind: 'not-applicable' as const }))
    const acquire = vi.fn(async () => ({ release() {} }))
    await expect(admitCanvasRun(request, authoritiesWith(authorities, {
      cost: { estimate: cost },
      concurrency: { acquire },
    }))).rejects.toMatchObject({ code: 'CANVAS_RUN_PERMISSION_DENIED' })
    expect(cost).not.toHaveBeenCalled()
    expect(acquire).not.toHaveBeenCalled()
  })

  it('rejects a disabled Canvas before model resolution', async () => {
    const { authorities, request } = await admissionHarness({ canvasEnabled: false })
    await expect(admitCanvasRun(request, authorities)).rejects.toMatchObject({
      code: 'CANVAS_RUN_FEATURE_DISABLED',
    })
  })

  it('applies node features only to the scheduled partial scope', async () => {
    const { authorities, request } = await admissionHarness({ videoEnabled: false, partialRunEnabled: true })
    const permit = await admitCanvasRun({
      ...request,
      workflow: workflowWithUnscheduledVideo(),
      selection: { mode: 'selected', nodeIds: [generateNodeId] },
    }, authorities)
    expect(permit.evidence.plan.scheduledNodeIds).toEqual([
      WorkflowNodeId('prompt'),
      generateNodeId,
    ])
    permit.lease.release()
  })

  it('rejects a scheduled disabled Video node even when the DAG is otherwise valid', async () => {
    const { authorities, request } = await admissionHarness({ videoEnabled: false })
    await expect(admitCanvasRun({
      ...request,
      workflow: workflowWithUnscheduledVideo(),
    }, authorities)).rejects.toMatchObject({ code: 'CANVAS_RUN_FEATURE_DISABLED' })
  })

  it('requires partialRun capability for non-full scheduling', async () => {
    const { authorities, request } = await admissionHarness({ partialRunEnabled: false })
    await expect(admitCanvasRun({
      ...request,
      selection: { mode: 'selected', nodeIds: [generateNodeId] },
    }, authorities)).rejects.toMatchObject({ code: 'CANVAS_RUN_FEATURE_DISABLED' })
  })

  it('rejects a statically invalid DAG before model resolution', async () => {
    const { authorities, request } = await admissionHarness()
    const workflow = request.workflow
    await expect(admitCanvasRun({
      ...request,
      workflow: { ...workflow, edges: workflow.edges.filter(edge => edge.id !== 'e-prompt') },
    }, authorities)).rejects.toMatchObject({ code: 'CANVAS_RUN_INVALID_WORKFLOW' })
  })

  it('requires one matching model request for every scheduled Provider-backed node', async () => {
    const { authorities, request } = await admissionHarness()
    await expect(admitCanvasRun({
      ...request,
      modelRequests: new Map(),
    }, authorities)).rejects.toMatchObject({ code: 'CANVAS_RUN_MODEL_REQUEST_MISSING' })

    const invalid = imageModelRequest()
    await expect(admitCanvasRun({
      ...request,
      modelRequests: new Map([[generateNodeId, {
        ...invalid,
        requirements: { capability: 'text-to-video' },
      }]]),
    }, authorities)).rejects.toMatchObject({ code: 'CANVAS_RUN_MODEL_REQUEST_INVALID' })
  })

  it('rejects model requests for unscheduled/non-Provider nodes', async () => {
    const { authorities, request } = await admissionHarness()
    await expect(admitCanvasRun({
      ...request,
      modelRequests: new Map([
        ...request.modelRequests,
        [WorkflowNodeId('prompt'), imageModelRequest()],
      ]),
    }, authorities)).rejects.toMatchObject({ code: 'CANVAS_RUN_MODEL_REQUEST_INVALID' })
  })

  it('gates fallback mode with the N09 providerFallback capability', async () => {
    const { authorities, request } = await admissionHarness({ providerFallbackEnabled: false })
    await expect(admitCanvasRun({
      ...request,
      modelRequests: new Map([[generateNodeId, imageModelRequest('fallback')]]),
    }, authorities)).rejects.toMatchObject({ code: 'CANVAS_RUN_FEATURE_DISABLED' })
  })

  it('fails before governance when the resolved Provider runtime is unavailable', async () => {
    const { authorities, request } = await admissionHarness({ registerRuntime: false })
    const cost = vi.fn(() => ({ kind: 'not-applicable' as const }))
    await expect(admitCanvasRun(request, authoritiesWith(authorities, {
      cost: { estimate: cost },
    }))).rejects.toMatchObject({ code: 'CANVAS_RUN_PROVIDER_UNAVAILABLE' })
    expect(cost).not.toHaveBeenCalled()
  })

  it('fails closed when cost cannot be estimated instead of treating unknown cost as zero', async () => {
    const { authorities, request } = await admissionHarness()
    const quota = vi.fn(() => ({ allowed: true as const }))
    await expect(admitCanvasRun(request, authoritiesWith(authorities, {
      cost: { estimate: () => ({ kind: 'unavailable' }) },
      quota: { check: quota },
    }))).rejects.toMatchObject({ code: 'CANVAS_RUN_COST_UNAVAILABLE' })
    expect(quota).not.toHaveBeenCalled()
  })

  it('accepts explicit non-billable cost without inventing a currency', async () => {
    const { authorities, request } = await admissionHarness()
    const permit = await admitCanvasRun(request, authoritiesWith(authorities, {
      cost: { estimate: () => ({ kind: 'not-applicable' }) },
    }))
    expect(permit.evidence.costEstimate).toEqual({ kind: 'not-applicable' })
    permit.lease.release()
  })

  it('fails quota, approval, and idempotency decisions before concurrency acquisition', async () => {
    const { authorities, request } = await admissionHarness()
    const acquire = vi.fn(async () => ({ release() {} }))

    await expect(admitCanvasRun(request, authoritiesWith(authorities, {
      quota: { check: () => ({ allowed: false }) },
      concurrency: { acquire },
    }))).rejects.toMatchObject({ code: 'CANVAS_RUN_QUOTA_DENIED' })

    await expect(admitCanvasRun(request, authoritiesWith(authorities, {
      approval: { request: () => ({ outcome: 'denied' }) },
      concurrency: { acquire },
    }))).rejects.toMatchObject({ code: 'CANVAS_RUN_APPROVAL_DENIED' })

    await expect(admitCanvasRun(request, authoritiesWith(authorities, {
      approval: { request: () => ({ outcome: 'unavailable' }) },
      concurrency: { acquire },
    }))).rejects.toMatchObject({ code: 'CANVAS_RUN_APPROVAL_UNAVAILABLE' })

    await expect(admitCanvasRun(request, authoritiesWith(authorities, {
      idempotency: { check: () => ({ status: 'duplicate' }) },
      concurrency: { acquire },
    }))).rejects.toMatchObject({ code: 'CANVAS_RUN_DUPLICATE_REQUEST' })

    expect(acquire).not.toHaveBeenCalled()
  })
})
