# Harness rc.8 upstream baseline for Canvas V2.2

Status: `PARTIAL BACKPORT / REVIEW`

Full upstream sync: `NOT COMPLETE`

## Official target

Repository:

```text
deepseek-ai/deepseek-harness
```

Release merge:

```text
141eb6fef83422698aef7a981029e843e8161534
```

Release identity:

```text
dsh@0.1.0-rc.8
```

The official target is the authority for the rc.8 Client ownership and bootstrap contracts used by N11.5.

## Why the historical `sync/upstream-rc8*` refs are not the baseline

Historical private sync branches are ancestors of the current Canvas stack, but the reachable sync anchor still exposes private `0.1.0-rc.7` release metadata. An ancestor branch name proves that synchronization/backport work happened; it does not prove that the current private tree equals the official final rc.8 release.

N11.5 therefore records two separate states:

```text
compatibility overlay / protocol remediation
!=
full upstream release synchronization
```

## Current private release identity

The private root `package.json` still declares:

```text
0.1.0-rc.7
```

This remains direct evidence that the repository is not yet a mechanically complete rc.8 release tree. N11.5 does not bump individual packages to rc.8 merely because their protocol has been backported; package-family version migration belongs to the eventual release-wide sync.

## rc.8 ownership now present in the private tree

### Dynamic React root owner — aligned

The private tree now contains:

```text
packages/client/ui-renderer
@deepseek-ai/dsh-client-ui-renderer
```

It owns:

- React `createRoot` / `hydrateRoot`;
- slot renderer installation;
- application root-slot assembly;
- session title projection;
- `ctx.uiRenderer.mount(container)`;
- React root unmount through its returned disposer.

The default Web bundle includes `ui-renderer` in both its workspace dependency graph and Cordis browser roster.

### Framework-free Web boot — aligned

The rc.7 Web-owned React files (`AppRoot`, `app-shell`, Web `DocumentTitle`, `boot.tsx`) have been removed.

Current Web boot:

1. renders a framework-free BootPage;
2. consumes `window.__ModuleLoader__.create()`;
3. activates every dynamic graph entry through the Cordis Loader;
4. audits the settled graph;
5. requires `uiRenderer` to exist;
6. hands the existing mount point to `uiRenderer.mount(container)` through a dependency fiber.

A missing renderer fails loudly on the BootPage rather than waiting forever.

### Host/Web bootstrap facade — aligned

The private `client-modules` protocol core now matches the official rc.8 source for:

```text
src/client/index.ts
src/client/manifest.ts
src/client/system.ts
src/index.ts
src/invariant.ts
```

The important rc.8 sequence is present:

```text
Host HTML
  -> install queue-mode window.__ModuleLoader__
  -> parser-preload client-modules + client-runtime bundle registrations
  -> inject window.__DSH_BOOT__
Web boot
  -> __ModuleLoader__.create(...)
  -> modules bootstrap factory creates ClientModuleSystem
  -> queue drains, facade becomes live
  -> ordinary modules graph row provides same closed-over ctx.modules
```

The old private `window.__DSH_MODULES__` handoff and shell-static modules registration are gone.

### Dynamic module request graph — aligned at protocol level

`dsh.client.external` is now carried into the boot graph. Dynamic package providers are ordered before consumers for synchronous `require`; trailing `/client` is normalized to its package row; self-requests and module cycles are rejected.

## Private compatibility still intentionally retained

The private tree is not yet a byte-for-byte rc.8 Client build graph.

In particular, private `PLATFORM_MODULES` / `tsdown.client.ts` still retain a broader static-seed/external compatibility surface than the official rc.8 final partition. This is deliberate in the N11.5 remediation: existing private bundles already rely on those identities, while modules/runtime parser preloading now supplies the rc.8 bootstrap semantics.

Changing that wider build partition requires repository-toolchain validation across all client packages, not an isolated Canvas edit.

## Canvas overlay evidence retained

Canvas continues to satisfy the compatibility rules that motivated N11.5:

- `/client` runtime surface is only `apply` / `inject`;
- Canvas owns a dynamic `shell.main` contribution;
- `ui-layout` remains generic and Canvas-agnostic;
- Conversation/Composer is independently owned;
- render observables travel through the reserved `hooks` compartment;
- presentation-only Editor state remains local/store-owned;
- Session Projection remains durable semantic authority;
- Harness Settings, capability snapshot and Media Node Registry remain external authorities rather than Browser-owned copies.

## Mechanical regression gates now present

The private tree includes source tests/gates for:

- unique dynamic React root ownership;
- absence of React root creation from Web boot;
- `ui-renderer` roster/dependency/project presence;
- renderer mount/hydration/unmount/disposal;
- framework-free BootPage behavior;
- Web facade-create handoff and fail-loud missing renderer;
- modules queue-to-live bootstrap identity;
- parser-preload ordering;
- `dsh.client.external` ordering/cycle behavior;
- Canvas `shell.main` ownership and minimal `/client` export boundary.

These are source-level tests until a runner actually executes them.

## Evidence still required before `full sync = COMPLETE`

The repository may only be called fully rc.8-synced after all of the following are available together:

1. **Release/package family reconciliation** — root and package versions/manifests follow an explicit rc.8 private-release policy or the official release family.
2. **Build graph reconciliation** — the remaining static-vs-dynamic client external partition and related build configuration are audited against the official target.
3. **Tool-owned outputs** — lockfile, generated catalogs and other derived artifacts are regenerated by the pinned repository toolchain; none are hand-edited.
4. **Private post-sync commit** — one concrete post-sync commit records the reconciled tree rather than pointing to a compatibility-only commit.
5. **REAL assembled boot** — built Web composition demonstrates modules facade -> full client roster -> uiRenderer handoff -> Canvas/Conversation lifecycle.
6. **Runnable exact-head CI** — repository-pinned build/typecheck/tests execute actual steps.

## Current CI limitation

The stacked Canvas PRs have repeatedly produced Actions jobs that fail before any step executes (`steps=[]` / `steps=null`, log retrieval `BlobNotFound`) or remain queued on the enterprise runner. These failures are infrastructure evidence, not passing or failing Canvas assertions.

Until runnable jobs exist, no exact-head repository acceptance is claimed.

## Baseline conclusion

The two most important rc.8 Client lifecycle differences that previously blocked N11.5 — dynamic renderer root ownership and the Host/Web module bootstrap facade — are now present in the private source tree.

That is a substantial compatibility remediation, but it is still not equivalent to the official rc.8 release tree. The authoritative status remains:

```text
compatibilityStatus = PARTIAL BACKPORT / REVIEW
fullSync = NOT COMPLETE
```
