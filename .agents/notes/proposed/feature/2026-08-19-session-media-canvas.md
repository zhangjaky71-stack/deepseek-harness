# Agent Note: Session-native generative media Canvas

Status: proposed

English | [中文](2026-08-19-session-media-canvas.zh.md)

## Problem

Harness needs a media creation surface that an Agent and a human can both operate without splitting authority between browser-only editor state, a separate application database, and model tool state. Image and video generation also produce long-running work and durable binary artifacts that should not become Session JSON payloads.

## Proposal

Canvas becomes a session-scoped domain whose durable authority is the Session log. A Host Canvas service will own mutations; Browser Remotes and model-facing Canvas tools will call the same service. Minimal and Editor presentations will project the same semantic workflow rather than maintain separate document models.

The domain separates `workflowRevision` from `runRevision`. Semantic workflow edits advance only `workflowRevision`; queued/running/terminal lifecycle changes advance only `runRevision`. A run records the immutable workflow revision it executes, so editing the current workflow while an older run continues neither mutates that run nor causes progress updates to invalidate an editor compare-and-set fence.

Semantic workflows contain only media-domain nodes, edges, output ids, and JSON-safe configuration. Browser graph layout and selection remain presentation data, provider request payloads remain provider data, and generated media is represented by durable references rather than binary bytes or bearer URLs. Images reuse the attachment identity already owned by `dsh-attachment`; video storage is a separate capability.

Durable Canvas values are read through an explicit decode/migration boundary before current-domain invariants run. Historical Session data remains immutable; old shapes are migrated only in memory. Unknown future schema or node versions fail loud instead of guessing a downgrade, while deprecated historical node aliases can produce explicit lifecycle notices without becoming valid output of current writers.

The implementation is divided into independently reviewable nodes in the [Canvas V2.1 workplan](../../../workplans/canvas-v2.1/README.md). N01 establishes the pure `@deepseek-ai/dsh-canvas` vocabulary, branded ids, constructors, product-state derivation, and value invariants. N02 adds schema/node version migration seams and append-only golden fixtures before Session events or provider execution are introduced.

## Alternatives considered

**Keep Canvas as a separate iframe application** — rejected as the long-term authority model. An iframe can remain a temporary presentation integration, but a separate process/database cannot provide one Session-replayable state that both Harness tools and the Browser edit directly.

**Reuse the existing model-written WorkflowEngine for media DAG execution** — rejected. That engine executes orchestration scripts and does not own editable media nodes, durable outputs, partial media execution, provider capability resolution, or Canvas revision semantics.

**Make the browser editor authoritative and synchronize Agent changes into it** — rejected. Browser lifetime and reconnect behavior would determine durability, and Agent work could not be reconstructed from the Session log without a second synchronization protocol.

**Use one revision for both workflow edits and run progress** — rejected. Long-running image/video work would continuously stale otherwise independent editor mutations and make compare-and-set conflicts unrelated to the semantic graph.

**Rewrite historical Session events when schemas change** — rejected. Event history stays append-only; readers decode and migrate old values into the current runtime shape, and unsupported future versions fail explicitly.

## Acceptance criteria

- A pure Canvas package owns branded Canvas/workflow/node/edge/run/variant ids and media-domain types without UI or provider SDK dependencies.
- Workflow and run revisions have independent invariants and tests.
- Canvas snapshots reject non-JSON workflow configuration and binary-bearing domain values.
- Durable workflow/snapshot decoding is versioned, migration is separate from current relational invariants, and unknown future versions fail with stable migration errors.
- Golden fixtures freeze V1 workflow, snapshot, layout, run-history, and deprecated-node compatibility behavior without rewriting historical data.
- The product state distinguishes empty, ready, dirty-ready, running, completed, failed, cancelled, and interrupted states, including a run executing an older workflow revision.
- Later Session, Remote, Agent, workflow-engine, asset, image, and video nodes can consume this domain without introducing a second Canvas authority.

## Risks

The domain may encode assumptions before real providers and editor consumers exist. Keep only concepts required by the accepted workplan, preserve the repository's pre-release freedom to correct names and fields, and require each later node to validate the domain against its first concrete consumer rather than adding speculative compatibility layers. Migration code must stay narrow: support only frozen historical shapes that actually have fixtures, not hypothetical upgrade chains.
