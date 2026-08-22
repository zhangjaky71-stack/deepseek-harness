import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MediaWorkflowId,
  WorkflowEdgeId,
  WorkflowNodeId,
  type CanvasImageAssetRef,
  type MediaWorkflow,
} from '@deepseek-ai/dsh-canvas'
import type { MediaNodeExecutionOutput } from '@deepseek-ai/dsh-media-workflow/engine'
import { admitCanvasRun } from '../src/index.ts'
import {
  admissionHarness,
  disposeContexts,
} from './admission-fixture.ts'

afterEach(disposeContexts)

const imageEdgeId = WorkflowEdgeId('boundary-image')
const promptEdgeId = WorkflowEdgeId('boundary-prompt')
const editNodeId = WorkflowNodeId('edit')

function editWorkflow(): MediaWorkflow {
  return {
    id: MediaWorkflowId('workflow-boundary'),
    schemaVersion: 1,
    name: 'Boundary edit',
    nodes: [
      { id: WorkflowNodeId('asset'), type: 'asset.input', nodeVersion: 1, config: {} },
      { id: WorkflowNodeId('prompt-boundary'), type: 'prompt', nodeVersion: 1, config: { text: 'edit' } },
      { id: editNodeId, type: 'image.edit', nodeVersion: 1, config: {} },
    ],
    edges: [
      { id: imageEdgeId, sourceNodeId: WorkflowNodeId('asset'), sourcePort: 'image', targetNodeId: editNodeId, targetPort: 'image' },
      { id: promptEdgeId, sourceNodeId: WorkflowNodeId('prompt-boundary'), sourcePort: 'text', targetNodeId: editNodeId, targetPort: 'prompt' },
    ],
    outputNodeIds: [editNodeId],
  }
}

const asset: CanvasImageAssetRef = {
  kind: 'image',
  image: {
    attachmentId: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    mediaType: 'image/png',
    bytes: 8,
    width: 1,
    height: 1,
  },
}

const imageBoundary: MediaNodeExecutionOutput = {
  value: { kind: 'image', asset },
  fingerprint: 'asset:image',
}
const promptBoundary: MediaNodeExecutionOutput = {
  value: { kind: 'text', text: 'edit this' },
  fingerprint: 'text:edit',
}

describe('N15 partial boundary preflight', () => {
  it('requires every scheduler boundary input before model or Provider work', async () => {
    const { authorities, request } = await admissionHarness()
    await expect(admitCanvasRun({
      ...request,
      workflow: editWorkflow(),
      selection: { mode: 'from-node', nodeId: editNodeId },
      boundaryInputs: new Map([[imageEdgeId, imageBoundary]]),
      modelRequests: new Map(),
    }, authorities)).rejects.toMatchObject({ code: 'CANVAS_RUN_BOUNDARY_INPUT_MISSING' })
  })

  it('rejects a boundary value whose runtime kind does not match the exact target port', async () => {
    const { authorities, request } = await admissionHarness()
    await expect(admitCanvasRun({
      ...request,
      workflow: editWorkflow(),
      selection: { mode: 'from-node', nodeId: editNodeId },
      boundaryInputs: new Map([
        [imageEdgeId, promptBoundary],
        [promptEdgeId, promptBoundary],
      ]),
      modelRequests: new Map(),
    }, authorities)).rejects.toMatchObject({ code: 'CANVAS_RUN_INVALID_WORKFLOW' })
  })

  it('checks every pre-existing boundary asset through the N17/N21 availability seam', async () => {
    const { authorities, request } = await admissionHarness()
    const isAvailable = vi.fn(() => false)
    await expect(admitCanvasRun({
      ...request,
      workflow: editWorkflow(),
      selection: { mode: 'from-node', nodeId: editNodeId },
      boundaryInputs: new Map([
        [imageEdgeId, imageBoundary],
        [promptEdgeId, promptBoundary],
      ]),
      modelRequests: new Map(),
    }, {
      ...authorities,
      governance: {
        ...authorities.governance,
        assets: { isAvailable },
      },
    })).rejects.toMatchObject({ code: 'CANVAS_RUN_ASSET_UNAVAILABLE' })
    expect(isAvailable).toHaveBeenCalledWith(asset)
  })
})
