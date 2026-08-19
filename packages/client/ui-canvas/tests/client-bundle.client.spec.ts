// @vitest-environment jsdom
/** Built client artifact smoke: the Canvas bundle registers exactly one conversation view. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'

const PLUGIN_ID = '@deepseek-ai/dsh-client-ui-canvas'
interface Handoff { id: string; factory: (require: (spec: string) => unknown) => Record<string, unknown> }
type Win = { __ModuleLoader__?: { load(h: Handoff): void } }

function readBundle(): string | undefined {
  try {
    return readFileSync(resolve('packages/client/ui-canvas/lib/client.js'), 'utf8')
  } catch {
    return undefined
  }
}

afterEach(() => {
  delete (window as Win).__ModuleLoader__
  for (const el of document.querySelectorAll('style')) el.remove()
})

describe('ui-canvas built client artifact', () => {
  const code = readBundle()

  async function loadArtifact() {
    let handoff: Handoff | undefined
    ;(window as Win).__ModuleLoader__ = { load: h => { handoff = h } }
    // Deliberate built-bundle fixture execution in the window scope.
    // oxlint-disable-next-line typescript/no-implied-eval, typescript/no-unsafe-call
    new Function(code!)()
    expect(handoff).toBeDefined()
    const modules = new Map<string, unknown>([
      ['react', await import('react')],
      ['react/jsx-runtime', await import('react/jsx-runtime')],
      ['react-dom', await import('react-dom')],
      ['@deepseek-ai/dsh-client-runtime/client', await import('@deepseek-ai/dsh-client-runtime/client')],
    ])
    const exports = handoff!.factory(spec => {
      if (!modules.has(spec)) throw new Error(`unexpected require: ${spec}`)
      return modules.get(spec)
    })
    return { handoff: handoff!, exports }
  }

  it.skipIf(code === undefined)('hands off with the manifest id and expected service injection', async () => {
    const { handoff, exports } = await loadArtifact()
    expect(handoff.id).toBe(PLUGIN_ID)
    expect(exports.apply).toBeTypeOf('function')
    expect(exports.inject).toEqual(['slots', 'sessions', 'locale'])
  })

  it.skipIf(code === undefined)('registers only the Canvas view and withdraws it on disposal', async () => {
    const { exports } = await loadArtifact()
    const ctx = new Context()
    const slots = new SlotRegistry(ctx)
    slots.register({
      name: 'root',
      children: {
        'conversation.view': { kind: 'list', scope: 'session' },
        'conversation.composer': { kind: 'chain', scope: 'session' },
      },
    }, (_p: { renderSlot?: unknown }) => null)
    ctx.provide('sessions', { binding: () => ({ session: {} }) } as never)
    ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
    ctx.provide('remote', { $on: () => () => {} } as never)
    ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    const locale = await import('@deepseek-ai/dsh-client-locale/client')
    ctx.plugin({ inject: [...locale.inject], apply: locale.apply })

    const beforeComposer = slots.entries('conversation.composer').length
    const fiber = ctx.plugin(exports as { apply: (ctx: Context) => void })
    await fiber.await()
    expect(slots.entries('conversation.view').map(entry => entry.options.id)).toEqual(['canvas'])
    expect(slots.entries('conversation.composer')).toHaveLength(beforeComposer)
    await fiber.dispose()
    expect(slots.entries('conversation.view')).toHaveLength(0)
  })

  it.skipIf(code === undefined)('injects plugin-tagged CSS', async () => {
    await loadArtifact()
    expect(document.querySelectorAll(`style[data-plugin=${JSON.stringify(PLUGIN_ID)}]`).length).toBeGreaterThan(0)
  })
})
