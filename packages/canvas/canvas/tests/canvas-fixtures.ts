import {
  CANVAS_CHANGE_VERSION,
  CanvasId,
  CanvasRunId,
  MediaWorkflowId,
  VideoAssetId,
  WorkflowEdgeId,
  WorkflowNodeId,
  createCanvasSnapshot,
  createMediaWorkflow,
} from '@deepseek-ai/dsh-canvas'
import type {
  CanvasChange,
  CanvasSnapshot,
  MediaWorkflow,
  WorkflowRef,
} from '@deepseek-ai/dsh-canvas'

export function baseWorkflow(name = 'Base'): MediaWorkflow {
  const prompt = WorkflowNodeId('prompt')
  const output = WorkflowNodeId('output')
  return createMediaWorkflow({
    id: MediaWorkflowId('workflow-main'),
    name,
    nodes: [
      { id: prompt, type: 'prompt', nodeVersion: 1, config: { text: 'make an image' } },
      { id: output, type: 'output', nodeVersion: 1, config: {} },
    ],
    edges: [{
      id: WorkflowEdgeId('prompt-output'),
      sourceNodeId: prompt,
      sourcePort: 'text',
      targetNodeId: output,
      targetPort: 'input',
    }],
    outputNodeIds: [output],
  })
}

export function workflowRef(canvas: CanvasSnapshot): WorkflowRef {
  if (canvas.workflow === null) throw new Error('test Canvas lacks workflow')
  return {
    canvasId: canvas.id,
    workflowId: canvas.workflow.id,
    workflowRevision: canvas.workflowRevision,
  }
}

export function createChange(
  id = CanvasId('canvas-fixture'),
  workflow = baseWorkflow(),
  at = 1_787_100_000_000,
): CanvasChange {
  return {
    kind: 'canvas/change',
    version: CANVAS_CHANGE_VERSION,
    operation: 'create',
    meta: { schemaVersion: 1 },
    canvas: createCanvasSnapshot({ id, workflow, createdAt: at }),
  }
}

export function runStartChange(canvas: CanvasSnapshot, runId = CanvasRunId('run-main')): CanvasChange {
  if (canvas.workflow === null) throw new Error('test Canvas lacks workflow')
  return {
    kind: 'canvas/change',
    version: CANVAS_CHANGE_VERSION,
    operation: 'run-start',
    meta: { schemaVersion: 1 },
    canvas: {
      ...canvas,
      runRevision: canvas.runRevision + 1,
      run: {
        id: runId,
        status: 'queued',
        workflowId: canvas.workflow.id,
        workflowRevision: canvas.workflowRevision,
        startedAt: canvas.updatedAt + 1,
      },
      updatedAt: canvas.updatedAt + 1,
    },
  }
}

export function runCompleteChange(canvas: CanvasSnapshot): CanvasChange {
  if (canvas.workflow === null || canvas.run === null) throw new Error('test Canvas lacks workflow/run')
  const first = {
    kind: 'video' as const,
    video: {
      assetId: VideoAssetId('video-a'),
      mediaType: 'video/mp4',
      bytes: 4096,
      width: 1280,
      height: 720,
      durationMs: 4000,
    },
  }
  const second = {
    kind: 'video' as const,
    video: {
      assetId: VideoAssetId('video-b'),
      mediaType: 'video/mp4',
      bytes: 8192,
      width: 1280,
      height: 720,
      durationMs: 4000,
    },
  }
  const finishedAt = canvas.updatedAt + 1
  return {
    kind: 'canvas/change',
    version: CANVAS_CHANGE_VERSION,
    operation: 'run-complete',
    meta: { schemaVersion: 1 },
    canvas: {
      ...canvas,
      runRevision: canvas.runRevision + 1,
      run: { ...canvas.run, status: 'completed', finishedAt },
      output: {
        runId: canvas.run.id,
        workflowId: canvas.workflow.id,
        workflowRevision: canvas.run.workflowRevision,
        assets: [first, second],
        primaryAssetIndex: 0,
      },
      updatedAt: finishedAt,
    },
  }
}
