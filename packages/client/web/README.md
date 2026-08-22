# @deepseek-ai/dsh-client-web

English | [中文](README.zh.md)

Web boot kernel: `new AppWebEntry(el, seams?).run()` mounts the client through two stages. The module stage consumes the Host-installed `window.__ModuleLoader__` facade and calls `create()` with `window.__DSH_BOOT__`, the shell's static module seed, and any test transport override. The facade adopts parser-preloaded registrations, constructs the client module system, exposes its parsed manifest, and switches from queue mode to live registration. The kernel then prefetches the manifest's `immediately` tier.

The plugin stage mounts the vendored Cordis Loader, injects that module system through the Loader's `internal` interface, creates every graph entry uniformly, waits for quiescence, and audits that every entry reached ACTIVE. Only after that audit does the kernel hand the existing mount point to the dynamic UI renderer through `ctx.uiRenderer.mount(container)`. React root creation, hydration, slot rendering, application assembly, and browser-title projection therefore belong to [`@deepseek-ai/dsh-client-ui-renderer`](../ui-renderer/README.md), not to the Web kernel.

The boot page is framework-free plain DOM with package-local CSS. It remains usable while client bundles are loading and when plugin activation fails. The UI renderer hydrates the marked boot DOM before switching to the assembled application, preserving the handoff without a second shell-owned React root. A missing `uiRenderer` after the graph settles is treated as a loud boot failure rather than an unbounded dependency wait.

`PLATFORM_MODULES` (`src/platform.ts`) remains the private composition's source of truth for shell-seeded shared module identities and the current client-bundle external baseline. The rc.8 bootstrap protocol additionally parser-preloads the modules and runtime bundles before the Vite shell. This branch deliberately keeps the existing private static-seed compatibility surface while the wider rc.8 build-system synchronization remains pending; it does not claim the repository has already adopted every upstream static/dynamic external split.

The optional `seams` parameter forwards the module system's `loadBundle` transport override (`BootSeams`) for environments where external `<script>` execution cannot reach the page context; ordinary browser callers omit it.

## Model Experience

None, as the boot kernel only starts the browser plugin tree; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The application waits for the full roster** — one failed entry keeps the framework-free boot page visible with a loud report; partial UI availability is not supported.
- **The private static-module seed is still broader than the official rc.8 final tree** — renderer/root ownership and the HTML bootstrap protocol are aligned, while the remaining build/external partition must be validated as part of the repository-wide rc.8 synchronization rather than silently rewritten here.
