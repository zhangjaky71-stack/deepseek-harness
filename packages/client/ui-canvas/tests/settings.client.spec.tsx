import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { CanvasFeatureConfig } from '@deepseek-ai/dsh-canvas/client'
import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { CanvasSettingsSection } from '../src/client/CanvasSettingsSection.tsx'

const t = ((key: string) => key) as never

function ready(overrides: Partial<SettingsScopeSnapshot<CanvasFeatureConfig>> = {}): SettingsScopeSnapshot<CanvasFeatureConfig> {
  return {
    status: 'ready',
    value: {
      canvas: { enabled: true },
      editor: { enabled: true },
      history: { enabled: true },
      video: { enabled: false },
      variants: { enabled: false },
      partialRun: { enabled: false },
      regionEdit: { enabled: false },
      providerFallback: { enabled: false },
    },
    base: undefined,
    user: undefined,
    revision: 1,
    writable: true,
    mode: 'host',
    ...overrides,
  }
}

function render(snapshot: SettingsScopeSnapshot<CanvasFeatureConfig>): string {
  const setFeature = vi.fn()
  const resetFeature = vi.fn()
  return renderToStaticMarkup(<CanvasSettingsSection
    t={t}
    useSettings={((selector: (value: SettingsScopeSnapshot<CanvasFeatureConfig>) => unknown) => selector(snapshot)) as never}
    setFeature={setFeature}
    resetFeature={resetFeature}
  />)
}

describe('Canvas deployment settings section', () => {
  it('renders all eight feature switches and makes restart semantics explicit', () => {
    const html = render(ready())
    for (const feature of ['canvas', 'editor', 'history', 'video', 'variants', 'partialRun', 'regionEdit', 'providerFallback']) {
      expect(html).toContain(`settings.feature.${feature}.title`)
    }
    expect(html).toContain('settings.restartBadge')
    expect(html).toContain('settings.restartNotice')
    expect(html).toContain('type="checkbox"')
  })

  it('marks raw user-layer overrides without confusing them with resolved values', () => {
    const html = render(ready({
      user: { video: { enabled: false } },
      base: { video: { enabled: false }, editor: { enabled: true } },
    }))
    expect(html).toContain('settings.overridden')
    expect(html).toContain('settings.inherited')
    expect(html).toContain('settings.reset')
  })

  it('is read-only when the Host settings provider is not writable', () => {
    const html = render(ready({ writable: false }))
    expect(html).toContain('settings.readOnly')
    expect(html).toContain('disabled=""')
  })

  it('renders an unavailable state for remote/missing Host settings without hiding Canvas capability copy', () => {
    const html = render({
      status: 'unavailable',
      value: undefined,
      base: undefined,
      user: undefined,
      revision: undefined,
      writable: false,
      mode: 'memory',
    })
    expect(html).toContain('settings.title')
    expect(html).toContain('settings.unavailable')
    expect(html).not.toContain('settings.restartNotice')
  })
})