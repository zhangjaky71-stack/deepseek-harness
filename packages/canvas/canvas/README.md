# @deepseek-ai/dsh-canvas

English | [中文](README.zh.md)

`dsh-canvas` owns the session-scoped media Canvas domain vocabulary: semantic media workflows, independent workflow/run revisions, durable media references, run/output summaries, presentation state derived from those values, and the durable decode/migration seam for historical Canvas data. N01/N02 remain state-free; Session events, projections, Remotes, Agent tools, providers, and UI belong to later Canvas layers.

## Domain model

A `CanvasSnapshot` has one stable `CanvasId`, a semantic `MediaWorkflow | null`, independent `workflowRevision` and `runRevision` counters, an optional current variant id, the current or most-recent `CanvasRunSnapshot`, and the current `CanvasOutput`. `workflowRevision` advances only when semantic workflow content changes; run lifecycle updates use `runRevision` and never make an otherwise current workflow edit stale.

`MediaWorkflow` is UI- and provider-independent. It contains semantic nodes, semantic edges, output node ids, and JSON-safe node configuration. React Flow positions, viewport state, provider credentials, provider request payloads, binary media, and bearer URLs are not workflow data.

`CanvasLayoutSnapshot` is versioned separately from semantic workflow state so editor coordinates and viewport changes do not advance `workflowRevision`. `CanvasRunHistoryEntry` is a bounded history DTO intended to be derived from Session history rather than becoming a second authority.

`CanvasOutput` stores durable references rather than bytes. Images reuse `ImageAttachmentRef`; videos use an opaque `VideoAssetRef`. A result can contain multiple candidates and selects one with `primaryAssetIndex`.

## Construction and validation

The package root exports branded-id factories, `createMediaWorkflow()`, `createCanvasSnapshot()`, `assertCanvasJsonValue()`, `assertMediaWorkflow()`, `assertCanvasSnapshot()`, `isCanvasRunTerminal()`, and `deriveCanvasProductState()`. Id factories do not validate; invariants reject empty ids at the durable/domain boundary.

`assertCanvasSnapshot()` checks schema versions, safe integer revisions and timestamps, workflow identity relationships, run lifecycle timing, output revision relationships, candidate selection, durable asset metadata, and JSON-safe workflow configuration. Cycle detection and node-port-definition compatibility belong to the media-workflow engine rather than this value package.

`deriveCanvasProductState()` yields `EMPTY`, `READY`, `DIRTY_READY`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, or `INTERRUPTED`. A run remains `RUNNING` even when the user edits the current workflow to a newer revision while that frozen run continues; after that old run is terminal, a stale successful output yields `DIRTY_READY`.

The separately published `./invariant` companion currently registers an explained empty runtime invariant because N01/N02 own immutable values and decode logic only. The Canvas service layer replaces that emptiness with Session event/data relationship checks when durable Canvas events exist.

## Durable decode and migration

N02 adds an explicit durable boundary: `decode stored value → migrate to current runtime shape → run current N01 invariant`. `migrateStoredMediaWorkflow()` and `migrateStoredCanvasSnapshot()` intentionally stop before relational invariants, while `decodeMediaWorkflow()` and `decodeCanvasSnapshot()` chain migration with the current domain checks.

Current versions are exported as `CANVAS_CHANGE_VERSION`, `CANVAS_LAYOUT_SCHEMA_VERSION`, `MEDIA_WORKFLOW_SCHEMA_VERSION`, `CANVAS_SCHEMA_VERSION`, and per-node `MEDIA_WORKFLOW_NODE_VERSIONS`. Unknown future schema or node versions fail with stable `CanvasMigrationError` codes instead of guessing a downgrade. Historical Session events are never rewritten.

Golden fixtures freeze `workflow-v1`, `snapshot-v1`, `layout-v1`, `run-history-v1`, and a retired pre-registry `image.create@v1` node. The retired alias is accepted only while decoding that historical shape, migrated to `image.generate@v1`, and surfaced as a `CANVAS_DEPRECATED_NODE` notice with lifecycle `deprecated`; current writers never emit the alias. Once migrated, the runtime shape is idempotent on subsequent reads.

## Model Experience

### Pure Canvas domain

#### What the model sees

Nothing directly. This package registers no tool, prompt section, request context, or model-visible result; later Canvas consumers own any model-facing projection of these values.

#### Token effect

Zero direct tokens. Domain construction, migration, and validation do not alter model requests.

#### KV Cache effect

None. This package does not participate in prompt assembly.

## Known Limitations and Deferred Work

- **No durable authority yet** — N01/N02 define, migrate, and validate Canvas values but do not append Session events, fold replay, or expose a service; the event-sourced service is N03.
- **Only V1 is current** — the migration seam and golden fixtures establish compatibility behavior, but there is no V1→V2 workflow/snapshot transform until a real V2 schema exists.
- **No DAG execution validation** — cycles, registered node port definitions, capability resolution, and scheduler checks belong to the media-workflow engine.
- **No video storage implementation** — `VideoAssetRef` is durable metadata only; the separate media-asset capability owns bytes, authorization, and range reads.
