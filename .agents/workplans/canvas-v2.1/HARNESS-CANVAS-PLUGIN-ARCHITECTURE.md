# Harness ↔ Canvas V2.2 Plugin Architecture (`dsh@0.1.1-rc.2`)

## 1. Architectural objective

Canvas is a first-class Harness extension domain. It must use Harness lifecycle, Session, Remote, Settings, Attachment, Client module and renderer infrastructure rather than embedding a parallel app framework.

The product, however, deliberately adds a Canvas work surface beside Conversation. This document separates **framework ownership** from **product ownership** so future upstream syncs do not erase that requirement.

## 2. High-level topology

```text
Host Harness
├─ Session Log / Session Projection
├─ Authorization / Settings
├─ Attachment image authority
├─ CanvasService
├─ MediaNodeRegistry
├─ MediaWorkflow Engine
├─ MediaModelRegistry
├─ MediaProviderRuntime
└─ CanvasRunAdmission / later Run lifecycle
         │ Typert Remote + Session projections
         ▼
Browser Harness
├─ Client Runtime / Sessions
├─ ui-renderer          ← React root + React bindings
├─ ui-layout            ← geometry + generic slots
│   ├─ sidebar
│   ├─ shell.main       ← intentional Canvas extension
│   ├─ conversation
│   ├─ details
│   └─ shell.overlay
├─ ui-conversation      ← Conversation + Composer owner
├─ ui-attachment        ← conversation attachment presentation
└─ ui-canvas            ← Canvas Minimal/Editor presentation owner
```

## 3. Host ownership

### CanvasService

Owns Canvas semantic commands, revisions, event append and current/history business operations. Browser Remote and Agent tools must converge here or at an explicitly shared command layer above it.

### Session Projection

Canvas projection must use the current official Projection state/wire-view contract:

```text
Session events
    ↓
Host Canvas projection state
    ↓ explicit wire view
Browser-safe Canvas projection
```

A private `owner/readGuard` projection-registry extension is not the long-term compatibility contract. Authorization remains mandatory but should be enforced at the synchronized official Session/Remote exposure boundary.

### Attachment

Harness Attachment is the single image binary authority:

```text
raw image bytes
→ validate/normalize/save
→ ImageAttachmentRef
→ Canvas durable AssetRef/provenance
```

Model request images are derived later through the official request-image pipeline. Canvas does not own image compression/request caches.

### Media Workflow / Model / Provider

These remain Canvas-owned generation domains:

- MediaNodeRegistry: exact `(type, version)` metadata, open-world.
- MediaWorkflow Engine: validation/planning/execution fingerprinting, Browser-independent.
- MediaModelRegistry: generation-model capability and routing policy.
- MediaProviderRuntime: generation Provider operations/handles/cancel/health.

They are distinct from Harness Chat LLM model routing.

### Run Admission

N15 owns Host-side pre-start governance. Every Browser/Agent run path must receive the same admission result and exact WorkflowRef fence.

## 4. Browser ownership

### ui-renderer

Official `ui-renderer` owns:

- `createRoot` / `hydrateRoot`;
- React bindings required by dynamic UI plugins;
- application-root mounting/unmounting.

Web boot and `ui-layout` may not take this ownership back. Legacy `web-react` compatibility assumptions are superseded.

### ui-layout

`ui-layout` owns only geometry, generic slots and panel viewing state. It must not own Canvas semantic state, mode, workflow, run or asset state.

The private extension adds a generic `shell.main` session slot and the geometry required to place it beside Conversation. This is an intentional product fork over official Layout, not a request to fork the whole layout subsystem.

### ui-conversation

Owns ConversationRoot, message flow, Composer and conversation-specific input seats. Canvas does not create a second Composer.

### ui-canvas

Owns:

- Minimal/Editor presentation choice;
- Canvas-specific selection/focus and transient editor presentation state;
- Canvas-specific workflow renderer/inspector/library;
- Canvas output composition inside `shell.main`;
- prompt-preparation sampling for Canvas interaction context;
- binding to Host node catalog/settings/projection/remote faces.

It does **not** own durable semantic truth.

## 5. Minimal vs Editor

```text
same Session Canvas projection
        │
        ├─ Minimal → current run/output/asset presentation
        └─ Editor  → same workflow + layout/draft editing presentation
```

Switching modes must not create/copy a workflow or run. Editor draft state is presentation-only until a Host CAS mutation succeeds.

## 6. Agent and command path

```text
user prompt / slash command / Agent tool
            │
            ├─ official image submission envelope when images exist
            │
            ▼
Canvas intent/tool/command
            ▼
Host Canvas command/service
            ▼
Workflow mutation or Run admission/start
            ▼
Session durable events + Projection
            ▼
Minimal/Editor update
```

No Canvas-specific Browser→Provider shortcut is allowed.

## 7. Region editing

Region selection is a normalized Canvas semantic intent sampled from UI context. The generic official `read_image_region` tool no longer exists and must not be reintroduced as an architectural dependency.

Region operations should flow through Canvas image-edit/crop nodes/provider adapters and, when a derived durable image is required, save the result through Harness Attachment.

## 8. Settings lifecycle

Browser Canvas settings bind through the shared official Settings Describe Mirror. Host Canvas features still follow restart semantics:

```text
composition config base
+ durable user overlay
→ effective settings sampled at feature-service activation
→ immutable current CanvasCapabilities
```

Changing Settings does not half-hot-enable a currently disabled Canvas deployment.

## 9. Plugin lifecycle requirements

Every registration/subscription must belong to the creating Cordis effect/fiber:

- `shell.main` occupant retracts when ui-canvas unloads;
- Renderer root unmounts with ui-renderer dependency lifetime;
- local Canvas mode/selection state is pruned with Session/plugin lifetime;
- node/model/provider registry definitions unregister exactly on owning plugin disposal;
- settings mirror scope subscriptions dispose with caller lifecycle;
- no HMR generation reuses stale Browser semantic/presentation anchors.

## 10. Cross-package value rules

Client feature packages cooperate through Cordis services, slots, standard hooks and JSON-safe injected shares. Cross-plugin runtime imports must obey the current client package/domain graph rules.

Canvas domain/engine/provider packages remain Browser-independent unless a dedicated client-safe types surface is explicitly published.

## 11. Upgrade rule

For infrastructure packages modified by both upstream and Canvas:

```text
latest official file/package
        ↓
reconcile official behavior first
        ↓
replay documented Canvas extension only
        ↓
run focused divergence tests
```

The largest current replay patch is `shell.main`; it must never be used as justification to freeze an old official ui-layout implementation.
