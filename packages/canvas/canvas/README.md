# @deepseek-ai/dsh-canvas

English | [中文](README.zh.md)

`dsh-canvas` owns the Session-scoped media Canvas domain and its Host control plane: semantic workflows, independent workflow/run revisions, durable media references, migration/replay, Host authorization and audit, deployment feature policy, Session Projection integration, independent editor layout state, bounded history, request-local interaction context, and `ctx.canvas`. Session events remain the only durable Canvas authority. Provider execution, Agent tools, physical media stores, and UI remain separate consumers.

## Domain and migration

`CanvasSnapshot` contains one stable `CanvasId`, `MediaWorkflow | null`, independent `workflowRevision` and `runRevision`, optional current variant identity, the current/most-recent Run, and current output. Semantic edits advance only `workflowRevision`; run lifecycle changes advance only `runRevision`; selecting an existing output advances neither.

`MediaWorkflow` is UI- and provider-independent. It stores semantic nodes/edges/output ids and JSON-safe configuration. Editor coordinates, provider credentials/raw request objects, binary media, bearer URLs, browser selection, and deployment feature flags are not workflow state. `CanvasLayoutSnapshot` persists editor positions/viewport in its own `canvas/layout-change` stream and never advances either Canvas revision.

Durable values use `stored JSON → migrateStoredX() → current structural value → current invariant`. Canvas-owned schema/node versions fail loud when unsupported. The durable node model is open-world: unavailable plugin nodes preserve their stored `type`, optional positive `nodeVersion`, config, and graph relationships; N10/N12 decide whether the current deployment can validate ports/config or execute the node. Historical Session events are never rewritten.

## Durable authority and Run vocabulary

Each accepted semantic mutation commits one complete post-change `CanvasSnapshot` as `canvas/change`; `clear` carries `canvas: null`. Current Run writers use `run-start` and `run-update`. `run-update` represents queued/running milestones plus `completed`, `failed`, `cancelled`, and `interrupted`; legacy `run-complete` remains historical replay vocabulary only.

The strict fold tracks Canvas and Run identities across the entire Session. A Run id cannot be reused after terminal completion or after Canvas clear/recreate. Workflow edits use `WorkflowRef { canvasId, workflowId, workflowRevision }`; run progress intentionally does not stale that semantic CAS fence. Clear uses the same workflow CAS and refuses to tombstone a Canvas whose current Run is still non-terminal.

`CanvasService` preflights each candidate against a detached fold, then calls `Session.append()`. Session `internal/dispatch` is the synchronous precommit veto point; the log push is the logical commit; `session/event` is postcommit observation. The Canvas cache advances only after append succeeds.

## Current-write authority

Current `canvas/change` and `canvas/layout-change` writes are package-owned. `CanvasService` executes the append under a process-local one-shot write permit; the Canvas invariant consumes the exact matching permit during Session precommit. A structurally valid current event appended by an alternate Host path is therefore rejected before publication.

This fence prevents accidental authorization bypasses and architecture drift inside trusted Host code. It is not a sandbox against malicious code already executing in the same process. Historical events loaded before the invariant is mounted remain replayable without a current-write permit. The shipped `dsh-base` composition mounts both `@deepseek-ai/dsh-invariants` and `@deepseek-ai/dsh-canvas/invariant`, so ordinary product profiles enforce the permit mechanically; lightweight custom compositions that omit the companion still rely on CanvasService as the current writer.

## Host authorization

`CanvasPermission` is the shared Host action vocabulary for CanvasService and later Remote, Agent Tool, History, Asset, restore, variant, layout, Run, and media-route consumers. Current actions include read/edit/run/cancel, history read, asset read/export/delete, workflow restore, variant create, and layout write.

Authorization requests include canonical actor/source metadata, the Session id, and a typed `CanvasAuthorizationResource` scope (`session`, `canvas`, `workflow`, `run`, `asset`, `variant`, or `layout`). The built-in `CanvasAuthorizationPolicy` is the current single-user actor-kind policy; an external `ctx.canvasAuthorization` service may implement stronger ownership/tenant/ACL rules behind the same request contract.

`CanvasServiceConfig.authorizationMode` controls missing external policy behavior:

- `single-user-fallback` (default) uses the configured built-in policy when `ctx.canvasAuthorization` is absent.
- `required-external` fails closed with `CANVAS_AUTHORIZATION_FAILED` when the external service is unavailable.

Exceptions from an external authorization service are normalized to policy-unavailable rather than propagating backend/identity-provider diagnostics. A normal deny becomes the generic `CANVAS_PERMISSION_DENIED`; detailed policy reasons are not a Browser authorization oracle.

## Actor/source provenance

`CanvasAccessContext` is durable audit attribution, not caller-asserted identity. Browser and asset requests use a Host-minted single-user Browser principal (`human:host-browser`); the target Session remains a separate authorization input (`sessionId` and resource scope) rather than being reused as a human identity. Agent and system paths retain their own stronger provenance rules:

- `browser-remote` → the Host-minted `human:host-browser` principal.
- `agent-tool` → `agent`, whose id exactly matches the target Agent.
- `system-reconciler` → `system`.
- `asset-route` → the same Host-minted Browser principal until a real authenticated human identity layer exists.
- `host` → the exact target Agent identity or an explicit system actor.

The package exports Host-owned constructors (`canvasHostAgentAccess`, `canvasBrowserAccess`, `canvasAgentToolAccess`, `canvasSystemAccess`) so transports/tools need not assemble provenance ad hoc. `canvasBrowserAccess()` requires the Host caller to have resolved a target Session, but it does not turn that Session id into a user id. Actor ids are bounded; durable request/correlation ids are bounded to 128 characters, reject control characters/outer whitespace, and use a log-safe character set.

The Browser principal is deliberately only a single-user Host surrogate. A future authenticated human/tenant identity source replaces that principal behind the same Host authorization seam; the Session/resource model and permission vocabulary do not need to change.

## Sensitive durable-data boundary

Canvas protects durable state structurally rather than trusting UI conventions. Workflow configuration recursively rejects known credential/header/binary carrier keys, including normalized/suffixed API-key, access/auth/session/id token, client/callback secret, private/secret key, authorization/cookie/header, base64/data-URL/blob, and raw media-byte shapes. It also rejects explicit data-URL base64 payloads, PEM private-key blocks, obvious Bearer credential strings, and common long `sk-`/`rk-` credential signatures.

`assertCanvasDurableAuditSafe()` extends the current-writer boundary beyond workflow config. Durable Run diagnostics are bounded and scanned before commit, so a Provider SDK error containing Authorization headers/API credentials cannot be copied verbatim into `CanvasRunError.message`. Host/provider code must classify/redact raw failures into stable safe code + safe summary; N23 may retain additional redacted diagnostics in structured logs/traces, not Session JSON. Durable image/video object identifiers and image display names are likewise bounded/scanned; binary payloads and provider raw responses remain outside Canvas state.

These rules guarantee that Harness/Provider/Host structural credential carriers and raw provider diagnostics do not intentionally become Canvas durable state. They do **not** claim perfect secret detection for arbitrary user-authored prompt text; a user can intentionally paste secret-looking text into semantic content, and heuristic scanning cannot be a complete DLP system.

## Session Projection read authorization

When `ctx.sessionProjections` is present, Canvas registers `canvas → CanvasSnapshot | null` and `canvasLayout → CanvasLayoutSnapshot | null`. Projection folds remain pure and identity-free. Canvas additionally registers Browser read guards through the Session Projection registry so the same Host `canvas.read` policy controls whether those keys may leave through snapshot/history baseline/change-frame delivery.

This closes the earlier gap where `ctx.canvas.get()` could be denied while Browser Projection still exposed the value. Live projection reads carry the exact target Session id and the same Host-minted Browser principal used by Canvas Remote and Interaction. Detached cached/history projection views currently carry no invented Session identity: with an external/required identity-dependent policy Canvas fails closed and omits guarded keys until a live authorized Session view is available. Internal projection cells/checkpoints remain complete derived state; read denial does not rewrite Session history.

## Editor layout

Layout state remains a separate durable stream. `CanvasService.saveLayout()` requires `canvas.layout.write`, the current workflow identity, known current node ids, and a valid viewport/position structure. It appends one full `CanvasLayoutSnapshot` under the same current-write authority fence. Semantic edits preserve layout; Canvas create/clear resets the current layout projection to `null` without deleting historical layout events.

## Browser Remote and interaction

Browser mutation wrappers create trusted `human:host-browser + browser-remote` access on the Host; Browser payloads do not supply their own actor/source. The resolved Session id remains the authorization target and is not promoted into a user principal. Mutations return small receipts. Current Canvas/layout values arrive through Session Projection, so there is deliberately no second `getCurrent` RPC.

The current Remote namespace exposes only implemented behavior: workflow edit/replace, output selection, layout save, clear, and bounded `listRuns`/`getRun`. Future run/cancel/variant/restore operations are not registered until their owning nodes implement them. Under weak SRC reflection the Host validates business DTO shape before authorization/dispatch instead of relying on generated schemas being present.

Run history remains bounded and derived from `canvas/change`, never a second durable database. Each history entry carries its durable `canvasId`; `listRuns()` requires that `canvasId`, while `getRun()` requires `canvasId + runId`. Authorization is performed against that requested generation/resource, so permission to a newly created Canvas cannot expose an older Canvas generation from the same Session. The rebuildable index uses the N03 strict fold and then applies new Session events incrementally; Canvas fold state and the History index are batch-staged and published together.

Remote failures are explicit. The Typert Gateway preserves only declared `TypertBusinessFailure`, lookup-policy failures, and cancellation. Ordinary exceptions become the fixed `internal / Remote request failed` envelope. Canvas Remote wrappers convert only allowlisted `HarnessError` codes to fixed public messages, so Host resource ids, policy diagnostics, and raw internal/provider error text do not become Browser error messages.

`CanvasInteractionContext` is request-local rather than Canvas durable state. `CanvasInteractionService` stages a Browser selection against the exact ordinary prompt RPC id; `CanvasInteractionBridge` uses the same Host-minted Browser principal, validates Canvas identity/revision/assets, binds the selection to the admitted user message, and injects the precise context through the normal logged Agent message path. Selection/focus itself is ephemeral.

## Deployment feature policy

Authorization and deployment capability are independent. Authorization answers whether an actor may perform an action; feature policy answers whether the current deployment offers it. `CanvasFeatureService` owns effective Canvas/Editor/History/Video/Variants/Partial Run/Region Edit/Provider Fallback flags. Historical values remain readable when a feature is disabled; flags do not rewrite durable history.

`CanvasFeatureService` has a formal activation dependency on `ctx.settings`. At activation it registers the durable `canvas` Settings namespace with the same feature-config schema: the Cordis/plugin entry config is the composition `base`, and the durable user Settings document overlays that base (with schema defaults beneath both). The namespace declares `applies: 'restart'`, and the service samples `scope.get()` exactly once into its immutable effective capability snapshot for that activation. Later Settings edits are persisted but do not hot-mutate current Host capability; a Host restart or feature-service remount re-registers the namespace and samples the updated durable layer.

The read-only `canvasFeatures` Remote exposes only that effective capability snapshot. Raw composition/user Settings layers and secret metadata never leave the Host through this Remote. This prevents Browser Settings state from becoming a second live capability authority and keeps one deterministic capability value for all Host consumers during an activation.

## Validation responsibilities

Pure domain invariants validate value relationships. N02 migration validates durable structural compatibility. N03/N04 service + Session invariant enforce transition, commit, provenance, authorization boundary, current-write authority, and durable-data safety. N10/N12 own installed node definitions and executability. N15/N16 own admission/Jobs/Retry/Cancel/Reconciler. N17/N21 own physical image/video asset persistence and authorized binary reads. N23 owns progress, logs, metrics, traces, and additional diagnostic redaction.

## Model Experience

Canvas domain/authorization/projection machinery is not directly model-facing. N18 Agent tools will expose selected Host capabilities through model-facing schemas while calling the same `ctx.canvas` authorization and durable authority paths.

#### KV Cache effect

None from this package's persistence, authorization, or projection machinery.

## Known Limitations and Deferred Work

- The built-in policy is actor-kind based and intended for the current single-user deployment. Workspace ownership, tenant ACLs, and authenticated human identity are future Host policy concerns behind `ctx.canvasAuthorization`.
- The current Browser principal is Host-minted but not authenticated per-user identity. Live authorization still carries the exact target Session separately; identity-dependent detached reads fail closed because the generic detached projection read context does not currently carry that Session target.
- The package-local write permit prevents accidental alternate current writers only when the Canvas invariant companion is mounted; it is not a malicious same-process-code sandbox. The shipped base profile mounts that companion; custom compositions must do the same if they require the mechanical fence.
- Sensitive-value signatures are defense in depth, not a general-purpose DLP engine for arbitrary user text.
- Provider execution, retry/cancel reconciliation, physical asset stores, and authorized binary routes remain owned by later workplan nodes.
- Repository-pinned lockfile/module-graph/generated Typert artifacts must be regenerated and validated on the final rc.8-compatible workspace before release acceptance.
