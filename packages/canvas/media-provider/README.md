# @deepseek-ai/dsh-media-provider

English | [中文](README.zh.md)

`dsh-media-provider` owns two Host-side authorities for Canvas media execution: the N13 process-local Provider/model capability catalog and requirement resolver, plus the N14 Provider runtime adapter registry and generic N12 executor bridge. The package does not write Canvas/Session state, expose credentials to workflows, or perform run admission.

## N13 model catalog

The default export is `MediaModelRegistry`, mounted as `ctx.mediaModels` when a composition installs it. A Provider plugin registers one `MediaProviderDescriptor` together with every `MediaModelDescriptor` it owns. Registration is atomic and effect-scoped: invalid metadata or any duplicate rejects the complete candidate before commit, and unloading the owning Cordis fiber removes exactly that Provider and its models.

Registry `revision` is process-local and advances once for each successful Provider registration or exact unregistration. `snapshot()` returns one immutable synchronous view containing Providers and models in stable id order. The revision is rebuildable deployment metadata, not durable Canvas/Session state and not comparable across Host restarts.

Provider and model ids are opaque branded strings. Models are keyed by `(providerId, modelId)`. `executionIdentityKey` is additionally unique across the live catalog and represents the concrete Provider/model/version identity consumed by N12 fingerprints. `getModelByExecutionIdentity()` performs the reverse lookup without requiring N12 or N14 callers to parse that opaque key.

Providers and models may be registered with `enabled=false`. Disabled entries remain discoverable for settings, diagnostics, and historical provenance, but the resolver never selects them.

## Model capability descriptor

`MediaModelCapabilities` is Provider-neutral metadata. One model declares:

- semantic operations such as `text-to-image`, `image-edit`, `text-to-video`, and `image-to-video`;
- supported aspect ratios, either `any` or an explicit allowlist;
- optional width/height ranges and steps;
- optional duration range and step;
- maximum reference-image count;
- mask, seed, and audio support.

Aspect ratios are normalized to lowest positive integer terms at registration, so `18:32` and `9:16` represent the same ratio. A duplicate that appears only after normalization is rejected.

Width/height constraints are independent numeric limits. When a request supplies both dimensions, the resolver also derives their ratio and applies the model's aspect-ratio policy even if the request omitted an explicit ratio. An explicit ratio that conflicts with width/height is invalid input rather than a model mismatch.

## Requirement resolution

`MediaModelRequirements` describes only the semantic operation and capabilities needed for one execution. Resolution has three explicit modes.

### Strict

`strict` carries an exact preferred `(providerId, modelId)` and no routing policy. Unknown, disabled, or incompatible preferences fail. Strict mode never silently changes models.

### Auto

`auto` requires a caller-owned `MediaModelRoutingPolicy.candidateOrder`. The resolver walks that exact order and returns the first enabled compatible model. It does not use plugin registration order, lexical sorting, or a hidden global default as preference.

### Fallback

`fallback` first preserves its explicit preferred model when that model is enabled and compatible. Otherwise it walks the same explicit candidate order as `auto`. A successful replacement returns `MEDIA_MODEL_FALLBACK_USED` with preferred/actual references and the known preferred mismatches.

Duplicate or unknown routing entries fail as policy errors. If no enabled compatible candidate exists, resolution fails with `MEDIA_MODEL_NO_COMPATIBLE_MODEL`.

A successful resolution returns the actual descriptors plus the opaque N12 execution identity:

```ts
{ executionIdentity: { key: model.executionIdentityKey } }
```

## N14 runtime adapter registry

The `@deepseek-ai/dsh-media-provider/runtime` subpath exports `MediaProviderRuntimeRegistry`, mounted as `ctx.mediaProviders`. N13 selects a model; N14 routes only the resolved `providerId`. Runtime registration requires the matching N13 Provider descriptor to exist first, rejects duplicate adapters, and is effect-scoped so HMR/plugin disposal removes the exact adapter.

A `MediaProvider` implements three operations:

```ts
start(request, signal)  // inline completion, polling task, or callback task
resume(handle, signal)  // pending or completed
cancel(handle, signal)  // Provider-owned cancellation
```

`MediaProviderOperationHandle` contains only safe opaque task identity: `providerId`, `mode`, and `providerTaskId`. N14 keeps it serializable so N16/N22 can later retain and reconcile asynchronous operations. N14 itself does not make the handle durable across Host restarts.

Provider-specific credentials, endpoints, SDK objects, and request payloads stay inside adapter/deployment implementations. The semantic `MediaProviderRequest` contains only the resolved Provider/model identity, node type/version, normalized workflow config, semantic prompt/reference inputs, and operation-specific requirements. Browser, Workflow, Session, and Tool results never receive credentials or Provider bearer URLs from this layer.

`runMediaProviderOperation()` drives inline, polling, and callback-backed resume flows under one `AbortSignal`. For asynchronous tasks, an abort requests `provider.cancel(handle)` and the operation rejects with `MEDIA_PROVIDER_ABORTED`. Later durable retry/reconciliation remains N16/N22 ownership.

## Provider error normalization

Adapters may throw SDK/provider errors, but the runtime surface exposes stable `MediaProviderError` codes. HTTP-like `429` becomes `MEDIA_PROVIDER_RATE_LIMIT`; `5xx` becomes `MEDIA_PROVIDER_SERVER_ERROR`; adapters may also use `MEDIA_PROVIDER_REJECTED`, `MEDIA_PROVIDER_TIMEOUT`, and other stable codes.

Public error messages never copy raw Provider response bodies or secret-bearing SDK text. The original cause may remain process-local on the Error object for Host diagnostics, but it is not part of the semantic Provider result contract.

## N12 ProviderExecutor bridge

`registerBuiltinMediaProviderExecutors()` installs exact-version N12 executors for the current Provider-backed built-ins:

- `image.generate@1` → `text-to-image`;
- `image.edit@1` → `image-edit`;
- `video.generate@1` → `text-to-video`;
- `video.image-to-video@1` → `image-to-video`.

The bridge requires the N13 execution identity supplied to N12, resolves the exact model through `MediaModelRegistry`, verifies that the model still exists/enables the required capability, then routes to the matching runtime adapter. N12 remains Provider-neutral and does not parse Provider/model identity strings.

Provider media bytes are validated for the binding's expected kind/count before any storage side effect. The bridge then calls a `MediaProviderOutputMaterializer`, which converts Host-local bytes into stable image/video asset refs plus content fingerprints. N14 tests use an in-memory materializer; N17/N21 own the durable attachment/media-asset implementations. A Provider never writes Canvas/Session state directly.

## Runtime/catalog invariant

`@deepseek-ai/dsh-media-provider/invariant` now checks the N13/N14 cross-authority relation: every registered runtime adapter must have a matching N13 Provider descriptor. Runtime registration already enforces this relationship at its own commit point; the invariant independently catches invalid reconstructed composition state.

## Ownership with N15/N16/N17/N21/N22

Catalog availability and runtime adapter presence are not run admission. N15 combines N09 feature policy, authorization, runtime availability, concurrency, quota/cost, approval, idempotency, and the N13 model resolution before a paid or long-running operation starts.

N16 owns durable Run/Job lifecycle, retry, terminal-state races, and reconciliation. N17/N21 own durable image/video byte storage and authorized asset reads. N22 owns production asynchronous video Provider resume/reconciliation. N14 supplies the adapter/handle/error/materialization seams those layers consume.

No N14 service or Mock Provider is added to shipped base profiles yet. The only N14 Provider implementation in this node is the opt-in test Mock; a real deployed Provider arrives in N20/N22 and can mount the catalog/runtime services together with its own adapter/configuration.

## Model Experience

None directly. This package registers no model-facing tool and contributes no prompt text. It only executes an already-planned media node after model selection/admission layers have supplied the required runtime inputs.

#### Token effect

Zero direct tokens.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **No real cloud Provider in this package** — N14 defines the adapter/runtime seam; N20/N22 add production image/video adapters.
- **Output materialization is a seam, not storage** — N17/N21 must durably save bytes before returning stable refs. Until then, only tests provide an in-memory materializer.
- **Async handles are not durable yet** — N14 can start/resume/cancel polling or callback tasks in-process; N16/N22 own restart-safe persistence and reconciliation.
- **No run admission** — N15 must authorize and govern a resolved runtime operation before execution; catalog eligibility and adapter presence alone never authorize work.
- **No shipped Provider composition yet** — the Mock stays test-only and real deployment configuration is deferred to the real Provider nodes.
- **Registry revisions and runtime registrations are process-local** — Host restart rebuilds both authorities from composition.
