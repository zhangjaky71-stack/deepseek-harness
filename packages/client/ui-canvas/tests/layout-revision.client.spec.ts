import { describe, expect, it } from 'vitest'
import type { CanvasId, MediaWorkflowId } from '@deepseek-ai/dsh-canvas/client'
import {
  reconcileLayoutReceipt,
  reconcileProjectedLayoutRevision,
  type CanvasLayoutRevisionClock,
} from '../src/client/layout-revision.ts'

const canvasA = 'canvas-a' as CanvasId
const canvasB = 'canvas-b' as CanvasId
const workflowA = 'workflow-a' as MediaWorkflowId
const workflowB = 'workflow-b' as MediaWorkflowId

function clock(revision: number): CanvasLayoutRevisionClock {
  return { canvasId: canvasA, workflowId: workflowA, revision }
}

describe('Canvas layout revision clock', () => {
  it('never regresses a receipt-advanced token from a stale same-generation Projection', () => {
    const committed = reconcileLayoutReceipt(clock(3), canvasA, workflowA, 4)
    expect(committed.revision).toBe(4)
    expect(reconcileProjectedLayoutRevision(committed, canvasA, workflowA, 3)).toBe(committed)
    expect(reconcileProjectedLayoutRevision(committed, canvasA, workflowA, 5)).toEqual({
      canvasId: canvasA,
      workflowId: workflowA,
      revision: 5,
    })
  })

  it('resets on Canvas or workflow generation change', () => {
    expect(reconcileProjectedLayoutRevision(clock(8), canvasB, workflowA, 0)).toEqual({
      canvasId: canvasB,
      workflowId: workflowA,
      revision: 0,
    })
    expect(reconcileProjectedLayoutRevision(clock(8), canvasA, workflowB, 2)).toEqual({
      canvasId: canvasA,
      workflowId: workflowB,
      revision: 2,
    })
  })

  it('ignores a late receipt from an obsolete generation', () => {
    const current = reconcileProjectedLayoutRevision(clock(6), canvasB, workflowB, 1)
    expect(reconcileLayoutReceipt(current, canvasA, workflowA, 7)).toBe(current)
    expect(reconcileLayoutReceipt(current, canvasB, workflowB, 2)).toEqual({
      canvasId: canvasB,
      workflowId: workflowB,
      revision: 2,
    })
  })
})
