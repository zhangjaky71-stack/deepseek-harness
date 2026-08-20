# Agent Note: Canvas open-world node migration

Status: proposed

English | [中文](2026-08-20-canvas-open-world-migration.zh.md)

## Problem

Canvas durable workflows can outlive the plugin composition that created them. A workflow containing a third-party node must remain readable after that plugin is disabled, removed, or temporarily unavailable. Treating the currently installed node catalog as the durable schema makes Session replay depend on runtime plugin availability and can turn a previously valid workflow into unreadable history.

The existing Canvas migration code also used one Core-owned version table as if it described every legal node type. That assumption conflicts with the open-world node registry used by the editor and workflow engine.

## Proposal

Canvas migration will distinguish Canvas-owned compatibility from plugin-owned compatibility.

Canvas Core owns workflow/snapshot/layout schema migration, explicit Core node versions, and frozen Core legacy aliases. The exported Core node-version table is closed over Canvas-owned node kinds only.

Unknown node types are preserved as semantic data. Migration retains the node type, optional positive node version, JSON-safe config, and graph relationships without consulting the installed registry. A missing definition therefore prevents current execution but does not prevent Session replay, projection, inspection, or editor placeholder rendering.

N10 `MediaNodeRegistry` owns current `type@version` definitions, config schemas, ports, and lifecycle metadata. N12 owns graph validation and executor availability. Canvas Core does not infer a plugin's current version or migration path.

Current-version durable objects reject unsupported fields. A writer that adds a durable field must bump the owning schema/version or add an explicit migration path; old readers must not silently discard the field.

Layout adopts the same naming rule as Workflow and Canvas Snapshot: `migrateStoredCanvasLayoutSnapshot()` performs structural migration and `decodeCanvasLayoutSnapshot()` adds the current layout invariant.

`CanvasRunHistoryEntry` remains a Session-derived bounded query/compatibility DTO. Any physical cache using that DTO must remain rebuildable from Session history and must not become a second durable Canvas authority.

This note refines the migration portion of [Session-native generative media Canvas](../feature/2026-08-19-session-media-canvas.md). That broader feature proposal remains active; this note does not supersede its Session-authority, revision, authorization, projection, or UI decisions.

## Alternatives considered

**Reject nodes absent from the current registry during migration.** This makes durable replay dependent on deployment composition and prevents users from opening workflows after uninstalling a plugin, so it is rejected.

**Let Canvas Core maintain versions for every plugin node.** This centralizes third-party compatibility in the wrong package and requires Core changes for every extension, so it is rejected.

**Treat every unknown node version as a future version.** Canvas Core cannot know whether a plugin-defined version is current, historical, or future. Only the owning plugin registry can answer that, so Core preserves the value instead.

**Silently ignore unknown current-schema fields.** This hides writers that changed durable data without changing the version and can lose information during replay, so current-schema decoders reject unsupported fields.

## Acceptance criteria

- A stored workflow containing an uninstalled plugin node can migrate and pass Canvas structural/domain validation without loading that plugin.
- Plugin node type, node version, config, edges, and output references survive reload unchanged.
- Canvas-owned nodes still fail loud for unsupported future Core node versions.
- The Core version map does not use an open-world node type as if every string had a Core-owned version.
- Current Workflow, Node, Snapshot, Layout, Run, Output, and media-reference decoders reject unsupported durable fields where N02 owns decoding.
- Layout exposes separate structural migration and current invariant decode paths.
- Run History remains a rebuildable Session-derived DTO rather than a durable authority.

## Risks

Preserving an unknown plugin node means a workflow can be readable but temporarily non-executable. The editor and execution validator must make that state explicit rather than implying success.

Strict current-schema field checking makes forgotten version bumps fail immediately. That is intentional, but future schema additions must update the owning version and migration tests in the same change.
