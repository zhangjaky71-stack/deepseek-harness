# Agent Note: Canvas V2.2 deployment features use Harness Settings

Status: implemented

English | [中文](2026-08-22-canvas-v2-2-feature-settings.zh.md)

## Problem

Canvas already had a Host deployment feature service with effective flags for Canvas, Editor, History, Video, Variants, Partial Run, Region Edit, and Provider Fallback. Host operations and Browser capability discovery used that service correctly, but its configuration source stopped at the Cordis plugin `Config`. The N09 workplan requires the current Harness settings authority, where a feature owner registers a namespace schema and the durable user document overlays the composition configuration.

A naive optional/dynamic Settings integration creates another problem. The base bundle explicitly states that row order is not activation order. If `CanvasFeatureService` could activate before `settings` and later sample Settings when the provider appeared, current capabilities would change halfway through one Host activation. Browser Canvas currently snapshots `canvasFeatures` during its own activation, while Host operations read the service live; that would split UI exposure from Host enforcement.

## Decision

`CanvasFeatureService` declares `settings` as an activation dependency. The shipped base profile already mounts Settings in every profile, so Cordis does not publish `canvasFeatures` until the settings provider is available.

The service registers namespace `canvas` with its existing Schemastery `Config` and the Cordis entry config as the composition base:

```text
schema defaults
  -> CanvasFeatureService entry config (base)
  -> settings.yaml user section "canvas"
  -> resolved activation snapshot
```

The registration uses `applies: 'restart'`. `CanvasFeatureService` samples the resolved scope exactly once when it activates. A later settings document edit is persisted by the Settings provider but does not mutate the current `capabilities` object. Restarting/remounting the feature service re-registers the namespace and samples the new durable user layer.

This is intentionally not a live flag system. A correct live capability transition would need atomic Browser surface removal/republication, Editor node-catalog refresh, prompt-preparation replacement, in-flight admission semantics, and future Agent Tool advertisement updates. N09 does not introduce half of that protocol behind a checkbox.

## Browser ownership

`ui-canvas` owns the Canvas settings section, while `ui-settings` remains only the generic settings shell/transport provider. The Canvas client binds the `canvas` namespace through `ctx.settingsScope` and contributes `settings.section` independently from the current `canvas.enabled` capability. A currently disabled Canvas can therefore still be re-enabled for the next Host activation.

The settings component receives the settings snapshot through the slot `inject.hooks` compartment and framework-generated `useSettings`; it does not subscribe to a service directly. Writes call `SettingsScope.set(feature, { enabled })`; Reset calls `unset(feature)` to re-inherit the composition/schema layers. The page explicitly says restart is required and distinguishes user overrides from inherited values.

The Canvas main product surface remains independent of Settings UI availability. It continues to publish only from the current Host `canvasFeatures` Remote. Saving a checkbox never makes the current UI pretend the new deployment capability is active.

## Alternatives considered

**Keep Cordis Config as the only truth** — rejected. It bypasses the repository's durable settings namespace authority and gives the Browser no canonical persistence path.

**Make Settings optional and sample it whenever it appears** — rejected. Because bundle row order does not sequence activation, this creates an unsafe base-only → settings-backed half-live transition.

**Watch the settings scope and live-update `ctx.canvasFeatures`** — rejected for N09. The existing Browser/Host consumers do not yet share an atomic live-reconfiguration protocol.

**Store flags in Canvas Session/Workflow/Projection or browser localStorage** — rejected. Deployment policy is not Canvas business state and must not become a second durable authority.

## Consequences

Any composition that mounts `CanvasFeatureService` must provide the Harness `settings` service. The shipped base composition already satisfies that contract. A lightweight custom composition that does not need deployment feature policy can omit `CanvasFeatureService`; the Canvas domain itself is not converted into a settings provider.

The Canvas package now has a real workspace dependency on `@deepseek-ai/dsh-settings`, and `ui-canvas` has an optional type/peer dependency on the client Settings contract for its settings contribution. Lockfile and generated artifacts must be produced by the pinned workspace toolchain rather than hand-edited.

## Verification

Host tests cover composition base + user layer resolution, `applies: restart`, secret-free descriptors, no current-activation mutation after settings writes, remount resampling, and namespace disposal. Existing feature and interaction policy fixtures now mount a minimal Settings provider to match the real dependency graph.

Client tests cover all eight switches, restart copy, override/inheritance state, read-only/unavailable states, `SettingsScope.set/unset`, settings contribution disposal, and the critical case where current `canvas.enabled=false` hides `shell.main` but leaves the Canvas Settings section available.

Repository-wide typecheck, lint, build, GUI/browser tests, generated-artifact consistency, and REAL composition remain required before N09 moves from REVIEW to ACCEPTED.