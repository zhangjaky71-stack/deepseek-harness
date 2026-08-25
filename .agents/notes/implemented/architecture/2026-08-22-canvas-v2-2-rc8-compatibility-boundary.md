# Agent Note: Canvas V2.2 rc.8 compatibility boundary

Status: implemented

English | [中文](2026-08-22-canvas-v2-2-rc8-compatibility-boundary.zh.md)

## Problem

Canvas can obey a newer Harness client contract while the private repository is still not mechanically synchronized to that release. Conflating those states would let downstream nodes treat adapters, historical sync ancestry, or one repaired ownership seam as proof of a release-wide runtime baseline.

The validated compatibility overlay now sits on the final N11 editor baseline. This renderer-root remediation also closes two concrete rc.8 ownership gaps: dynamic `ui-renderer` owns the React application root, and the Web kernel consumes the rc.8-style `window.__ModuleLoader__` queue/create facade. Those improvements are real, but release-wide version/package/build/lock/generated reconciliation and exact-head REAL assembled boot evidence are still incomplete. N11.5 therefore remains `BLOCKED / REVIEW` until the upstream-sync ledger is complete.

## Decision

Maintain two independent engineering states for Harness upgrades:

1. **Compatibility overlay** — newer public APIs, plugin seams, lifecycle rules, and Canvas authority boundaries already obeyed by the private product stack.
2. **Repository upstream sync** — official package, version, root-owner, bootstrap, build, lock/generated, and runtime-composition changes mechanically present and validated in the private tree.

The renderer/root and module-bootstrap remediation advances the second ledger but does not by itself complete it. Historical `sync/*` ancestry and green Canvas-local tests remain evidence inputs rather than release-completion proof.

Canvas may be **compatible with** a newer Harness client contract while the private repository is **not yet mechanically synced** to that Harness release. These are separate engineering states and must never share the same completion label.

For the current `dsh@0.1.0-rc.8` target, N11.5 has now remediated the two previously concrete Web-client ownership gaps: the dynamic `ui-renderer` owns the React application root, and the Web kernel consumes the rc.8-style `window.__ModuleLoader__` queue/create facade instead of constructing a private module system. N11.5 nevertheless remains `BLOCKED / REVIEW` because release-wide version/package/build/lock/generated reconciliation and REAL assembled validation are still incomplete.

## Evidence required for a full sync claim

A compatibility note or an ancestor branch named `sync/*` is not enough. A release may be called fully synced only when the actual tree proves the target ownership and package graph.

For rc.8, the minimum evidence includes:

- official target commit `141eb6fef83422698aef7a981029e843e8161534`;
- private pre-sync and post-sync commits;
- package/version graph aligned with the rc.8 target or an explicitly audited private-version policy;
- official `packages/client/ui-renderer` present in the private tree;
- React root owned by dynamic `ui-renderer`, exposed as `ctx.uiRenderer.mount(container)`;
- framework-free Web boot handing the container to `uiRenderer` after the client roster activates;
- rc.8 module bootstrap ownership: Host-installed `__ModuleLoader__` queue, parser preloads, `create()`, then live registration;
- build/tsconfig/bundle/lock/generated graph reconciled by the repository toolchain;
- REAL assembled boot and lifecycle evidence.

If any required repository-wide evidence remains absent, the correct state is `PARTIAL BACKPORT`, `SYNC INCOMPLETE`, or `REVIEW`.

## Ownership remediation completed in N11.5

The previous counter-evidence around React-root and bootstrap ownership is no longer true on the current remediation branch.

### Dynamic renderer owns the application root

`packages/client/ui-renderer` now exists as the dynamic browser renderer package. It owns `createRoot` / `hydrateRoot`, installs the React slot renderer, assembles the root slot, projects the durable session title, exposes `ctx.uiRenderer.mount(container)`, and returns the application-root unmount disposer.

`packages/client/web` no longer owns `AppRoot`, `app-shell`, or the final React root. Its boot path is framework-free and performs the handoff only after the client graph settles. A missing `uiRenderer` fails loud on the boot failure surface instead of waiting forever.

### rc.8 module bootstrap ownership is restored

The client-module protocol now follows the rc.8 queue/create model:

```text
Host index transform
  → installs window.__ModuleLoader__ in queue mode
  → parser-preloads modules + runtime bundles
  → injects window.__DSH_BOOT__
  → Web kernel calls __ModuleLoader__.create(...)
  → module system drains queued registrations
  → facade switches to live registration
```

The old private `window.__DSH_MODULES__` adoption seam and shell-side static `MODULES_ID` registration are removed. The rc.8 `external` module-graph contract, `/client` normalization, dynamic-provider ordering, self/cycle rejection, bootstrap-module retention, and invalidate semantics are also present.

The core `client-modules` implementation files were transplanted from the official target and their resulting blob hashes match the official rc.8 blobs for the browser index, manifest, system, Host index, and invariant source.

## Remaining repository-wide counter-evidence

The repository must still not be described as a complete rc.8 release sync because broader release evidence remains unresolved:

- root release metadata still identifies the private baseline as `0.1.0-rc.7`;
- the full official rc.8 package/version family has not been mechanically reconciled as one release operation;
- the private build external partition is not yet proven identical to the official rc.8 final-tree build contract;
- workspace lockfile and generated artifacts have not been regenerated by the pinned repository toolchain for this migration;
- no exact-head REAL assembled Web boot / lifecycle run has executed successfully in repository CI.

These are now the blockers. The old statement that the private Web kernel itself still owns React `createRoot()` is obsolete and must not be repeated.

## What the Canvas compatibility overlay already gets right

### Dynamic package boundary

`@deepseek-ai/dsh-client-ui-canvas/client` exposes only the Cordis loading face at runtime (`apply` and `inject`). Components, stores, and pure helpers remain package internals. Shared contracts are type-only.

### Product composition

Canvas contributes its product surface dynamically to generic `shell.main`. `ui-layout` merely renders that generic slot; it does not import Canvas or own Workflow, Run, Mode, Selection, Draft, or mutation state.

The old `conversation.view` ownership assumption is obsolete. Conversation/Composer remains independently owned by the Conversation domain and Canvas does not create a second Composer.

### Client state discipline

Mode and semantic selection remain stable browser-local observable sources because the prompt-preparation bridge reads the same values. Render code sees them through the reserved `hooks` compartment.

Editor Draft, save status, Undo/Redo, Clipboard, and transient layout positions are presentation-only and therefore use the slot-declared store. Durable Workflow truth stays in Session Projection.

### External authorities

Canvas does not create Browser-owned replacements for Harness Settings, effective deployment capabilities, Media Node Registry/catalog revision, or Session Projection/durable Canvas state. Those authorities remain Host/framework owned.

## Root ownership is an architectural invariant, not a naming detail

The rc.8 ownership chain now implemented by the private remediation branch is:

```text
framework-free Web boot
  → activate dynamic roster
  → verify uiRenderer service
  → dependency-fiber uiRenderer.mount(container)
  → ui-renderer owns hydrate/create/unmount
```

This matters for HMR and disposal: renderer replacement can retract the old root and remount through normal Cordis service lifecycle. The Web kernel does not regain React ownership merely because it initiates the service call.

## Regression gates

N11.5 now pins both the Canvas overlay and the remediated rc.8 kernel boundary:

- Canvas `/client` runtime exports are exactly `apply` / `inject`;
- Canvas is present exactly once in the dynamic Web roster;
- Canvas injects `shell.main`, not `conversation.view`;
- AppFrame renders `shell.main` generically and has no Canvas import/type dependency;
- `ui-renderer` is present in the Web roster and owns `createRoot` / `hydrateRoot`;
- Web boot contains no application `createRoot`, `AppRoot`, or shell-owned final app assembly;
- mount occurs only after graph activation and dispose retracts the renderer root;
- missing `uiRenderer` fails loud;
- module bootstrap queue/create/live-registration behavior and dynamic external ordering are covered by the upgraded module tests;
- built-client enable/disable/dispose behavior removes the Canvas product contribution with plugin lifetime;
- built-client Node Catalog fixtures use the versioned `{ revision, entries }` DTO.

These source tests are regression contracts, not a substitute for runnable repository CI.

## Rule for future upgrades

For rc.9 and later, maintain two explicit ledgers:

1. **Compatibility overlay ledger** — which new public APIs/lifecycle rules the Canvas packages already follow.
2. **Upstream sync ledger** — which official tree/package/root-owner/build/version changes are mechanically present in the private repository.

Do not promote the second ledger based on the first. Conversely, once a concrete ownership gap is remediated, remove it from the counter-evidence rather than leaving stale documentation that understates the tree.

## Alternatives considered

**Treat the now-correct renderer/root and module bootstrap as proof of a complete rc.8 sync.** Rejected because root ownership is only one release boundary. Root/private version metadata, the complete package/version family, build external partition, lock/generated reconciliation, and REAL assembled boot evidence remain separate completion gates.

**Keep the #41 business facts but discard the validated #40 compatibility-overlay boundary.** Rejected because the renderer remediation is stacked on that overlay and must preserve its Host-authoritative Canvas contracts, `shell.main` composition, versioned catalog DTO, and plugin lifecycle semantics.

**Resolve the documentation conflict by choosing either merge side wholesale.** Rejected because #40 owns the current Agent Note format and validated overlay evidence while #41 owns newer renderer/bootstrap facts. A semantic merge is required to preserve both truths.

**Hand-edit pairing hashes.** Rejected. The bilingual consistency record is regenerated by the repository's `verify-translation-pairing --write` tool after both sides are updated.

## Consequences

The merged boundary now accurately records three distinct facts at once: the Canvas overlay is validated on final N11, renderer/root and module-bootstrap ownership are remediated, and N11.5 as a release baseline is still blocked by broader rc.8 reconciliation and REAL-composition evidence.

This preserves strict predecessor discipline for later work. #41 can be validated as the next N11.5 remediation layer without prematurely authorizing N12 to consume rc.8 as accepted. It also means future release-sync work must remove blockers only when their exact mechanical and runtime evidence exists, rather than by changing status prose.
