# Canvas V2.2 — Editor workspace authority and exact catalog identity

English | [中文](2026-08-22-canvas-v2-2-editor-workspace.zh.md)

## Why this note exists

N11 turns the Canvas Editor from a selection/state-machine shell into a real semantic workflow editor. The dangerous regressions are not visual. They are authority mistakes: letting Browser draft state become a second Workflow, resolving plugin nodes by type without version, submitting the same Draft twice from debounce and blur, or persisting graph-renderer state as semantic Domain data.

This note records the boundaries maintainers must preserve when changing the Editor.

## 1. Session Projection remains the Workflow authority

The Browser does not own a durable `MediaWorkflow` copy. The current workflow always comes from the session-native `canvas` Projection.

The Editor's session-scoped store is presentation-only. It may retain:

- one narrow selected-node Draft;
- save status;
- revision-fenced Undo/Redo commands;
- an explicit Clipboard payload;
- transient local drag positions.

It must not retain a long-lived Workflow snapshot and later overwrite the Host from that snapshot. A Canvas generation/workflow replacement clears generation-bound Draft/history/positions before the new document can be edited.

This is why every semantic edit is derived against the currently projected Workflow and sent as an atomic `WorkflowEditOperation[]` batch with an exact `workflowRevision` CAS.

## 2. Catalog identity is `(type, version)`, not only `type`

`MediaNodeRegistry` is open-world and may contain multiple versions of the same plugin node type. A durable historical node therefore resolves its UI/port metadata only by:

```text
(node.type, node.nodeVersion ?? 1)
```

Never build `Map<type, definition>` for workflow-node resolution. Doing so can make a v1 node render or connect using v2 ports.

The renderer-neutral graph adapter must preserve `nodeVersion`; dropping it before presentation lookup is equivalent to corrupting the identity even if the Domain value itself is untouched.

The Browser does not create a local Registry. Node Library, Inspector diagnostics, and port authoring consume the client-safe Host catalog snapshot. The Host-provided catalog revision remains the identity of that snapshot; N11 does not add polling or a second revision source.

## 3. Historical unavailable nodes are readable, not silently upgraded

Open-world durability means the current Host may not have the exact Definition that created a historical node.

When the exact Definition is missing:

- keep the node visible;
- keep its durable type/version/config readable;
- render the Inspector as read-only diagnostics;
- do not expose invented ports for new connections;
- do not bind it to another installed version;
- do not delete or migrate it merely because the plugin is absent now.

The same read-only presentation applies when the exact Definition names a deployment Feature that is currently disabled.

Do **not** treat `lifecycle.executable=false` as an Editor permission. N10 owns lifecycle/run admission: a definition may be installed and editable while current execution is disallowed. `creatable/deprecated` filter Node Library creation; `executable` is run-engine policy.

## 4. Draft typing is local; save is one atomic Host write

Keystrokes mutate only the narrow Browser Draft. They do not append Session revisions per character.

N11 uses two save triggers:

- 450 ms after typing stops;
- immediate save when the Inspector field loses focus.

Both triggers call the same Draft save path. An in-flight key derived from the Draft identity prevents blur from starting a write and the pending debounce from submitting the same Draft again.

The save path must preserve these outcomes:

- stale base revision → `Conflict`, no overwrite;
- invalid local JSON → `Save failed`, no Host write;
- no semantic difference → mark clean without creating a revision;
- accepted operations → one atomic Host transaction;
- transport failure → `Offline`/`Save failed`, Draft remains dirty;
- never report `Saved` merely because the Browser attempted a write.

## 5. Undo/Redo are commands, not history rewrites

Undo/Redo entries contain forward/inverse operation batches and the revision fence they expect. They do not contain a Workflow snapshot.

An accepted Undo or Redo is another legal Canvas mutation, so it creates a new workflow revision. Session history is never rewritten.

There is one explicit V1 limitation: current `rename-node` cannot exactly restore an optional `name` field that was originally absent. Empty string is not the same semantic value as field absence, and the current Host edit boundary also rejects an empty rename. Do not hide this with Browser-only state. A future Host wire operation must represent exact clear/restore semantics end-to-end before this case is considered solved.

## 6. Layout is independent from semantic Workflow state

Pointer movement updates only transient Browser positions. Pointer-up persists `canvas/layout-change` through independent `layoutRevision` CAS.

Dragging a node must not advance `workflowRevision`.

The graph adapter is intentionally renderer-neutral. It may expose semantic node/edge identity plus positions, but renderer-library JSON, internal handles, viewport object graphs, or React component instances do not enter the Canvas Domain. XYFlow/React Flow can replace the current positioned-card renderer later without changing durable Workflow format.

## 7. Port authoring follows exact Host metadata

Connection authoring must obtain inputs/outputs from the exact installed Definition for each durable node version. It may offer a connection only when both endpoints are available and media-port types match.

Disconnect is a semantic operation too. Deleting selected edges or nodes derives an atomic operation batch: affected edges are disconnected before nodes are removed, and output-node selection is repaired in the same transaction when needed.

## 8. Tests that guard these boundaries

N11 has focused test sources for:

- exact same-type v1/v2 catalog resolution;
- no silent fall-forward when the historical version is absent;
- read-only Inspector for missing Definition;
- feature-disabled Definition exclusion from authoring;
- exact-version port projection;
- renderer adapter preserving `nodeVersion`;
- typing not writing per character;
- 450 ms debounce commit;
- blur immediate commit with pending-debounce dedupe;
- offline write leaving the Draft dirty and status unsaved;
- copy/paste/delete atomic helpers;
- revision-fenced Undo/Redo store behavior;
- layout staying outside semantic Workflow state.

These tests existing in the branch is not equivalent to CI acceptance. At the time of this note, repository Actions still fail/queue before normal test steps execute. N11 remains `REVIEW` until exact-head repository-pinned checks actually run.

## Maintenance checklist

When changing the Editor, verify all of the following:

1. Is the current Workflow still read from Session Projection rather than a Browser-owned copy?
2. Does every semantic write carry the latest legitimate CAS revision rather than blindly replacing state?
3. Are plugin nodes resolved by exact type + durable version?
4. Can missing/disabled historical nodes still be displayed without invented metadata?
5. Can debounce and blur race without duplicate commits?
6. Does a failed write remain visibly unsaved?
7. Does Undo/Redo create new mutations instead of rewriting history?
8. Does layout remain on its independent event/revision channel?
9. Is Node Library still driven only by Host catalog metadata?
10. Has any renderer-specific state leaked into Domain or Session semantic events?

If any answer is “no”, the change is crossing an N11 authority boundary even if the UI looks correct.
