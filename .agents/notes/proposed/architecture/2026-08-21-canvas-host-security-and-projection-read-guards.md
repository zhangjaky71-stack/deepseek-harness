# Agent Note: Canvas Host security and Session Projection read guards

Status: proposed

English | [中文](2026-08-21-canvas-host-security-and-projection-read-guards.zh.md)

## Problem

Canvas has more than one Host read/write transport even though Session is the only durable authority. Browser Remote, Agent Tool, system reconciliation, run history, asset routes, and Session Projection must not invent independent authorization or actor-attribution rules.

Three gaps are security-relevant. A structurally valid direct `Session.append('canvas/change', ...)` can bypass CanvasService unless current writers are mechanically owned. Protecting only `ctx.canvas.get()` is incomplete when the Browser receives the same state through Session Projection. Provider SDK/HTTP errors can contain credentials or raw request data and must not be copied into durable Run state.

## Decision

Canvas security is Host-owned and layered:

```text
trusted Host provenance
  → resource-aware authorization
  → durable-data safety / domain preflight
  → package-owned current-write authority
  → Session precommit + commit
```

### Principal and resource are separate

`CanvasAccessContext` is canonical audit attribution, not caller-asserted identity. Browser and asset paths use one Host-minted single-user principal, `human:host-browser`. The target Session is carried separately in `CanvasAuthorizationRequest.sessionId` and typed resource scope; a Session id is never reused as a human identity.

Agent Tool attribution remains bound to the exact target Agent id. Reconciler work uses an explicit system actor. Direct Host calls use the exact Agent or a system actor. Browser payloads and Tool arguments therefore cannot claim a stronger actor/source pair.

The Browser principal is intentionally temporary. A future authenticated human/tenant identity layer replaces the principal source behind this same Host seam without changing Canvas permissions or resource identities.

### Authorization is resource-aware and may fail closed

`CanvasAuthorizationRequest` contains permission, Session target, actor/source attribution, and typed resource identity. The built-in actor-kind policy remains the single-user fallback. Deployments that require an external policy set `authorizationMode=required-external`; a missing or throwing policy service fails closed without exposing backend diagnostics.

### Current writers require a package permit

CanvasService performs authorization, provenance binding, validation, durable-data safety, and detached-fold preflight before entering a one-shot process-local write permit. When the Canvas invariant companion is mounted, it consumes the exact permit at Session `internal/dispatch` before log publication. Direct current `canvas/change` and `canvas/layout-change` appends without that permit are rejected.

The permit prevents accidental alternate Host writers and architecture drift. It is not a sandbox against malicious code already executing in the same process. Historical events replay without a current-writer permit. Lightweight compositions without the invariant companion still rely on CanvasService correctness; production mechanical direct-append rejection therefore requires the invariant in the composition.

### Projection folds stay pure; Browser delivery is authorized

Session Projection state calculation remains identity-free. `ProjectionDefinition.init/apply/view` does not receive users, transports, or ACLs.

`SessionProjectionRegistry.registerReadGuard(key, guard)` adds a Browser-facing delivery gate after schema validation. Snapshot values and change-feed frames are omitted when any guard denies or throws. Internal cells/checkpoints remain complete derived state.

Live guards receive the exact target Session id. Canvas combines that target with the same Host-minted Browser principal used by Remote and Interaction, then evaluates `canvas.read` for both `canvas` and `canvasLayout`. Detached cache/history views currently do not invent a Session target; identity-dependent external policies therefore fail closed there. Projection-cache durability remains unaffected because checkpoint persistence uses the unfiltered internal `checkpoint()` surface.

The registry defines no generic ACL. A domain registers a read guard only when it owns a real Host read policy.

### Durable diagnostics are safe summaries

Workflow config rejects structural credential/header/binary carriers and selected explicit credential signatures. Current durable Canvas safety also covers Run error code/message, image/video durable object ids, and safe image display metadata.

Provider raw errors follow:

```text
raw provider/HTTP error
  → Host classification + redaction
  → stable safe code + bounded safe summary
  → durable CanvasRunError
```

Additional diagnostics belong to N23 redacted logs/traces, not Session JSON. This boundary protects Harness/Provider/Host structural secrets; it is not a promise to detect every secret-looking string deliberately pasted by a user into semantic content.

## Consequences

- Browser UI visibility is never an authorization mechanism.
- Browser Remote, Projection, and Interaction share one Host-minted principal and keep the Session as a separate target resource.
- Agent Tool, History, Asset, Run, and Reconciler code reuse the same Host permission/resource vocabulary.
- Session Projection remains a generic computation seam while supporting domain-owned read visibility decisions.
- Authorization denial does not delete projection state or rewrite Session history.
- External policy failure can be configured fail closed without changing Canvas Domain.
- N16 must redact Provider errors before persisting Run failures.
- N17/N21 asset routes must authorize typed asset resources through the same seam.
- Multi-user identity/tenancy remains deferred without requiring a second Canvas authorization architecture.

## Rejected alternatives

**Use Session id as the Browser human id** — rejected because resource identity is not user identity and would couple security semantics to an accidental Agent/Session-id relationship.

**Authorize only in Browser Remote wrappers** — rejected because Agent Tool, Asset, system, and direct Host paths would bypass it.

**Put authorization inside projection `apply/view`** — rejected because projection mathematics would become caller-dependent and replay/checkpoint behavior would no longer be pure.

**Treat Session Projection visibility as automatically equivalent to Session access** — rejected because Canvas exposes a concrete `canvas.read` Host permission; a parallel unguarded state path would make that permission misleading.

**Persist raw Provider exceptions and redact only in UI** — rejected because the credential would already be durable in Session history.

**Use a global `key.includes("token")` scanner** — rejected because legitimate semantic configuration such as `maxTokens` would become unusable while other credential carriers would still be missed.
