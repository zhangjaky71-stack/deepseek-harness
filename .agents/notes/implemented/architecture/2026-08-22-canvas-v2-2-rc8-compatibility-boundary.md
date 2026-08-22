# Canvas V2.2 — rc.8 compatibility is not the same as an rc.8 repository sync

English | [中文](2026-08-22-canvas-v2-2-rc8-compatibility-boundary.zh.md)

## Decision

Canvas may be **compatible with** a newer Harness client contract while the private repository is **not yet mechanically synced** to that Harness release. These are separate engineering states and must never share the same completion label.

For the current `dsh@0.1.0-rc.8` target, the Canvas overlay has already adopted important rc.8 rules, but the repository still carries rc.7-era Web root ownership. N11.5 therefore remains `BLOCKED / REVIEW`.

## Evidence required for a full sync claim

A compatibility note or an ancestor branch named `sync/*` is not enough. A release may be called fully synced only when the actual tree proves the target ownership and package graph.

For rc.8, the minimum evidence includes:

- official target commit `141eb6fef83422698aef7a981029e843e8161534`;
- private pre-sync and post-sync commits;
- package/version graph aligned with the rc.8 target or an explicitly audited private-version policy;
- official `packages/client/ui-renderer` present in the private tree;
- React root owned by dynamic `ui-renderer`, exposed as `ctx.uiRenderer.mount(container)`;
- framework-free Web boot handing the container to `uiRenderer` after the client roster activates;
- build/tsconfig/bundle/lock/generated graph reconciled by the repository toolchain;
- REAL assembled boot and lifecycle evidence.

If any of those remain absent, the correct state is `PARTIAL BACKPORT`, `SYNC INCOMPLETE`, or `REVIEW`.

## Current private counter-evidence

The current private tree still exposes mechanically observable rc.7-era ownership:

- root `package.json` says `0.1.0-rc.7`;
- `packages/client/ui-renderer` is absent;
- `packages/client/web/src/boot.tsx` imports ReactDOM `createRoot()`;
- the Web boot owns `AppRoot` and a shell-owned `APP_SHELL_ID` assembly;
- the final app is produced through `appShell.renderApp()` rather than a dynamic `uiRenderer` mount service.

These facts are stronger than a historical branch name. They prevent a full rc.8 sync claim until the root ownership migration is actually performed.

## What the Canvas compatibility overlay already gets right

This blocked sync status does not invalidate the Canvas-level compatibility work already in the stack.

### Dynamic package boundary

`@deepseek-ai/dsh-client-ui-canvas/client` exposes only the Cordis loading face at runtime (`apply` and `inject`). Components, stores, and pure helpers remain package internals. Shared contracts are type-only.

### Product composition

Canvas contributes its product surface dynamically to generic `shell.main`. `ui-layout` merely renders that generic slot; it does not import Canvas or own Workflow, Run, Mode, Selection, Draft, or mutation state.

The old `conversation.view` ownership assumption is obsolete. Conversation/Composer remains independently owned by the Conversation domain and Canvas does not create a second Composer.

### Client state discipline

Mode and semantic selection remain stable browser-local observable sources because the prompt-preparation bridge reads the same values. Render code sees them through the reserved `hooks` compartment.

Editor Draft, save status, Undo/Redo, Clipboard, and transient layout positions are presentation-only and therefore use the slot-declared store. Durable Workflow truth stays in Session Projection.

### External authorities

Canvas does not create Browser-owned replacements for:

- Harness Settings;
- effective deployment capabilities;
- Media Node Registry / catalog revision;
- Session Projection / durable Canvas state.

Those authorities remain Host/framework owned.

## Root ownership is an architectural invariant, not a naming detail

The official rc.8 design deliberately moves React root ownership out of the Web boot kernel. This changes HMR/disposal responsibility:

```text
Web boot
  → activate dynamic roster
  → wait for uiRenderer service
  → uiRenderer.mount(container)
```

Because the renderer is a plugin, replacing/remounting that dependency can replace the application root through normal Cordis lifecycle. A private shell that still owns `createRoot()` has different lifecycle semantics even if every business plugin uses the same slot APIs.

That is why Canvas-level slot compatibility cannot stand in for repository-level root migration.

## Regression gates

N11.5 pins the parts of the overlay that are already correct:

- `/client` runtime exports are exactly `apply` / `inject`;
- Canvas is present exactly once in the dynamic Web roster;
- Canvas injects `shell.main`, not `conversation.view`;
- AppFrame renders `shell.main` generically and has no Canvas import/type dependency;
- built-client enable/disable/dispose behavior removes the product contribution with plugin lifetime;
- built-client Node Catalog fixtures use the current versioned `{ revision, entries }` DTO.

These tests protect the overlay while the broader upstream sync remains blocked.

## Rule for future upgrades

For rc.9 and later, maintain two explicit ledgers:

1. **Compatibility overlay ledger** — which new public APIs/lifecycle rules the Canvas packages already follow.
2. **Upstream sync ledger** — which official tree/package/root-owner changes are mechanically present in the private repository.

Do not promote the second ledger based on the first. This prevents future nodes from building on a release baseline that exists only in comments and adapter code.
