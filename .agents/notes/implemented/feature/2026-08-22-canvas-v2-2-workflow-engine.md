# Canvas v2.2 Media Workflow Engine ownership

N12 adds a Browser-independent media DAG engine to `@deepseek-ai/dsh-media-workflow`. The package now owns static graph validation, deterministic planning, immutable execution snapshots, exact-version executor dispatch, execution fingerprints, deterministic cache reuse, a cancellation seam, and an optional runtime-event sink. It still does not own Canvas durability, model/provider selection, admission, or Jobs.

## Engine is a library, not a new deployment authority

`MediaWorkflowEngine` consumes the existing N10 `MediaNodeRegistry`, a caller-supplied `MediaNodeExecutorRegistry`, and an optional cache. N12 does not add a new shipped Cordis service row merely to make the Executor Registry globally reachable. There is no current provider-backed consumer that requires that deployment lifetime yet; N14 may mount or adapt the executor registration seam when Provider adapters exist.

This keeps the N10 Definition Registry as the current Host catalog authority while making Engine execution open-world: a custom node participates by registering its Definition and an exact `(type, version)` Executor, without adding a node switch to the Engine.

## Model resolution stays outside the Engine

An earlier N12 prototype accepted a `resolveModelKey()` callback on the run request. That makes model selection happen inside the execution loop and weakens N13 ownership.

The final request instead accepts optional `MediaNodeExecutionIdentity` values that are already resolved by the caller. N12 treats the non-empty stable `key` as opaque execution identity: it includes the key in the node fingerprint and passes it to the Executor, but it never chooses or falls back between models/providers.

N13 owns model descriptors and strict/fallback resolution. N14 owns Provider adapters/routing. N15 owns deployment feature, authorization, quota/cost/approval/concurrency admission. N16 owns durable Run/Job lifecycle, retry, cancel races, and reconciliation.

## Fingerprints preserve graph identity

A node fingerprint includes exact type/version, schema-normalized config, optional resolved execution identity, and upstream contributions. Each upstream contribution carries edge id, source node id, source port, target port, and producer content fingerprint.

This is intentional. Sorting multiple values on one port only by their content fingerprint can make two distinct graph connections share the same cache key. N12 canonicalizes the graph-aware contribution data instead, so a topology change that can affect semantics changes the fingerprint even when the content hashes happen to match.

Only Definitions with `execution.deterministic=true` participate in automatic cache reads/writes. Generative/non-deterministic nodes remain uncached by default.

## A cache hit is not trusted executor output

Cached values cross a storage seam and must not bypass the Executor result contract. A cache hit is validated against the exact Definition's output ports/types/requiredness and producer fingerprint requirements, then detached and frozen before downstream nodes receive it.

The process-local memory cache also detaches on read/write. A cache implementation can therefore be replaced later without making cache contents a second semantic authority.

## Partial execution has explicit boundaries

`selected`, `from-node`, and `downstream` plans never silently re-run excluded upstream nodes. Any edge crossing from an unscheduled producer into the scheduled scope becomes an explicit boundary requirement. Missing or type-incompatible boundary values fail the Engine call.

The deterministic topological order uses stable node/edge identities rather than caller array order. Definitions declaring `supportsPartialRun=false` reject partial scopes that schedule them.

## Runtime events are in-band and non-durable

`WorkflowEventSink` receives `node-started`, `node-cache-hit`, and `node-completed` runtime facts. Publishing is part of the current Engine call: a sink rejection fails that call. The sink is not a Session event API and N12 does not persist it.

N16 may adapt these facts into its durable Run/Job state machine. Until then, no caller should treat the N12 event stream as replayable state.

## Cancellation checks engine-controlled settlement points

The caller's `AbortSignal` is forwarded to the Executor, but the Engine does not rely on every Executor honoring it correctly. It checks cancellation before work and again after asynchronous cache/executor operations. A late Executor result returned after cancellation is not accepted as a completed node.

This is only an execution cancellation seam. N16 still owns user-visible cancel lifecycle, Provider cancel, idempotency, terminal winner rules, and reconciliation.

## Published-path evidence

The package exposes `@deepseek-ai/dsh-media-workflow/engine`. Its built-LIB smoke requires `lib/engine.js` and runs a built `prompt@1` DAG under plain Node with real Cordis Registry/Builtins fibers, preventing a source-only success from hiding a broken published subpath.

Repository-pinned exact-head validation remains required before N12 can be accepted. Current Canvas stack Actions have repeatedly failed before project steps execute (`steps=[]`/log `BlobNotFound`) or remained queued on enterprise runners, so those infrastructure failures are not evidence that this Engine passed or failed its tests.
