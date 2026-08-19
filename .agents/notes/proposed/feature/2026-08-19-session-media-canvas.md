# Agent Note: Session-native generative media Canvas

Status: proposed

English | [中文](2026-08-19-session-media-canvas.zh.md)

## Problem

Harness needs a media creation surface that an Agent and a human can both operate without splitting authority between browser-only editor state, a separate application database, and model tool state. Image and video generation also produce long-running work and durable binary artifacts that should not become Session JSON payloads.

## Proposal

Canvas is a session-scoped domain whose durable authority is the Session log. A Host Canvas service owns business mutations; Browser Remotes and model-facing Canvas tools call the same service. Minimal and Editor presentations project the same semantic workflow rather than maintain separate document models.

The domain separates `workflowRevision` from `runRevision`. Semantic workflow edits advance only `workflowRevision`; run lifecycle changes advance only `runRevision`. A run records the immutable workflow revision it executes, so editing the current workflow while an older run continues neither mutates that run nor causes progress updates to invalidate an editor compare-and-set fence.

Semantic workflows contain only media-domain nodes, edges, output ids, and JSON-safe configuration. Editor layout is a separately persisted presentation value; provider request payloads remain provider data, and generated media is represented by durable references rather than binary bytes or bearer URLs. Images reuse the attachment identity already owned by `dsh-attachment`; video storage is a separate capability.

Durable Canvas values pass through an explicit decode/migration path before current-domain invariants run. Historical Session data stays append-only; old values are migrated only in memory. Unknown future schema or node versions fail loud instead of guessing a downgrade, while deprecated historical node aliases produce explicit lifecycle notices without becoming valid output of current writers.

Every accepted semantic Canvas mutation is one `canvas/change` Session event containing the complete post-change `CanvasSnapshot`; `clear` contains a null tombstone. A strict pure fold validates consecutive mutations, and the package invariant independently stages the next fold state before Session publication. The Host `CanvasService` derives its cache from the committed log and publishes no cache state before `session.append()` succeeds.

Workflow edits use `WorkflowRef { canvasId, workflowId, workflowRevision }` compare-and-set. `runRevision` is intentionally excluded so run lifecycle changes do not make unrelated semantic edits stale. A batch of workflow operations is applied to a detached draft, validated as a complete workflow, and committed by one event or not committed at all.

Canvas authorization is a Host concern shared by all transport and tool consumers. `CanvasPermission` names the actions that Browser Remote, Agent Tool, History, Asset, restore, variant, and layout paths must request. `CanvasAuthorizationService` is optional; CanvasService always evaluates it when present and otherwise uses the same allow-list policy implementation as the current single-user fallback. UI visibility is never treated as enforcement.

Request identity is explicit. `CanvasAccessContext` contains a `human`, `agent`, or `system` actor, a known request source, and optional request/correlation ids. `canvas/change.meta` evolves independently from the event envelope: historical metadata schema version 1 remains readable, while current writers record canonical actor/source metadata v2. Durable audit values are allow-listed and semantic workflow data rejects credential/header/binary-shaped fields before commit.

Editor layout has its own durable stream. `canvas/layout-change` contains one complete `CanvasLayoutSnapshot` and current audit metadata. Layout writes are authorized with `canvas.layout.write`, must target the current workflow identity, cannot reference absent current nodes, and do not advance either Canvas revision. The combined package invariant validates Canvas and layout streams together before publication.

Current Browser-facing state is projected, not queried from a second database. When Session Projection is composed, CanvasService registers `canvas → CanvasSnapshot | null` and `canvasLayout → CanvasLayoutSnapshot | null`. Both projections are whole-value, UI-scale, and omit history, binary payloads, provider raw responses, logs, and progress history. Projection folds are fail-soft and return the same state reference for unrelated/malformed events; strict rejection remains the responsibility of the durable write/replay path.

Semantic workflow edits preserve current layout because layout has an independent stream. Canvas `create` and `clear` reset the current layout projection to null so a later Canvas cannot inherit stale coordinates if a workflow id is reused. Historical layout events remain in the Session log and therefore remain auditable/replayable as history without becoming current state.

The client-safe `@deepseek-ai/dsh-canvas/client` outlet carries Canvas and layout projection types without importing Host services. Browser current state therefore comes only from Session Projection. There is no Canvas `getCurrent` Remote method.

Browser mutations use Typert Remote wrappers on the same `CanvasService`. The wrappers accept business arguments only, create `human` + `browser-remote` access on the Host, and then call the ordinary Host mutation methods, so a Browser cannot supply a forged system or Agent actor. Mutation results are small receipts; the subsequent current value arrives through Projection.

Run history is a bounded query view derived from `canvas/change`, not a second durable store. `listRuns` walks runs newest-first with a default page size of 20 and a hard maximum of 100; its opaque cursor is anchored to the run-start Session sequence so newly appended runs do not reorder an in-progress pagination walk. `getRun` derives the same DTO by run id. History responses contain durable references and run metadata, not binary media or provider objects.

The Remote namespace publishes only behavior that exists on the Host. `editWorkflow`, `replaceWorkflow`, `selectOutput`, `saveLayout`, `clear`, `listRuns`, and `getRun` are active. The public method-name type reserves `createVariant`, `restoreWorkflow`, `run`, and `cancel`, but those endpoints are not registered until their corresponding Host mutations exist. Generated `./typert` and `./remote` artifacts remain build output rather than hand-maintained source.

`dsh-base` mounts `@deepseek-ai/dsh-canvas` in every profile. Browser Remotes and later Agent tools therefore resolve the same Host service instead of relying on a Web-only Canvas owner.

The implementation is divided into independently reviewable nodes in the [Canvas V2.1 workplan](../../../workplans/canvas-v2.1/README.md). The Canvas package owns domain values, migration, strict replay, runtime invariants, Host authorization/audit, bounded projections, independent layout persistence, Typert mutation/history APIs, and the single Host façade before provider execution, Agent tools, media assets, or UI are added.

## Alternatives considered

**Keep Canvas as a separate iframe application** — rejected as the long-term authority model. An iframe can remain a presentation integration, but a separate process/database cannot provide one Session-replayable state that both Harness tools and the Browser edit directly.

**Reuse the existing model-written WorkflowEngine for media DAG execution** — rejected. That engine executes orchestration scripts and does not own editable media nodes, durable outputs, partial media execution, provider capability resolution, or Canvas revision semantics.

**Make the browser editor authoritative and synchronize Agent changes into it** — rejected. Browser lifetime and reconnect behavior would determine durability, and Agent work could not be reconstructed from the Session log without a second synchronization protocol.

**Store node coordinates inside `MediaWorkflow`** — rejected. Dragging a node would create a semantic workflow revision, stale Agent/editor CAS fences, and make execution fingerprints depend on presentation-only state.

**Expose current Canvas through a dedicated `getCurrent` RPC** — rejected. A second current-state query path would compete with Session Projection. Browser current state comes from projection; Remote APIs carry mutations and bounded history queries.

**Persist run history in a separate Canvas database** — rejected. Session already records the durable run lifecycle and outputs. A second store would need synchronization and conflict rules; bounded History queries instead derive from the append-only Session log.

**Let Browser callers provide `CanvasAccessContext`** — rejected. Actor/source attribution is a Host transport responsibility; accepting it from the Browser would let an untrusted caller claim another actor kind.

**Use one revision for both workflow edits and run progress** — rejected. Long-running media work would continuously stale otherwise independent editor mutations.

**Emit node-level delta events as Canvas authority** — rejected. Fine-grained deltas make replay and atomic multi-operation edits depend on partial intermediate states. Whole post-change values keep Session replay sufficient.

**Authorize only in Browser or Agent Tool adapters** — rejected. A second caller could bypass the check. Canvas permissions are decided by the Host service used by every consumer.

## Acceptance criteria

- Canvas/workflow/run values, schema migration, and semantic invariants are UI/provider independent.
- `canvas/change` cold replay reconstructs the same current Canvas as live service state.
- Workflow CAS fences semantic revision only; run revision changes do not stale an edit.
- Every current Canvas read/mutation goes through Host authorization and accepted mutations carry durable actor/source attribution.
- `canvas/layout-change` is independent from semantic workflow revisioning and is rejected if it targets another workflow or absent node.
- `CanvasService.saveLayout()` leaves `workflowRevision` and `runRevision` unchanged.
- Session Projection exposes only `canvas` and `canvasLayout` whole current values for this domain and remains bounded as Session history grows.
- Cold projection replay equals live projection state after Canvas and layout mutations.
- Semantic workflow edits retain layout; Canvas create/clear reset current layout projection without rewriting historical layout events.
- Projection registration unloads with the Canvas service fiber.
- Browser-facing projection and Remote DTO types are available through a client-safe package face.
- Canvas has no `getCurrent` Remote endpoint; committed current state continues through Session Projection.
- Browser Remote mutations are attributed as `human` + `browser-remote` and pass through Host authorization before Session append.
- Run-history pagination is bounded and stable when newer runs are appended after a cursor is issued.
- Generated Canvas Remote contribution mounts through `api-remotes` and the built HTTP chain can mutate Host Canvas state.
- Every shipped profile mounts the same Host `ctx.canvas` service through `dsh-base`.
- Provider execution, Agent tools, asset routes, and UI remain consumers of the same Session/Canvas authority rather than independent state stores.

## Risks

Whole Canvas events are larger than deltas, so `CanvasSnapshot` and projection values must stay UI-scale. Layout and semantic graph state intentionally evolve independently; future Editor code must treat positions as optional presentation hints and ignore entries that are not relevant to the current graph. Projection and History are derived views, not durability: Session replay and strict package invariants remain authoritative. Stable cursor semantics depend on append-only Session sequence numbers. The current Browser human id is a session-level surrogate in the single-user deployment; a future identity layer must replace that attribution without moving authorization out of the Host. The current authorization policy is still actor-kind based and will need stronger tenancy/ACL policy behind the same Host seam when multi-user ownership is introduced.
