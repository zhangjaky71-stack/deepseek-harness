# Canvas V2.2 — Harness `dsh@0.1.1-rc.2` Upstream Baseline

Status: `CURRENT BASELINE / CODE REALIGNMENT REQUIRED`

## 1. Exact upstream target

```text
repository: deepseek-ai/deepseek-harness
branch: master
commit: b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
release: dsh@0.1.1-rc.2
release date: 2026-08-21
```

This file supersedes `RC8-UPSTREAM-BASELINE.md` as the current implementation baseline.

## 2. Why this is a baseline, not a merge recipe

The private Canvas repository contains intentional product extensions and several selective backports. Therefore compatibility is not measured by a raw tree equality check. Every upstream change must be classified as one of:

1. **Adopt unchanged** — upstream owns the infrastructure and Canvas should stop carrying a parallel implementation.
2. **Replay Canvas extension** — start from current upstream behavior, then re-apply a narrowly documented Canvas product requirement.
3. **Revalidate only** — private implementation already matches the upstream contract closely enough; prove it against the exact baseline.
4. **Deferred upstream gap** — upstream capability does not cover a required Canvas feature, so the Canvas-owned subsystem remains.

## 3. Confirmed high-impact upstream changes

### 3.1 Session Projection

Official Projection now separates Host fold state from client-visible wire views. Canvas must migrate to the official projection definition/wire contract rather than treating private registry `owner/readGuard` extensions as permanent public seams.

Required result:

```text
Canvas Host projection state
        ↓ official projection wire view
Browser-safe Canvas projection DTO
```

Authorization remains Host-enforced, but the enforcement point must be re-aligned with the current Session/Remote exposure path.

### 3.2 Attachment / image pipeline

Official Attachment now owns:

- durable normalized image masters;
- `originalDimensions` when normalization reduces the input;
- deployment image byte/count/pixel/dimension limits;
- deterministic model-request image variants;
- `ImageRequestPolicy` and `RequestImageAttachment`;
- stable `variantId` cache/upload identity;
- route-specific request projection used by inline and Files API paths.

Canvas must not build a second image store, compression cache, request transform cache, or LLM-specific image projection.

Durable Canvas state stores only stable attachment-backed references and provenance. Request variants and remote Files transport identities are transient/request infrastructure.

### 3.3 Region image reads removed upstream

Official `read_image_region` was removed. Canvas keeps region editing as a product feature, but region selection is a Canvas semantic intent and must be implemented through Canvas image-edit/crop/provider execution, not by resurrecting the removed generic tool contract.

### 3.4 Settings client authority

Official client settings now derive every namespace from one shared `SettingsDescribeMirror`. Canvas Browser settings must bind through that mirror. Canvas Host feature semantics remain restart-applied: composition config is the base, durable user settings overlay it, and one activation samples the effective capability snapshot.

### 3.5 UI renderer / React ownership

Official `ui-renderer` now owns React root creation and React bindings. Legacy `web-react` compatibility assumptions are superseded. Web boot remains framework-free and hands the mount point to the renderer service.

### 3.6 Web module transport

Official Web boot now accepts transport-owned bundle loading through `globalThis.__DSH_TRANSPORT__.loadBundle` and suppresses HTTP prefetch when the transport owns bundle bytes. The private rc.8 ModuleLoader backport must be extended to this contract.

### 3.7 Command image submission envelope

Official slash-command execution can explicitly declare image acceptance and carries the complete text+image submission envelope through admission. Canvas Agent/Slash integration must reuse this path rather than create a separate image-upload/cleanup protocol.

### 3.8 Build and repository gates

The official root build/gate surface now includes the `scripts/build.ts` build path plus newer coverage, Web CI, client-package/domain, runtime-closure, optional-dependency and documentation gates. N25 and all Definition-of-Done sections must use the current repository-owned gates instead of frozen rc.8 command lists.

## 4. Confirmed compatibility already present in the private stack

These areas are not redesign blockers, but still require exact-head validation after the upstream sync:

- Typert `RemoteResult<T>` discriminated result shape;
- dynamic `ui-renderer` owns application-root mount/unmount;
- Web uses the `window.__ModuleLoader__` facade rather than private `__DSH_MODULES__` final ownership;
- Canvas Media Node Registry is open-world and versioned by exact `(type, version)`;
- N12 Media Workflow Engine is Browser-independent and Provider-neutral;
- N13 Media Model Registry is separate from Chat LLM routing;
- N14 Provider Runtime is Provider-neutral and does not write Canvas durable state directly.

## 5. Intentional Canvas product divergence

The largest deliberate divergence is the Web product topology.

Official latest layout:

```text
sidebar | conversation | details
```

Canvas product topology:

```text
sidebar | shell.main(Canvas) | conversation | details
```

Rules:

- `shell.main` remains a generic slot owned geometrically by `ui-layout` and occupied semantically by `ui-canvas`.
- `ui-layout` must not import Canvas domain/packages or contain Canvas business state.
- Conversation remains the Conversation/Composer owner; Canvas never creates a second Composer.
- The divergence is replayed as a minimal patch over the latest official layout after every upstream upgrade.
- Theme, session-scope rules, details lifecycle, slot runtime, drag lifecycle and renderer ownership must track upstream unless a separate product requirement is documented.

## 6. Canvas-owned capabilities that upstream still does not replace

Keep these subsystems:

- Canvas durable domain / event sourcing / revisions;
- Minimal/Editor presentation state machine;
- Media Node Registry and editable DAG workflow;
- Media Workflow Engine;
- Media generation Model Registry / Resolver;
- generation Provider Runtime and Provider adapters;
- Canvas Run Admission / quota / cost / approval / concurrency policy;
- durable Canvas Run lifecycle/history/variants;
- Canvas-specific Agent tools/intents;
- Video binary authority and async video provider lifecycle;
- Canvas observability, retention references and release E2E.

## 7. Required realignment order

```text
A. baseline + docs freeze
B. official client/runtime/attachment/settings/projection infrastructure sync
C. replay minimal shell.main Canvas layout extension
D. revalidate N01–N11 against the new infrastructure
E. revalidate existing N12–N15 implementations
F. implement N16–N25 only after their revised prerequisites hold
G. regenerate lock/generated outputs with the pinned repository toolchain
H. run exact-head REAL assembled and repository gates
```

## 8. Non-negotiable migration rules

- Never hand-edit `pnpm-lock.yaml` or generated Typert/catalog/module/config/persistence artifacts.
- Never copy the entire private `ui-layout` over the latest official layout; replay only the documented Canvas extension.
- Never copy Browser selection, Settings, Node Registry, Model Registry or Provider availability into a second local authority.
- Never place image/video bytes, base64, object URLs, provider temporary URLs or Files upload ids in Canvas Session events.
- Never treat a runner failure before steps execute as product-test evidence.

## 9. Exit criteria for this baseline migration

The private repository can call itself aligned to this baseline only when:

1. official infrastructure changes above are mechanically reconciled;
2. intentional divergences have explicit regression tests;
3. generated artifacts are regenerated by their owner commands;
4. exact-head typecheck/build/lint/unit/coverage/docs/client-domain/runtime-closure checks execute;
5. REAL assembled Web proves ModuleLoader/transport → renderer → layout → conversation + Canvas lifecycles;
6. a concrete private post-sync commit is recorded in this file or its successor baseline note.
