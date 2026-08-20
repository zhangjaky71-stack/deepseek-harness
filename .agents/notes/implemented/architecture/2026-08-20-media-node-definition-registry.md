# Media node definitions are process-local plugins; workflow nodes remain durable open-world data

## Decision

Canvas workflow node values and media-node definitions live on different planes.

A workflow node is durable semantic data stored in the Canvas Session history. Its `type` is a stable extensible identifier and its `nodeVersion` is durable. A `MediaNodeDefinition` is process-local deployment metadata registered in `ctx.mediaNodes`. The definition tells current code how to validate config, understand ports, present the node, and apply intrinsic lifecycle policy.

The process-local registry must never become a prerequisite for decoding historical Canvas data. If a plugin is absent, an old workflow containing its node still opens. Current consumers then fail explicitly when they require a definition that is not installed.

## Open-world type boundary

`MediaWorkflowNodeType` derives from declaration-mergeable `MediaWorkflowNodeTypeMap`. Built-in types are declared by Canvas, while a plugin may augment the map with its own stable identifier without editing Canvas Domain code.

Pure Canvas validation checks durable structure: node id/type string, positive version, JSON-safe config, graph identity, edges, and output-node references. It does **not** ask whether the current process has a matching definition.

This means plugin unload, rollback, or an older deployment cannot make Session replay fail merely because registry metadata is missing.

## Migration boundary

Core migration stays strict where core owns the schema.

`MEDIA_WORKFLOW_NODE_VERSIONS` is the built-in compatibility table. A known built-in node with a future version still fails loud, because core would otherwise guess a migration it does not understand. A node type not owned by core is preserved with its positive integer `nodeVersion`; core neither upgrades nor downgrades it.

The active plugin that owns that `(type, version)` must register the corresponding definition before current creation/validation/execution can use it.

Historical `image.create@1` remains a special core-owned retired alias and still migrates explicitly to `image.generate@1`.

## Registry lifecycle

`MediaNodeRegistry` is `ctx.mediaNodes`. A definition is keyed by `(type, version)` and registration is effect-scoped to the **calling plugin fiber**.

Consequences:

- duplicate active keys fail rather than silently replacing metadata;
- unloading/HMR of a node plugin removes exactly its own registration;
- replacement plugin code can register new metadata after the old fiber is gone;
- no Session event is emitted by registry registration/unregistration;
- registry state is rebuilt from composition after process restart.

Definition metadata is snapshotted/frozen at registration. Zod schemas remain by reference because they are executable plugin metadata with prototypes/functions, not durable JSON.

## Lifecycle is not feature policy

Intrinsic node lifecycle and N09 deployment capability are independent.

A definition carries:

- `deprecated`
- `creatable`
- `executable`
- optional replacement
- optional deployment feature requirement such as `video`

A deprecated historical node may be non-creatable but still executable. `executable=false` is an intrinsic hard block. N09 `video.enabled=false` is a deployment block even though Video definitions remain registered and intrinsically executable.

Later consumers therefore combine static registry metadata with `ctx.canvasFeatures`; they must not mutate registry definitions to reflect current deployment config.

## One metadata source, multiple consumers

The same definition catalog is intended for:

- N11 Editor node library / Inspector metadata;
- N12 workflow validation and typed port compatibility;
- N12/N16 execution lifecycle checks;
- N18 Agent-readable structural summaries and creatable capability advertising.

Definitions contain stable metadata only. React components, Provider clients/SDK objects, credentials, concrete model ids, binary assets, and mutable run state do not belong in the registry.

## Built-in registration

The seven V1 definitions are registered by `@deepseek-ai/dsh-media-workflow/builtins` on a separate plugin fiber from the registry service itself. This makes built-ins follow the same HMR semantics as future external node plugins instead of receiving privileged hard-coded registry treatment.

The shipped `dsh-base` mounts the registry and built-ins once for every profile. Future feature-specific node plugins can participate through the same registration contract.

## Execution boundary

N10 does not implement the workflow engine. `assertCreatable()` and `assertExecutable()` expose intrinsic lifecycle checks; N12 owns graph validation, required inputs, port compatibility, cycles, topology, partial execution, and fingerprints. N15/N16 additionally own deployment/run admission before Provider or Job work begins.
