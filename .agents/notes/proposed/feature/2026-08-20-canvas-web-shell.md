# Agent Note: Canvas Web shell over Session Projection

Status: proposed

English | [中文](2026-08-20-canvas-web-shell.zh.md)

## Problem

The session-native Canvas domain now has durable Session events, current-state projections, editor layout persistence, Host authorization, Browser mutations, and bounded History queries. The Web application still needs a product surface that supports both a simple generation experience and a workflow-oriented experience without creating a browser-owned Canvas state, replacing the resident conversation composer, or pretending that media execution already exists.

## Proposal

Add `@deepseek-ai/dsh-client-ui-canvas` as one `conversation.view` contribution in the Web browser roster. It reads `canvas` and `canvasLayout` through the standard Session Projection hook and renders two UI-local presentation modes over those same values:

- **Minimal** — product state and current generated result references, with workflow topology hidden.
- **Editor** — a workflow shell that exposes semantic node/edge counts, workflow revision, saved-layout presence, semantic node cards, and the same current output.

The mode choice is browser-local per Session. It is not a Canvas mutation, does not append a Session event, and does not become a second durable preference document. Narrow viewports default to Minimal; wider viewports default to Editor; either may be selected manually.

`ui-conversation` continues to own the Session shell and composer. Canvas occupies only the `conversation.view` body. Because the composer sits outside that view ring, Chat/Trajectory/Canvas switching never removes prompt entry or introduces a Canvas-specific duplicate composer.

The UI uses the same eight product states as N01: `EMPTY`, `READY`, `DIRTY_READY`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, and `INTERRUPTED`. The Browser implementation copies the N01 derivation rules isomorphically instead of value-importing the Host Canvas package at runtime. `@deepseek-ai/dsh-canvas/client` remains a type/DTO/declaration-merge boundary; the Browser bundle has no hidden runtime edge to Host-domain JavaScript.

Primary action selection is deterministic: READY/COMPLETED/DIRTY_READY show Run, FAILED/CANCELLED/INTERRUPTED show Retry, RUNNING shows Cancel only, and EMPTY shows none. N07 renders these as disabled capability skeletons because Host run/cancel behavior belongs to the later media execution node. Publishing a clickable control backed by a fake or not-yet-existent Remote endpoint would make the UI lie about system capability.

`DIRTY_READY` deliberately keeps the prior output visible. The stale result is useful context while the semantic workflow has advanced; it is labeled as belonging to the older revision until a later run produces an output for the current revision.

`SaveStatus` is also a shell-only contract in N07. It renders the reserved saved/saving/error vocabulary but is fixed to saved until the editor-draft/autosave node owns a real browser draft, debounce, conflict, and save lifecycle.

Generated media bytes are not fetched in this node. Output cards render durable image/video-reference metadata. Authorized media routes and actual media presentation belong to the asset/UI nodes that own delivery and access policy.

`dsh-web-app` explicitly mounts `ui-canvas` after `ui-conversation` and declares the package dependency. The root Client aggregate references the new project so browser purity and package tests participate in the ordinary Client gates.

## Alternatives considered

**Make Canvas a separate page outside the conversation shell** — rejected. It would duplicate session selection and composer behavior and weaken the “same session, same authority” product model.

**Put a second prompt box inside Minimal Canvas** — rejected. The resident conversation composer already owns user input and remains visible under every conversation view.

**Persist Minimal/Editor mode in Session** — rejected for N07. Mode is a presentation preference, not collaborative Canvas state. Persisting it would create Session churn with no semantic value and make one client's layout preference affect another consumer.

**Import `deriveCanvasProductState()` as a runtime value from the Host Canvas package** — rejected. Canvas is not a browser plugin in the Web module roster. The UI keeps the client outlet type-only and uses an isomorphic pure rule set with equivalence tests.

**Wire Run/Cancel buttons to placeholder methods** — rejected. N06 deliberately reserves those Remote names without registering endpoints before Host behavior exists. N07 preserves that honesty by rendering state-correct but disabled controls.

**Hide old output in DIRTY_READY** — rejected. The old result is still a durable, useful artifact and is the exact context a person needs before deciding whether to rerun the changed workflow.

## Acceptance criteria

- Web ships exactly one `conversation.view` entry with id `canvas`.
- Canvas view reads current business state only from `useProjection('canvas')` and `useProjection('canvasLayout')`.
- Switching Minimal/Editor changes browser-local mode only and writes no Session event.
- Narrow viewport default is Minimal; wide default is Editor; either can be manually selected.
- The resident conversation composer is not claimed or replaced by `ui-canvas`.
- All eight N01 product states have deterministic presentation behavior.
- RUNNING renders Cancel as the only primary control; no Run/Retry duplicate is rendered.
- DIRTY_READY keeps the previous output visible and marks it stale relative to the current workflow.
- Run/Retry/Cancel remain disabled until real Host execution/cancellation exists.
- Editor is explicitly a shell in N07, not a hidden DAG-editing implementation.
- Canvas Browser bundle uses Canvas client types only and has no runtime dependency on Host Canvas JavaScript.
- Built client artifact coverage proves the plugin registers/withdraws the Canvas view through the real SlotRegistry ring and does not claim the composer.
- `dsh-web-app` roster and dependency manifest both include `ui-canvas`.

## Risks

The Browser contains an isomorphic copy of the Host product-state derivation because the package boundary forbids a runtime Host-domain import. The two rule sets must therefore remain pinned by tests when the domain state machine changes. The N07 result cards are intentionally placeholders, so they should not grow ad-hoc unauthenticated media URL logic before the asset-delivery node exists. Mode state is in-memory for the mounted client lifetime; adding persistence later must remain a UI preference and must not become Canvas durable authority.
