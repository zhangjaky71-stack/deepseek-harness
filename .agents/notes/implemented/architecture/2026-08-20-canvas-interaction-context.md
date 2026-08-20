# Canvas interaction context is ephemeral selection with logged model-visible context

## Decision

Canvas selection used by natural-language deictic references is **not** durable Canvas state. Node/edge/asset/output/region selection remains per-session Browser-local presentation state until the user submits an ordinary prompt.

At submission, the Browser freezes one `CanvasInteractionContext` anchored to the Canvas/workflow identity and sampled `workflowRevision`. That detached snapshot is correlated to the exact ordinary prompt using the prompt carrier's existing RPC id. When—and only when—the exact admitted user message enters an Agent step, the Host inserts a Canvas plugin-context message immediately before that prompt. The normal Agent loop logs that model-visible message before the request.

Therefore both statements are simultaneously true and must remain true:

1. Browser selection itself is not Workflow state, `canvas/change`, layout state, or Session Projection.
2. The exact Canvas context text a model actually receives **is** Session history, because model-visible content must use logged channels.

## Correlation invariant

Never bind Canvas selection to “the next inbox message” or “the next turn” by timing. Concurrent prompt admissions and existing Queue rows make that incorrect.

The ordinary `session.prompt` carrier already mints one unique RPC id before transport, and the Host records that id in the exact user-message source. Canvas interaction staging reuses that identity:

```text
send-time selection snapshot
  → prepare exact prompt rpcId
  → stage(agent, rpcId, context)
  → ordinary prompt admission
  → source.rpcId on exact user message
  → bind rpcId to that messageId
  → consume only when that message survives agent/pre-step
```

A failed ordinary prompt discards an unbound stage. A rejected/discarded inbox message drops its binding. Selection can never spill into a later prompt.

## Staleness invariant

Semantic selections remember the revision at which they were made.

- Same Canvas/workflow, same revision: validate selected node/edge membership.
- Same Canvas/workflow, later revision: preserve the old sampled revision and mark context `STALE`; do not silently reinterpret an old target as current.
- Replaced Canvas/workflow identity before send: attach no old selection.
- Canvas/workflow unavailable after prompt admission but before claim: keep the accepted prompt and render `STALE/UNAVAILABLE` rather than failing it retroactively.

Current-output focus and durable asset identity are intentionally separate. A `{runId, assetIndex}` focus expires when it stops being current; an exact durable asset reference may remain a valid referent afterward.

## Asset isolation invariant

A Browser-supplied asset reference must be an exact durable Canvas output previously recorded in the same Session. Shape validation or opaque-id equality alone is insufficient. Region and mask asset references follow the same rule.

## Service topology

Do not merge ephemeral correlation maps into durable `CanvasService` state.

The Canvas package owns two direct Typert services:

- `CanvasService` → namespace `canvas`, durable Session-backed authority.
- `CanvasInteractionService` → namespace `canvasInteraction`, short-lived correlation only.

Both are generated into the same `@deepseek-ai/dsh-canvas/remote` contribution. The base bundle mounts `@deepseek-ai/dsh-canvas/interaction-service` beside the ordinary Canvas service. This avoids a second workspace/package while preserving a clean service boundary.

Typert gateway classes must directly inherit `TypertRemoteService`; do not wrap the durable Canvas service in an inherited subclass just to add interaction methods, because the generator's gateway-service binding intentionally recognizes the direct heritage boundary.

## Client boundary

`ui-conversation` owns a feature-neutral send-time preparation registry. It synchronously snapshots feature state at submit time, and the fetch carrier invokes preparation after it mints the ordinary prompt RPC id but before envelope observation/transport. The Host prompt wire payload is unchanged.

`ui-canvas` registers one preparation provider only after `remote.canvasInteraction` is mounted. With no concrete selection the provider returns nothing. Minimal/Editor mode and interaction selection remain Browser-local and Session-isolated.

## Model-visible form

Canvas context uses a user-role plugin `snapshot` message so the Conversation UI can render it as context rather than a human bubble. It lists only sampled fields that exist and explicitly says not to invent a target when selection is absent. Stale context instructs the Agent to re-read Canvas before mutating semantic targets.

## Non-goals

This decision does not implement Canvas Agent tools, provider execution, run/cancel, DAG mutation, mask drawing, or durable interaction recovery across Host process death. Those capabilities may consume the interaction context later but must not move Browser selection into durable Canvas state to do so.
