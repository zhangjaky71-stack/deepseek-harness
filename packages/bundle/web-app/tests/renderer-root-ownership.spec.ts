import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(path), 'utf8')
}

describe('Web renderer root ownership', () => {
  it('keeps the Web kernel framework-free and hands mounting to uiRenderer', () => {
    const boot = source('packages/client/web/src/boot.ts')
    expect(boot).toContain('scope.uiRenderer.mount(this.container)')
    expect(boot).not.toContain("from 'react'")
    expect(boot).not.toContain("from 'react-dom/client'")
    expect(boot).not.toContain('createRoot(')
    expect(boot).not.toContain('hydrateRoot(')
    expect(boot).not.toContain('AppRoot')
    expect(boot).not.toContain('appShell')
    expect(boot).not.toContain('APP_SHELL_ID')
  })

  it('keeps React root creation inside the dynamic ui-renderer package', () => {
    const renderer = source('packages/client/ui-renderer/src/client/index.ts')
    expect(renderer).toContain('createRoot')
    expect(renderer).toContain('hydrateRoot')
    expect(renderer).toContain("ctx.reflect.provide('uiRenderer'")
    expect(renderer).toContain('ctx.slots.install(createSlotRenderer())')
  })

  it('includes ui-renderer in the default Web package graph and browser roster', () => {
    const manifest = source('packages/bundle/web-app/package.json')
    const patch = source('packages/bundle/web-app/cordis.patch.yml')
    const aggregate = source('tsconfig.client.json')
    expect(manifest).toContain('"@deepseek-ai/dsh-client-ui-renderer": "workspace:^"')
    expect(patch).toContain("- id: ui-renderer\n      name: '@deepseek-ai/dsh-client-ui-renderer'")
    expect(aggregate).toContain('{ "path": "./packages/client/ui-renderer" }')
  })
})
