/** Browser UI renderer: slot adapter plus dynamic React-root ownership. */
import { createElement, useLayoutEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import type { Context } from '@deepseek-ai/cordis'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { createSlotRenderer } from './scoped-slots.tsx'
import { buildRenderApp } from './app.tsx'

export type UseSession<Snap extends object = object> = SnapshotSelectorHook<Snap>
export type {
  ChainRenderOpts, HostObservable, RenderOpts, SessionProvideInfo, SnapshotSelectorHook,
  SlotRenderer, SlotRendererHost, StoreInstanceLike,
} from '@deepseek-ai/dsh-client-ui-slots'
export type { SessionProviderProps } from './session-provider.tsx'

export interface UiRendererService {
  mount: (container: HTMLElement) => () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context { uiRenderer: UiRendererService }
}

export const inject = ['slots', 'sessions']

interface BootSnapshot { className: string; html: string }
function BootHandoff(props: { app: () => ReactNode; boot: BootSnapshot }): ReactNode {
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => { setReady(true) }, [])
  if (ready) return props.app()
  return createElement('div', {
    className: props.boot.className,
    'data-dsh-boot': '',
    dangerouslySetInnerHTML: { __html: props.boot.html },
  })
}
function mountApp(container: HTMLElement, app: () => ReactNode): Root {
  const boot = container.querySelector<HTMLElement>(':scope > [data-dsh-boot]')
  if (boot !== null) {
    return hydrateRoot(container, createElement(BootHandoff, {
      app,
      boot: { className: boot.className, html: boot.innerHTML },
    }))
  }
  const root = createRoot(container)
  flushSync(() => { root.render(app()) })
  return root
}
export function apply(ctx: Context): void {
  ctx.slots.install(createSlotRenderer())
  ctx.reflect.provide('uiRenderer', {
    mount: (container: HTMLElement): (() => void) => {
      const root = mountApp(container, buildRenderApp({ ctx }))
      return () => { root.unmount() }
    },
  })
}
