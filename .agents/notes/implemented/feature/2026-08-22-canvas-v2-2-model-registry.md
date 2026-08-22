# Canvas v2.2 Media Model Registry / Requirement Resolver ownership

N13 introduces `@deepseek-ai/dsh-media-provider` as the process-local authority for media Provider/model capability metadata and pure requirement resolution. It exists so Agent, Inspector, workflow execution, and later Provider routing can consume one descriptor vocabulary instead of maintaining capability if-else tables in multiple layers.

## The Registry owns catalog metadata, not Provider runtime

`MediaModelRegistry` is a Cordis Service (`ctx.mediaModels`) that accepts one Provider descriptor together with every model descriptor owned by the registering plugin fiber.

The registration is atomic and effect-scoped. A bad descriptor or duplicate rejects the complete candidate before commit; disposing the owning fiber removes exactly that Provider and its models. The process-local revision is rebuildable deployment metadata, not Session durability.

N14 still owns credentials, Provider clients, network requests, operation handles, runtime health, and Provider cancellation. N13 deliberately makes no network call.

## Model availability is not run admission

`provider.enabled` and `model.enabled` only state whether an entry may participate in model resolution. Disabled entries remain discoverable so settings, diagnostics, and historical provenance can still name them.

This is not authorization. N15 must combine N09 feature policy, authorization, Provider runtime availability, concurrency, quota/cost, approval, idempotency, and the N13 resolution result before a paid or long-running task begins.

Keeping these meanings separate prevents a catalog checkbox from becoming an accidental security or billing boundary.

## Provider plugins register one atomic ownership set

A Provider registration owns:

```text
ProviderDescriptor
+ all MediaModelDescriptor values for that Provider
```

Model ids are exact `(providerId, modelId)` identities. `executionIdentityKey` is additionally unique across the live catalog because N12 uses it as the opaque concrete Provider/model/version identity in execution fingerprints.

Registration canonicalizes and freezes capability metadata. Equivalent aspect ratios reduce to one representation (`18:32` → `9:16`), and duplicate ratios after normalization are invalid.

## Change notifications happen after commit and cannot veto it

A final source audit caught a subtle transaction problem in the initial N13 implementation: `onChange` callbacks ran after mutation but an observer exception could escape `register()`. That makes an already-committed operation look failed and can starve later observers.

The final Registry treats change notifications as non-vetoing diagnostics. Each synchronous observer failure is contained and logged; later observers still receive the committed revision. Registration/disposal state never depends on observer success.

This follows the repository rule to publish state only at its commit point and avoids a false rollback contract.

## Requirements are Provider-neutral

`MediaModelRequirements` expresses only semantic execution needs:

- media operation;
- width/height;
- aspect ratio;
- duration;
- reference-image count;
- mask;
- seed;
- audio.

The matcher does not know Provider SDK request shapes.

When both width and height are present, N13 derives their ratio and applies the model's ratio capability even when the caller omitted `aspectRatio`. If an explicit ratio conflicts with the dimensions, the request is invalid rather than merely incompatible with one model. This prevents a model from being selected through an internally contradictory request.

## Strict, Auto, and Fallback have different authority

Strict mode carries one exact preferred Provider/model. It has no routing policy and never switches models. Unknown, disabled, or incompatible preferred models fail explicitly; incompatibility carries the complete mismatch list.

Auto and Fallback consume a caller-owned ordered `candidateOrder`. The resolver never invents preference from plugin registration order, lexical ordering, or a hidden global default.

Fallback first preserves its explicit preference when possible. If it must replace the preference, the result includes `MEDIA_MODEL_FALLBACK_USED` with preferred/actual references and known preferred mismatches.

Duplicate or unknown policy candidates are configuration errors; they are not silently ignored.

## Nested selection discriminants need an explicit request type guard

The public request is intentionally a union where Strict has no `routing`, while Auto/Fallback require it. The discriminant is nested at `request.selection.mode`.

TypeScript does not narrow the containing request union merely from a nested discriminant access. A final review caught that relying on such narrowing would make `routing` accesses fail repository typecheck. The resolver therefore uses an explicit type predicate that narrows `MediaModelResolutionRequest` to `MediaModelPolicyResolutionRequest` before policy-only fields are read. No cast is used to bypass this contract.

## N13 produces the identity N12 consumes

Successful resolution returns the actual Provider/model plus:

```ts
executionIdentity: { key: model.executionIdentityKey }
```

The ownership direction is intentionally one-way:

```text
requirements + deployment candidate order
                ↓
N13 Registry / Resolver
                ↓
actual Provider/model + executionIdentity
                ↓
N12 fingerprint / Executor input
```

N12 must not regain a model-resolver callback. N13 must not execute the Provider request.

## No shipped composition row before the first consumer

The package is buildable and registered in the Host TypeScript aggregate, but N13 does not add a shipped base-composition service row. There is no Provider runtime consumer yet, so mounting an empty deployment catalog globally would create state without a current operation that uses it.

N14 can mount `MediaModelRegistry` together with the first real Provider adapter and descriptor registration.

## Invariant companion is intentionally empty for now

The package publishes `@deepseek-ai/dsh-media-provider/invariant` because every package owns an invariant companion.

Its current installer carries a package-specific `No runtime invariant:` reason. N13 has only one mutable catalog authority, and descriptor/ownership/duplicate/mutation rules are already enforced at that authority's commit point. Re-validating the same values from the same source would not be an independent runtime invariant.

When N14 creates a separate Provider runtime registration authority, that relationship becomes a legitimate cross-authority invariant candidate.

## New package uses the current declaration layout

Review against `packages/AGENTS.md` corrected the first N13 package draft from the legacy `outDir: lib` shape to the current `lib/types` declaration layout. Runtime JS remains under `lib/*.js`; `package.json` type/export paths point at `lib/types/*.d.ts`.

The root Host aggregate explicitly references `packages/canvas/media-provider` so repository typecheck cannot accidentally skip the new project.

## Lockfile is a generated-toolchain boundary

Because N13 creates a new pnpm workspace package, `pnpm-lock.yaml` needs a new importer generated by the repository-pinned pnpm toolchain before frozen install can pass.

The connected editing environment does not provide a trustworthy pinned repository install. The lockfile is therefore not hand-edited. This is a deliberate validation blocker, not an omission to disguise.

## Validation status

N13 remains `REVIEW`. Source contracts, tests, docs, invariant/package wiring, and built-LIB smoke are present, but acceptance requires real repository-pinned lockfile generation, install, typecheck, lint, build, coverage/focused tests, and the built-output smoke.

The surrounding Canvas stack has repeatedly shown GitHub Actions failures before project steps start (`steps=[]`, Azure `BlobNotFound`) and queued enterprise runners. If N13 exact-head Actions reproduce that pattern, it is infrastructure evidence rather than a test verdict.
