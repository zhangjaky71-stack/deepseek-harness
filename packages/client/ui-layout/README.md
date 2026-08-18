# @deepseek-ai/dsh-client-ui-layout

English | [中文](README.zh.md)

Shell plugin for the three-column AppFrame: the workspace sidebar, an Infinite Canvas pane, and the conversation sidebar. The canvas is an iframe for the independently run `apps/infinite-canvas` service at `http://127.0.0.1:3000/`. Tool details stay mounted and overlay the conversation sidebar when opened. Both sidebars have horizontal resize controls; the workspace sidebar retains its 56px collapsed rail. The plugin also projects resolved `ctx.theme` snapshots onto the document.

AppFrame declares `sidebar`, `conversation`, `details`, and `shell.overlay` below the runtime-owned `root` slot. The conversation owner share is empty; the sidebar owner share contains `collapsed` and `width`. Registrants obtain business data from standard hooks and actions from their own inject faces.

The `/client` exports are the plugin body (`apply` and `inject`), `LayoutController`, and the owner-share interfaces. AppFrame and the transient layout store remain package-internal.

## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Canvas lifecycle is separate** — the middle pane remains unavailable until Infinite Canvas listens on `127.0.0.1:3000`; this package does not start, configure, or proxy that service.
- **Panel geometry is transient** — reloading restores the sidebar default and closes the details overlay; selecting a different Session also closes the overlay.
