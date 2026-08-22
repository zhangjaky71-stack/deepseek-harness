# `@deepseek-ai/dsh-media-workflow`

English | [中文](README.zh.md)

Browser-independent media workflow definitions and execution engine for Canvas V2.2. Current integration baseline: Harness `dsh@0.1.1-rc.2`.

## Responsibilities

This package owns two related but separate process-level capabilities:

- **Media Node Registry** — exact `(type, version)` definitions, ports, config schemas, lifecycle metadata, feature requirements and executor metadata.
- **Workflow Engine** — deterministic validation, partial-run planning, immutable run snapshots, execution fingerprints, optional cache seams, executor dispatch and cancellation checks.

It does not own Session persistence, Browser graph rendering, Provider model selection, Provider SDKs, credentials, image/video binary storage, quota, cost or approval.

## Open-world registry

Node types are open-world extension identifiers. Core registration does not enforce a built-in node-type whitelist. Historical custom nodes remain valid durable workflow data when their plugin is absent; current authoring/execution then reports an unavailable exact definition.

Registry snapshots are immutable and carry a process-local monotonic revision. Registration/unregistration advances the revision exactly once; restart may begin again at zero. The revision is discovery/HMR state, not a Session durable generation.

Browser consumers receive only a client-safe catalog projection. Runtime validators/functions/credentials never cross that boundary.

## Exact version rule

Every definition/executor lookup uses `(node.type, node.nodeVersion ?? 1)`. A historical `foo@1` node must never borrow ports/config/execution metadata from the currently installed `foo@2` definition.

## Workflow engine

The engine validates graph structure and exact definitions, then produces a deterministic plan for full or partial execution. Supported scheduling semantics include full runs and explicit selected/from-node/downstream scopes with boundary inputs.

A run snapshot is immutable. Later Browser edits or registry HMR do not mutate an already admitted run.

## Asset boundary under `0.1.1-rc.2`

Workflow semantic values may carry stable Canvas image/video AssetRefs. The engine does not own Harness Attachment image normalization or `RequestImageAttachment` derivation.

Request-image bytes, transform-cache paths, temporary Provider URLs and remote Files upload identities must not enter workflow snapshots or semantic fingerprints. Fingerprints are based on stable semantic inputs/content identities and the exact media execution identity resolved by N13.

## Model/provider boundary

This package describes node execution requirements; it does not select the generation model/provider. N13 resolves media-generation requirements, N14 invokes Provider adapters, N15 performs governance and N16 owns durable run lifecycle.

Harness Chat LLM model routing remains a different domain.

## Browser/editor relationship

`ui-canvas` obtains exact version catalog metadata through the Host client-safe node catalog and uses it for Node Library, ports and Inspector behavior. Missing definitions make historical nodes read-only/unavailable; the Browser never creates a second registry.

## Validation and cache rules

Fresh executor outputs and cache hits must pass the same semantic output validation. Layout coordinates, Browser selection and request transport state do not affect semantic fingerprints.

## Upgrade/revalidation

The N10 registry and N12 engine implementations are largely retained during the 0.1.1-rc.2 migration. Revalidation focuses on:

- the latest client package/domain graph for the catalog projection;
- stable Attachment-backed asset values without request-image leakage;
- built package/runtime-closure gates after upstream synchronization.

See workplans N10 and N12 plus `UPSTREAM-0.1.1-RC2-BASELINE.md`.