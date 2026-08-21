# Agent Note: Canvas Host security and Session Projection read guards

Status: proposed

English | [中文](2026-08-21-canvas-host-security-and-projection-read-guards.zh.md)

## Problem

Canvas has more than one Host read/write transport even though Session is the only durable authority. Browser Remote, Agent Tool, system reconciliation, run history, asset routes, and Session Projection must not each invent their own authorization or actor attribution rules.

Two gaps are particularly dangerous. First, a structurally valid direct `Session.append('canvas/change', ...)` could bypass a CanvasService permission check unless the current writer itself is mechanically owned. Second, protecting `ctx.canvas.get()` with `canvas.read` is incomplete when the Browser receives the same current value through Session Projection.

Provider execution adds a third boundary: raw SDK/HTTP errors can contain Authorization headers, API keys, signed URLs, or request payloads. Such diagnostics must never be copied directly into durable `CanvasRunError` state.

## Decision

Canvas security is Host-owned and split into four independent layers:

```text
trusted provenance
  → resource-aware authorization
  → durable-data safety / domain preflight
  → package-owned current-write authority
  → Session precommit + commit
```

### Provenance is not caller assertion

`CanvasAccessContext` is canonical audit attribution. The Host binds each source to an expected actor shape and the exact target Agent/Session where applicable. Browser payloads do not claim `system`; Agent Tool calls cannot name another Agent identity; reconciler work uses an explicit system actor.

The current human identity is a single-user Session/Agent surrogate, not the final multi-user identity model. A future identity layer replaces the principal source behind the same Host seam.

### Authorization is resource-aware and may fail closed

`CanvasAuthorizationRequest` contains the permission, Session id, actor/source attribution, and typed resource identity. The built-in actor-kind policy remains the single-user fallback. Deployments that require an external policy set `authorizationMode=required-external`; missing or throwing policy services fail closed without exposing backend diagnostics.

### Current writers require a package permit

CanvasService performs authorization, provenance binding, validation, durable-data safety, and detached-fold preflight before entering a one-shot process-local write permit. The Canvas Session invariant consumes the exact permit at `internal/dispatch` before log publication. Direct current `canvas/change` and `canvas/layout-change` appends without that permit are rejected.

This permit prevents accidental alternate Host writers and architecture drift. It is not a sandbox against malicious code already executing in the same process. Historical events are replayed without a current-writer permit.

### Projection folds stay pure; delivery is authorized

Session Projection state calculation remains identity-free. `ProjectionDefinition.init/apply/view` does not receive users, transports, or ACLs.

`SessionProjectionRegistry.registerReadGuard(key, guard)` adds a browser-facing delivery gate after schema validation. Snapshot values and change-feed frames are omitted when any guard denies or throws. Internal cells/checkpoints remain complete derived state.

Live guards receive the exact Session id. Detached cache/history views do not invent an identity; an identity-dependent domain can fail closed. Canvas registers `canvas.read` guards for both `canvas` and `canvasLayout`, so Browser Projection cannot bypass the Host read permission.

The registry defines no generic ACL. A domain only registers a guard when it has a real Host read policy.

### Durable diagnostics are safe summaries

Workflow config rejects structural credential/header/binary carriers and selected explicit credential value signatures. The current durable Canvas audit also covers Run error code/message and safe asset display metadata.

Provider raw errors follow:

```text
raw provider/HTTP error
  → Host classification + redaction
  → stable safe code + bounded safe summary
  → durable CanvasRunError
```

Additional diagnostics belong to N23 redacted logs/traces, not Session JSON.

This boundary protects Harness/Provider/Host structural secrets. It is not a promise to detect every secret-looking string deliberately pasted by a user into natural-language content.

## Consequences

- Browser UI visibility is never an authorization mechanism.
- Agent Tool, Remote, History, Asset, Run, and Reconciler code reuse one Host permission/provenance vocabulary.
- Session Projection remains a generic computation seam while supporting domain-owned read visibility decisions.
- Authorization denial does not delete projection state or rewrite Session history.
- External policy failure can be configured fail closed without changing Canvas Domain.
- N16 must redact Provider errors before persisting Run failures.
- N17/N21 asset routes must authorize a typed asset resource through the same seam.
- Multi-user identity/tenancy remains deferred, but it no longer requires a new Canvas authorization architecture.

## Rejected alternatives

**Authorize only in Browser Remote wrappers** — rejected because Agent Tool, Asset, system, and direct Host paths would bypass it.

**Put authorization inside projection `apply/view`** — rejected because projection mathematics would become caller-dependent and replay/checkpoint behavior would no longer be pure.

**Treat Session Projection visibility as automatically equivalent to Session access** — rejected because Canvas exposes a concrete `canvas.read` Host permission; a parallel unguarded current-state path would make that permission misleading.

**Persist raw Provider exceptions and redact only in UI** — rejected because the credential would already be durable in Session history.

**Use a global `key.includes("token")` scanner** — rejected because legitimate semantic configuration such as `maxTokens` would become unusable while still missing other credential carriers.
