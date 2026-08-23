# Agent Note: Canvas V2.2 node registry revision identity

Status: implemented

## Problem

N10 already had the correct high-level ownership: `ctx.mediaNodes` was the process-local Host authority for versioned media-node definitions, registrations were effect-scoped, custom node types were open-world, and Browser consumers received only a data-safe catalog. The missing piece was catalog identity.

The old `canvasFeatures.listNodes()` shape returned only `CanvasNodeCatalogEntry[]`. After a plugin unload or HMR replacement there was no mechanical way for a consumer or test to identify which exact Host Registry mutation state produced a Browser catalog. Comparing array contents was insufficient, while inventing a Browser-side generation counter would create a second authority and make stale-catalog reasoning ambiguous.

## Decision

`MediaNodeRegistry` owns a process-local monotonic mutation revision for the lifetime of that Registry instance and exposes an atomic `snapshot()` containing `{ revision, definitions }`.

A fresh Registry starts at revision `0`. Every successful `(type, version)` registration advances the revision exactly once, and every successful exact unregistration advances it exactly once. Validation failures and duplicate-registration failures do not advance the revision. An HMR-style unload followed by replacement registration is two mutations and therefore produces two different revisions. `MediaNodeRegistryChange` carries the resulting revision so observers can align lifecycle notifications with the same Registry sequence.

The revision is not durable state. It is not appended to Canvas Session history, is not a workflow revision, and is not comparable across Host or Registry restarts. Restarting the Host rebuilds the Registry and may restart its revision sequence. Consumers treat a newly fetched Host snapshot as authoritative for that Host lifetime.

The Browser-safe catalog contract is `CanvasNodeCatalogSnapshot { revision, entries }`. `CanvasFeatureService.remoteExportListNodes()` reads one `ctx.mediaNodes.snapshot()`, projects definitions into client-safe entries, and forwards the exact Registry revision. Runtime Zod schemas and functions, Provider objects, credentials, and executor state remain Host-only.

`ui-canvas` stores the returned revision as `nodeCatalogRevision` alongside the entries it loaded. It does not increment, synthesize, persist, or otherwise maintain an independent registry revision. If catalog discovery fails, `nodeCatalogRevision` is absent and Editor may degrade while Minimal and historical Canvas rendering remain readable.

The open-world rule remains unchanged. Built-in nodes are initial registrations, not a permanent enum. Historical workflows containing an unavailable custom node remain decodable and presentable; current validation or execution can report the definition as unavailable. Installing the matching plugin can make the same historical node resolvable without modifying a Canvas-core switch.

N10 intentionally does not add Browser polling or a push-synchronization protocol. Every successful catalog read instead carries an exact Host Registry identity, so a future refresh or subscription feature can replace snapshots using Host-provided identity without changing the authority model.

## Alternatives considered

**A Browser-local generation counter.** Rejected because it would create a second catalog authority whose values could diverge from Host Registry mutations and could not prove which Host state produced a catalog.

**A durable or cross-restart registry generation.** Rejected because Registry membership is rebuildable process metadata, not Canvas or Session durable state. Persisting it would conflate deployment/plugin lifecycle with workflow history.

**A closed built-in node whitelist.** Rejected because the Registry is intentionally open-world. Closing the type universe would break historical custom-node readability and plugin extensibility without improving catalog identity.

**Live polling or push synchronization in N10.** Rejected for this node because exact snapshot identity is sufficient for the current activation model. Live freshness can be added later without introducing another authority.

## Testing

Focused coverage pins the shipped contract: duplicate registration does not change the existing definition or revision; register → unregister → HMR replacement register → unregister produces four distinct revisions; change notifications carry the resulting revisions; seven built-ins produce seven successful mutations from a fresh Registry; Host `listNodes()` returns the exact current Registry revision and reflects a later snapshot on a later call; Browser preserves the Host revision; catalog failure exposes no fabricated revision and preserves Minimal readability; and custom-node historical/open-world behavior remains intact.

## Consequences

The benefit is a mechanically testable identity for every client-safe node catalog without creating Browser authority or durable Registry state. Host, Browser, and future refresh logic can reason about which process-local Registry snapshot produced the entries they are using.

The cost is that revision values are meaningful only within one Registry lifetime, and a catalog loaded during one Browser activation can become stale if plugins change later because N10 does not provide live subscription. When refresh is needed, the Browser must fetch the Host catalog again and replace both `entries` and the Host-provided `revision` together rather than comparing revisions across Host restarts or synthesizing a local generation.
