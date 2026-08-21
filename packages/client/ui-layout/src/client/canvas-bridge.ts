export const INFINITE_CANVAS_URL = 'http://127.0.0.1:3000/'
export const INFINITE_CANVAS_ORIGIN = new URL(INFINITE_CANVAS_URL).origin

export const CANVAS_BRIDGE_CHANNEL = 'deepseek-harness:infinite-canvas'
export const CANVAS_BRIDGE_VERSION = 1 as const

export type CanvasBridgeHostInitMessage = {
  channel: typeof CANVAS_BRIDGE_CHANNEL
  version: typeof CANVAS_BRIDGE_VERSION
  type: 'host:init'
  payload: {
    host: 'deepseek-harness'
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

export type CanvasBridgeMessage = CanvasBridgeReadyMessage | CanvasBridgeErrorMessage

export function createCanvasHostInitMessage(): CanvasBridgeHostInitMessage {
  return {
    channel: CANVAS_BRIDGE_CHANNEL,
    version: CANVAS_BRIDGE_VERSION,
    type: 'host:init',
    payload: { host: 'deepseek-harness' },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isReadyPayload(value: unknown): value is CanvasBridgeReadyMessage['payload'] {
  return value === undefined
    || (isRecord(value) && (value.app === undefined || typeof value.app === 'string'))
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
