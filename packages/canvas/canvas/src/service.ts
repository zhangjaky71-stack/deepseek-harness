/** Public CanvasService surface: durable Canvas domain plus request-local interaction staging. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote } from '@deepseek-ai/dsh-typert-protocol'
import { CanvasInteractionBridge } from './interaction-bridge.ts'
import type {
  CanvasInteractionDiscardReceipt,
  CanvasInteractionStageReceipt,
  DiscardCanvasInteractionRequest,
  StageCanvasInteractionRequest,
} from './interaction-types.ts'
import { CanvasService as DurableCanvasService } from './runtime.ts'
import type { CanvasServiceConfig } from './types.ts'

/**
 * Existing Session-backed Canvas service with the N08 exact-turn interaction
 * bridge layered onto the same Typert `canvas` namespace.
 */
export class CanvasService extends DurableCanvasService {
  private readonly interactionBridge: CanvasInteractionBridge

  constructor(ctx: Context, config: CanvasServiceConfig = {}) {
    super(ctx, config)
    this.interactionBridge = new CanvasInteractionBridge(ctx, this)
  }

  /** Browser send-time stage bound to the exact upcoming ordinary prompt rpc id. */
  @Remote('stageInteraction')
  remoteExportStageInteraction(
    agent: Agent,
    request: StageCanvasInteractionRequest,
  ): CanvasInteractionStageReceipt {
    return this.interactionBridge.stage(agent, request)
  }

  /** Best-effort rollback when the correlated ordinary prompt was not admitted. */
  @Remote('discardInteraction')
  remoteExportDiscardInteraction(
    agent: Agent,
    request: DiscardCanvasInteractionRequest,
  ): CanvasInteractionDiscardReceipt {
    return this.interactionBridge.discard(agent, request)
  }
}

export default CanvasService
