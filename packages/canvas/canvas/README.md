# @deepseek-ai/dsh-canvas

English | [中文](README.zh.md)

`dsh-canvas` owns the session-scoped media Canvas domain and its Host control plane: semantic media workflows, independent workflow/run revisions, durable media references, schema migration, strict Session replay, Host authorization/audit, bounded Session projections, independent editor layout state, Typert Browser mutations, bounded run-history queries, request-local Canvas interaction context, and `ctx.canvas`. Session events remain the only durable Canvas authority; provider execution, Agent tools, media-asset implementations, and UI remain separate layers.

## Domain model

A `CanvasSnapshot` has one stable `CanvasId`, a semantic `MediaWorkflow | null`, independent `workflowRevision` and `runRevision` counters, an optional current variant id, the current or most-recent `CanvasRunSnapshot`, and the current `CanvasOutput`. Semantic workflow edits advance only `workflowRevision`; run lifecycle changes advance only `runRevision`. Selecting an already-generated output candidate changes neither revision.

`MediaWorkflow` is UI- and provider-independent. It contains semantic nodes, semantic edges, output node ids, and JSON-safe node configuration. Graph positions, viewport state, provider credentials, provider request payloads, binary media, bearer URLs, browser selection, and interaction focus are not workflow data.

`CanvasLayoutSnapshot` stores editor node positions and viewport independently from semantic workflow state. Saving layout never advances `workflowRevision` or `runRevision`. `CanvasRunHistoryEntry` is a bounded history DTO derived from Session history rather than a second authority.

`CanvasOutput` stores durable references rather than bytes. Images reuse `ImageAttachmentRef`; videos use an opaque `VideoAssetRef`. A result can contain multiple candidates and selects one with `primaryAssetIndex`.

## Construction and validation

The package root exports branded-id factories, `createMediaWorkflow()`, `createCanvasSnapshot()`, Canvas/layout constructors and decoders, product-state derivation, interaction decoding/rendering, and current value invariants. Id factories do not validate; invariants reject invalid ids and relationships at durable/domain boundaries.

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

When `ctx.sessionProjections` is composed, CanvasService registers two whole-value projection units: `canvas → CanvasSnapshot | null` and `canvasLayout → CanvasLayoutSnapshot | null`. The client-safe `@deepseek-ai/dsh-canvas/client` outlet carries the same projection and interaction type declarations without importing Host services.

Projection folds are deliberately fail-soft: unrelated events and malformed Canvas-shaped events return the same state reference so one plugin cannot tear down the shared projection drive. Strict rejection belongs to the write-side service, durable decoder, and package invariant. Current-state projection values remain UI-scale and do not include run history, binary media, provider raw responses, logs, progress history, or browser selection.

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

The generated `./remote` contribution exposes the durable `canvas` namespace (`editWorkflow`, `replaceWorkflow`, `selectOutput`, `saveLayout`, `clear`, `listRuns`, `getRun`) and, from N08, the request-local `canvasInteraction` namespace (`stage`, `discard`). Both namespaces are generated from this one package; generated artifacts remain build output and are never hand-maintained.

Browser callers never supply `CanvasAccessContext` for normal Canvas mutations: dedicated Remote wrappers create `human` + `browser-remote` access on the Host and then call the same CanvasService methods used by other consumers. Mutation methods return small receipts; the Browser reads committed current Canvas and layout values from Session Projection, so there is deliberately no `getCurrent` RPC.

`listRuns()` and `getRun()` derive history directly from `canvas/change` events. Pages are newest-first, default to 20 entries, reject limits above 100, and use an opaque cursor anchored to the run-start Session sequence so later runs do not reorder an in-progress pagination walk. History responses contain durable run/output DTOs only and do not create a second history database.

The public `CanvasRemoteMethodName` type reserves `createVariant`, `restoreWorkflow`, `run`, and `cancel` names for their owning later domain implementations. Those methods are not registered as Remote endpoints until the corresponding Host behavior exists; the UI does not publish fake success paths.

## Request-local Canvas Interaction Context

`CanvasInteractionContext` is deliberately outside `CanvasSnapshot`, `MediaWorkflow`, `canvas/change`, and Session Projection. It is a one-shot browser snapshot used to interpret deictic instructions such as “this”, “this image”, “this node”, “here”, “这个”, “这张”, and “这里”. The DTO carries `canvasId`, `workflowId`, the sampled `workflowRevision`, optional UI mode, selected node/edge ids, durable selected assets, current-output focus, and an optional normalized region/mask seam.

`decodeCanvasInteractionContext()` strictly bounds and decodes Browser input. At stage time `resolveCanvasInteractionContext()` proves Canvas/workflow identity, checks same-revision node/edge membership, validates current-output focus, and preserves revision drift as an explicit stale state instead of silently rebinding the selection. Selected asset references are additionally proven to be exact historical Canvas outputs from the same Session.

The Host mounts `CanvasInteractionService` from `@deepseek-ai/dsh-canvas/interaction-service`. It is a second direct `TypertRemoteService` in this package, published as namespace `canvasInteraction`, and owns no durable state. `stage()` stores a short-lived `{ agent, rpcId } → interaction snapshot` correlation; `discard()` removes an unbound stage when prompt admission fails.

The Browser prompt carrier already mints the ordinary prompt RPC id before transport. `ui-conversation` lets a feature prepare that exact id, so `ui-canvas` stages the frozen selection before the normal `session.prompt` request is sent without widening the Host prompt payload. When the Host later inserts the corresponding user message, `CanvasInteractionBridge` binds the staged RPC id to that exact message id. Concurrent sends and long queues therefore cannot attach one selection to another prompt by timing guesswork.

At `agent/pre-step`, only a bound user message that survives downstream pre-step policy receives Canvas context. The bridge inserts one user-role plugin `snapshot` message immediately before that exact prompt, then consumes the binding. The normal Agent loop writes both messages to Session history before the model request. Browser selection remains ephemeral; the only durable record is the precise context text the model actually received, preserving the system invariant that model-visible content uses logged channels.

If the workflow revision advanced while a prompt waited in Queue, the context renders `STALE` and instructs the Agent to call `canvas_read` before mutating sampled workflow targets. If the Canvas/workflow became unavailable after prompt admission, the already-admitted prompt still runs with `STALE/UNAVAILABLE` context rather than failing after the fact. Missing selection fields are explicit: the model is told not to invent a target.

## Browser presentation consumer

The shipped Web surface mounts `@deepseek-ai/dsh-client-ui-canvas` as one `conversation.view` consumer. It reads current Canvas and layout only from Session Projection and keeps Minimal/Editor mode plus interaction selection as per-session browser-local presentation state, so the UI does not become a second Canvas authority. The resident Conversation composer remains owned by `ui-conversation` outside the view ring.

N08 makes Editor node/edge cards and Minimal/Editor output candidates selectable for natural-language reference while deliberately stopping before DAG mutation. Output selection keeps a durable asset reference even after a later result becomes current; current candidate focus is retained only while the same run/index remains valid. The send-time builder preserves an older revision for stale detection but refuses to rebind an old selection to a replacement Canvas/workflow identity.

The Canvas client outlet stays runtime-free for Browser use: UI packages consume DTO/projection/interaction declarations type-only rather than loading Host-domain Canvas JavaScript into the browser bundle.

## Model Experience

### Session-native Canvas interaction context

#### What the model sees

No standing Canvas prompt is added. When and only when an ordinary user prompt is sent with a concrete Canvas selection, the model receives one logged plugin-context message immediately before that user prompt. It contains the sampled/current workflow revision status and the selected node, edge, durable asset, focused output, or region fields that exist. A stale selection explicitly instructs the model to call `canvas_read`; an absent selection contributes no Canvas message and must not be guessed.

#### Token effect

Event sourcing, projections, layout persistence, migration, authorization, audit, replay, Remote mutations, and history remain token-free. N08 adds bounded turn-local tokens only on prompts that actually carry a selection. The exact context is durable because it is logged as model-visible history, not reconstructed from later browser state.

#### KV Cache effect

There is no new standing system-prefix impact. The interaction message is ordinary turn-local history, so it affects only the conversation suffix from the turn where selection was used onward.

## Known Limitations and Deferred Work

- **Interaction selection is not an Agent Tool** — N08 gives the model grounded referents, but actual Canvas read/edit/run tools remain their owning later node; stale guidance references the planned `canvas_read` contract.
- **Region support is a seam, not a visual mask editor** — normalized region/mask DTOs are supported, while drawing/editing masks and inpaint/outpaint behavior remain later workflow/UI work.
- **Current authorization policy is actor-kind based** — identity ownership, multi-user tenancy, workspace ACLs, approval policy, quotas, and provider-cost admission belong to later governance layers behind the same Host seam.
- **Run execution is not implemented** — `run` and `cancel` remain reserved names, not registered endpoints; Jobs, provider execution, retry, cancel, and the full run lifecycle remain separate work.
- **Variant creation and workflow restore are not implemented** — their Remote names are reserved but no endpoint is published until their Host mutations exist.
- **No DAG execution validation** — cycles, registered node port definitions, capability resolution, and scheduler checks belong to the media-workflow engine.
- **No video storage implementation** — `VideoAssetRef` is durable metadata only; the separate media-asset capability owns bytes, authorization, and Range reads.
