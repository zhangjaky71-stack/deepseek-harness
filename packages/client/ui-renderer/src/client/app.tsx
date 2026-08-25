/** Real-UI assembly closure. The whole layout tree hangs from the built-in `root` slot. */
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { bindSnapshotSelector } from './bind.ts'
import { DocumentTitle } from './DocumentTitle.tsx'
import type {} from '@deepseek-ai/dsh-client-runtime/client'

/** Dependencies required to assemble the browser application root. */
export interface AssemblyDeps {
  /** Browser Cordis context containing sessions and the installed slot renderer. */
  readonly ctx: Context
}

/**
 * Build the React application closure rendered by the dynamic root owner.
 * @param deps - Renderer assembly dependencies.
 * @returns A closure that projects the selected-session title and root slot.
 */
export function buildRenderApp(deps: AssemblyDeps): () => ReactNode {
  const { ctx } = deps
  const sessions = ctx.get('sessions')
  if (sessions === undefined) throw new Error('ui renderer: sessions service unavailable')
  const useSessions = bindSnapshotSelector(sessions.list)
  const SessionDocumentTitle = (): ReactNode => {
    const title = useSessions((state) => {
      const id = state.current
      return id === undefined ? undefined : state.byId[id]?.title
    })
    return <DocumentTitle {...title === undefined ? {} : { title }} />
  }
  return () => (
    <>
      <SessionDocumentTitle />
      {ctx.slots.renderSlot('root', {})}
    </>
  )
}
