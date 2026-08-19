# @deepseek-ai/dsh-canvas

English | [中文](README.zh.md)

`dsh-canvas` owns the session-scoped media Canvas domain and its durable Host control plane: semantic media workflows, independent workflow/run revisions, durable media references, schema migration, strict Session replay, Host authorization/audit, bounded Session projections, independent editor layout state, Typert Browser mutations, bounded run-history queries, and `ctx.canvas`. Session events remain the only durable Canvas authority; provider execution, Agent tools, media-asset implementations, and UI remain separate layers.

## Domain model

A `CanvasSnapshot` has one stable `CanvasId`, a semantic `MediaWorkflow | null`, independent `workflowRevision` and `runRevision` counters, an optional current variant id, the current or most-recent `CanvasRunSnapshot`, and the current `CanvasOutput`. Semantic workflow edits advance only `workflowRevision`; run lifecycle changes advance only `runRevision`. Selecting an already-generated output candidate changes neither revision.

`MediaWorkflow` is UI- and provider-independent. It contains semantic nodes, semantic edges, output node ids, and JSON-safe node configuration. Graph positions, viewport state, provider credentials, provider request payloads, binary media, and bearer URLs are not workflow data.

`CanvasLayoutSnapshot` stores editor node positions and viewport independently from semantic workflow state. Saving layout never advances `workflowRevision` or `runRevision`. `CanvasRunHistoryEntry` is a bounded history DTO derived from Session history rather than a second authority.

`CanvasOutput` stores durable references rather than bytes. Images reuse `ImageAttachmentRef`; videos use an opaque `VideoAssetRef`. A result can contain multiple candidates and selects one with `primaryAssetIndex`.

## Construction and validation

The package root exports branded-id factories, `createMediaWorkflow()`, `createCanvasSnapshot()`, Canvas/layout constructors and decoders, product-state derivation, and current value invariants. Id factories do not validate; invariants reject invalid ids and relationships at durable/domain boundaries.

`assertCanvasSnapshot()` checks schema versions, safe integer revisions and timestamps, workflow identity relationships, run lifecycle timing, output revision relationships, candidate selection, durable asset metadata, and JSON-safe workflow configuration. `assertCanvasLayoutSnapshot()` checks the separately versioned layout, finite positions, non-negative timestamps, and positive viewport zoom. Cycle detection and registered node-port compatibility belong to the media-workflow engine rather than this package.

`deriveCanvasProductState()` yields `EMPTY`, `READY`, `DIRTY_READY`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, or `INTERRUPTED`. A run remains `RUNNING` when the user edits the current workflow to a newer revision; after an old run is terminal, a successful output from the old workflow revision yields `DIRTY_READY`.

## Durable decode and migration

Durable Canvas values follow `decode stored value → migrate to current runtime value → run current domain invariant`. `migrateStoredMediaWorkflow()` and `migrateStoredCanvasSnapshot()` stop before relational invariants, while `decodeMediaWorkflow()` and `decodeCanvasSnapshot()` chain migration with current validation.

Current versions are exported as `CANVAS_CHANGE_VERSION`, `CANVAS_LAYOUT_SCHEMA_VERSION`, `MEDIA_WORKFLOW_SCHEMA_VERSION`, `CANVAS_SCHEMA_VERSION`, and per-node `MEDIA_WORKFLOW_NODE_VERSIONS`. Unknown future schema or node versions fail with stable `CanvasMigrationError` codes instead of guessing a downgrade. Historical Session events are never rewritten.

Golden fixtures freeze V1 workflow, snapshot, layout, run-history, and a retired pre-registry `image.create@v1` node. The retired alias is accepted only while decoding historical data, migrated to `image.generate@v1`, and surfaced as a `CANVAS_DEPRECATED_NODE` notice; current writers never emit the alias.

## Event sourcing and replay

Every accepted semantic Canvas mutation is a `canvas/change` Session event carrying one complete post-change `CanvasSnapshot`; `clear` carries `canvas: null`. `decodeCanvasChange()`, `applyCanvasChange()`, `applyCanvasEvent()`, and `foldCanvas()` form the strict replay path.

Editor layout uses a separate `canvas/layout-change` event carrying one complete `CanvasLayoutSnapshot` plus current audit metadata. `foldCanvasLayout()` reconstructs the latest durable layout history. The package invariant folds Canvas and layout streams together before Session publication, so a layout event cannot target another workflow or reference a node absent from the current workflow.

The invariant companion independently stages each candidate `session/event` before publication. A malformed or impossible transition is rejected before it enters the log. The CanvasService cache is only an incremental optimization: cold replay remains the recovery authority.

`canvas/change.meta` is versioned independently from the event envelope. Historical metadata schema version 1 remains readable without inventing an actor retroactively. Current Canvas and layout writes use metadata schema version 2 with canonical actor/source and optional request/correlation ids.

## Session projections and editor layout

When `ctx.sessionProjections` is composed, CanvasService registers two whole-value projection units: `canvas → CanvasSnapshot | null` and `canvasLayout → CanvasLayoutSnapshot | null`. The client-safe `@deepseek-ai/dsh-canvas/client` outlet carries the same projection type declarations without importing Host services.

Projection folds are deliberately fail-soft: unrelated events and malformed Canvas-shaped events return the same state reference so one plugin cannot tear down the shared projection drive. Strict rejection belongs to the write-side service, durable decoder, and package invariant. Current-state projection values remain UI-scale and do not include run history, binary media, provider raw responses, logs, or progress history.

Semantic workflow edits preserve the current layout projection because layout has its own event stream and revision semantics. Canvas `create` and `clear` reset the current `canvasLayout` projection to `null`; old layout events remain in Session history, but a new current Canvas never inherits stale coordinates merely because a workflow id is reused.

`CanvasService.saveLayout()` accepts the current workflow id, partial node positions, and optional viewport. It enforces `canvas.layout.write` on the Host, rejects unknown node ids or a mismatched workflow id, assigns a monotonic server-side timestamp, appends exactly one `canvas/layout-change`, and does not change the semantic Canvas snapshot or either Canvas revision.

## Host authorization and audit

`CanvasPermission` defines the shared Host action set used by CanvasService and its Remote, Agent Tool, History, Asset, restore, variant, and layout consumers. The set includes Canvas read/edit/run/cancel, history read, asset read/export/delete, workflow restore, variant create, and layout write.

`CanvasAuthorizationService` is an optional Cordis service exposed as `ctx.canvasAuthorization`. Its default `CanvasAuthorizationPolicy` is appropriate for the current single-user deployment and allows human, agent, and system actors; deployments may override allowed actor kinds per permission. CanvasService always evaluates authorization on the Host, including Browser Remote and layout requests.

`CanvasAccessContext` carries only durable-safe actor/source identifiers and optional request/correlation ids. Audit metadata is materialized by allow-list. Semantic workflow configuration is scanned before commit for credential/header/binary-shaped keys such as authorization headers, API keys, tokens, client/callback secrets, passwords, base64/data URLs, blobs, and raw media bytes; diagnostics never echo rejected secret values.

## CanvasService

The default package export is `CanvasService`, mounted as `ctx.canvas` and published to Typert namespace `canvas`. It is the single Host façade for current Canvas reads, accepted Canvas/layout writes, and bounded Session-derived history. It validates the exact live Agent, authorization, semantic/layout invariants, and complete candidate state before appending Session events; derived cache state is synchronized only after append succeeds.

`create()` installs an initial workflow; `replaceWorkflow()` and `editWorkflow()` use `WorkflowRef { canvasId, workflowId, workflowRevision }` compare-and-set. `runRevision` is deliberately absent from that fence, so run lifecycle changes do not make unrelated semantic edits stale. `editWorkflow()` applies an entire `WorkflowEditOperation[]` batch to a detached draft and commits once after final validation. `selectOutput()` changes only the primary result selection, `saveLayout()` writes the independent layout stream, and `clear()` records a Canvas tombstone while current layout projection resets separately.

## Browser Remote and run history

The generated `./remote` contribution exposes `editWorkflow`, `replaceWorkflow`, `selectOutput`, `saveLayout`, `clear`, `listRuns`, and `getRun`. Browser callers never supply `CanvasAccessContext`: dedicated Remote wrappers create `human` + `browser-remote` access on the Host and then call the same CanvasService methods used by other consumers. Mutation methods return small receipts; the Browser reads committed current Canvas and layout values from Session Projection, so there is deliberately no `getCurrent` RPC.

`listRuns()` and `getRun()` derive history directly from `canvas/change` events. Pages are newest-first, default to 20 entries, reject limits above 100, and use an opaque cursor anchored to the run-start Session sequence so later runs do not reorder an in-progress pagination walk. History responses contain durable run/output DTOs only and do not create a second history database.

The public `CanvasRemoteMethodName` type also reserves `createVariant`, `restoreWorkflow`, `run`, and `cancel` names for their owning later domain implementations. Those methods are not registered as Remote endpoints until the corresponding Host behavior exists; N06 does not publish fake success paths.

The package publishes generated `./typert` and `./remote` artifacts through the repository Typert build, following the same artifact-plane pattern as Goal. The source tree owns decorators and client-safe DTOs; generated files are not hand-maintained.

## Model Experience

### Session-native Canvas service

#### What the model sees

Nothing directly yet. This package registers no Canvas tool, prompt section, request context, or model-visible result. Later Canvas tools consume `ctx.canvas`, and any model-visible Canvas context remains required to be reconstructable from the Session log.

#### Token effect

Zero direct tokens. Event sourcing, projections, layout persistence, migration, authorization, audit, replay, Remote calls, and Host mutations do not alter model requests.

#### KV Cache effect

None. This package does not participate in prompt assembly yet.

## Known Limitations and Deferred Work

- **No Canvas UI consumer yet** — Browser mutation/history transport and current-state projections exist, but Minimal/Editor rendering and interaction context are separate client work.
- **Current authorization policy is actor-kind based** — identity ownership, multi-user tenancy, workspace ACLs, approval policy, quotas, and provider-cost admission belong to later governance layers behind the same Host seam.
- **Run execution is not implemented** — `run` and `cancel` are reserved Remote names but are not registered endpoints; Jobs, provider execution, retry, cancel, and the full run lifecycle remain separate work.
- **Variant creation and workflow restore are not implemented** — their Remote names are reserved but no endpoint is published until their Host mutations exist.
- **No DAG execution validation** — cycles, registered node port definitions, capability resolution, and scheduler checks belong to the media-workflow engine.
- **No video storage implementation** — `VideoAssetRef` is durable metadata only; the separate media-asset capability owns bytes, authorization, and Range reads.
