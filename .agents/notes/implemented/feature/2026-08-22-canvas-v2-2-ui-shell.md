# Agent Note: Canvas V2.2 dynamic UI shell ownership

Status: implemented

English | [中文](2026-08-22-canvas-v2-2-ui-shell.zh.md)

## Problem

The first N07 Canvas shell treated `conversation.view` as the Canvas product surface. That seam is already owned by `ui-conversation` for Conversation body switching while the Conversation/Composer product remains resident. Registering Canvas as another product owner in that ring couples independent plugins to registration order and makes the central Canvas experience depend on Conversation internals.

Moving Canvas directly into `ui-layout` would avoid that collision but create a worse ownership violation: the layout package would need Canvas-specific props, stores, or lifecycle knowledge. The repository contract requires `render-service` to keep React-root ownership, `ui-layout` to stay generic, `ui-conversation` to own Conversation/Composer behavior, and `ui-canvas` to own Canvas presentation.

## Decision

N07 uses a generic session-scoped `shell.main` slot as the Canvas product region. `ui-layout` declares and renders `shell.left`, `shell.main`, and optional `shell.right`, but knows nothing about Canvas Workflow, Run, Asset, Selection, Mode, or mutation APIs. `ui-canvas` contributes exactly the Canvas product surface to `shell.main`. `ui-conversation` continues to own the Conversation/Composer surface in `shell.right` and keeps its own `conversation.view` composition internally.

Canvas UI state is still derived from standard Session Projection values. Minimal and Editor are presentation modes over the same projected Canvas; switching modes never appends Session events or advances Workflow revision. Browser-local mode and interaction rows are scoped to live Sessions and cleared on plugin/HMR disposal.

Deployment gating and write availability are separated. `remote.canvasFeatures` is the fail-closed deployment gate: when Canvas is disabled or capability discovery fails, no Canvas main surface is published. Once enabled, the projected read surface does not require `remote.canvas` mutation transport. A missing/reconnecting mutation Remote makes writes explicitly unavailable rather than hiding current projected state. Editor node-catalog discovery may also degrade independently to Minimal instead of taking down the Canvas read surface.

## Alternatives considered

**Keep Canvas inside `conversation.view`** — rejected. It makes the Canvas product depend on a Conversation-owned view ring and risks product ownership and Composer/body behavior becoming registration-order-sensitive.

**Teach `ui-layout` about Canvas** — rejected. It would put Workflow/Run/mode state in the layout owner and create a second business integration point.

**Mount a second React root from Canvas** — rejected. `render-service` remains the root owner and boot/failure behavior must stay canonical.

**Require mutation Remote before rendering** — rejected. Read authority already exists in Session Projection; transient write unavailability must not erase readable state.

## Consequences

The Web shell has a clear ownership split: generic layout regions, a central Canvas product, and a resident Conversation/Composer region. Canvas can be installed, removed, or HMR-replaced through normal plugin/slot lifecycle without taking over the React root or storing Canvas state in layout. Read availability is resilient to mutation-service churn, while deployment-level Canvas disablement remains fail-closed.

The tradeoff is that `shell.main` becomes an explicit generic composition contract and therefore requires layout regression tests. Those tests must prove the region remains business-agnostic and that Canvas registration/disposal does not duplicate slot entries or leak session-local rows.

## Verification

Focused `ui-canvas` tests pin `shell.main` registration/disposal, Canvas capability gating, optional mutation Remote behavior, Editor catalog degradation, local-state pruning, and product-state rendering. `ui-layout` tests pin generic left/main/right composition without Canvas-specific state. Built-client coverage must assert the packaged plugin registers `shell.main`, not `conversation.view`, while Conversation/Composer ownership remains untouched.

Repository-wide typecheck, lint, build, hygiene, documentation/translation gates, and REAL composition remain required before N07 moves from REVIEW to ACCEPTED.