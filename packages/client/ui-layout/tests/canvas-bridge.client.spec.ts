import { describe, expect, it } from 'vitest'
import {
  CANVAS_BRIDGE_CHANNEL,
  CANVAS_BRIDGE_VERSION,
  createCanvasHostCommandMessage,
  createCanvasHostInitMessage,
  INFINITE_CANVAS_ORIGIN,
  isCanvasBridgeMessage,
  isTrustedCanvasMessage,
  parseCanvasCommandEvent,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/canvas-bridge.ts'

const command = {
  commandId: 'canvas_1',
  action: 'generate' as const,
  prompt: 'A quiet neon city at dawn',
  target: { kind: 'active' as const },
}

const readyMessage = {
  channel: CANVAS_BRIDGE_CHANNEL,
  version: CANVAS_BRIDGE_VERSION,
  type: 'canvas:ready',
  payload: { app: 'infinite-canvas' },
} as const

describe('Infinite Canvas bridge contract', () => {
  it('creates versioned bootstrap and command messages', () => {
    expect(createCanvasHostInitMessage()).toEqual({
      channel: 'deepseek-harness:infinite-canvas',
      version: 1,
      type: 'host:init',
      payload: { host: 'deepseek-harness' },
    })
    expect(createCanvasHostCommandMessage(command)).toEqual({
      channel: 'deepseek-harness:infinite-canvas',
      version: 1,
      type: 'host:command',
      payload: { command },
    })
  })

  it('parses only a well-formed durable canvas command event', () => {
    expect(parseCanvasCommandEvent('session-1', {
      type: 'canvas/command',
      seq: 12,
      time: 123,
      data: { command },
    })).toEqual({ sessionId: 'session-1', seq: 12, command })

    expect(parseCanvasCommandEvent('session-1', {
      type: 'canvas/command', seq: 12, data: { command: { ...command, prompt: '   ' } },
    })).toBeNull()
    expect(parseCanvasCommandEvent('session-1', {
      type: 'canvas/command', seq: 12, data: { command: { ...command, target: { kind: 'node', nodeId: '' } } },
    })).toBeNull()
    expect(parseCanvasCommandEvent('session-1', {
      type: 'canvas/command', seq: -1, data: { command },
    })).toBeNull()
    expect(parseCanvasCommandEvent('session-1', { type: 'tool/result', seq: 12, data: {} })).toBeNull()
  })

  it('accepts only supported canvas response shapes', () => {
    expect(isCanvasBridgeMessage(readyMessage)).toBe(true)
    expect(isCanvasBridgeMessage({
      channel: CANVAS_BRIDGE_CHANNEL,
      version: CANVAS_BRIDGE_VERSION,
      type: 'canvas:error',
      payload: { message: 'boot failed' },
    })).toBe(true)
    expect(isCanvasBridgeMessage({
      channel: CANVAS_BRIDGE_CHANNEL,
      version: CANVAS_BRIDGE_VERSION,
      type: 'canvas:command-result',
      payload: { commandId: 'canvas_1', ok: true, nodeId: 'gen-1' },
    })).toBe(true)

    expect(isCanvasBridgeMessage({ ...readyMessage, version: 2 })).toBe(false)
    expect(isCanvasBridgeMessage({ ...readyMessage, channel: 'other' })).toBe(false)
    expect(isCanvasBridgeMessage({ ...readyMessage, type: 'host:init' })).toBe(false)
    expect(isCanvasBridgeMessage({
      channel: CANVAS_BRIDGE_CHANNEL,
      version: CANVAS_BRIDGE_VERSION,
      type: 'canvas:ready',
      payload: { app: 42 },
    })).toBe(false)
    expect(isCanvasBridgeMessage({
      channel: CANVAS_BRIDGE_CHANNEL,
      version: CANVAS_BRIDGE_VERSION,
      type: 'canvas:command-result',
      payload: { commandId: 'canvas_1', ok: 'yes' },
    })).toBe(false)
    expect(isCanvasBridgeMessage({
      channel: CANVAS_BRIDGE_CHANNEL,
      version: CANVAS_BRIDGE_VERSION,
      type: 'canvas:error',
      payload: {},
    })).toBe(false)
    expect(isCanvasBridgeMessage(null)).toBe(false)
  })

  it('requires both the target iframe window and exact canvas origin', () => {
    const frameWindow = {} as Window
    const otherWindow = {} as Window
    const event = {
      source: frameWindow,
      origin: INFINITE_CANVAS_ORIGIN,
      data: readyMessage,
    } as unknown as MessageEvent<unknown>

    expect(isTrustedCanvasMessage(event, frameWindow)).toBe(true)
    expect(isTrustedCanvasMessage({ ...event, source: otherWindow } as MessageEvent<unknown>, frameWindow)).toBe(false)
    expect(isTrustedCanvasMessage({ ...event, origin: 'http://localhost:3000' } as MessageEvent<unknown>, frameWindow)).toBe(false)
    expect(isTrustedCanvasMessage({ ...event, data: { ...readyMessage, version: 2 } } as MessageEvent<unknown>, frameWindow)).toBe(false)
    expect(isTrustedCanvasMessage(event, null)).toBe(false)
  })
})