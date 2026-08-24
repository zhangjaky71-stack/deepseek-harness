# Agent Note: Canvas V2.2 rc.8 compatibility boundary

Status: implemented

English | [中文](2026-08-22-canvas-v2-2-rc8-compatibility-boundary.zh.md)

## Problem

Canvas may be **compatible with** a newer Harness client contract while the private repository is **not yet mechanically synced** to that Harness release. Treating those states as equivalent would let later nodes rely on a release baseline that is present only in adapters, comments, or historical branch ancestry rather than in the actual package graph and runtime ownership.

For the current `dsh@0.1.0-rc.8` target, the Canvas overlay has already adopted important rc.8 rules, while the private repository still carries observable rc.7-era Web root ownership. N11.5 therefore needs an explicit boundary between a compatible product overlay and a completed repository-wide upstream sync. Until the full-tree, root-owner, package-graph, and REAL composition evidence exists, the node remains `BLOCKED / REVIEW`.

## Decision

Maintain two independent engineering states for Harness upgrades:

1. **Compatibility overlay** — which newer public APIs, plugin seams, lifecycle rules, and authority boundaries the Canvas packages already obey.
2. **Repository upstream sync** — which official package, version, root-owner, bootstrap, build, lock/generated, and runtime-composition changes are mechanically present in the private tree.

The compatibility overlay may be implemented and regression-tested without promoting the repository sync state. A release is considered fully synced only when the actual private tree and runnable evidence satisfy the upstream completion gates. Historical `sync/*` ancestry and Canvas-local API compatibility are evidence inputs, not completion proof.

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

For rc.9 and later, maintain the compatibility-overlay ledger and the upstream-sync ledger independently. Do not promote the upstream-sync ledger based on the compatibility-overlay ledger. This prevents future nodes from building on a release baseline that exists only in comments and adapter code.

## Alternatives considered

**Treat Canvas-level rc.8 compatibility as proof that the repository is rc.8-synced.** Rejected because the private tree can obey newer Canvas slot/export contracts while still retaining older Web root ownership, package versions, bootstrap flow, and generated/lock state.

**Use historical `sync/*` branch ancestry as the completion signal.** Rejected because ancestry proves that synchronization work occurred, not that the final private tree still contains every official ownership and package-graph change after later overlays and remediations.

**Keep the rc.7 Web-owned React root while documenting it as an acceptable private variation.** Rejected for the N11.5 acceptance baseline because root ownership changes plugin disposal, HMR, remount, and failure semantics. A different owner is an architectural difference, not a cosmetic private customization.

**Delay compatibility regression tests until the full repository sync is complete.** Rejected because the already-correct Canvas overlay needs protection while the broader migration proceeds. The tests are useful evidence as long as they are not misrepresented as full-sync evidence.

## Consequences

The boundary lets Canvas compatibility improvements land and remain regression-protected without creating a false release-completion claim. It also gives later nodes a mechanically checkable rule: N12 may be inspected or prepared while N11.5 is blocked, but it cannot treat rc.8 as an accepted runtime baseline until the repository-wide completion gates pass.

The cost is that N11.5 can legitimately have implemented compatibility decisions while still remaining blocked as a node. Validation records must therefore say exactly which ledger passed. The repository must continue carrying the broader renderer/root/package/REAL-composition work instead of collapsing that work into a green Canvas-local test suite.

## Maintenance checklist

When changing Harness compatibility or upstream-sync status, verify all of the following:

1. Is the claimed upstream target identified by an exact official commit/version?
2. Are compatibility-overlay facts kept separate from repository-wide sync facts?
3. Does the private tree contain the target root owner and bootstrap ownership rather than merely equivalent-looking adapters?
4. Are package/version/build/lock/generated differences explicitly reconciled or explicitly blocking?
5. Is Canvas still dynamically composed through generic public seams without Web/ui-layout product special cases?
6. Do Host Settings, capabilities, node catalog, and Session Projection remain authoritative?
7. Is there runnable build/test evidence for the exact candidate head?
8. Is there REAL assembled boot/lifecycle evidence before the upstream-sync ledger is promoted?

If any repository-wide completion gate is missing, keep N11.5 `BLOCKED / REVIEW` even when the Canvas compatibility overlay itself is green.
