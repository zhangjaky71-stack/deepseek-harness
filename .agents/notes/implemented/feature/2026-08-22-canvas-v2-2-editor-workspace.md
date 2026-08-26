# Agent Note: Canvas V2.2 editor workspace authority and exact catalog identity

Status: implemented

English | [中文](2026-08-22-canvas-v2-2-editor-workspace.zh.md)

## Problem

N11 turns the Canvas Editor from a selection/state-machine shell into a real semantic workflow editor. The dangerous regressions are not visual. They are authority mistakes: letting Browser draft state become a second Workflow, resolving plugin nodes by type without version, submitting the same Draft twice from debounce and blur, or persisting graph-renderer state as semantic Domain data.

The Editor therefore needs durable maintenance boundaries that keep semantic Workflow authority on the Host/session side while still allowing responsive Browser-local editing state. Those boundaries must also survive open-world node definitions, historical node versions, deployment feature changes, asynchronous saves, Undo/Redo, and an independently revisioned layout channel.

## Decision

The shipped N11 Editor keeps Session Projection as the semantic Workflow authority and treats Browser state as presentation-only. Every semantic mutation is derived from the currently projected Workflow and sent as an atomic operation batch with an exact `workflowRevision` CAS.

Installed node metadata is resolved by exact `(type, nodeVersion ?? 1)` identity from the Host-projected catalog. Missing or deployment-disabled historical definitions remain visible and readable but cannot be silently rebound, edited through invented metadata, or used for new connection authoring.

Draft typing stays Browser-local. The 450 ms debounce and Inspector blur both enter one save path with in-flight Draft-identity de-duplication; failed transport or validation leaves the Draft dirty and visibly unsaved. Layout persistence stays outside semantic Workflow revisioning and uses its own generation-scoped monotonic `layoutRevision` CAS token.

## 1. Session Projection remains the Workflow authority

The Browser does not own a durable `MediaWorkflow` copy. The current workflow always comes from the session-native `canvas` Projection.

The Editor's session-scoped store is presentation-only. It may retain:

- one narrow selected-node Draft;
- save status;
- revision-fenced Undo/Redo commands;
- an explicit Clipboard payload;
- transient local drag positions.

It must not retain a long-lived Workflow snapshot and later overwrite the Host from that snapshot. A Canvas generation/workflow replacement clears generation-bound Draft/history/positions before the new document can be edited.

Every semantic edit is therefore derived against the currently projected Workflow and sent as an atomic `WorkflowEditOperation[]` batch with an exact `workflowRevision` CAS.

## 2. Catalog identity is `(type, version)`, not only `type`

`MediaNodeRegistry` is open-world and may contain multiple versions of the same plugin node type. A durable historical node therefore resolves its UI/port metadata only by:

```text
(node.type, node.nodeVersion ?? 1)
```

Never build `Map<type, definition>` for workflow-node resolution. Doing so can make a v1 node render or connect using v2 ports.

The renderer-neutral graph adapter preserves `nodeVersion`; dropping it before presentation lookup would corrupt identity even if the Domain value itself remained untouched.

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

The save path preserves these outcomes:

- stale base revision → `Conflict`, no overwrite;
- invalid local JSON → `Save failed`, no Host write;
- no semantic difference → mark clean without creating a revision;
- accepted operations → one atomic Host transaction;
- transport failure → `Offline`/`Save failed`, Draft remains dirty;
- never report `Saved` merely because the Browser attempted a write.

## 5. Undo/Redo are commands, not history rewrites

Undo/Redo entries contain forward/inverse operation batches and the revision fence they expect. They do not contain a Workflow snapshot.

An accepted Undo or Redo is another legal Canvas mutation, so it creates a new workflow revision. Session history is never rewritten.

There is one explicit V1 limitation: current `rename-node` cannot exactly restore an optional `name` field that was originally absent. Empty string is not the same semantic value as field absence, and the current Host edit boundary also rejects an empty rename. N11 does not hide this with Browser-only state. A future Host wire operation must represent exact clear/restore semantics end-to-end before this case is considered solved.

## 6. Layout is independent from semantic Workflow state

Pointer movement updates only transient Browser positions. Pointer-up persists `canvas/layout-change` through independent `layoutRevision` CAS.

Dragging a node does not advance `workflowRevision`.

The Browser layout CAS clock is scoped by `(canvasId, workflowId)` and reconciles projected revisions monotonically. A delayed Projection cannot move a receipt-advanced token backwards, and a late save receipt from a replaced Canvas/workflow generation cannot clear the current generation's local positions.

The graph adapter is intentionally renderer-neutral. It may expose semantic node/edge identity plus positions, but renderer-library JSON, internal handles, viewport object graphs, or React component instances do not enter the Canvas Domain. XYFlow/React Flow can replace the current positioned-card renderer later without changing durable Workflow format.

## 7. Port authoring follows exact Host metadata

Connection authoring obtains inputs/outputs from the exact installed Definition for each durable node version. It may offer a connection only when both endpoints are available and media-port types match.

Disconnect is a semantic operation too. Deleting selected edges or nodes derives an atomic operation batch: affected edges are disconnected before nodes are removed, and output-node selection is repaired in the same transaction when needed.

## Testing

N11 has focused tests for:

- exact same-type v1/v2 catalog resolution;
- no silent fall-forward when the historical version is absent;
- read-only Inspector for missing Definition;
- feature-disabled Definition exclusion from authoring;
- exact-version port projection;
- renderer adapter preserving `nodeVersion`;
- typing not writing per character;
- 450 ms debounce commit;
- blur immediate commit with pending-debounce de-duplication;
- offline write leaving the Draft dirty and status unsaved;
- copy/paste/delete atomic helpers;
- revision-fenced Undo/Redo store behavior;
- layout staying outside semantic Workflow state;
- predecessor layout-revision monotonicity and generation fencing.

The presence of test sources is not itself an acceptance claim. Repository-pinned validation is tracked separately from this implemented decision record; the note describes the shipped branch semantics regardless of whether the current stacked PR has completed every repository gate.

## Alternatives considered

**Keep a Browser-owned Workflow snapshot and save it wholesale.** Rejected because it creates a second semantic authority, makes Projection replacement and concurrent Host writes race with stale Browser state, and weakens exact revision CAS into last-writer-wins replacement.

**Resolve plugin metadata by node `type` only.** Rejected because the registry is open-world and can contain v1 and v2 of the same type. Type-only lookup silently attaches the wrong ports/defaults/lifecycle metadata to durable historical nodes.

**Let debounce and blur execute independent save implementations.** Rejected because the two triggers can race and submit the same Draft twice. One save path plus in-flight Draft identity de-duplication makes trigger timing a presentation concern rather than a write-authority concern.

**Persist renderer state as Workflow state.** Rejected because renderer JSON, viewport internals, and component-specific handles are not semantic media-workflow data. Keeping layout on an independent revision channel preserves renderer replaceability and prevents drag operations from mutating semantic Workflow history.

**Silently bind an unavailable historical node to the nearest installed version.** Rejected because it changes durable meaning without an explicit migration. Historical nodes remain readable and authoring becomes read-only until their exact Definition is available and enabled.

## Consequences

The decision buys one semantic Workflow authority, exact historical node identity, deterministic Draft write behavior, and renderer-independent durability. It also makes failures explicit: unavailable historical definitions are intentionally read-only, failed writes stay visibly dirty, and stale layout receipts are ignored rather than guessed into current state.

The cost is additional Browser presentation machinery: Draft identity de-duplication, exact catalog availability checks, revision-fenced command history, and a separate generation-scoped layout CAS clock. The V1 `rename-node` wire limitation also remains visible instead of being papered over in Browser state. These costs are intentional because they keep authority and durable semantics on the Host/session boundary.

## Maintenance checklist

When changing the Editor, verify all of the following:

1. Is the current Workflow still read from Session Projection rather than a Browser-owned copy?
2. Does every semantic write carry the latest legitimate CAS revision rather than blindly replacing state?
3. Are plugin nodes resolved by exact type + durable version?
4. Can missing/disabled historical nodes still be displayed without invented metadata?
5. Can debounce and blur race without duplicate commits?
6. Does a failed write remain visibly unsaved?
7. Does Undo/Redo create new mutations instead of rewriting history?
8. Does layout remain on its independent event/revision channel with generation fencing?
9. Is Node Library still driven only by Host catalog metadata?
10. Has any renderer-specific state leaked into Domain or Session semantic events?

If any answer is “no”, the change crosses an N11 authority boundary even if the UI looks correct.
