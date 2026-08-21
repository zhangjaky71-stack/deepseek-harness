/**
 * Three-column shell frame, registered into the built-in 'root' slot (the web
 * shell renders only 'root'). Owns the grid tracks (sidebar | canvas |
 * conversation), the sidebar and conversation drag handles (pointer capture + rAF
 * throttle), the concession chain (columns.ts), and the child-slot render
 * decisions. The details surface remains mounted and overlays the conversation
 * column when a tool opens it. Pure component: everything arrives
 * through the three framework shares — zero cordis or framework imports,
 * zero self-made hooks.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { computeColumns, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT } from './columns.ts'
import {
  createCanvasHostInitMessage,
  INFINITE_CANVAS_ORIGIN,
  INFINITE_CANVAS_URL,
  isCanvasBridgeMessage,
  isTrustedCanvasMessage,
} from './canvas-bridge.ts'
import type { createLayoutStore } from './stores.ts'
import css from './AppFrame.module.css'

/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'conversation' | 'details' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createLayoutStore>>

type CanvasConnectionStatus = 'loading' | 'handshaking' | 'ready' | 'error'

/** Center column hosting the separately-run Infinite Canvas application. */
function CanvasColumn() {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const handshakeTimer = useRef<number | null>(null)
  const [status, setStatus] = useState<CanvasConnectionStatus>('loading')

  const clearHandshakeTimer = useCallback(() => {
    if (handshakeTimer.current === null) return
    window.clearTimeout(handshakeTimer.current)
    handshakeTimer.current = null
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      const frameWindow = frameRef.current?.contentWindow ?? null
      if (!isCanvasBridgeMessage(event.data) || !isTrustedCanvasMessage(event, frameWindow)) return
      clearHandshakeTimer()
      setStatus(event.data.type === 'canvas:ready' ? 'ready' : 'error')
    }

    window.addEventListener('message', onMessage)
    return () => {
      clearHandshakeTimer()
      window.removeEventListener('message', onMessage)
    }
  }, [clearHandshakeTimer])

  const onLoad = useCallback(() => {
    clearHandshakeTimer()
    setStatus('handshaking')
    const frameWindow = frameRef.current?.contentWindow
    if (frameWindow === undefined || frameWindow === null) {
      setStatus('error')
      return
    }

    frameWindow.postMessage(createCanvasHostInitMessage(), INFINITE_CANVAS_ORIGIN)
    handshakeTimer.current = window.setTimeout(() => {
      handshakeTimer.current = null
      setStatus(current => current === 'ready' ? current : 'error')
    }, 8000)
  }, [clearHandshakeTimer])

  return (
    <section
      className={css.canvasCol}
      aria-label="Infinite Canvas"
      aria-busy={status !== 'ready'}
      data-canvas-status={status}
    >
      <iframe
        ref={frameRef}
        className={css.canvasFrame}
        src={INFINITE_CANVAS_URL}
        title="Infinite Canvas"
        onLoad={onLoad}
      />
    </section>
  )
}

/** Conversation column grid item. */
function ConversationColumn(props: { children?: ReactNode }) {
  return <div className={css.conversationCol}>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 */
function DragHandle(props: { side: 'sidebar' | 'conversation'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

/** The three-column frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  actions,
  renderSlot,
}: AppFrameProps) {
  const panels = useStore(s => s)
  const detailsSession = useSessions((s) => {
    const current = s.current
    return current !== undefined && s.byId[current]?.blank === false ? current : undefined
  })
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  const lastSession = useRef(detailsSession)
  useLayoutEffect(() => {
    if (detailsSession === undefined) return
    if (lastSession.current !== undefined && lastSession.current !== detailsSession) {
      actions.closeDetails()
    }
    lastSession.current = detailsSession
  }, [actions, detailsSession])

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const width = el.getBoundingClientRect().width
        if (width > 0) setViewport(width)
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  // Narrow viewports auto-collapse the sidebar; the store mirror keeps
  // toggleSidebar's semantics right (narrow toggles flip the manual
  // re-expand override, stores.ts). Collapsed is decided here, so the
  // solver stays breakpoint-free: a narrow re-expand passes the preference
  // (or the default when the wide preference is closed) and the center
  // absorbs the squeeze.
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])
  const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
  const sidebarPreference = sidebarCollapsed
    ? 0
    : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  const cols = computeColumns(viewport, sidebarPreference, 0)
  const detailsOpen = detailsSession !== undefined && panels.details !== 0
  const colsRef = useRef(cols)
  colsRef.current = cols

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  const sidebarBase = useRef(0)
  const conversationBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onConversationStart = useCallback(() => { conversationBase.current = panels.conversation; setDragging(true) }, [panels.conversation])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onConversationDrag = useCallback((dx: number) => {
    actions.setConversation(conversationBase.current - dx)
  }, [actions])
  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{ gridTemplateColumns: `${cols.sidebar}px minmax(0, 1fr) ${panels.conversation}px` }}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-details-open={detailsOpen || undefined}
      data-dragging={dragging || undefined}
    >
      <div className={css.sidebarCol}>
        {/* Render-site slot call with live concession output: a closed
            sidebar keeps the mounted slot at the compact-rail width, and the
            component sees its rendered state as owner params decided here
            (collapsed follows the resolved rail, so a derived auto-collapse
            renders the rail UI too). */}
        {renderSlot('sidebar', {
          collapsed: sidebarCollapsed,
          width: cols.sidebar,
        })}
      </div>
      <>
        {/* Both column occupants stay at fixed tree positions from first
            paint — no loading gate: a bare status line reads worse than
            the shell's own pending rendering. The conversation
            is session-maybe; the strict details entry naturally renders
            empty while no session is current. */}
        <CanvasColumn />
        <ConversationColumn>{renderSlot('conversation', {})}</ConversationColumn>
      </>
      <div className={css.detailsOverlay} style={{ left: viewport - panels.conversation }}>
        {renderSlot('details', {})}
      </div>
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
      {/* The collapsed rail is fixed-width: no resize handle while closed. */}
      {!sidebarCollapsed && <DragHandle side="sidebar" left={cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
      <DragHandle side="conversation" left={viewport - panels.conversation} onStart={onConversationStart} onDrag={onConversationDrag} onEnd={onDragEnd} />
    </div>
  )
}
