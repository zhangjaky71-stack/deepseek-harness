import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  SettingsProvider,
  settingsNamespace,
  type SettingsNamespace,
} from '@deepseek-ai/dsh-settings'
import CanvasFeatureService, { CANVAS_FEATURE_SETTINGS_NAMESPACE } from '../src/feature-service.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.dispose()
})

class MemorySettings extends SettingsProvider {
  readonly doc: Record<string, unknown>

  constructor(ctx: Context, config: { doc?: Record<string, unknown> } = {}) {
    super(ctx)
    this.doc = structuredClone(config.doc ?? {})
  }

  get writable(): boolean { return true }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

const CANVAS_NS = settingsNamespace(CANVAS_FEATURE_SETTINGS_NAMESPACE)

describe('CanvasFeatureService Harness settings integration', () => {
  it('uses entry config without requiring a settings provider', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(CanvasFeatureService, { video: { enabled: true } })
    expect(ctx.canvasFeatures.capabilities.video.enabled).toBe(true)
    expect(ctx.get('settings')).toBeUndefined()
  })

  it('registers one restart-applied canvas namespace and samples the resolved user layer at activation', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(MemorySettings, {
      doc: {
        canvas: {
          canvas: { enabled: true },
          editor: { enabled: false },
          video: { enabled: true },
        },
      },
    })
    await ctx.plugin(CanvasFeatureService, {
      editor: { enabled: true },
      video: { enabled: false },
    })

    expect(ctx.canvasFeatures.capabilities.editor.enabled).toBe(false)
    expect(ctx.canvasFeatures.capabilities.video.enabled).toBe(true)

    const descriptor = ctx.settings.describe({ redactSecrets: true })
      .find(entry => entry.ns === CANVAS_NS)
    expect(descriptor).toMatchObject({
      ns: 'canvas',
      applies: 'restart',
      value: {
        canvas: { enabled: true },
        editor: { enabled: false },
        video: { enabled: true },
      },
      secrets: [],
    })
  })

  it('persists settings edits without mutating the active deployment until the feature service is remounted', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(MemorySettings, {
      doc: { canvas: { video: { enabled: true } } },
    })
    const first = ctx.plugin(CanvasFeatureService, { video: { enabled: false } })
    await first
    expect(ctx.canvasFeatures.capabilities.video.enabled).toBe(true)

    await ctx.settings.update(CANVAS_NS, { video: { enabled: false } })
    expect(ctx.canvasFeatures.capabilities.video.enabled).toBe(true)

    await first.dispose()
    expect(ctx.settings.get(CANVAS_NS)).toBeUndefined()

    const second = ctx.plugin(CanvasFeatureService, { video: { enabled: true } })
    await second
    expect(ctx.canvasFeatures.capabilities.video.enabled).toBe(false)
  })

  it('removes the settings namespace with the feature owner fiber', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(MemorySettings)
    const feature = ctx.plugin(CanvasFeatureService)
    await feature
    expect(ctx.settings.get(CANVAS_NS)).toBeDefined()

    await feature.dispose()
    expect(ctx.settings.get(CANVAS_NS)).toBeUndefined()
  })
})