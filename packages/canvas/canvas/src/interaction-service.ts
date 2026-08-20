/** Request-local Canvas interaction staging service (`canvasInteraction` Typert namespace). */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { CanvasInteractionBridge } from './interaction-bridge.ts'
import type {
  CanvasInteractionDiscardReceipt,
  CanvasInteractionStageReceipt,
  DiscardCanvasInteractionRequest,
  StageCanvasInteractionRequest,
} from './interaction-types.ts'
import type {} from './feature-service.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    canvasInteraction: CanvasInteractionService
  }
}

/**
 * Process-local Browser→Agent correlation service. Durable Canvas authority
 * remains `ctx.canvas`; this service only stages one-shot turn context.
 */
export class CanvasInteractionService extends TypertRemoteService {
  static inject = ['agents', 'canvas', 'canvasFeatures']

  private readonly bridge: CanvasInteractionBridge

  constructor(ctx: Context) {
    super(ctx, 'canvasInteraction')
    this.bridge = new CanvasInteractionBridge(ctx, ctx.canvas)
  }

  /** Stage one send-time Browser snapshot against the exact upcoming ordinary prompt rpc id. */
  @Remote('stage')
  remoteExportStage(
    agent: Agent,
    request: StageCanvasInteractionRequest,
  ): CanvasInteractionStageReceipt {
    this.ctx.canvasFeatures.assertEnabled('canvas')
    if (request.context.region !== undefined) this.ctx.canvasFeatures.assertEnabled('regionEdit')
    return this.bridge.stage(agent, request)
  }

  /** Roll back an unbound stage when the corresponding ordinary prompt was not admitted. */
  @Remote('discard')
  remoteExportDiscard(
    agent: Agent,
    request: DiscardCanvasInteractionRequest,
  ): CanvasInteractionDiscardReceipt {
    return this.bridge.discard(agent, request)
  }
}

export default CanvasInteractionService
