# Canvas V2.2 packages

English | [中文](README.zh.md)

Current upstream baseline: `deepseek-ai/deepseek-harness@b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` (`dsh@0.1.1-rc.2`).

This directory contains the Host-side and Browser-independent domains that make Canvas a first-class Harness extension for Agent-driven image/video generation and editable media workflows. The current implementation contract is owned by `.agents/workplans/canvas-v2.1/`.

## Package map

- `canvas/` — durable Canvas domain, Session event/service integration, current/history Remote faces, interaction context and restart-applied feature capabilities.
- `media-workflow/` — open-world media node definitions plus the Browser-independent DAG validation/planning/execution engine.
- `media-provider/` — media-generation model registry/resolver and Provider-neutral runtime adapter contracts. This is deliberately separate from Harness Chat LLM model routing.
- `media-provider-mock/` — opt-in deterministic/fault-injectable Provider runtime used only for tests and development compositions.
- `run-admission/` — N15 Host run preflight/governance: authorization, feature policy, workflow plan, asset availability, model/provider resolution, cost/quota/approval/idempotency and concurrency reservation.

Future nodes add durable image output integration through Harness Attachment, Canvas Run/Jobs/history, video storage/providers and production observability/retention.

## Current ownership rules

1. Session Log is the durable Canvas semantic authority; current Projection is reconstructable.
2. Canvas Projection must follow the current official Host-state/client-wire-view Session Projection contract.
3. Harness Attachment is the single image binary authority. Canvas stores stable image references and provenance, never image bytes, request-image bytes, cache paths or remote Files bearer identities.
4. Video binary durability is not implied by the current image Attachment API; N21 owns that design until upstream provides an official equivalent.
5. Media nodes/models/providers are open-world process extensions. Durable workflows do not depend on a built-in node whitelist.
6. Browser and Agent operations converge on Host CanvasService/run-admission semantics; no Browser-to-Provider shortcut exists.
7. Provider credentials remain Host-only.

## Upstream realignment

The `0.1.1-rc.2` migration requires the Canvas stack to adopt the latest official Session Projection, Attachment request-image pipeline, shared Settings mirror, ui-renderer React ownership, Web bundle transport and command image-envelope semantics. The main deliberate product divergence is in the Client layout: Canvas adds a generic `shell.main` product seat beside Conversation.

See:

- `.agents/workplans/canvas-v2.1/UPSTREAM-0.1.1-RC2-BASELINE.md`
- `.agents/workplans/canvas-v2.1/HARNESS-CANVAS-PLUGIN-ARCHITECTURE.md`
- `.agents/workplans/canvas-v2.1/ACCEPTANCE-MATRIX.md`

Do not hand-edit `pnpm-lock.yaml`, Typert generated output or generated repository catalogs while synchronizing these packages.