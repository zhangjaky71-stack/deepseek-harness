# `@deepseek-ai/dsh-client-ui-canvas`

English | [中文](README.zh.md)

Dynamic Browser presentation plugin for Canvas V2.2. Current upstream integration target: Harness `dsh@0.1.1-rc.2`.

## Product ownership

`ui-canvas` owns the Canvas product presentation, not durable Canvas semantics.

It dynamically occupies the private product extension slot `shell.main` and renders one current Session Canvas in either Minimal or Editor mode. Conversation and Composer remain owned by `ui-conversation`; Canvas never introduces a second chat input surface.

## Intentional layout divergence

Official latest Harness layout centers Conversation:

```text
sidebar | conversation | details
```

The Canvas product deliberately uses:

```text
sidebar | shell.main(Canvas) | conversation | details
```

`ui-canvas` occupies `shell.main`; `ui-layout` owns only the generic slot/geometry. During every upstream upgrade this extension is replayed over the newest official layout instead of freezing an old layout implementation.

## Current state sources

Semantic current state comes only from the current Session Canvas Projection wire view. The Browser does not keep a second workflow/run/asset authority.

Browser-local state is limited to presentation concerns such as:

- Minimal/Editor mode;
- selected nodes/edges/output/region;
- dirty Editor draft/save state;
- Undo/Redo command history;
- clipboard;
- transient drag positions/viewport state.

Session pruning/plugin disposal clears session-local presentation anchors.

## Minimal

Minimal renders persisted current run/output/asset state and should remain usable when Editor-specific node catalog discovery or mutation Remote service is unavailable. It must not depend on Provider SDKs or a local workflow copy to show already durable results.

## Editor

Editor uses the Host client-safe Media Node catalog. All definition lookup is exact `(type, nodeVersion ?? 1)`.

- exact definition missing → historical node remains visible/read-only;
- required current feature disabled → node remains visible/read-only/unavailable;
- creatable + feature-enabled exact definition → Node Library authoring allowed.

Draft changes save through normal Host workflow operations with expected revision CAS. Debounce and blur share one de-duplicated save path. Conflict/offline/failure preserves the draft instead of fabricating success.

Undo/Redo sends normal inverse/forward Host operations, not full Browser workflow snapshots. The historical optional `name` absence edge case must not be faked with an invalid empty-string rename; until the Host wire can exactly represent clear-name, UI/history behavior must stay explicit and safe.

## Settings under `0.1.1-rc.2`

Canvas Settings must bind through the official `settingsScope` service backed by the shared `SettingsDescribeMirror`. This plugin must not retain its own per-namespace `settings.describe()` reader after synchronization.

The Settings section may remain available while current `canvas.enabled=false` so a local user can configure the next activation. Product rendering follows only current Host `CanvasCapabilities`, never raw settings values.

## Interaction context

On ordinary prompt submission, this plugin samples the exact Session's current selection/mode/projection and stages one bounded context for that exact prompt RPC id. Host correlation decides whether it reaches the Agent.

Region selection is a Canvas semantic editing intent in normalized coordinates. The removed upstream `read_image_region` tool is not a dependency.

Selected image targets are stable Canvas attachment-backed asset refs, not request-image variants or Browser object URLs.

## Image/asset presentation

Harness Attachment owns image bytes. `ui-canvas` may compose Canvas-specific galleries/stages around stable asset references, but it does not copy `ui-attachment`'s Conversation composer/message presentation ownership and never receives Provider credentials or request-image cache data.

## Renderer and plugin lifecycle

Official `ui-renderer` owns React root and React bindings. `ui-canvas` is a dynamic Cordis/slot plugin and must not call `createRoot`/`hydrateRoot` or depend on legacy `web-react` root ownership.

All slot registrations, settings subscriptions, prompt-preparation hooks and local session stores must retract/clear with the owning effect/fiber for unload/HMR safety.

## Remotes

Known business failures use the official `RemoteResult<T>` shape and stable Canvas error codes. Minimal current read comes from Session Projection; mutation/catalog/interaction Remotes are optional capabilities with explicit degradation.

## Revalidation status

The N07–N11 Browser implementation is retained but remains under 0.1.1-rc.2 revalidation. Required migrations include latest Session Projection wire views, shared Settings mirror, official renderer/React binding ownership and replaying the `shell.main` layout extension on the newest `ui-layout`.

See workplans N07–N11 and N11.5.