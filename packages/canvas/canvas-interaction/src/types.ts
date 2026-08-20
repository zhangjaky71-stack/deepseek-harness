/** Request-local Canvas interaction bridge vocabulary. Types only. */

import type { CanvasInteractionContext } from '@deepseek-ai/dsh-canvas/client'

/** Browser request to stage one detached interaction snapshot against an ordinary prompt rpc id. */
export interface StageCanvasInteractionRequest {
  readonly rpcId: string
  readonly context: CanvasInteractionContext
}

/** Successful process-local stage receipt. */
export interface CanvasInteractionStageReceipt {
  readonly staged: true
  readonly expiresAt: number
}

/** Browser rollback request used only when the corresponding ordinary prompt was not admitted. */
export interface DiscardCanvasInteractionRequest {
  readonly rpcId: string
}

/** Idempotent rollback result. */
export interface CanvasInteractionDiscardReceipt {
  readonly discarded: boolean
}

/** Host bridge configuration. */
export interface CanvasInteractionConfig {
  /** TTL for a staged rpc id before its ordinary prompt reaches the Agent inbox. */
  readonly stageTtlMs?: number
}
