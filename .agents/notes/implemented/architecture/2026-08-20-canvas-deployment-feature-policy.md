# Canvas feature policy is deployment state, not durable Canvas state

## Decision

Canvas feature flags describe what the **current deployment** may expose or execute. They are not business history and must not enter `CanvasSnapshot`, `MediaWorkflow`, `canvas/change`, layout events, or Session Projection.

The Host owns one effective capability source through `ctx.canvasFeatures`. Shipped profiles mount `@deepseek-ai/dsh-canvas/feature-service` in `dsh-base`; Browser UI discovers the same policy through read-only `remote.canvasFeatures.get()`, and future Agent tools/run admission must consume the same Host service rather than duplicate flag logic.

## Capability vocabulary

The deployment policy owns these switches:

- `canvas.enabled`
- `editor.enabled`
- `history.enabled`
- `video.enabled`
- `variants.enabled`
- `partialRun.enabled`
- `regionEdit.enabled`
- `providerFallback.enabled`

`canvas.enabled` is the parent. When it is false, every child **effective** capability is false even if a child raw config says true.

The shipped defaults match implemented capability, not product aspiration: Canvas/Editor/History are enabled; Video/Variants/Partial Run/Region Edit/Provider Fallback remain disabled until their owning implementation nodes exist.

## Authorization is separate

Feature policy must never become an ACL substitute.

For an operation with both concerns, Host order is:

```text
exact live Agent
  → authorization / actor / source
  → deployment capability
  → domain validation / audit validation
  → Session commit or bounded query
```

Authorization answers “may this actor do it?” Feature policy answers “does this deployment offer it?” UI visibility is only an affordance and cannot replace either Host check.

## Historical readability invariant

Disabling a feature must not make old Session data unreadable.

A historical Video workflow remains decodable and visible when `video.enabled=false`. The user may remove/disconnect disabled Video nodes or replace the workflow with a supported one. The deployment must reject **new active use** of the disabled capability: adding a Video node, editing/connecting it as an active semantic target, making it an output, or admitting the workflow for execution.

This distinction is required for safe downgrade, rollback, staged rollout, and opening Sessions created under a more capable deployment.

`CanvasService.get()` therefore remains an authorized read even while Canvas or a child feature is disabled. Replay and Projection also remain feature-neutral because they reconstruct historical truth rather than current deployment permission.

## Browser fail-closed invariant

`ui-canvas` does not guess deployment capability from compiled code or local defaults. It waits for `remote.canvasFeatures`, calls `get()`, and registers the Canvas conversation view only when the Host says effective `canvas.enabled=true`.

Missing Remote, business failure, transport failure, or disposal before asynchronous discovery settles produces no Canvas tab. Once enabled, current Canvas business state still comes from Session Projection; capability discovery is not a second Canvas-state source.

When `editor.enabled=false`, an existing browser-local `editor` preference is treated as Minimal for rendering without rewriting that preference or writing Session state. Historical disabled nodes/results stay visible and are marked unavailable rather than silently hidden.

## Request-local interaction invariant

Canvas interaction context follows the same capability truth. The Browser strips a stale local Region selection when `regionEdit.enabled=false` so an otherwise valid ordinary prompt can still send. The Host independently rejects a direct region-bearing `canvasInteraction.stage`, so a caller bypassing UI cannot activate a disabled region capability.

## Future execution invariant

N09 must not publish fake `run`/provider behavior simply to demonstrate a flag. `CanvasFeatureService.assertWorkflowExecutable()` is the frozen Host admission seam for later execution nodes. N15/N16 must call it before creating any Job or provider task. N10 and N18 likewise use `ctx.canvasFeatures` when deciding which node/tool capabilities may be created or advertised.

A flag can disable an implementation, but enabling a flag cannot fabricate an implementation that is not installed yet.

## Composition boundary

The shipped base profile always mounts `canvas-features` before Canvas interaction consumers. Custom or pre-N09 compositions that intentionally omit the service retain legacy behavior; they are not the shipped deployment policy and must not be used by new product code as an implicit “all enabled” signal.

Feature defaults live in the validated `CanvasFeatureService.Config`/policy layer, not duplicated in bundle YAML. A later profile patch overrides the feature row configuration as one deployment choice.
