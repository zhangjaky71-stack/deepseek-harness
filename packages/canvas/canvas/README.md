# @deepseek-ai/dsh-canvas

English | [中文](README.zh.md)

`dsh-canvas` owns the session-scoped media Canvas domain and its Host control plane: semantic media workflows, independent workflow/run revisions, durable media references, schema migration, strict Session replay, Host authorization/audit, deployment feature policy, bounded Session projections, independent editor layout state, Typert Browser mutations, bounded run-history queries, request-local Canvas interaction context, and `ctx.canvas`. Session events remain the only durable Canvas authority; provider execution, Agent tools, media-asset implementations, and UI remain separate layers.

## Domain model

A `CanvasSnapshot` has one stable `CanvasId`, a semantic `MediaWorkflow | null`, independent `workflowRevision` and `runRevision` counters, an optional current variant id, the current or most-recent `CanvasRunSnapshot`, and the current `CanvasOutput`. Semantic workflow edits advance only `workflowRevision`; run lifecycle changes advance only `runRevision`. Selecting an already-generated output candidate changes neither revision.

`MediaWorkflow` is UI- and provider-independent. It contains semantic nodes, semantic edges, output node ids, and JSON-safe node configuration. Graph positions, viewport state, provider credentials, provider request payloads, binary media, bearer URLs, browser selection, interaction focus, and deployment feature flags are not workflow data.

`CanvasLayoutSnapshot` stores editor node positions and viewport independently from semantic workflow state. Saving layout never advances `workflowRevision` or `runRevision`. `CanvasRunHistoryEntry` is a bounded history DTO derived from Session history rather than a second authority.

`CanvasOutput` stores durable references rather than bytes. Images reuse `ImageAttachmentRef`; videos use an opaque `VideoAssetRef`. A result can contain multiple candidates and selects one with `primaryAssetIndex`.

## Construction and validation

The package root exports branded-id factories, `createMediaWorkflow()`, `createCanvasSnapshot()`, Canvas/layout constructors and decoders, product-state derivation, interaction decoding/rendering, deployment-capability helpers, and current value invariants. Id factories do not validate; invariants reject invalid ids and relationships at durable/domain boundaries.

`assertCanvasSnapshot()` checks schema versions, safe integer revisions and timestamps, workflow identity relationships, run lifecycle timing, output revision relationships, candidate selection, durable asset metadata, and JSON-safe workflow configuration. `assertCanvasLayoutSnapshot()` checks the separately versioned layout, finite positions, non-negative timestamps, and positive viewport zoom. Cycle detection and registered node-port compatibility belong to the media-workflow engine rather than this package.

`deriveCanvasProductState()` yields `EMPTY`, `READY`, `DIRTY_READY`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, or `INTERRUPTED`. A run remains `RUNNING` when the user edits the current workflow to a newer revision; after an old run is terminal, a successful output from the old workflow revision yields `DIRTY_READY`.

## Durable decode and migration

Durable Canvas values follow `stored JSON → migrateStoredX() → current structural value → current invariant`. `migrateStoredMediaWorkflow()` and `migrateStoredCanvasSnapshot()` stop before relational invariants, while `decodeMediaWorkflow()` and `decodeCanvasSnapshot()` add current Canvas-domain validation. Layout uses the same split: `migrateStoredCanvasLayoutSnapshot()` is structural and `decodeCanvasLayoutSnapshot()` adds `assertCanvasLayoutSnapshot()`.

Current Canvas-owned versions are exported as `CANVAS_CHANGE_VERSION`, `CANVAS_LAYOUT_SCHEMA_VERSION`, `MEDIA_WORKFLOW_SCHEMA_VERSION`, `CANVAS_SCHEMA_VERSION`, and `CORE_MEDIA_WORKFLOW_NODE_VERSIONS`. The node-version map is deliberately closed over Canvas-owned node kinds only; it is not the catalog of every legal workflow node. Unknown plugin node types remain structurally readable with their type, optional positive node version, JSON-safe config, and graph relationships even when the plugin is not installed. N10/N12 decide whether the current Host has a matching `type@version` definition and executor.

Future Canvas/Core schema versions and future Canvas-owned node versions fail with stable `CanvasMigrationError` codes instead of guessing a downgrade. Unknown plugin node versions are preserved rather than misclassified as Core future versions. Current-version durable objects reject unsupported fields so a writer cannot add persistent data without an explicit version/migration change and have an older reader silently discard it. Historical Session events are never rewritten.

Golden fixtures freeze V1 workflow, snapshot, layout, run-history compatibility data, a retired pre-registry `image.create@v1` node, and an unavailable plugin-node workflow. The retired alias is accepted only while decoding historical data, migrated to `image.generate@v1`, and surfaced as a `CANVAS_DEPRECATED_NODE` notice; current writers never emit the alias. The plugin fixture proves durable workflows remain readable without consulting a plugin registry.

`CanvasRunHistoryEntry` remains a Session-derived bounded query/compatibility DTO, not a second durable schema authority. Its decoder validates current DTO fields, run lifecycle timestamps, and media-reference metadata; any future physical history cache must remain rebuildable from Session history and version its own storage independently.

## Event sourcing and replay

Every accepted semantic Canvas mutation is a `canvas/change` Session event carrying one complete post-change `CanvasSnapshot`; `clear` carries `canvas: null`. `decodeCanvasChange()`, `applyCanvasChange()`, `applyCanvasEvent()`, and `foldCanvas()` form the strict replay path. Current run writers use `run-start` followed by `run-update`; the latter covers queued/running milestones and all four terminal states (`completed`, `failed`, `cancelled`, `interrupted`). The earlier `run-complete` spelling remains readable only for historical N03 Session replay.

The strict fold tracks both Canvas ids and run ids for the entire Session. A `CanvasRunId` cannot be reused after completion or even after clearing and creating another Canvas in the same Session. Run lifecycle updates preserve the run/workflow identity and `startedAt`, advance only `runRevision`, reject `running → queued`, and never allow a terminal run to return to a non-terminal state. A completed run must publish the durable output owned by that run.

CanvasService owns an independent preflight boundary: it clones its current fold state and applies the complete candidate change before calling `Session.append()`. Session then provides the second, repository-wide boundary: synchronous `internal/dispatch` invariant checks can veto before the log push; the log push is the logical commit point; `session/event` is post-commit observe-only publication. Cache synchronization happens only after the append commits, so append/invariant failure leaves both the Session log and live Canvas cache unchanged.

Editor layout uses a separate `canvas/layout-change` event carrying one complete `CanvasLayoutSnapshot` plus current audit metadata. `foldCanvasLayout()` reconstructs the latest durable layout history. The package invariant folds Canvas and layout streams together before Session publication, so a layout event cannot target another workflow or reference a node absent from the current workflow.

The invariant companion also protects direct Host-side `Session.append('canvas/change', ...)` calls. Historical metadata schema version 1 and legacy `run-complete` remain readable during replay, but new live Canvas writes must use metadata schema version 2 with canonical actor/source, must use `run-update` for run lifecycle changes, and must pass the same credential/header/binary workflow audit-safety check used by CanvasService. Read compatibility therefore does not keep obsolete writer vocabulary writable.

Deployment feature flags are deliberately absent from every durable Canvas event. Turning a capability on or off changes what the current deployment may do; it never rewrites what a historical Session says happened.

## Session projections and editor layout

When `ctx.sessionProjections` is composed, CanvasService registers two whole-value projection units: `canvas → CanvasSnapshot | null` and `canvasLayout → CanvasLayoutSnapshot | null`. The client-safe `@deepseek-ai/dsh-canvas/client` outlet carries the same projection, interaction, and capability type declarations without importing Host services.

Projection folds are deliberately fail-soft: unrelated events and malformed Canvas-shaped events return the same state reference so one plugin cannot tear down the shared projection drive. Strict rejection belongs to the write-side service, durable decoder, and package invariant. Current-state projection values remain UI-scale and do not include run history, binary media, provider raw responses, logs, progress history, browser selection, or feature configuration.

Semantic workflow edits preserve the current layout projection because layout has its own event stream and revision semantics. Canvas `create` and `clear` reset the current `canvasLayout` projection to `null`; old layout events remain in Session history, but a new current Canvas never inherits stale coordinates merely because a workflow id is reused.

`CanvasService.saveLayout()` accepts the current workflow id, partial node positions, and optional viewport. It enforces `canvas.layout.write` on the Host, rejects unknown node ids or a mismatched workflow id, assigns a monotonic server-side timestamp, appends exactly one `canvas/layout-change`, and does not change the semantic Canvas snapshot or either Canvas revision.

## Host authorization and audit

`CanvasPermission` defines the shared Host action set used by CanvasService and its Remote, Agent Tool, History, Asset, restore, variant, and layout consumers. The set includes Canvas read/edit/run/cancel, history read, asset read/export/delete, workflow restore, variant create, and layout write.

`CanvasAuthorizationService` is an optional Cordis service exposed as `ctx.canvasAuthorization`. Its default `CanvasAuthorizationPolicy` is appropriate for the current single-user deployment and allows human, agent, and system actors; deployments may override allowed actor kinds per permission. CanvasService always evaluates authorization on the Host, including Browser Remote and layout requests. Creating an initial Canvas with `currentVariantId` requires both the ordinary `canvas.edit` permission and the dedicated `canvas.variant.create` permission.

`CanvasAccessContext` carries only durable-safe actor/source identifiers and optional request/correlation ids. Audit metadata is materialized by allow-list. Semantic workflow configuration is scanned before commit for credential/header/binary-shaped keys such as authorization headers, API keys, tokens, client/callback secrets, passwords, base64/data URLs, blobs, and raw media bytes; diagnostics never echo rejected secret values. The package invariant repeats this audit-safe check at the live Session pre-commit boundary so a direct Host append cannot become a credential bypass.

Authorization and feature policy are independent checks. Authorization answers whether this actor may perform an action; deployment capability answers whether this installation currently offers the action at all. Canvas mutation/query entry points authorize first and then evaluate feature policy before domain commit, so a flag never becomes an ACL substitute and a disabled feature cannot be bypassed by calling the Host service directly.

## Deployment feature policy

N09 adds `CanvasFeatureService`, mounted as `ctx.canvasFeatures` from `@deepseek-ai/dsh-canvas/feature-service` and published as deployment-global Typert namespace `canvasFeatures`. Its validated Cordis Config owns eight switches: `canvas.enabled`, `editor.enabled`, `history.enabled`, `video.enabled`, `variants.enabled`, `partialRun.enabled`, `regionEdit.enabled`, and `providerFallback.enabled`.

The shipped defaults match the capabilities that actually exist at this point in the stack: Canvas, Editor shell, and History are enabled; Video, Variants, Partial Run, Region Edit, and Provider Fallback are disabled. `canvas.enabled` is the parent capability: when it is false, every child effective capability is false even if a child raw toggle says true. `remote.canvasFeatures.get()` returns only this immutable effective capability map, never the raw deployment configuration.

Feature policy controls new use, not historical readability. `CanvasService.get()` stays authorized and readable when Canvas or a child capability is disabled, and Session replay/projections continue decoding old data. A historical video workflow therefore still opens when `video.enabled=false`. It may be dismantled by removing/disconnecting the disabled video nodes or replaced wholesale by a supported workflow, but callers cannot add a new video node, modify/use a disabled video node as an active semantic target, or pass the workflow through `assertWorkflowExecutable()`.

Current Host enforcement includes Canvas mutations, Browser Editor writes, editor layout saves, run-history queries, initial variant identity, and region-bearing interaction staging. `editor.enabled=false` blocks Browser manual workflow mutations and layout writes while preserving Host/Agent semantic-edit capability for the later Agent Tool path. `history.enabled=false` blocks History queries. `variants.enabled=false` blocks new variant identity use. `regionEdit.enabled=false` blocks a direct region-bearing interaction stage even if a caller bypasses the UI.

`run` does not exist yet, so N09 does not publish a fake execution endpoint merely to test a flag. `CanvasFeatureService.assertWorkflowExecutable()` is the frozen Host admission seam that N15/N16 must call before starting Provider/Job work. N10/N18 likewise consume `ctx.canvasFeatures` when deciding which node/tool capabilities may be created or advertised.

## CanvasService

The default package export is `CanvasService`, mounted as `ctx.canvas` and published to Typert namespace `canvas`. It is the single Host façade for current Canvas reads, accepted Canvas/layout writes, and bounded Session-derived history. It requires both the exact live Agent and the exact `agent.session` object currently registered in `ctx.sessions`; wrapping a detached `Session.create()` object in a registered Agent is not a durable write path. It then evaluates authorization, deployment capability where applicable, semantic/layout invariants, audit safety, and the complete detached fold transition before appending Session events. Derived cache state is synchronized only after append succeeds.

`create()` installs an initial workflow; `replaceWorkflow()` and `editWorkflow()` use `WorkflowRef { canvasId, workflowId, workflowRevision }` compare-and-set. Canvas-id, workflow-id, and revision mismatches have distinct stable errors, while `runRevision` remains deliberately absent from the semantic fence. An edit/replace whose final workflow is semantically identical to the current workflow returns current state without appending or manufacturing a new revision. `editWorkflow()` otherwise applies the entire `WorkflowEditOperation[]` batch to a detached draft and commits once after final validation.

`selectOutput()` changes only the primary result selection and is itself no-op aware. `saveLayout()` writes the independent layout stream. `clear()` is a destructive mutation and therefore takes the same `WorkflowRef` CAS fence rather than only a Canvas id; it refuses to tombstone a Canvas while its current Run is queued/running. N16 must first make that Run durably `cancelled` or `interrupted` before clear can remove the current Canvas, preventing a long-running Provider/Job from losing its owner.

## Browser Remote and run history

The generated `./remote` contribution now exposes three namespaces from this one package: durable `canvas` (`editWorkflow`, `replaceWorkflow`, `selectOutput`, `saveLayout`, `clear`, `listRuns`, `getRun`), deployment-global read-only `canvasFeatures` (`get`), and request-local `canvasInteraction` (`stage`, `discard`). Generated artifacts remain build output and are never hand-maintained.

Browser callers never supply `CanvasAccessContext` for normal Canvas mutations: dedicated Remote wrappers create `human` + `browser-remote` access on the Host and then call the same CanvasService methods used by other consumers. Mutation methods return small receipts; the Browser reads committed current Canvas and layout values from Session Projection, so there is deliberately no `getCurrent` RPC. The `clear` Remote now carries a `WorkflowRef` so a stale Browser tab cannot delete a newer semantic revision.

`listRuns()` and `getRun()` derive history directly from `canvas/change` events. Pages are newest-first, default to 20 entries, reject limits above 100, and use an opaque cursor anchored to the run-start Session sequence so later runs do not reorder an in-progress pagination walk. History responses contain durable run/output DTOs only and do not create a second history database. N09 gates these calls with the effective History capability after Host authorization.

The public `CanvasRemoteMethodName` type reserves `createVariant`, `restoreWorkflow`, `run`, and `cancel` names for their owning later domain implementations. Those methods are not registered as Remote endpoints until the corresponding Host behavior exists; the UI does not publish fake success paths.

## Request-local Canvas Interaction Context

`CanvasInteractionContext` is deliberately outside `CanvasSnapshot`, `MediaWorkflow`, `canvas/change`, and Session Projection. It is a one-shot browser snapshot used to interpret deictic instructions such as “this”, “this image”, “this node”, “here”, “这个”, “这张”, and “这里”. The DTO carries `canvasId`, `workflowId`, the sampled `workflowRevision`, optional UI mode, selected node/edge ids, durable selected assets, current-output focus, and an optional normalized region/mask seam.

`decodeCanvasInteractionContext()` strictly bounds and decodes Browser input. At stage time `resolveCanvasInteractionContext()` proves Canvas/workflow identity, checks same-revision node/edge membership, validates current-output focus, and preserves revision drift as an explicit stale state instead of silently rebinding the selection. Selected asset references are additionally proven to be exact historical Canvas outputs from the same Session.

The Host mounts `CanvasInteractionService` from `@deepseek-ai/dsh-canvas/interaction-service`. It is a direct `TypertRemoteService` in this package, published as namespace `canvasInteraction`, and owns no durable state. `stage()` stores a short-lived `{ agent, rpcId } → interaction snapshot`; `discard()` removes an unbound stage when prompt admission fails. N09 makes `canvasFeatures` a required service for this bridge and enforces Canvas/Region Edit capability before staging.

The Browser prompt carrier already mints the ordinary prompt RPC id before transport. `ui-conversation` lets a feature prepare that exact id, so `ui-canvas` stages the frozen selection before the normal `session.prompt` request is sent without widening the Host prompt payload. When the Host later inserts the corresponding user message, `CanvasInteractionBridge` binds the staged RPC id to that exact message id. Concurrent sends and long queues therefore cannot attach one selection to another prompt by timing guesswork.

At `agent/pre-step`, only a bound user message that survives downstream pre-step policy receives Canvas context. The bridge inserts one user-role plugin `snapshot` message immediately before that exact prompt, then consumes the binding. The normal Agent loop writes both messages to Session history before the model request. Browser selection remains ephemeral; the only durable record is the precise context text the model actually received, preserving the system invariant that model-visible content uses logged channels.

If the workflow revision advanced while a prompt waited in Queue, the context renders `STALE` and instructs the Agent to call `canvas_read` before mutating sampled workflow targets. If the Canvas/workflow became unavailable after prompt admission, the already-admitted prompt still runs with `STALE/UNAVAILABLE` context rather than failing after the fact. Missing selection fields are explicit: the model is told not to invent a target.

## Browser presentation consumer

The shipped Web surface mounts `@deepseek-ai/dsh-client-ui-canvas` as a capability-gated `conversation.view` consumer. It first discovers effective capabilities through `remote.canvasFeatures.get()` and registers no Canvas tab on disabled or failed discovery. Once enabled, current Canvas/layout still come only from Session Projection, while Minimal/Editor mode plus interaction selection stay per-session browser-local presentation state. The resident Conversation composer remains owned by `ui-conversation` outside the view ring.

N09 makes Editor Minimal-only when `editor.enabled=false`, preserves historical disabled Video nodes/results instead of hiding data, and marks unsupported video nodes unavailable. N08 node/edge/output selection remains the natural-language reference surface; region selection is stripped at the Browser send boundary when Region Edit is disabled and independently rejected by the Host if directly supplied.

The Canvas client outlet stays runtime-free for Browser use: UI packages consume DTO/projection/interaction/capability declarations type-only rather than loading Host-domain Canvas JavaScript into the browser bundle.

## Model Experience

### Session-native Canvas interaction context

#### What the model sees

No standing Canvas prompt or feature table is added. When and only when an ordinary user prompt is sent with a concrete enabled Canvas selection, the model receives one logged plugin-context message immediately before that user prompt. It contains the sampled/current workflow revision status and the selected node, edge, durable asset, focused output, or enabled region fields that exist. A stale selection explicitly instructs the model to call `canvas_read`; an absent selection contributes no Canvas message and must not be guessed.

#### Token effect

Event sourcing, projections, layout persistence, migration, authorization, audit, feature discovery, replay, Remote mutations, and history remain token-free. Interaction context adds bounded turn-local tokens only on prompts that actually carry a selection. The exact context is durable because it is logged as model-visible history, not reconstructed from later browser state.

#### KV Cache effect

There is no new standing system-prefix impact. The interaction message is ordinary turn-local history, so it affects only the conversation suffix from the turn where selection was used onward.

## Known Limitations and Deferred Work

- **Feature policy is capability, not implementation** — flags for future Video/Variants/Partial Run/Provider Fallback exist now so later nodes share one deployment truth; enabling one cannot create an endpoint/provider/UI that has not been implemented yet.
- **No live Run/Retry/Cancel behavior** — `run` and `cancel` remain reserved names, not registered endpoints; N15/N16 must call the N09 execution-capability seam before Jobs/Provider work starts. N03 only freezes the durable `run-start`/`run-update` lifecycle vocabulary.
- **Interaction selection is not an Agent Tool** — interaction context gives the model grounded referents, but actual Canvas read/edit/run tools remain their owning later node; stale guidance references the planned `canvas_read` contract.
- **Region support is a seam, not a visual mask editor** — normalized region/mask DTOs are supported and feature-gated, while drawing/editing masks and inpaint/outpaint behavior remain later workflow/UI work.
- **Current authorization policy is actor-kind based** — identity ownership, multi-user tenancy, workspace ACLs, approval policy, quotas, and provider-cost admission belong to later governance layers behind the same Host seam.
- **Variant creation and workflow restore are not implemented** — their Remote names are reserved but no endpoint is published until their Host mutations exist.
- **No DAG execution validation** — cycles, registered node port definitions, capability resolution, and scheduler checks belong to the media-workflow engine.
- **No video storage implementation** — `VideoAssetRef` is durable metadata only; the separate media-asset capability owns bytes, authorization, and Range reads.
