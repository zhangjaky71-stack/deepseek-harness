# @deepseek-ai/dsh-session-projection

English | [中文](README.zh.md)

Session-projection Service Definition and drive registry. It owns `ctx.sessionProjections`, drives registered projection units over committed Session events, and serves finished whole values to browser carriers such as api-proxy history baselines and `session/projection` push frames. A domain owns pure projection mathematics; the framework owns drive, cache checkpoints, browser-read filtering, visibility ordering, HMR/disposal and change delivery. The [session-projection RFC](../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md) records the original design rationale.

## Service: `SessionProjectionRegistry` (`ctx.sessionProjections`)

### Public API

- `register(definition): () => void` registers one domain projection unit. State and fold semantics are pure, synchronous, and versioned by `stateVersion`. A definition may declare a stable `owner`: overlapping registrations with the same explicit owner use latest-definition-active HMR semantics. Different owners may not claim the same key. Legacy unowned duplicates retain same-`stateVersion` first-live compatibility semantics and promote the next surviving definition when that active registration unloads.
- `registerReadGuard(key, guard): () => void` registers a browser-facing visibility guard for one projection key. Multiple guards compose with AND semantics, guard exceptions fail closed, and registration/disposal re-evaluates known-session visibility.
- `refreshBrowserVisibility(session, keys?)` explicitly re-evaluates browser visibility after an ACL/principal decision changes without inventing a Session event.
- `onChanged(listener): () => void` subscribes to browser-facing changes. Ordinary domain changes carry the whole typed value. Visibility-only transitions can carry the framework control envelope in the same `value` slot.
- `snapshot(session): ProjectionSnapshot` returns one synchronous browser-facing cut over registered/readable keys. Live guards receive the exact Session id.
- `checkpoint(session): ProjectionCheckpoint` returns detached internal projection state for persistence. Read guards never delete or mutate checkpoint state.
- `viewCheckpoint(checkpoint, context?)` and `restore(checkpoint, events, baseSeq, context?)` serve detached/cold browser views. A trusted carrier may supply the exact target Session id; absent verified identity, guards receive no invented id and can deny fail closed.

### Key types

- `SessionProjectionMap` is the merge-extensible type table shared across domain providers, baseline blocks, client cells, and UI hooks.
- `ProjectionDefinition<K, S>` is `{ key, owner?, schema, init(), apply(state,event), view(state), stateVersion }`.
- `ProjectionReadContext` identifies the `browser` surface and optionally the exact target `sessionId` supplied by a live Session or trusted carrier.
- `ProjectionReadGuard` decides only whether an already-computed value may leave the Host. It never participates in fold mathematics or durable state.
- `SessionProjectionControlEnvelope` is a type-only description of the reserved live visibility-control shape. The `/types` outlet remains runtime-free.

## Contract

- **Framework drives; domains compute.** The registry subscribes to `session/event` once. Every committed event passes every active unit's synchronous `apply`; domains hold no drive subscription.
- **Same-reference means no downstream domain work.** An uninterested `apply` returns the same state reference. `Object.is` gates ordinary value emission.
- **Whole-value event rule.** State-carrying Session events contain the complete post-change state rather than a bare delta, keeping replay cheap and self-contained.
- **Projection state is plain JSON.** Persisted `(sessionId,key,ver,seq,val)` rows are rebuildable shortcuts, never authority. `stateVersion` invalidates incompatible rows.
- **Read authorization is separate from computation.** A guard runs only after a value has been computed and schema-validated. A denied value remains in internal cells/checkpoints but is absent from browser delivery.
- **Read guards fail closed.** Guard exceptions are deny. Security-sensitive detached/cold carriers must pass the exact target identity they actually own; they must not invent a principal or substitute another resource id.
- **Visibility changes do not forge Session events.** ACL, capability or HMR changes can happen at the same durable Session seq. The registry uses a monotonic per-session/key visibility generation to publish `present -> absent -> present` transitions without modifying domain history.
- **Visibility generation is not a domain revision.** It orders browser visibility only. Domain revisions remain owned by their domains (for Canvas: workflow/run/layout revisions).
- **Baseline values stay ordinary typed values.** Control metadata is live-feed framework metadata, not part of `SessionProjectionMap` and not persisted into domain state.
- **Effects own lifecycle.** Units, listeners and read guards dispose with their registering fiber. The last unit registration disappearing emits explicit absence to known live browser consumers.
- **HMR replacement is owner-scoped.** Same-key definitions replace each other only when both declare the same stable `owner`; newest-live wins and rebuilds from Session history. Different owners are rejected. Unowned duplicates remain a compatibility mode: the first live definition stays active, and unloading it promotes the next surviving same-version definition instead of retaining a disposed ghost.
- **No wire vocabulary ownership here.** Carriers still mint their physical blocks/frames. The registry owns computation and generic browser visibility semantics, not an HTTP/WebSocket protocol.

## Browser visibility ordering

Durable projection updates still use Session `seq`. A browser visibility transition may occur without a new event, so the live feed can carry a reserved control envelope conceptually equivalent to:

```ts
{
  __sessionProjectionControl: {
    generation: number
    present: boolean
    value?: unknown
  }
}
```

The client projection store compares durable seq first and visibility generation for same-seq control transitions. A newer `present:false` therefore removes a value immediately; a later same-seq `present:true` can restore it. Stale generations are ignored. A fresh history/list baseline can re-establish authority after reconnect/truncation.

Empty Session cuts use `-1`, matching `ProjectionSnapshot.asOfSeq` and `session/subscribed.lastSeq`.

## Security role

Projection read guards exist because a Host read permission is incomplete if the protected value can still leave through Session Projection. Canvas uses this seam to apply `canvas.read` consistently to `canvas` and `canvasLayout` while keeping their folds identity-free.

The same policy must hold for every carrier path. In the current Host composition:

- live snapshot/change delivery supplies live `Session.id`;
- history tail responses are re-secured after the core handler: a matching live Session uses `Session.id`; otherwise a matching persisted inspection uses the requested target SessionId;
- detached subagent history uses the same final-source rule for the child SessionId;
- cold list checkpoint views supply `SessionHeader.id`;
- cold restore supplies the requested persisted SessionId.

History tail recomputation also requires the final source log end to equal the page end already returned by the core handler. If attach/detach or persistence drift makes those cuts disagree, the transcript remains servable but the entire projection block is omitted; a baseline evaluated without exact identity is never used as fallback.

The guard is a visibility filter, not durable deletion. Checkpoints and cells retain complete derived state so policy changes never rewrite Session history or destroy replayability. Projection cache output is filtered again at the browser read boundary; persisted cache rows are never an ACL bypass.

## Model Experience

None. Projections derive client-facing read models from already-logged Session state and do not affect prompts, model messages, tool schemas, provider requests, or KV cache behavior.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Browser read context carries the target Session id but no authenticated multi-user/tenant principal. A future Host identity layer must provide that principal rather than deriving it inside projection folds.
- A detached caller that cannot prove a target Session identity must omit it; identity-dependent guards then fail closed.
- Every browser baseline still considers every registered key before read filtering; there is no client-requested lazy key set yet.
- The unit table is process-wide, so unguarded key presence is not a per-session feature signal. Consumers should interpret values/capabilities rather than infer ownership from registration alone.
- Eager drive touches every active unit per event. Cheap same-reference transitions are the current scaling strategy; event-type prefilters can be added later without changing the domain contract.
- Registry cells live in memory; `dsh-session-projection-cache` is the optional persisted shortcut.
- Synchronous-unit discipline is partly review-enforced: schema validation catches an async `view`, but blocking or torn non-Session reads inside `apply` remain implementation errors.
- Repository-pinned generated documentation and i18n metadata must be regenerated/verified after source changes before release acceptance.
