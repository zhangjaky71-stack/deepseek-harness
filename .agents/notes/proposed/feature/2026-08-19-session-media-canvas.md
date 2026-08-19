# Agent Note: Session-native generative media Canvas

Status: proposed

English | [中文](2026-08-19-session-media-canvas.zh.md)

## Problem

Harness needs a media creation surface that an Agent and a human can both operate without splitting authority between browser-only editor state, a separate application database, and model tool state. Image and video generation also produce long-running work and durable binary artifacts that should not become Session JSON payloads.

## Proposal

Canvas is a session-scoped domain whose durable authority is the Session log. A Host Canvas service owns business mutations; Browser Remotes and model-facing Canvas tools call the same service. Minimal and Editor presentations project the same semantic workflow rather than maintain separate document models.

The domain separates `workflowRevision` from `runRevision`. Semantic workflow edits advance only `workflowRevision`; run lifecycle changes advance only `runRevision`. A run records the immutable workflow revision it executes, so editing the current workflow while an older run continues neither mutates that run nor causes progress updates to invalidate an editor compare-and-set fence.

Semantic workflows contain only media-domain nodes, edges, output ids, and JSON-safe configuration. Browser graph layout and selection remain presentation data, provider request payloads remain provider data, and generated media is represented by durable references rather than binary bytes or bearer URLs. Images reuse the attachment identity already owned by `dsh-attachment`; video storage is a separate capability.

Durable Canvas values pass through an explicit decode/migration path before current-domain invariants run. Historical Session data stays append-only; old values are migrated only in memory. Unknown future schema or node versions fail loud instead of guessing a downgrade, while deprecated historical node aliases produce explicit lifecycle notices without becoming valid output of current writers.

Every accepted Canvas business mutation is one `canvas/change` Session event containing the complete post-change `CanvasSnapshot`; `clear` contains a null tombstone. A strict pure fold validates the relationship between consecutive mutations, and the package invariant independently stages the next fold state before Session publication. The Host `CanvasService` derives its cache from the committed log and publishes no cache state before `session.append()` succeeds.

Workflow edits use `WorkflowRef { canvasId, workflowId, workflowRevision }` compare-and-set. `runRevision` is intentionally excluded so run lifecycle changes do not make unrelated semantic edits stale. A batch of workflow operations is applied to a detached draft, validated as a complete workflow, and committed by one event or not committed at all.

The `canvas/change.meta` object is versioned independently from the event envelope. The initial metadata version carries no actor or authorization decision; the authorization node extends that metadata while preserving historical readability. Security policy therefore stays Host-owned without making the first event-sourcing implementation invent a partial authorization model.

The implementation is divided into independently reviewable nodes in the [Canvas V2.1 workplan](../../../workplans/canvas-v2.1/README.md). The Canvas package owns domain values, migration, strict replay, runtime invariants, and the Host write service before projection, Remote, provider execution, or UI layers are introduced.

## Alternatives considered

**Keep Canvas as a separate iframe application** — rejected as the long-term authority model. An iframe can remain a presentation integration, but a separate process/database cannot provide one Session-replayable state that both Harness tools and the Browser edit directly.

**Reuse the existing model-written WorkflowEngine for media DAG execution** — rejected. That engine executes orchestration scripts and does not own editable media nodes, durable outputs, partial media execution, provider capability resolution, or Canvas revision semantics.

**Make the browser editor authoritative and synchronize Agent changes into it** — rejected. Browser lifetime and reconnect behavior would determine durability, and Agent work could not be reconstructed from the Session log without a second synchronization protocol.

**Use one revision for both workflow edits and run progress** — rejected. Long-running image/video work would continuously stale otherwise independent editor mutations and make compare-and-set conflicts unrelated to the semantic graph.

**Rewrite historical Session events when schemas change** — rejected. Event history stays append-only; readers decode and migrate old values into the current runtime value, and unsupported future versions fail explicitly.

**Emit node-level delta events as Canvas authority** — rejected. Fine-grained deltas make replay and atomic multi-operation edits depend on partial intermediate states. One full post-change snapshot per accepted business mutation keeps the Session log sufficient for replay while semantic operations remain request-side input.

**Update a service cache before appending the Session event** — rejected. The cache is derived state and cannot become visible before the durable commit point; append failure must leave both the log and live view unchanged.

## Acceptance criteria

- A pure Canvas domain owns branded Canvas/workflow/node/edge/run/variant ids and media-domain types without UI or provider SDK dependencies.
- Workflow and run revisions have independent invariants and tests.
- Canvas snapshots reject non-JSON workflow configuration and binary-bearing domain values.
- Durable workflow/snapshot decoding is versioned, migration is separate from current relational invariants, and unknown future versions fail with stable migration errors.
- Golden fixtures freeze V1 workflow, snapshot, layout, run-history, and deprecated-node compatibility behavior without rewriting historical data.
- `canvas/change` is sufficient to reconstruct current Canvas state from a cold Session replay; `clear` reconstructs to null.
- `CanvasService` is the Host mutation owner, and cache state is derived only from committed Session events.
- A workflow-operation batch advances `workflowRevision` once and cannot partially commit.
- Workflow CAS rejects stale semantic revisions while ignoring independent `runRevision` changes.
- The package invariant rejects malformed or impossible Canvas transitions before Session publication.
- Authorization, actor/audit metadata, projection, Remote, provider execution, Agent tools, and UI remain separate owning nodes rather than bypasses around `CanvasService`.

## Risks

Full snapshots make individual Canvas events larger than delta events. Keep `CanvasSnapshot` UI-scale: do not add binary payloads, full history, raw provider responses, or progress history. The service cache must remain an optimization rather than authority, so every cache behavior requires a cold-replay equivalent. The event metadata version must evolve deliberately when authorization/audit fields arrive so historical pre-authorization events remain readable without pretending they contain actors they never recorded.
