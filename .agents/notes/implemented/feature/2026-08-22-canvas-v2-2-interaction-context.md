# Agent Note: Canvas V2.2 exact-turn interaction context

Status: implemented

English | [中文](2026-08-22-canvas-v2-2-interaction-context.zh.md)

## Problem

Canvas needs to let a person say “modify this”, “use this image”, or “change here” through the ordinary Conversation Composer while preserving the exact Canvas selection they meant at send time. That selection is transient UI state, but the model-visible interpretation must be correlated to the exact admitted user turn, survive queueing safely, and be logged through normal Agent message channels.

The existing N08 path already solved most correlation and lifecycle requirements, but two Browser-input boundaries were too trusting. The `canvasInteraction` Remote accepted TypeScript-shaped request objects and `CanvasInteractionService` dereferenced `request.context.region` before runtime decoding. Under weak SRC/reflection, malformed payloads could therefore escape as raw JavaScript errors before the intended Canvas error boundary. In addition, identifiers copied from Browser interaction context into the model-visible plugin message were only checked for non-empty strings, so control-text/newline or oversized identifiers could reshape or inflate that context.

## Decision

Keep three distinct layers:

1. **Browser-local selection** — per Session, presentation-only, never Canvas durable state.
2. **Host request correlation** — one-shot process-local staging keyed by exact Agent + ordinary prompt RPC id, then bound to the exact admitted user-message id.
3. **Model-visible context** — emitted only for the exact message that survives into `agent/pre-step`, inserted immediately before that user message, and recorded by the ordinary logged Agent path.

`CanvasInteractionBridge.stage()` and `discard()` now treat their payloads as untrusted runtime values. They require an object envelope, reject extra top-level fields, validate the bounded transport RPC id, and strictly decode the nested interaction context before any Host Canvas read or correlation-state mutation. Region feature policy runs against that decoded context instead of reading nested Browser fields ahead of validation.

Identifiers that can enter the model-visible interaction message use a stricter N08 admission budget than generic durable Canvas ids: at most 256 characters and a single-line opaque identifier character set. This applies to Canvas/workflow/node/edge/run/image-attachment/video-asset identifiers supplied through the interaction request. The goal is not to redefine historical Canvas schema; it is to keep the Browser-to-model context channel bounded and structurally inert.

Revision-only drift remains intentionally admissible. The Host marks it `STALE` and the model-facing text requires `canvas_read` before acting on selected workflow targets. Canvas/workflow identity replacement is not rebound by the Browser builder. Durable selected assets must already exist in the exact Session's Canvas output history.

## Alternatives considered

**Persist selection as Canvas Session events** — rejected. Selection/focus is presentation context, not workflow/domain state, and persisting every click would pollute replay and revision semantics.

**Send a second Canvas-specific chat RPC** — rejected. It would fork ordinary prompt admission, logging, cancellation, and Composer behavior.

**Trust generated TypeScript/SRC shape at runtime** — rejected. Weak reflection or direct Remote callers still require Host-side validation before property access and business logic.

**Allow arbitrary strings and escape only at rendering time** — rejected as the sole defense. Escaping helps formatting but does not provide a token/size budget or prevent Browser-provided control-like identifiers from becoming model-facing data.

## Consequences

The interaction channel is now explicit about authority and lifetime. A selection cannot leak by “most recent selection” global state: it must match the exact prompt correlation identity. Prompt admission failure, downstream rejection/filtering, Agent disposal, plugin disposal, or TTL expiry removes staged/bound state. Queue-time Canvas drift is re-evaluated at claim time.

The tighter identifier rule can reject unusual durable Canvas identifiers when they are used through the interaction channel even though the durable Canvas schema itself accepts broader non-empty ids. That is deliberate: the model-facing transport has a smaller safety budget. If the repository later standardizes a global opaque-id grammar, N08 should reuse that validator rather than maintain a parallel grammar.

## Verification

Focused bridge tests cover exact RPC binding, wrong-RPC non-consumption, discard, downstream rejection, execution-time revision drift, Canvas unavailability, malformed stage/discard envelopes, and policy-before-Host-read ordering. Interaction decoder tests cover strict shape, bounded selection count, normalized regions, duplicate ids, membership at the current revision, stale signaling, identity replacement, focused-output validity, and rejection of control-text/oversized model-visible identifiers.

Repository-wide typecheck, lint, build, hygiene, documentation/translation gates, generated Typert consistency, and REAL composition remain required before N08 moves from REVIEW to ACCEPTED.