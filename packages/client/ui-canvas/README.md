# @deepseek-ai/dsh-client-ui-canvas

English | [中文](README.zh.md)

Browser-only Canvas product surface over the session-native Canvas domain. The plugin does not own the conversation session, composer, Canvas durability, deployment capability policy, layout shell, or provider execution. Current Canvas and editor-layout state comes only from the standard Session Projection hook (`canvas` / `canvasLayout`), while deployment capability comes from the read-only Host `canvasFeatures` Remote.

## Surface contract

The Canvas product surface is contributed to the generic session-scoped `shell.main` region. `ui-layout` only declares and arranges generic `shell.left` / `shell.main` / `shell.right` regions; it does not know Canvas Workflow, Run, Asset, Selection, Mode, or mutation state. `ui-conversation` remains the Conversation/Composer owner in `shell.right` and keeps its own `conversation.view` composition internally. Canvas therefore never needs to claim the Conversation view ring or create a second Composer.

The surface has two presentation modes over the same projected Canvas. **Minimal** shows product state and generated output references without exposing workflow topology. **Editor** shows a workflow-oriented shell with semantic node/edge counts, revision/layout information, and selectable node/edge cards; later editor nodes still own full visual DAG mutation.

Mode is browser-local per Session and never becomes a Session event. The person may switch Minimal/Editor without mutating Canvas state. The mode ledger has no Session-write or persistence dependency.

The ordinary Conversation Composer remains resident in the Conversation-owned `shell.right` surface. Canvas in `shell.main` uses that existing prompt path for Agent turns rather than exposing a Canvas-specific duplicate input.

## Deployment capabilities

The Browser fails closed on deployment-level Canvas capability. The plugin waits for generated `remote.canvasFeatures`, calls its global read-only `get()` method, and contributes the Canvas `shell.main` surface only when the returned effective `canvas.enabled` value is true. A missing feature Remote, business failure, transport failure, or plugin disposal before the query settles publishes no Canvas main surface. Capability discovery is not stored in Session state and does not become a second business-state authority.

Write availability is intentionally separate from read rendering. Once Canvas is enabled, the projected Minimal surface does not require `remote.canvas` mutation transport to remain visible. If mutation transport is absent or reconnecting, write operations return explicit offline/save outcomes instead of erasing the readable projection. If Editor is enabled but node-catalog discovery fails, Editor is disabled for that activation and the Minimal read surface remains available.

`editor.enabled=false` makes the surface Minimal-only even if the browser-local mode store still contains `editor`; the mode switch is not rendered. The stored preference is not rewritten, so a later deployment that re-enables Editor can reuse normal local preference semantics without a Session mutation.

Disabled feature data is not erased. In particular, a historical `video.generate` or `video.image-to-video` node remains visible in Editor when `video.enabled=false`, but is marked `Unavailable in this deployment`. Existing video output references also remain visible. This distinguishes “cannot use this capability now” from “the historical workflow/result no longer exists.”

The send-time interaction preparer is registered only inside an enabled Canvas capability scope. `regionEdit.enabled=false` strips any stale browser-local region selection before staging an otherwise valid prompt; the Host independently rejects a direct region-bearing stage call, so UI filtering is an affordance rather than the security/enforcement boundary.

## Interaction selection and Agent turns

N08 adds a separate per-session browser-local interaction store. Editor node/edge cards and Minimal/Editor output candidates can be selected; a later region/mask editor can use the same store through the `CanvasRegionSelection` seam. Selection is presentation context, not Canvas domain state: selecting, clearing, or focusing an item does not append a Session event, change a Projection, or advance a Canvas revision.

Every semantic selection is anchored to the `{ canvasId, workflowId, workflowRevision }` observed when the user clicked it. If the same workflow advances to a newer revision before the next prompt, the old revision is preserved so the Host can mark the target stale. If the current Canvas or workflow identity is replaced entirely, the old selection is not rebound to the new document and no target is attached.

Output selection carries both the durable selected asset reference and, while still current, `{ runId, assetIndex }` focus. This lets “use this image/video” keep referring to the durable asset even if a later run becomes current, while “candidate 3” focus is dropped once that candidate is no longer the current output.

At the ordinary conversation send boundary, the Canvas plugin synchronously snapshots the selection, mode, and current Canvas Projection. With no concrete selection, it registers no interaction context and the Agent must not invent a target. With a target, the snapshot is staged against the exact ordinary prompt RPC id through the generated `canvasInteraction` Remote before that prompt is transported. Prompt-admission failure rolls the stage back.

The Host later binds that RPC id to the exact admitted user-message id and, only when that message survives into `agent/pre-step`, places a logged Canvas plugin-context message immediately before it. The Browser-local selection itself is never durable; only the context text the model actually receives enters the Session log. This preserves the repository rule that model-visible content uses logged channels.

## Product states

The shell implements the same N01 product-state rules as the Host domain without value-importing Host Canvas code into the browser bundle:

- `EMPTY` — no semantic workflow yet.
- `READY` — workflow exists and has not produced a current terminal result.
- `DIRTY_READY` — a previous output remains visible but belongs to an older workflow revision.
- `RUNNING` — queued or running media execution.
- `COMPLETED` — the current workflow revision owns the completed result.
- `FAILED`, `CANCELLED`, `INTERRUPTED` — terminal non-success states for the current workflow revision.

The primary-control skeleton is deterministic: READY/COMPLETED/DIRTY_READY → Run, failures → Retry, RUNNING → Cancel only, EMPTY → no primary action. Run/Retry/Cancel controls remain disabled because live media execution and cancellation belong to the later run-engine node; the UI does not publish fake Remote success paths.

`DIRTY_READY` keeps the old result visible and labels it as stale relative to the current workflow. Minimal and Editor therefore share one product-state machine and one projected Canvas rather than maintaining independent result lifecycles.

## Projection and client boundary

`@deepseek-ai/dsh-canvas/client` is consumed type-only for Canvas DTOs, capability DTOs, interaction DTOs, and the SessionProjectionMap declaration merge. The browser bundle owns small isomorphic product-state/interaction builders so it does not require Host-domain Canvas JavaScript at runtime. No client-side Canvas fold or feature-policy implementation exists: the Host computes whole projection values and effective deployment capabilities.

Generated image/video bytes are not resolved by this shell yet. Result cards display durable media-reference metadata only; authorized media routes and richer previews belong to the asset/UI nodes that own those capabilities.

`SaveStatus` remains a presentation skeleton fixed to `saved`. Draft ownership, debounce, autosave, conflict handling, and real saving/error transitions belong to the later editor-draft node.

## Model Experience

The package contributes model-visible content only when the user sends a prompt with a concrete Canvas selection. The resulting context names the sampled Canvas/workflow revision and selected nodes, edges, durable assets, focused output, or enabled region. Revision drift is explicit: stale context tells the Agent to call `canvas_read` before mutating selected workflow targets. No selection means no Canvas context is contributed.

Feature discovery itself contributes zero model tokens. Disabled Canvas suppresses the Browser selection preparation path entirely; other flags change UI affordances but are not injected into the standing prompt.

#### KV Cache effect

No standing prefix is added. Interaction context is turn-local user-role plugin context, so only turns that carry a selection add tokens; the exact text is logged with that turn and remains replayable.

## Known Limitations and Deferred Work

- **No live Run/Retry/Cancel behavior** — controls are state-correct but disabled until media execution and cancellation exist on the Host.
- **Editor selection is not DAG editing** — node/edge selection is shipped for deictic Agent context, while connection mutation, Inspector editing, undo/redo, and partial execution arrive later.
- **Feature-gated future surfaces are not fabricated** — History/Variant/Partial Run/Provider Fallback have capability values now, but their future UI appears only with their owning implementation nodes.
- **Region selection is a seam, not a visual mask editor** — the DTO/store path exists, but drawing masks/regions and inpaint/outpaint operations are later UI/workflow work.
- **Media cards are metadata placeholders** — actual image/video rendering requires authorized asset delivery.
- **Save status is static** — draft/autosave behavior is deferred; the UI still creates no second durable source.
- **Mode and selection are intentionally local** — they survive only in the mounted browser client lifetime and are not synchronized through Session history; only model-visible context actually consumed by a turn is logged.