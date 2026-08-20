# @deepseek-ai/dsh-client-ui-canvas

English | [中文](README.zh.md)

Browser-only Canvas conversation view over the session-native Canvas domain. The plugin registers one `conversation.view` entry named `canvas`; it does not own the conversation session, composer, Canvas durability, or provider execution. Current Canvas and editor-layout state comes only from the standard Session Projection hook (`canvas` / `canvasLayout`).

## Surface contract

The view has two presentation modes over the same projected Canvas. **Minimal** shows product state and generated output references without exposing workflow topology. **Editor** shows a workflow-oriented shell with semantic node/edge counts, revision/layout information, and a node list; N07 deliberately stops before visual DAG editing.

Mode is browser-local per Session and never becomes a Session event. Narrow viewports default to Minimal and wider viewports to Editor; the person may switch either way without mutating Canvas state. The mode ledger has no Remote, Session, or persistence dependency.

The conversation composer remains resident because `ui-conversation` owns it outside the `conversation.view` ring. Switching Chat/Trajectory/Canvas views therefore changes the session body only; prompt entry remains the ordinary conversation composer rather than a Canvas-specific duplicate input.

## Product states

The shell implements the same N01 product-state rules as the Host domain without value-importing Host Canvas code into the browser bundle:

- `EMPTY` — no semantic workflow yet.
- `READY` — workflow exists and has not produced a current terminal result.
- `DIRTY_READY` — a previous output remains visible but belongs to an older workflow revision.
- `RUNNING` — queued or running media execution.
- `COMPLETED` — the current workflow revision owns the completed result.
- `FAILED`, `CANCELLED`, `INTERRUPTED` — terminal non-success states for the current workflow revision.

The primary-control skeleton is deterministic: READY/COMPLETED/DIRTY_READY → Run, failures → Retry, RUNNING → Cancel only, EMPTY → no primary action. Run/Retry/Cancel controls are intentionally disabled in N07 because live media execution and cancellation belong to the later run-engine node; the UI does not publish fake Remote success paths.

`DIRTY_READY` keeps the old result visible and labels it as stale relative to the current workflow. Minimal and Editor therefore share one product-state machine and one projected Canvas rather than maintaining independent result lifecycles.

## Projection and client boundary

`@deepseek-ai/dsh-canvas/client` is consumed type-only for Canvas DTOs and the SessionProjectionMap declaration merge. The browser bundle owns a small isomorphic product-state helper so it does not require Host-domain JavaScript at runtime. No client-side Canvas fold exists: the Host computes whole projection values and the standard Session runtime pushes them to the view.

Generated image/video bytes are not resolved by this shell yet. Result cards display durable media-reference metadata only; authorized media routes and richer previews belong to the asset/UI nodes that own those capabilities.

`SaveStatus` is a presentation skeleton fixed to `saved` in N07. Draft ownership, debounce, autosave, conflict handling, and real saving/error transitions belong to the later editor-draft node.

## Model Experience

None directly. This package is a browser presentation plugin and contributes no tool, prompt section, request context, or model-visible result.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **No live Run/Retry/Cancel behavior** — controls are state-correct but disabled until media execution and cancellation exist on the Host.
- **Editor is a shell, not the DAG editor** — graph interaction, connections, Inspector editing, undo/redo, and partial execution arrive in later Canvas UI nodes.
- **Media cards are metadata placeholders** — actual image/video rendering requires authorized asset delivery.
- **Save status is static** — draft/autosave behavior is deferred; N07 does not create a second durable source.
- **Mode is intentionally local** — Minimal/Editor preference survives only as browser-local state for the mounted client lifetime and is not synchronized through Session history.
