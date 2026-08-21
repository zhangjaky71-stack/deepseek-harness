# @deepseek-ai/dsh-session-projection

English | [中文](README.zh.md)

Session-projection Service Definition and drive registry. It owns `ctx.sessionProjections`, drives registered projection units over committed Session events, and serves finished whole values to browser carriers such as api-proxy history baselines and `session/projection` push frames. A domain owns pure projection mathematics; the framework owns drive, caching, browser-read filtering, and change delivery. The [session-projection RFC](../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md) records the original design rationale.

## Service: `SessionProjectionRegistry` (`ctx.sessionProjections`)

### Public API

- `register(definition): () => void` registers one domain projection unit. State and fold semantics are pure, synchronous, and versioned by `stateVersion`.
- `registerReadGuard(key, guard): () => void` registers a browser-facing visibility guard for one projection key. Multiple guards compose with AND semantics, guard exceptions fail closed, and the registration is tied to the caller fiber for disposal/HMR safety.
- `onChanged(listener): () => void` subscribes to browser-facing changed projection values. A changed value denied by a read guard is not emitted.
- `snapshot(session): ProjectionSnapshot` returns one synchronous browser-facing cut over registered and readable keys. Live guards receive the exact Session id.
- `checkpoint(session): ProjectionCheckpoint` returns detached internal projection state for persistence. Read guards do not delete or mutate checkpoint state.
- `viewCheckpoint(checkpoint)` and `restore(checkpoint, events, baseSeq)` serve detached browser views. Detached guards receive no invented Session identity and may therefore deny fail closed.

### Key types

- `SessionProjectionMap` is the merge-extensible type table shared across domain providers, wire blocks, client cells, and UI hooks.
- `ProjectionDefinition<K, S>` is `{ key, schema, init(), apply(state,event), view(state), stateVersion }`.
- `ProjectionReadContext` currently identifies the `browser` surface and optionally the exact live `sessionId`.
- `ProjectionReadGuard` decides only whether an already-computed value may leave the Host on the browser projection surface. It does not participate in fold mathematics or durable state.

## Contract

- **Framework drives; domains compute.** The registry subscribes to `session/event` once. Every committed event passes every registered unit's synchronous `apply`; domains hold no drive subscriptions.
- **Same-reference means no downstream work.** An uninterested `apply` returns the same state reference. `Object.is` gates the change feed.
- **Whole-value event rule.** State-carrying Session events contain the complete post-change state rather than a bare delta, making projection transitions cheap and replay self-contained.
- **Projection state is plain JSON.** Persisted cache rows are `(sessionId,key,ver,seq,val)` shortcuts, never authority. `stateVersion` invalidates incompatible rows.
- **Read authorization is separate from computation.** A read guard runs only after a value has been computed and schema-validated. A denied value remains present in internal cells/checkpoints but is omitted from browser snapshots/change frames.
- **Read guards fail closed.** A thrown guard is treated as deny. Identity-dependent guards must also decide what to do for detached reads where `sessionId` is unavailable; security-sensitive domains should normally deny.
- **No principal is invented.** This registry does not authenticate users, tenants, or transports. A domain/carrier may use the exact live Session id as an input to its Host authorization seam; future identity layers can extend the carrier contract without contaminating projection folds.
- **Effects own lifecycle.** Projection units, listeners, and read guards all dispose with their registering fiber. No HMR/unload path may leave stale projection or security registrations behind.
- **No wire vocabulary here.** Carriers mint their own blocks/frames. The registry remains the computation/read-control seam rather than a protocol package.

## Security role

Projection read guards exist because a Host service permission is incomplete if the same protected value can still leave through Session Projection. Canvas uses this seam to apply `canvas.read` consistently to the `canvas` and `canvasLayout` browser projection keys while keeping their folds identity-free. Other domains should add a guard only when they have a real Host read policy; the registry itself does not create generic ACL semantics.

The guard is a visibility filter, not durable deletion. Checkpoints and projection cells retain the complete derived state so policy changes do not rewrite Session history or destroy replayability.

## Model Experience

None. Projections derive client-facing read models from already-logged Session state and do not affect prompts, model messages, tool schemas, provider requests, or KV cache behavior.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Browser read context currently carries an exact live Session id but no authenticated user/tenant principal. Multi-user identity/tenancy must be supplied by the Host carrier/authorization layer rather than inferred here.
- Detached checkpoint/history views have no live Session identity. Identity-dependent guards therefore fail closed unless the domain explicitly defines a safe identity-free policy; a future carrier may provide a verified detached-session principal without changing projection mathematics.
- Every browser baseline still considers every registered key before read filtering; there is no client-requested lazy key set yet.
- The unit table is process-wide, so unguarded key presence is not a per-session capability signal. Consumers should interpret the value rather than infer feature ownership from registration alone.
- Eager drive touches every unit per event. Cheap same-reference transitions are the current scaling strategy; event-type prefilters can be added later without changing the domain contract.
- Registry cells live in memory; `dsh-session-projection-cache` remains the optional persisted shortcut.
- Synchronous-unit discipline is partly review-enforced: schema validation catches an async `view`, but blocking or torn non-Session reads inside `apply` remain implementation errors.
