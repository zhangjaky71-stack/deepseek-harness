# @deepseek-ai/dsh-media-provider

English | [中文](README.zh.md)

`dsh-media-provider` owns the process-local media Provider/model capability catalog and the pure model requirement resolver used by later Canvas execution layers. N13 does not call Provider APIs, resolve credentials, enforce Canvas permissions/features, create Jobs, or write Session state.

## Registry contract

The default export is `MediaModelRegistry`, mounted as `ctx.mediaModels` when a composition installs it. A Provider plugin registers one `MediaProviderDescriptor` together with every `MediaModelDescriptor` it owns. The registration is atomic and effect-scoped: descriptor validation or any duplicate rejects the whole candidate before commit, and unloading the owning Cordis fiber removes exactly that Provider and its models.

Registry `revision` is process-local and increases once for each successful Provider registration or exact unregistration. `snapshot()` returns one synchronous immutable view containing Providers and models in stable id order. This revision is rebuildable deployment metadata, not durable Canvas/Session state and not comparable across Host restarts.

Provider and model ids are opaque branded strings. Models are keyed by `(providerId, modelId)`. `executionIdentityKey` must also be unique across the live catalog; it represents the concrete Provider/model/version identity whose semantic change must invalidate N12 execution fingerprints.

Providers and models may be registered with `enabled=false`. Disabled entries remain discoverable for settings, diagnostics, and historical provenance, but the resolver never chooses them.

## Model capability descriptor

`MediaModelCapabilities` is Provider-neutral metadata. One model declares:

- supported semantic operations such as `text-to-image`, `image-edit`, `text-to-video`, and `image-to-video`;
- supported aspect ratios, either `any` or an explicit allowlist;
- optional width/height ranges and steps;
- optional duration range and step;
- maximum reference-image count;
- mask, seed, and audio support.

Aspect ratios are normalized to lowest positive integer terms at registration, so `18:32` and `9:16` represent the same ratio. A duplicate that appears only after normalization is rejected.

Width/height constraints are independent numeric limits. When a request supplies both dimensions, the resolver also derives their ratio and applies the model's aspect-ratio policy even if the request omitted an explicit ratio. Supplying an explicit ratio that conflicts with width/height is invalid input rather than a model mismatch.

## Requirement resolution

`MediaModelRequirements` describes the semantic operation and only the capabilities needed for one execution: dimensions, ratio, duration, reference count, mask, seed, and audio.

Resolution has three explicit modes.

### Strict

`strict` carries an exact preferred `(providerId, modelId)` and does not accept a routing policy. Unknown or disabled preferences fail. If the model is available but incompatible, resolution fails with the complete mismatch list. Strict mode never silently changes models.

### Auto

`auto` requires a caller-owned `MediaModelRoutingPolicy.candidateOrder`. The resolver walks that exact order and returns the first enabled compatible model. It does not use plugin registration order, string sorting, or a hidden global default as preference.

### Fallback

`fallback` first honors its explicit preferred model when that model is enabled and compatible. Otherwise it walks the same explicit candidate order as `auto`. A successful replacement returns `MEDIA_MODEL_FALLBACK_USED` with both preferred and actual model/provider references plus any compatibility mismatches known for the preferred model.

Duplicate or unknown routing entries fail as policy errors rather than being silently ignored. If no enabled compatible candidate exists, resolution fails with `MEDIA_MODEL_NO_COMPATIBLE_MODEL`.

## N12 execution identity

A successful resolution returns the actual Provider descriptor, actual model descriptor, warnings, and:

```ts
{ executionIdentity: { key: model.executionIdentityKey } }
```

N12 consumes this opaque identity in `MediaWorkflowEngine`; it fingerprints and forwards the value but never selects the model. This keeps one direction of ownership:

```text
requirements + routing policy
        ↓
N13 MediaModelRegistry / Resolver
        ↓
actual Provider/model + executionIdentity
        ↓
N12 Executor call / fingerprint
```

## Ownership with N14 and N15

N13 catalog availability is not run admission. `provider.enabled` and `model.enabled` only state whether the catalog entry is eligible for model resolution.

N14 owns Provider adapters, credentials, network operations, operation handles, and runtime Provider availability. N15 combines N09 Canvas feature policy, authorization, Provider availability, concurrency, quota/cost, approval, idempotency, and the N13 resolution result before any paid/long-running Provider task begins.

The package is therefore not mounted in the shipped base composition yet. N14 introduces the first Provider runtime consumer and can mount the N13 Registry together with Provider descriptor/adapter registrations. Adding a no-consumer service row in N13 would create deployment state without an operation that uses it.

## Invariant companion

`@deepseek-ai/dsh-media-provider/invariant` currently registers an intentionally empty package contribution. N13 has one process-local authority and enforces descriptor, ownership, duplicate-key, and registration mutation rules at the Registry commit point; there is no independent mutable/event source to compare against yet. N14 may add a real cross-authority runtime invariant when Provider registrations exist.

## Model Experience

None directly. N13 registers no model-facing tool and contributes no prompt text. Later Agent/UI consumers can read the same descriptors instead of maintaining their own model capability tables.

#### Token effect

Zero direct tokens.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **No Provider adapter or network execution** — N14 owns Provider runtime behavior and credentials.
- **No deployment routing-policy service yet** — N13 requires callers of `auto`/`fallback` to provide the complete candidate order explicitly; N14/N15 can source that order from deployment configuration.
- **No Canvas feature/authorization/quota admission** — N15 combines those decisions before execution. A compatible N13 model is not by itself permission to start a task.
- **No Browser/Agent catalog consumer yet** — later Inspector and Agent surfaces can consume the same descriptors without duplicating capability maps.
- **Registry revision is not durable** — a Host restart rebuilds the catalog and revision sequence.
