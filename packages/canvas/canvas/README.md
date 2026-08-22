# `@deepseek-ai/dsh-canvas`

English | [中文](README.zh.md)

The Host Canvas domain/service package for Canvas V2.2. Current upstream integration target: `deepseek-ai/deepseek-harness@b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` (`dsh@0.1.1-rc.2`).

## What this package owns

- Durable Canvas/Workflow/Run/Asset semantic types and invariants.
- Session-event commands and `CanvasService` mutation authority.
- Canvas current/history Host APIs and Typert Remote declarations.
- Canvas interaction-context Host staging/binding for exact Agent turns.
- Restart-applied Canvas feature capability service.
- Client-safe node catalog DTO mapping from the Media Node Registry.
- Canvas authorization vocabulary/policy integration.

It does not own React, graph rendering, Provider SDKs, image binary storage, model routing or Provider credentials.

## Durable authority

```text
Browser Remote / Agent Tool / Command
              ↓
        CanvasService
              ↓
      Session durable events
              ↓
   official Session Projection
   Host state → client wire view
```

Session Log is authoritative. Process caches and Browser stores are reconstructable or presentation-only.

## Projection migration contract

The current official Harness Projection framework separates Host fold state from the client-visible wire projection. Canvas must use that contract during the 0.1.1-rc.2 sync.

Historical private projection `owner/registerReadGuard` mechanics are not considered a permanent public Harness seam. The security requirement remains unchanged: N04 must enforce `canvas.read` at the synchronized Host Session/Remote exposure boundary before a Browser actor can obtain the Canvas wire view.

The Browser wire view may include stable Canvas/workflow/run ids, revisions, safe node config/layout and stable asset metadata. It must not expose Host-only audit state, credentials, binary data, request-image cache data or Provider temporary URLs.

## Image asset boundary

Harness Attachment is the sole image binary authority after the upstream sync:

```text
image bytes
→ ctx.attachments.saveImage(...)
→ normalized ImageAttachmentRef
→ CanvasImageAssetRef / provenance
→ Canvas Session event
```

Canvas durable state must never contain image base64/bytes, Browser object URLs, request-image bytes, compression/cache paths, `RequestImageAttachment` transport data or remote Files bearer identities.

`originalDimensions` and other optional stable attachment metadata must remain forward-compatible with historical Canvas values.

Video durability remains a later Canvas-owned N21 concern until Harness provides an equivalent official video attachment seam.

## Workflow and revision boundaries

- Node types are open-world semantic identifiers; no built-in runtime whitelist defines durable legality.
- `workflowRevision` changes only for semantic workflow mutations.
- `layoutRevision` is independent from semantic execution state.
- Registry revisions are process-local and are never Canvas durable revisions.
- A Run is pinned to an exact workflow identity/revision admitted by N15; later edits do not mutate the run snapshot.

## Authorization

All read/edit/run/history/asset operations are Host-authorized. Browser gating is not enforcement. Stable asset ids are references, not bearer authorization.

Expected policy families include `canvas.read`, `canvas.edit`, `canvas.run`, history read and asset read. Exact mapping follows the synchronized Harness authorization/session exposure APIs.

## Feature settings

Canvas registers the durable `canvas` settings namespace. Composition/plugin configuration is the base, durable user settings are the overlay, and `CanvasFeatureService` samples the effective settings once when it activates.

Current `CanvasCapabilities` therefore describe the current Host activation. A settings checkbox describes the next compatible activation and does not half-hot-enable Canvas/Editor/Video.

## Interaction context

Browser selection/focus/region is not workflow state. The client stages one bounded snapshot against the exact ordinary prompt RPC id; Host binds it to the exact admitted user-message id and injects it only when that message reaches the Agent turn.

Region selection is a Canvas semantic edit intent. The official generic `read_image_region` tool was removed upstream; this package must not restore it as an architectural dependency.

## Remote behavior

Generated Typert Remotes use the official discriminated `RemoteResult<T>` behavior. Known business conflicts return stable business error codes; unexpected internal errors are redacted rather than forwarding arbitrary `Error.message` to the Browser.

Minimal presentation must remain readable from Session Projection when mutation/catalog Remotes are temporarily unavailable.

## N15 run-admission relationship

This package supplies authorization/feature/domain inputs to `@deepseek-ai/dsh-canvas-run-admission`. It does not create chargeable Provider operations by itself. Every future Browser/Agent run path must pass N15 before N16 starts a durable Run.

## Upgrade status

Current source contains substantial pre-0.1.1-rc.2 implementation and is under revalidation. Before acceptance:

1. synchronize the latest official Session Projection infrastructure;
2. move Canvas state/wire projection to that seam;
3. map read authorization to the current Host exposure boundary;
4. synchronize Attachment and Settings dependencies;
5. regenerate Typert/generated repository outputs with the pinned toolchain;
6. execute focused Canvas replay/authorization/Remote tests and REAL assembled Web evidence.

See `.agents/workplans/canvas-v2.1/N01-canvas-domain.md` through `N09-feature-flags.md`, plus `N11.5-rc8-compatibility.md` (filename retained for link stability, content now targets 0.1.1-rc.2).