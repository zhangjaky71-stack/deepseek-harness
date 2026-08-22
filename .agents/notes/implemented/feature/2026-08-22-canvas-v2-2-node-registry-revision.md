# Canvas V2.2 node registry revision identity

## Problem

N10 already had the correct high-level ownership: `ctx.mediaNodes` was the process-local Host authority for versioned media-node definitions, registrations were effect-scoped, custom node types were open-world, and Browser consumers received only a data-safe catalog. The missing piece was catalog identity.

The old `canvasFeatures.listNodes()` shape returned only `CanvasNodeCatalogEntry[]`. After a plugin unload/HMR replacement there was no mechanical way for a consumer or test to say which exact Host Registry mutation state produced a Browser catalog. A Browser could only compare array contents or invent its own generation counter, which would create a second authority and make stale-catalog reasoning ambiguous.

## Durable maintenance contract

`MediaNodeRegistry` owns a **process-local** monotonic mutation revision for the lifetime of that Registry instance.

- A fresh Registry starts at revision `0`.
- Every successful `(type, version)` registration advances revision exactly once.
- Every successful exact unregistration advances revision exactly once.
- Validation failures and duplicate-registration failures do not advance revision.
- HMR-style unload followed by replacement registration is two mutations and therefore two different revisions.
- `snapshot()` returns `{ revision, definitions }` synchronously so the revision and ordered definition set describe the same Registry state.
- `MediaNodeRegistryChange` includes the resulting revision for observers.

The revision is **not durable state**. It is not appended to Canvas Session history, is not a workflow revision, and is not comparable across Host/Registry restarts. Restarting the Host rebuilds the Registry and may restart its revision sequence. Consumers must treat a newly fetched Host snapshot as authoritative for that Host lifetime.

## Host / Browser boundary

The Browser-safe catalog shape is `CanvasNodeCatalogSnapshot { revision, entries }`.

`CanvasFeatureService.remoteExportListNodes()` takes one `ctx.mediaNodes.snapshot()` and projects its definitions into client-safe entries while forwarding the exact Registry revision. Runtime Zod schemas/functions, Provider objects, credentials, and executor state remain Host-only.

`ui-canvas` stores that returned revision as `nodeCatalogRevision` alongside the entries it loaded. It must not increment, synthesize, persist, or otherwise maintain an independent registry revision. If catalog discovery fails, `nodeCatalogRevision` is absent and Editor may degrade while Minimal/historical Canvas rendering remains available.

N10 intentionally does not add Browser polling or a push-synchronization protocol. The important invariant is that every successful catalog read has an exact Host Registry identity. A future refresh/subscription feature can compare or replace snapshots using Host-provided identity without changing the authority model.

## Open-world rule remains unchanged

This revision contract must not be implemented by closing the node-type universe.

Built-in nodes are initial registrations, not a permanent enum. Historical workflows containing an unavailable custom node remain decodable/presentable; current validation/execution can report the definition as unavailable. Installing the matching plugin can make the same historical node resolvable without modifying a Canvas-core switch.

Do not add a Browser node registry, built-in admission whitelist, or durable migration that deletes unknown plugin nodes merely to make catalog synchronization easier.

## Validation that should remain pinned

Focused tests should continue proving:

1. duplicate registration fails without changing the existing definition or revision;
2. register → unregister → HMR replacement register → unregister produces four distinct revisions;
3. change notifications carry the exact resulting revisions;
4. registering the seven built-ins yields seven successful mutations from a fresh Registry;
5. Host `listNodes()` returns the exact Registry revision and reflects a later snapshot on a later call;
6. Browser preserves the Host revision with the loaded catalog;
7. Browser catalog failure exposes no fabricated revision and does not erase the Minimal read surface;
8. custom-node historical/open-world behavior remains intact.

## Residual boundary

A catalog loaded during one Browser activation can become old if plugins change later because N10 does not provide live catalog subscription. That is a presentation freshness concern for a later node, not permission to create a second authority. When refresh is needed, fetch the Host catalog again and replace both `entries` and its Host-provided `revision` together.
