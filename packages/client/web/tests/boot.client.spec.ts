// @vitest-environment jsdom
import type { Context } from '@deepseek-ai/cordis'
import type {
  ClientPluginHandoff, DshWindow, WebBootEntry,
} from '@deepseek-ai/dsh-client-modules/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppWebEntry } from '../src/boot.ts'

const MODULES_ID = '@deepseek-ai/dsh-client-modules'
const win = globalThis as DshWindow

afterEach(() => {
  vi.restoreAllMocks()
  delete win.__DSH_BOOT__
  delete win.__ModuleLoader__
  delete win.__DSH_MODULES__
  document.body.innerHTML = ''
})

async function expectBootFailure(setup: () => void, message: string): Promise<void> {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const container = document.createElement('div')
  document.body.append(container)
  setup()
  const entry = new AppWebEntry(container)
  await entry.run()
  expect(container.textContent).toContain(message)
  expect(error).toHaveBeenCalledOnce()
  await entry.dispose()
}

describe('rc7-compatible bootstrap failure rendering', () => {
  it('renders a malformed boot manifest on the framework-free page', async () => {
    await expectBootFailure(
      () => { delete win.__DSH_BOOT__ },
      'window.__DSH_BOOT__ is missing or not an object',
    )
  })

  it('renders module-system construction failures', async () => {
    await expectBootFailure(() => {
      const duplicate = { id: 'duplicate', url: '/duplicate/client.js', rev: '1' }
      win.__DSH_BOOT__ = { rev: 'graph', entries: [duplicate, duplicate] }
    }, 'duplicate graph entry "duplicate"')
  })
})

describe('dynamic renderer handoff', () => {
  it('mounts only after the complete plugin graph activates', async () => {
    const events: string[] = []
    const container = document.createElement('div')
    document.body.append(container)
    const entries: WebBootEntry[] = [
      { id: 'consumer', url: '/consumer.js', rev: '1' },
      { id: MODULES_ID, url: '/modules.js', rev: '1' },
      { id: 'renderer', url: '/renderer.js', rev: '1' },
    ]
    win.__DSH_BOOT__ = { rev: 'graph', entries }
    const registrations = new Map<string, ClientPluginHandoff>([
      ['/consumer.js', {
        id: 'consumer',
        factory: () => ({
          inject: ['modules'],
          apply: (ctx: Context) => {
            expect(ctx.modules).toBeDefined()
            events.push('consumer')
          },
        }),
      }],
      ['/renderer.js', {
        id: 'renderer',
        factory: () => ({
          apply: (ctx: Context) => {
            ctx.reflect.provide('uiRenderer', {
              mount: (element: HTMLElement) => {
                events.push('mount')
                element.textContent = 'mounted'
                return () => { events.push('unmount') }
              },
            })
          },
        }),
      }],
    ])
    const entry = new AppWebEntry(container, {
      loadBundle: async (url) => {
        const registration = registrations.get(url)
        if (registration === undefined) throw new Error(`missing fixture registration ${url}`)
        win.__ModuleLoader__!.load(registration)
      },
    })

    await entry.run()

    expect(events).toEqual(['consumer', 'mount'])
    expect(container.textContent).toBe('mounted')
    await entry.dispose()
    expect(events).toEqual(['consumer', 'mount', 'unmount'])
  })

  it('fails loud when the activated graph does not provide uiRenderer', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = document.createElement('div')
    document.body.append(container)
    win.__DSH_BOOT__ = {
      rev: 'graph',
      entries: [{ id: MODULES_ID, url: '/modules.js', rev: '1' }],
    }
    const entry = new AppWebEntry(container)

    await entry.run()

    expect(container.textContent).toContain('uiRenderer service missing after client graph activation')
    expect(container.textContent).toContain('Failed to load plugins')
    expect(error).toHaveBeenCalledOnce()
    await entry.dispose()
  })
})
