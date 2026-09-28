# @deepseek-ai/dsh-media-provider-mock

English | [中文](README.zh.md)

`dsh-media-provider-mock` is the opt-in N14 test Provider for Canvas media workflows. It registers one N13 Provider/model pair and one N14 runtime adapter, produces deterministic Host-local image/video bytes, supports synchronous and resumable operation modes, and can inject normalized Provider failures without contacting a cloud service.

The package is test/support infrastructure. It is not mounted in shipped profiles and is not a substitute for a real Provider's credential, billing, quota, moderation, latency, or network behavior.

## Registration

The function plugin requires `ctx.mediaModels` and `ctx.mediaProviders`. On one owning Cordis fiber it registers:

- Provider id `mock-media`;
- model id `mock-universal-v1`;
- execution identity `mock-media/mock-universal-v1@1`;
- capabilities `text-to-image`, `image-edit`, `text-to-video`, and `image-to-video`;
- a `MockMediaProvider` runtime adapter under the same Provider id.

Disposing the fiber removes the model catalog contribution and runtime adapter through the registries' effect lifetimes. The Mock package does not register Canvas, Session, Browser, or Job state.

## Deterministic outputs

Successful operations emit non-empty `Uint8Array` fixtures whose JSON text records only safe test metadata: Provider id, model id, semantic capability, node type, sequence number, and output index. Image operations use `image/png`; video operations use `video/mp4`.

`text-to-image` returns the requested `count`; `image-edit`, `text-to-video`, and `image-to-video` each return one output. The bytes are intentionally not valid production media files. N14 tests only need deterministic Host-local payloads to exercise ProviderExecutor and the output-materialization seam; N17/N21 own actual binary validation/storage behavior.

## Operation modes

Without a queued scenario, `MockMediaProvider.start()` completes inline. `enqueue()` configures subsequent starts with:

```ts
mock.enqueue({
  mode: 'polling',        // inline | polling | callback
  pendingResumes: 2,
  retryAfterMs: 1,
  delayMs: 0,
})
```

Polling and callback scenarios return an opaque `providerTaskId`. `resume()` returns the configured number of `pending` updates and then one immutable completion. Later duplicate `resume()` calls return the same completion, which makes duplicate-completion tests deterministic. `cancel()` marks the task cancelled; later resume fails with `MEDIA_PROVIDER_ABORTED`.

Callback mode models the N14/N22 resumable handle contract, not an HTTP callback server. A real callback receiver/reconciliation path belongs to N22.

## Failure injection

A queued scenario can inject:

- `rate-limit` → SDK-shaped status `429`, normalized by N14 to `MEDIA_PROVIDER_RATE_LIMIT`;
- `server-error` → SDK-shaped status `503`, normalized to `MEDIA_PROVIDER_SERVER_ERROR`;
- `rejected` → `MEDIA_PROVIDER_REJECTED`;
- `timeout` → `MEDIA_PROVIDER_TIMEOUT`.

Failures can occur at `start` or the first `resume`. The 429/503 fixtures deliberately contain a fake raw response string so tests can prove N14's normalized public message does not copy Provider response text.

## Full-DAG use

Tests can combine the Mock with the real N10/N12 registries and engine:

```text
prompt@1
  ↓ text
image.generate@1
  ↓ image-list
output@1
```

The generic N14 ProviderExecutor routes the resolved Mock execution identity to this adapter. A test materializer converts the returned bytes to stable test asset refs. The DAG therefore exercises the same Provider-neutral N12 path used by future real adapters without requiring credentials or external services.

## Invariant companion

`@deepseek-ai/dsh-media-provider-mock/invariant` intentionally contributes no independent runtime check. The Mock owns no durable/shared authority beyond its N13 catalog and N14 runtime registrations, and `dsh-media-provider` already owns the invariant relating those two authorities.

## Model Experience

None directly. The Mock registers no model-facing tool and contributes no prompt text. It exists only for deterministic keyless tests and development compositions that explicitly opt in.

#### Token effect

Zero direct tokens.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Fixture bytes are not valid production media** — N17/N21 test real attachment/media-asset validation and storage separately.
- **No credential or endpoint behavior** — the Mock intentionally stores no secrets and opens no network connection.
- **No real billing/quota/moderation semantics** — N15 governance and real Provider adapters own those behaviors.
- **Callback mode is resumable-state simulation only** — N22 owns real callback ingress and restart-safe reconciliation.
- **No shipped composition row** — tests/examples must opt in explicitly; production profiles must never depend on this package.
