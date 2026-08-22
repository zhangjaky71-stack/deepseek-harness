# Canvas V2.2 — Harness Upgrade Migration Runbook

Current target: `dsh@0.1.1-rc.2` / `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`

## 1. Purpose

This runbook is the executable order for reconciling a newer Harness release with the private Canvas stack. It prevents two recurring failure modes:

- keeping obsolete private infrastructure because Canvas already depends on it;
- overwriting intentional Canvas product behavior with an upstream default.

## 2. Phase 0 — Freeze evidence before touching code

Record:

```text
official commit/release
private base branch/commit
open Canvas PR stack
current generated/lockfile status
known CI infrastructure blockers
```

For the current migration:

```text
official: b150a551b8d465e31e418e1b2eaf5e79bbb7d28e / 0.1.1-rc.2
private development base: fix/canvas-n15-v2.2-run-admission
documentation branch: docs/canvas-v2.2-0.1.1-rc2-realignment
```

## 3. Phase 1 — Diff and classify

Compare upstream against the private branch and classify every intersecting area as:

```text
ADOPT_UPSTREAM
REPLAY_CANVAS_EXTENSION
REVALIDATE_CANVAS_DOMAIN
DEFERRED_CANVAS_ONLY
```

The current mandatory classifications are:

| Area | Class | Action |
|---|---|---|
| Session Projection | ADOPT_UPSTREAM | migrate Canvas projection definitions/wire view |
| Attachment/image request pipeline | ADOPT_UPSTREAM | remove any duplicate image/request transform ownership |
| Settings Describe Mirror | ADOPT_UPSTREAM | migrate Browser namespace reads |
| ui-renderer React bindings | ADOPT_UPSTREAM | retire legacy web-react assumptions |
| Web transport `loadBundle` | ADOPT_UPSTREAM | extend private ModuleLoader boot path |
| Command image envelope | ADOPT_UPSTREAM | use for Canvas slash/command images |
| ui-layout topology | REPLAY_CANVAS_EXTENSION | replay only `shell.main` + Canvas/Conversation geometry |
| Canvas Domain / Workflow / Model / Provider / Admission | REVALIDATE_CANVAS_DOMAIN | preserve, adapt dependency seams |
| Video assets/providers | DEFERRED_CANVAS_ONLY | continue N21/N22 |

## 4. Phase 2 — Reconcile official infrastructure first

Recommended order:

1. Session Projection framework.
2. Attachment / attachment-local image contracts and implementation.
3. Settings client mirror/binder contracts.
4. ui-renderer / React binding ownership.
5. Web boot / module transport seam.
6. Commands / composer image envelope.
7. root build scripts and gate definitions.

Do **not** replay Canvas-specific layout or feature code until these packages represent the current official baseline closely enough to serve as a clean foundation.

## 5. Phase 3 — Replay intentional Canvas extensions

### Layout replay

Start from the latest official `ui-layout`, then apply the documented product patch:

```text
sidebar | shell.main(Canvas) | conversation | details
```

Keep the patch constrained to slot declaration, column geometry and render placement. Re-run layout regression tests proving:

- `shell.main` disappears cleanly when `ui-canvas` unloads;
- Conversation still owns its own root/composer;
- Details/sidebar/theme behavior tracks upstream;
- `ui-layout` has no Canvas domain dependency.

### Canvas browser replay

Re-bind `ui-canvas` to the latest official Session Projection, Settings, Renderer and Remote lifecycles. Never restore obsolete infrastructure solely to avoid changing Canvas Browser code.

## 6. Phase 4 — Revalidate implemented Canvas nodes

Revalidate in dependency order:

```text
N01 → N02 → N03 → N04 → N05 → N06 → N07 → N08 → N09 → N10 → N11
                                                            ↓
                                                          N11.5
                                                            ↓
                                           N12 → N13 → N14 → N15
```

Rules:

- preserve implementation history;
- update the current node contract where upstream changed ownership/API;
- append revalidation evidence to `implementations/N*.md`;
- never mark a node ACCEPTED before predecessor revalidation holds.

## 7. Phase 5 — Regenerate owner-managed artifacts

After source reconciliation, use the repository-pinned toolchain for all generated outputs. Expected owner commands include the current equivalents of:

```text
pnpm install / lockfile regeneration
gen-cordis-catalog
gen-cordis-api
gen-client-catalog
gen-tool-catalog
gen-config-catalog
gen-doc-graphs
gen-persistence-catalog
gen-module-graph
gen-scoped-events
Typert generation/build
translation pairing write/check
```

Never fabricate the resulting hashes or lockfile entries through the GitHub contents API.

## 8. Phase 6 — Focused validation

At minimum execute focused suites for:

- Canvas domain/migration/event/projection/remote;
- client layout/renderer/conversation/ui-canvas;
- settings mirror and Canvas settings;
- attachment normalization/request image;
- commands image-envelope integration;
- media-workflow registry/engine;
- media-provider registry/runtime/mock;
- run-admission.

A focused pass only proves the changed seam; it does not replace repository-wide gates.

## 9. Phase 7 — Repository gates

Use the exact scripts from the synchronized official root, not stale command names copied into older workplans. The current baseline includes newer families such as:

```text
build / build:official
check:ci / check:ci:static / check:ci:coverage / check:ci:artifacts / check:ci:consumers
verify-client-packages
verify-runtime-closure
verify-client-domain-graph
verify-optional-dependency-imports
verify-node-next-types
doc-sync / docs:check
```

Record command, exact head and result.

## 10. Phase 8 — REAL assembled verification

A release baseline is incomplete until the actual shipped composition proves:

```text
Host boot
→ __DSH_BOOT__ / ModuleLoader
→ optional transport-owned loadBundle
→ all required Client entries ACTIVE
→ ui-renderer mounts root
→ latest ui-layout + Canvas shell.main extension
→ Conversation and Canvas coexist
→ Session projection reaches both Minimal and Editor
→ Agent/command image inputs reach the common attachment/Canvas path
```

Also prove plugin unload/HMR/disposal does not leave stale Canvas mode, interaction, node catalog, settings subscription or React root ownership.

## 11. Phase 9 — Close the baseline

Update `UPSTREAM-0.1.1-RC2-BASELINE.md` (or the future successor) with the private post-sync commit and validation evidence.

Only then may N11.5 be marked accepted and downstream nodes inherit the new baseline.

## 12. CI infrastructure failure handling

If GitHub Actions shows `steps=[]` / `steps=null`, missing logs, `BlobNotFound` or an indefinitely queued enterprise runner:

- record the exact workflow/job URL and head;
- classify it as infrastructure-blocked;
- do not call it PASS;
- do not call it a Canvas assertion failure unless a repository step actually ran and failed.

Source inspection may continue, but acceptance remains `BLOCKED/UNVERIFIED`.
