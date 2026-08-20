# Canvas Editor draft and atomic mutation model

Status: implemented in the N11 draft stack; installed-node catalog and port-connection authoring remain follow-up work before N11 is considered complete.

## Problem

The Canvas Editor needs responsive local typing and dragging without creating a second semantic workflow authority in the Browser. It also needs undo/redo, copy/paste, and concurrent Agent/human safety while the durable workflow remains Session-native and revisioned by the Host.

## Decision

The `conversation.view` Canvas entry declares one session-scoped slot store. The store contains only presentation state: node-level Inspector Draft, save status, undo/redo command entries, clipboard subgraph, and transient drag positions. It never stores a complete `MediaWorkflow`; the authoritative workflow continues to come from `useProjection('canvas')`.

Inspector typing updates only a narrow node Draft. After 450 ms without input, the Editor derives the smallest `WorkflowEditOperation[]` batch from the current projected workflow and submits it through `canvas.editWorkflow`. The injected Browser mutation bridge reads the live projection again immediately before the RPC and requires the caller's expected `workflowRevision` to match. Revision mismatch becomes `Conflict`; it never silently rebases or overwrites.

Undo and redo store forward/inverse operation batches plus a revision fence, not workflow snapshots. A successful forward mutation records the committed revision as the only revision at which its inverse may run. Undo and redo are ordinary Host mutations, so every accepted action creates a new workflow revision and Session event.

Copy stores only the selected nodes, their internal edges, and renderer-neutral positions. Paste creates fresh node and edge ids and sends all semantic additions as one atomic operation batch. Delete disconnects affected edges before node removal and repairs `outputNodeIds` in the same batch. Select All remains Browser-local interaction context.

Node dragging updates only local positions during the gesture. Pointer-up persists one renderer-neutral `SaveCanvasLayoutRequest`; layout persistence remains independent of `workflowRevision`.

Save state is explicit: `Saved`, `Saving`, `Conflict`, `Offline`, or `Save failed`. Transport rejection does not mutate history stacks. The Inspector keeps its dirty Draft after conflict rather than overwriting the latest projected workflow.

## Renderer boundary

N11 introduces `adapters.ts` with renderer-neutral `CanvasFlowNode` and `CanvasFlowEdge` values. No React Flow/XYFlow object is stored in Domain or Session state. The current draft renderer uses positioned semantic cards so the edit model can be reviewed without adding an unverified dependency or hand-editing the lockfile. A future XYFlow adapter can consume the same boundary.

## Node catalog limitation

The Browser does not duplicate N10's Host `ctx.mediaNodes` metadata. The current node-library panel only offers types already present in the authoritative workflow. A client-safe installed-node catalog Remote is still required before the library can create arbitrary registered node types from the single Host metadata source.

## Known N10 compatibility defect

N10's intended open-world node-type contract is not fully realized yet: the current Canvas pure domain/migration code still contains built-in node-type admission tables. That conflicts with the registry architecture because an unavailable plugin's historical node must remain readable. This is a merge blocker for the completed N11 node-catalog work and must be removed before custom node types are authored from the Editor.

## Verification status

Unit tests were added for Draft operation derivation, atomic delete ordering, copy/paste fresh identities, inverse commands, layout adapters, and revision-fenced store history. The private repository currently cannot allocate its GitHub-hosted runner and the available environment has no authenticated checkout, so these tests are authored but not reported as executed in this change.
