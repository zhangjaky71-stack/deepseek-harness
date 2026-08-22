# Canvas V2.2 Media Provider Runtime Ownership

## Decision

Canvas media Provider execution is split into four independently owned layers:

```text
N13 model catalog / resolver
        ↓ resolved opaque execution identity
N14 Provider runtime / semantic adapter
        ↓ validated Provider media bytes
N17/N21 output materializer / durable asset storage
        ↓ stable media asset refs
N12 execution result consumed by later N16 Run/Job orchestration
```

N14 never parses model-selection policy out of workflow data and never persists Provider bytes directly into Canvas or Session state. It routes an N13-resolved execution identity to an exact Provider runtime adapter, drives that operation, validates the Provider result, and hands the validated bytes to an explicit materializer seam.

## Why the execution identity remains opaque

N13 owns Provider/model capability resolution. Its `executionIdentityKey` represents the concrete execution identity whose semantic change must invalidate N12 fingerprints.

N14 must not derive `providerId` or `modelId` by parsing that string. Doing so would turn an opaque invalidation key into a second routing protocol. `MediaModelRegistry.getModelByExecutionIdentity()` is the exact reverse lookup; N14 consumes that API and then routes by the returned model's `providerId`.

This preserves one authority for Provider/model identity and allows the execution key format to change without rewriting ProviderExecutor.

## Runtime registration follows catalog registration

A Provider runtime adapter can exist only while the N13 catalog contains its Provider descriptor. `MediaProviderRuntimeRegistry.register()` enforces this before commit, and the package invariant independently checks the same relation during reconstructed composition startup.

The runtime registry captures the N13 registry when the service activates. Registration effects still belong to the calling plugin fiber. This distinction matters because Cordis service method tracing binds `this.ctx` to the caller context: using `this.ctx.mediaModels` inside `register()` would accidentally force every caller to inject `mediaModels` even though the caller only consumes `mediaProviders`.

## Provider requests stay semantic

The N14 request vocabulary contains only media semantics needed by the four V1 Provider-backed nodes: prompt, image/mask/reference assets, output count, workflow config, and the already-resolved model identity.

Credentials, endpoint URLs, SDK objects, Provider request bodies, bearer download URLs, and raw Provider responses are adapter-owned deployment data. They must not enter MediaWorkflow config, Canvas durable state, Session logs, Browser state, or generic ProviderExecutor results.

A real Provider adapter is therefore added by registering catalog metadata plus a runtime implementation. Canvas Domain and N12 scheduler do not gain Provider switches.

## Validate before materializing

N14 checks Provider completion metadata and then checks the node binding's expected media kind/count before `MediaProviderOutputMaterializer` is called.

This ordering is deliberate. N17/N21 will eventually make the materializer durable. If N14 materialized first and validated later, a malformed Provider response could create durable orphan objects before the operation fails.

The materializer is a capability seam rather than an N14 storage implementation because N17/N21 are the asset-authority nodes. N14 tests use an in-memory materializer; production assembly must later supply the real durable implementation.

## Cancellation is one lifecycle operation

An asynchronous Provider operation is represented by one opaque `(providerId, mode, providerTaskId)` handle. When the owning AbortSignal fires, N14 requests Provider cancellation exactly once.

Automatic abort cancellation does not pass the already-aborted signal into `provider.cancel()`. Both a synchronous throw and an asynchronous rejection from that cancellation attempt are contained so they cannot replace the primary `MEDIA_PROVIDER_ABORTED` result. N14 waits for that one cancellation request to settle before returning the aborted operation to its caller.

Explicit cancellation for future N16/N22 reconciliation remains a separate function and reports normalized cancellation failures instead of swallowing them.

## Error normalization

Provider SDK/network failures are normalized to stable N14 error codes. Public error messages may carry safe Provider id, status, and retry delay metadata, but do not copy raw Provider response bodies, credentials, URLs, or SDK payload text.

Raw causes remain process-local diagnostic causes only. They are not a transport, Session, tool-result, or Browser contract.

## Mock Provider role

`@deepseek-ai/dsh-media-provider-mock` is an opt-in test/support Provider, not a production Provider. It registers one N13 model plus one N14 adapter and supports deterministic image/video bytes, resumable polling/callback state, fault injection, cancellation, and duplicate completion tests.

It is intentionally absent from shipped profiles. Its bytes are fixtures rather than valid production media, and it does not emulate credentials, billing, quota, moderation, or real network behavior.

## Maintainer rules

- Keep model selection in N13. N14 consumes the resolved identity; it does not choose a fallback model.
- Keep feature/authorization/quota/approval/concurrency admission in N15. A compatible/runtime-available Provider is not permission to start work.
- Keep durable Run/Job ownership and restart reconciliation in N16/N22.
- Keep durable attachment/media storage in N17/N21. Do not make Provider adapters write Canvas/Session/storage directly.
- Validate Provider result semantics before calling a durable materializer.
- Do not turn `executionIdentityKey` into a parsable routing format.
- Provider registry/catalog notifications are post-commit and non-vetoing; observer failures cannot make committed state look failed.
- The Mock Provider must stay opt-in and must never become a shipped production dependency.
