# @deepseek-ai/dsh-canvas

English | [中文](README.zh.md)

`dsh-canvas` owns the session-scoped media Canvas domain and its durable Host control plane: semantic media workflows, independent workflow/run revisions, durable media references, schema migration, strict Session replay, Host authorization/audit, and `ctx.canvas` mutations. Session events are the only durable Canvas authority; provider execution, projections, Remotes, Agent tools, assets, and UI remain later Canvas layers.

## Domain model

A `CanvasSnapshot` has one stable `CanvasId`, a semantic `MediaWorkflow | null`, independent `workflowRevision` and `runRevision` counters, an optional current variant id, the current or most-recent `CanvasRunSnapshot`, and the current `CanvasOutput`. Semantic workflow edits advance only `workflowRevision`; run lifecycle changes advance only `runRevision`. Selecting an already-generated output candidate changes neither revision.

`MediaWorkflow` is UI- and provider-independent. It contains semantic nodes, semantic edges, output node ids, and JSON-safe node configuration. React Flow positions, viewport state, provider credentials, provider request payloads, binary media, and bearer URLs are not workflow data.

`CanvasLayoutSnapshot` is versioned separately from semantic workflow state so editor coordinates and viewport changes do not advance `workflowRevision`. `CanvasRunHistoryEntry` is a bounded history DTO intended to be derived from Session history rather than becoming a second authority.

`CanvasOutput` stores durable references rather than bytes. Images reuse `ImageAttachmentRef`; videos use an opaque `VideoAssetRef`. A result can contain multiple candidates and selects one with `primaryAssetIndex`.

## Construction and validation

The package root exports branded-id factories, `createMediaWorkflow()`, `createCanvasSnapshot()`, `assertCanvasJsonValue()`, `assertMediaWorkflow()`, `assertCanvasSnapshot()`, `isCanvasRunTerminal()`, and `deriveCanvasProductState()`. Id factories do not validate; invariants reject empty ids at the durable/domain boundary.

`assertCanvasSnapshot()` checks schema versions, safe integer revisions and timestamps, workflow identity relationships, run lifecycle timing, output revision relationships, candidate selection, durable asset metadata, and JSON-safe workflow configuration. Cycle detection and registered node-port compatibility belong to the media-workflow engine rather than this package.

`deriveCanvasProductState()` yields `EMPTY`, `READY`, `DIRTY_READY`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, or `INTERRUPTED`. A run remains `RUNNING` when the user edits the current workflow to a newer revision; after an old run is terminal, a successful output from the old workflow revision yields `DIRTY_READY`.

## Durable decode and migration

Durable Canvas values follow `decode stored value → migrate to current runtime value → run current domain invariant`. `migrateStoredMediaWorkflow()` and `migrateStoredCanvasSnapshot()` stop before relational invariants, while `decodeMediaWorkflow()` and `decodeCanvasSnapshot()` chain migration with current validation.

Current versions are exported as `CANVAS_CHANGE_VERSION`, `CANVAS_LAYOUT_SCHEMA_VERSION`, `MEDIA_WORKFLOW_SCHEMA_VERSION`, `CANVAS_SCHEMA_VERSION`, and per-node `MEDIA_WORKFLOW_NODE_VERSIONS`. Unknown future schema or node versions fail with stable `CanvasMigrationError` codes instead of guessing a downgrade. Historical Session events are never rewritten.

Golden fixtures freeze `workflow-v1`, `snapshot-v1`, `layout-v1`, `run-history-v1`, and a retired pre-registry `image.create@v1` node. The retired alias is accepted only while decoding that historical value, migrated to `image.generate@v1`, and surfaced as a `CANVAS_DEPRECATED_NODE` notice with lifecycle `deprecated`; current writers never emit the alias.

## Event sourcing and replay

Every accepted Canvas business mutation is a `canvas/change` Session event carrying one complete post-change `CanvasSnapshot`; `clear` carries `canvas: null`. `decodeCanvasChange()`, `applyCanvasChange()`, `applyCanvasEvent()`, and `foldCanvas()` form the strict replay path. Replay validates operation-to-operation relationships in addition to the snapshot's own value invariants, including monotonic workflow/run revisions and the limited fields each operation may change.

The package invariant companion independently folds attached Session logs and stages every `session/event` candidate before publication. A malformed or impossible Canvas transition is rejected before it enters the log. The service cache is only an incremental optimization: cold replay and live state are required to be identical.

`canvas/change.meta` is versioned independently from the event envelope. Historical metadata schema version 1 remains readable without inventing an actor retroactively. Current CanvasService writes use metadata schema version 2 and record canonical `actor`, `source`, and optional `requestId` / `correlationId`.

## Host authorization and audit

`CanvasPermission` defines the shared Host action set used by CanvasService and later Remote, Agent Tool, History, Asset, restore, variant, and layout consumers. The set includes `canvas.read`, `canvas.edit`, `canvas.run`, `canvas.cancel`, `canvas.history.read`, asset read/export/delete, workflow restore, variant create, and layout write.

`CanvasAuthorizationService` is an optional Cordis service exposed as `ctx.canvasAuthorization`. Its default `CanvasAuthorizationPolicy` is appropriate for the current single-user deployment and allows human, agent, and system actors; deployments may override allowed actor kinds per permission. `CanvasService` always evaluates authorization on the Host. When no external service is mounted it uses the same policy implementation locally, so callers cannot bypass enforcement by hiding or showing UI controls.

`CanvasAccessContext` carries only durable-safe actor/source identifiers and optional request/correlation ids. Actors are `human`, `agent`, or `system`; known sources include Host calls, Browser Remote, Agent Tool, system reconciler, and asset route. CanvasService defaults omitted access context to the owning live Agent with source `host`, while future transport consumers supply their concrete human/system context.

Audit metadata is materialized by allow-list: arbitrary properties on a caller object are not copied into Session events. Semantic workflow configuration is also scanned before commit for credential/header/binary-shaped keys such as authorization headers, API keys, tokens, client/callback secrets, passwords, base64/data URLs, blobs, and raw media bytes. Rejections name the prohibited key/path but never echo the secret value.

## CanvasService

The default package export is `CanvasService`, mounted as `ctx.canvas`. It is the single Canvas business mutation entry. It accepts the exact live Agent that owns the Session, reconstructs/synchronizes its cache from Session events, authorizes the requested Host action, builds and validates the complete candidate snapshot in memory, then calls `session.append('canvas/change', ...)`. Cache publication happens only after append succeeds.

`create()` installs an initial workflow; `replaceWorkflow()` and `editWorkflow()` use `WorkflowRef { canvasId, workflowId, workflowRevision }` compare-and-set. `runRevision` is deliberately absent from that fence, so a run starting while an editor holds a valid workflow ref does not make the semantic edit stale. `editWorkflow()` applies the whole `WorkflowEditOperation[]` batch to a detached draft and appends exactly once only after the final workflow validates. `selectOutput()` changes only `primaryAssetIndex`/`updatedAt` and `clear()` records a null tombstone.

`CanvasServiceError` extends the Harness error vocabulary with stable service codes including `CANVAS_STALE_WORKFLOW_REVISION`, `CANVAS_INVALID_EDIT`, `CANVAS_PERMISSION_DENIED`, `CANVAS_INVALID_ACCESS_CONTEXT`, and `CANVAS_SENSITIVE_DATA`.

## Model Experience

### Session-native Canvas service

#### What the model sees

Nothing directly yet. This package registers no Canvas tool, prompt section, request context, or model-visible result. Later Canvas tools consume `ctx.canvas`, and any model-visible Canvas context remains required to be reconstructable from the Session log.

#### Token effect

Zero direct tokens. Event sourcing, migration, authorization, audit, replay, and Host mutations do not alter model requests.

#### KV Cache effect

None. This package does not participate in prompt assembly yet.

## Known Limitations and Deferred Work

- **Current authorization policy is actor-kind based** — identity ownership, multi-user tenancy, workspace ACLs, approval policy, quotas, and provider-cost admission belong to later governance layers. The Host seam is already centralized so those decisions do not need to be duplicated across Browser, Agent Tool, History, or Asset routes.
- **No client projection/Remote yet** — Browser reads and mutations are added by N05/N06. Until then `ctx.canvas` is Host-only and no shipped UI consumes it.
- **Run execution is not implemented** — the current package defines strict `run-start`/`run-complete` replay vocabulary only so workflow CAS and output selection can be exercised; Jobs, provider execution, retry, cancel, and the full run lifecycle belong to N16.
- **No DAG execution validation** — cycles, registered node port definitions, capability resolution, and scheduler checks belong to the media-workflow engine.
- **No video storage implementation** — `VideoAssetRef` is durable metadata only; the separate media-asset capability owns bytes, authorization, and Range reads.
