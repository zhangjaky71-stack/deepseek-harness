# Canvas V2.2 — Upstream Compatibility Policy

Baseline: `deepseek-ai/deepseek-harness@b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` (`dsh@0.1.1-rc.2`)

## 1. Policy goal

Canvas is an extension of Harness, not a second application framework. The private repository should carry only product behavior that upstream does not provide or intentionally differs for the Canvas product. Every Harness upgrade therefore follows **adopt upstream first, replay the smallest Canvas extension second**.

## 2. Classification required for every upstream diff

Every changed upstream file that intersects Canvas work must receive exactly one class:

### A — Adopt unchanged

Use upstream behavior and delete/retire private parallel logic. Typical examples:

- Session Projection framework;
- Attachment normalized/request-image pipeline;
- Settings Describe Mirror;
- ui-renderer React ownership;
- ModuleLoader/transport core;
- command attachment envelope;
- repository build/gate machinery.

### B — Replay intentional Canvas extension

Start from the upstream file and re-apply only the documented Canvas requirement. Current principal example:

```text
official layout: sidebar | conversation | details
Canvas layout:   sidebar | shell.main(Canvas) | conversation | details
```

The replay must stay small enough to explain and regression-test independently.

### C — Revalidate private domain

The subsystem is Canvas-owned and not replaced by upstream, but its dependency seams may have changed. Examples: Canvas Domain, Media Workflow Engine, Media Model Registry, Provider Runtime and Run Admission.

### D — Deferred Canvas-only capability

Upstream has no equivalent. Continue implementation under Canvas ownership. Examples: editable media workflow, image/video generation, Canvas Run lifecycle, video binary authority, generation history/variants.

## 3. Forbidden compatibility strategies

- Do not make a large private infrastructure fork merely to avoid adapting to a changed official seam.
- Do not copy an old private package wholesale over the new upstream package.
- Do not call a behavior “upstream-compatible” because TypeScript still compiles.
- Do not preserve a private API solely because older Canvas docs mention it.
- Do not treat generated files or lockfiles as hand-authored merge surfaces.
- Do not silently change a product requirement to reduce merge work.

## 4. Product invariants that outrank upstream defaults

Harness upgrades may change defaults but must not remove these product requirements without an explicit product decision:

1. Canvas and Conversation coexist in the Web shell.
2. Minimal and Editor share one durable semantic state.
3. Agent and Browser operate the same Host-authoritative Canvas.
4. Editor workflows remain manually editable and open-world.
5. Image/video generation and workflow generation remain Agent-addressable.
6. Provider credentials and admission policy remain Host-only.
7. Browser may degrade presentation when optional capabilities are absent, but must never fabricate semantic state.

## 5. Infrastructure ownership rules

### Session / Projection

- Session log is durable authority.
- Canvas fold state uses the official projection framework.
- Browser gets an explicit client-safe wire view.
- Authorization is Host-enforced at the current official exposure/Remote boundary; a historical private `registerReadGuard` must not become an unreviewed permanent fork.

### Image attachments

- Harness Attachment owns normalized image bytes and request-image derivation.
- Canvas stores stable references/provenance only.
- Request variants, compression cache and Files upload identities remain request/provider infrastructure.

### Settings

- Settings document is the durable preference authority.
- Browser namespace scopes derive from the shared official mirror.
- Canvas current feature capability is a Host activation snapshot, not the live checkbox value.

### Client rendering

- `ui-renderer` owns React root and React bindings.
- Web boot remains framework-free.
- `ui-layout` owns geometry/slots, not Canvas semantics.
- `ui-canvas` owns Canvas Browser presentation.

### Commands / attachments

- Composer/command image submissions use official submission-envelope semantics.
- Canvas must not add another base64/image admission path when the official envelope can carry the input.

## 6. Intentional Layout fork contract

The `shell.main` extension is allowed to change only the minimum surface required to place Canvas beside Conversation.

Allowed divergence:

- declare `shell.main` as a session-scoped generic slot;
- add the track/column necessary to render it;
- let `ui-canvas` occupy it dynamically;
- keep Conversation as its own product owner.

Not automatically allowed:

- fork ThemePresenter behavior;
- fork Cordis/slot lifecycle;
- change session scope semantics;
- re-own `details` behavior;
- move React root ownership back to Web/Layout;
- import Canvas domain/package values into `ui-layout`.

Every upstream layout upgrade must first reconstruct the new official package and then replay this contract.

## 7. Version and generated-artifact policy

Root/package family versions, lockfile and generated outputs are synchronized only through the repository's release/build tooling. In particular:

- do not hand-edit `pnpm-lock.yaml`;
- do not hand-edit generated Typert Remote artifacts;
- do not hand-edit generated module/config/tool/persistence/client catalogs;
- regenerate with the exact current scripts after source reconciliation.

## 8. Node status policy after an upstream upgrade

An implemented node becomes `REVALIDATION REQUIRED` when any of its dependency seams changes. Its implementation history remains true, but its acceptance is no longer current.

A node returns to `ACCEPTED` only after:

- source contracts are reconciled to the new baseline;
- generated outputs are current;
- focused tests execute;
- relevant repository gates execute;
- REAL assembled evidence exists for product-visible integration.

## 9. Upgrade evidence record

For each future upgrade, record:

```text
official repository + commit + release
private pre-sync branch/commit
classified diff summary
intentional divergence list
source migrations performed
generated commands run
exact-head validation commands/results
REAL assembled evidence
remaining blockers
private post-sync commit
```

Without this record, the repository is not considered synchronized even if a merge commit exists.
