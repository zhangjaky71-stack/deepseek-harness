export const INFINITE_CANVAS_URL = 'http://127.0.0.1:3000/'
export const INFINITE_CANVAS_ORIGIN = new URL(INFINITE_CANVAS_URL).origin

export const CANVAS_BRIDGE_CHANNEL = 'deepseek-harness:infinite-canvas'
export const CANVAS_BRIDGE_VERSION = 1 as const

export type CanvasGenerateCommand = {
  commandId: string
  action: 'generate'
  prompt: string
  target: { kind: 'active' } | { kind: 'node'; nodeId: string }
  model?: string
}

export type CanvasCommandDelivery = {
  sessionId: string
  seq: number
  command: CanvasGenerateCommand
}

export type CanvasBridgeHostInitMessage = {
  channel: typeof CANVAS_BRIDGE_CHANNEL
  version: typeof CANVAS_BRIDGE_VERSION
  type: 'host:init'
  payload: {
    host: 'deepseek-harness'
  }
}

export type CanvasBridgeHostCommandMessage = {
  channel: typeof CANVAS_BRIDGE_CHANNEL
  version: typeof CANVAS_BRIDGE_VERSION
  type: 'host:command'
  payload: {
    command: CanvasGenerateCommand
  }
}

export type CanvasBridgeReadyMessage = {
  channel: typeof CANVAS_BRIDGE_CHANNEL
  version: typeof CANVAS_BRIDGE_VERSION
  type: 'canvas:ready'
  payload?: {
    app?: string
  }
}

export type CanvasBridgeErrorMessage = {
  channel: typeof CANVAS_BRIDGE_CHANNEL
  version: typeof CANVAS_BRIDGE_VERSION
  type: 'canvas:error'
  payload: {
    message: string
  }
}

export type CanvasBridgeCommandResultMessage = {
  channel: typeof CANVAS_BRIDGE_CHANNEL
  version: typeof CANVAS_BRIDGE_VERSION
  type: 'canvas:command-result'
  payload: {
    commandId: string
    ok: boolean
    nodeId?: string
    error?: string
  }
}

export type CanvasBridgeMessage =
  | CanvasBridgeReadyMessage
  | CanvasBridgeErrorMessage
  | CanvasBridgeCommandResultMessage

export function createCanvasHostInitMessage(): CanvasBridgeHostInitMessage {
  return {
    channel: CANVAS_BRIDGE_CHANNEL,
    version: CANVAS_BRIDGE_VERSION,
    type: 'host:init',
    payload: { host: 'deepseek-harness' },
  }
}

export function createCanvasHostCommandMessage(command: CanvasGenerateCommand): CanvasBridgeHostCommandMessage {
  return {
    channel: CANVAS_BRIDGE_CHANNEL,
    version: CANVAS_BRIDGE_VERSION,
    type: 'host:command',
    payload: { command },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCanvasTarget(value: unknown): value is CanvasGenerateCommand['target'] {
  if (!isRecord(value)) return false
  if (value.kind === 'active') return true
  return value.kind === 'node' && typeof value.nodeId === 'string' && value.nodeId.length > 0
}

export function isCanvasGenerateCommand(value: unknown): value is CanvasGenerateCommand {
  return isRecord(value)
    && typeof value.commandId === 'string'
    && value.commandId.length > 0
    && value.action === 'generate'
    && typeof value.prompt === 'string'
    && value.prompt.trim().length > 0
    && isCanvasTarget(value.target)
    && (value.model === undefined || typeof value.model === 'string')
}

/**
 * Parse the plugin-extended durable event at the client boundary without
 * importing the model-facing tool package into a browser plugin.
 */
export function parseCanvasCommandEvent(sessionId: string, value: unknown): CanvasCommandDelivery | null {
  if (!isRecord(value) || value.type !== 'canvas/command') return null
  if (!Number.isSafeInteger(value.seq) || (value.seq as number) < 0) return null
  if (!isRecord(value.data) || !isCanvasGenerateCommand(value.data.command)) return null
  return {
    sessionId,
    seq: value.seq as number,
    command: value.data.command,
  }
}

function isReadyPayload(value: unknown): value is CanvasBridgeReadyMessage['payload'] {
  return value === undefined
    || (isRecord(value) && (value.app === undefined || typeof value.app === 'string'))
}

function isCommandResultPayload(value: unknown): value is CanvasBridgeCommandResultMessage['payload'] {
  return isRecord(value)
    && typeof value.commandId === 'string'
    && typeof value.ok === 'boolean'
    && (value.nodeId === undefined || typeof value.nodeId === 'string')
    && (value.error === undefined || typeof value.error === 'string')
}

export function isCanvasBridgeMessage(value: unknown): value is CanvasBridgeMessage {
  if (!isRecord(value)) return false
  if (value.channel !== CANVAS_BRIDGE_CHANNEL || value.version !== CANVAS_BRIDGE_VERSION) return false

  if (value.type === 'canvas:ready') {
    return isReadyPayload(value.payload)
  }

  if (value.type === 'canvas:error') {
    return isRecord(value.payload) && typeof value.payload.message === 'string'
  }

  if (value.type === 'canvas:command-result') {
    return isCommandResultPayload(value.payload)
  }

  return false
}

export function isTrustedCanvasMessage(
  event: MessageEvent<unknown>,
  frameWindow: Window | null,
  expectedOrigin = INFINITE_CANVAS_ORIGIN,
): boolean {
  return frameWindow !== null
    && event.source === frameWindow
    && event.origin === expectedOrigin
    && isCanvasBridgeMessage(event.data)
}