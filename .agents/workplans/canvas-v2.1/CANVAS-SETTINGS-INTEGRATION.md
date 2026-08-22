# Canvas V2.2 — Settings Integration (`dsh@0.1.1-rc.2`)

## 1. Purpose

Canvas uses Harness Settings for durable user preferences but must not confuse a mutable settings document with the capabilities of the currently running Host activation.

## 2. Authority split

```text
Harness Settings document
  composition base + durable user overlay
                 │
                 ▼
CanvasFeatureService activation
                 │ sample once
                 ▼
immutable current CanvasCapabilities
```

The Settings document answers “what should the next compatible activation use?”. `canvasFeatures` answers “what is available now?”.

## 3. Host contract

The Canvas feature service:

- formally depends on Harness Settings;
- registers namespace `canvas`;
- treats plugin/composition config as base values;
- overlays durable user settings;
- declares restart-applied behavior;
- samples effective values once per activation;
- exposes only effective current capability information to Browser consumers;
- never leaks raw credentials or provider configuration through feature settings.

Current feature families may include Canvas, Editor, image generation/editing, Video and region editing; exact fields are owned by the Canvas feature contract.

## 4. Browser contract under 0.1.1-rc.2

Official client Settings now has one shared `SettingsDescribeMirror`. Canvas must bind its namespace through the official `settingsScope` service and derive from that mirror rather than issuing a private `settings.describe()` read lifecycle per Canvas scope.

Expected shape:

```text
settings.describe()
      ↓ once/shared
SettingsDescribeMirror
      ↓ derived namespace
settingsScope.bind({ namespace: 'canvas' })
      ↓
Canvas Settings section
```

The Canvas settings UI may call namespace `set/unset` writes through the official scope, including expected revision behavior handled by the settings subsystem.

## 5. Disabled Canvas recovery

The Settings contribution must remain reachable when current `canvas.enabled=false` so a loopback/local user can change the next-start configuration. This does **not** mean the current Canvas product surface becomes enabled immediately.

```text
current canvas.enabled=false
→ shell.main Canvas occupant absent
→ Settings section still available if settings service is available
→ user changes value
→ restart/new Host activation required
```

## 6. Browser rendering rule

`ui-canvas` product rendering follows only current `CanvasCapabilities` from the Host feature Remote. It must never render Editor/Image/Video simply because the Settings document says they will be enabled after restart.

## 7. Fail-closed rules

- feature Remote unavailable → do not fabricate Canvas current capability;
- Settings unavailable/read-only → keep current Canvas rendering unchanged and show the appropriate settings state;
- malformed namespace view → Settings subsystem treats the view as unavailable/invalid; Canvas does not invent defaults client-side;
- feature disabled → direct Host mutation/run paths must reject even if a Browser attempts to bypass UI gating.

## 8. Testing requirements

- composition base only;
- user override wins over base;
- `unset` restores inherited base;
- current capabilities remain stable until restart/remount of the Host feature activation;
- shared mirror feeds Canvas namespace without an extra Canvas `describe` reader;
- disabled Canvas still exposes restart settings where allowed;
- remote/non-loopback memory mode is not falsely writable;
- Browser product surface never follows raw Settings directly;
- Host feature/admission checks remain authoritative.

## 9. Migration from the rc.8 private client

The existing N09 Host semantics are retained. The required code migration is primarily Browser-side:

```text
old private SettingsScopeController owning describe/read refresh
→ official shared SettingsDescribeMirror + derived scope
```

Do not reintroduce a separate Canvas mirror to minimize code changes.
