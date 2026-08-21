/** Pure durable command types for the Canvas bridge. @module @deepseek-ai/dsh-tool-canvas/types */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque identity used to deduplicate one Agent-issued Canvas command end to end. */
export type CanvasCommandId = Branded<'CanvasCommandId'>

/** Brand an already-generated opaque command id. */
export function CanvasCommandId(value: string): CanvasCommandId {
  return value as CanvasCommandId
}

/** The Phase 1 image-generation command understood by the Infinite Canvas bridge. */
export interface CanvasGenerateCommand {
  readonly commandId: CanvasCommandId
  readonly action: 'generate'
  readonly prompt: string
  /** Active Canvas chooses/creates a generator; node targets reuse an existing generator node. */
  readonly target: { readonly kind: 'active' } | { readonly kind: 'node'; readonly nodeId: string }
  /** Optional Canvas model id. The Canvas remains authoritative for provider/model validation. */
  readonly model?: string
}

/** Durable command vocabulary. Later phases extend this union with edit/video/workflow actions. */
export type CanvasCommand = CanvasGenerateCommand

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Agent-issued command for the separately-run Infinite Canvas application.
     * Log-only orchestration state: it never enters model history or the ordered conversation surface.
     */
    'canvas/command': { command: CanvasCommand }
  }
}
