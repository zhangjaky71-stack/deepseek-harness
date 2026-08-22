// @vitest-environment jsdom

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import type { CanvasCapabilities, CanvasFeatureConfig } from '@deepseek-ai/dsh-canvas/client'
import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { CanvasSettingsSectionInjected } from '../src/client/CanvasSettingsSection.tsx'
import type { CanvasViewInjected } from '../src/types.ts'
import { apply, inject } from '../src/client/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  while (contexts.length > 0) await contexts.pop()!.dispose()
})

function capabilities(enabled: boolean): CanvasCapabilities {
  return {
    canvas: { enabled },
    editor: { enabled },
    history: { enabled },
    video: { enabled: false },
    variants: { enabled: false },
    partialRun: { enabled: false },
    regionEdit: { enabled: false },
    providerFallback: { enabled: false },
  }
}

async function harness(
  get: () => Promise<unknown>,
  listNodes: () => Promise<unknown> = async () => ({ ok: true, value: [] }),
) {
  const ctx = new Context()
  contexts.push(ctx)
  const slots = new SlotRegistry(ctx)
  slots.register({
    name: 'root',
    children: { 'shell.main': { kind: 'single', scope: 'session' } },
  }, () => null)
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ ids: [], current: undefined }), subscribe: () => () => {} },
    binding: () => ({ session: {} }),
  } as never)
  ctx.provide('conversation', { registerPromptPreparation: () => () => {} } as never)
  ctx.provide('locale', {
    register: () => () => {},
    bind: () => ((key: string) => key),
  } as never)
  // Deliberately no remote.canvas service: projected Minimal state must not be
  // hidden just because mutation transport is absent.
  ctx.provide('remote', { canvasFeatures: { get, listNodes } } as never)
  ctx.provide('remote.canvasFeatures', {} as never)
  const fiber = ctx.plugin({ inject, apply })
  await fiber.await()
  return { ctx, slots, fiber }
}

async function settingsHarness(get: () => Promise<unknown>) {
  const ctx = new Context()
  contexts.push(ctx)
  const slots = new SlotRegistry(ctx)
  slots.register({
    name: 'root',
    children: {
      'shell.main': { kind: 'single', scope: 'session' },
      'settings.section': { kind: 'list', scope: 'root' },
    },
  }, () => null)
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ ids: [], current: undefined }), subscribe: () => () => {} },
    binding: () => ({ session: {} }),
  } as never)
  ctx.provide('conversation', { registerPromptPreparation: () => () => {} } as never)
  ctx.provide('locale', {
    register: () => () => {},
    bind: () => ((key: string) => key),
  } as never)
  const snapshot: SettingsScopeSnapshot<CanvasFeatureConfig> = {
    status: 'ready',
    value: { canvas: { enabled: false }, editor: { enabled: true } },
    base: { canvas: { enabled: true } },
    user: { canvas: { enabled: false } },
    revision: 2,
    writable: true,
    mode: 'host',
  }
  const set = vi.fn(() => Promise.resolve())
  const unset = vi.fn(() => Promise.resolve())
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set,
    unset,
  }
  ctx.provide('settingsScope', { bind: () => scope } as never)
  ctx.provide('connection', {} as never)
  ctx.provide('remote', {
    canvasFeatures: { get, listNodes: async () => ({ ok: true, value: [] }) },
  } as never)
  ctx.provide('remote.canvasFeatures', {} as never)
  const fiber = ctx.plugin({ inject, apply })
  await fiber.await()
  return { ctx, slots, fiber, set, unset, scope }
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('ui-canvas Host capability gate', () => {
  it('registers the Canvas main surface without a mutation Remote only when Host capabilities enable it', async () => {
    const enabled = await harness(async () => ({ ok: true, value: capabilities(true) }))
    await settle()
    expect(enabled.slots.entries('shell.main')).toHaveLength(1)
    await enabled.fiber.dispose()
    expect(enabled.slots.entries('shell.main')).toHaveLength(0)

    const disabled = await harness(async () => ({ ok: true, value: capabilities(false) }))
    await settle()
    expect(disabled.slots.entries('shell.main')).toHaveLength(0)
  })

  it('keeps the Canvas settings section available while the current Host capability is disabled', async () => {
    const { slots, set, unset, fiber } = await settingsHarness(async () => ({ ok: true, value: capabilities(false) }))
    await settle()
    expect(slots.entries('shell.main')).toHaveLength(0)
    const entry = slots.entries('settings.section')[0]
    expect(entry?.options).toMatchObject({ id: 'canvas', order: 20 })
    const injected = (entry!.inject as () => CanvasSettingsSectionInjected)()
    injected.setFeature('canvas', true)
    injected.resetFeature('editor')
    expect(set).toHaveBeenCalledWith('canvas', { enabled: true })
    expect(unset).toHaveBeenCalledWith('editor')

    await fiber.dispose()
    expect(slots.entries('settings.section')).toHaveLength(0)
  })

  it('keeps Minimal available when the optional Editor catalog fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { slots } = await harness(
      async () => ({ ok: true, value: capabilities(true) }),
      async () => ({ ok: false, error: { code: 'CATALOG_FAILED', message: 'offline' } }),
    )
    await settle()
    const entry = slots.entries('shell.main')[0]
    expect(entry).toBeDefined()
    const injected = (entry!.inject as (sessionId: never) => CanvasViewInjected)('session-a' as never)
    expect(injected.editorReady).toBe(false)
    expect(injected.nodeCatalog).toEqual([])
    expect(error).toHaveBeenCalledOnce()
  })

  it('fails closed when capability discovery returns a business error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { slots } = await harness(async () => ({
      ok: false,
      error: { code: 'FEATURE_LOOKUP_FAILED', message: 'not available' },
    }))
    await settle()
    expect(slots.entries('shell.main')).toHaveLength(0)
    expect(error).toHaveBeenCalledOnce()
  })

  it('does not register late when the plugin is disposed before discovery resolves', async () => {
    let resolveGet: ((value: unknown) => void) | undefined
    const pending = new Promise<unknown>((resolve) => { resolveGet = resolve })
    const { slots, fiber } = await harness(async () => await pending)
    await fiber.dispose()
    resolveGet?.({ ok: true, value: capabilities(true) })
    await settle()
    expect(slots.entries('shell.main')).toHaveLength(0)
  })
})