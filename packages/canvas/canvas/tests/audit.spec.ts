import { describe, expect, it } from 'vitest'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import {
  CanvasId,
  CanvasRunId,
  VideoAssetId,
  assertCanvasDurableAuditSafe,
  assertCanvasSnapshot,
  createCanvasSnapshot,
} from '@deepseek-ai/dsh-canvas'
import type { CanvasAssetRef, CanvasSnapshot } from '@deepseek-ai/dsh-canvas'
import { baseWorkflow } from './canvas-fixtures.ts'

function completedCanvas(asset: CanvasAssetRef): CanvasSnapshot {
  const workflow = baseWorkflow()
  const created = createCanvasSnapshot({
    id: CanvasId('canvas-audit-assets'),
    workflow,
    createdAt: 1,
  })
  const runId = CanvasRunId('run-audit-assets')
  const completed: CanvasSnapshot = {
    ...created,
    runRevision: 1,
    run: {
      id: runId,
      status: 'completed',
      workflowId: workflow.id,
      workflowRevision: created.workflowRevision,
      startedAt: 1,
      finishedAt: 2,
    },
    output: {
      runId,
      workflowId: workflow.id,
      workflowRevision: created.workflowRevision,
      assets: [asset],
      primaryAssetIndex: 0,
    },
    updatedAt: 2,
  }
  assertCanvasSnapshot(completed)
  return completed
}

describe('Canvas durable audit asset references', () => {
  it('rejects URL-shaped image attachment ids without echoing the reference', () => {
    const signedUrl = 'https://storage.example.test/image.png?signature=redacted'
    const canvas = completedCanvas({
      kind: 'image',
      image: {
        attachmentId: AttachmentId(signedUrl),
        mediaType: 'image/png',
        bytes: 1,
        width: 1,
        height: 1,
      },
    })

    let thrown: unknown
    try {
      assertCanvasDurableAuditSafe(canvas)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    expect(String((thrown as Error).message)).not.toContain(signedUrl)
  })

  it('rejects URL-shaped video asset ids while allowing opaque storage ids', () => {
    const urlCanvas = completedCanvas({
      kind: 'video',
      video: {
        assetId: VideoAssetId('https://video.example.test/object?token=redacted'),
        mediaType: 'video/mp4',
        bytes: 1,
      },
    })
    expect(() => assertCanvasDurableAuditSafe(urlCanvas)).toThrow()

    const opaqueCanvas = completedCanvas({
      kind: 'video',
      video: {
        assetId: VideoAssetId('video-object-01HZX8M4K3'),
        mediaType: 'video/mp4',
        bytes: 1,
      },
    })
    expect(() => assertCanvasDurableAuditSafe(opaqueCanvas)).not.toThrow()
  })
})
