# @deepseek-ai/dsh-media-workflow

English | [中文](README.zh.md)

`dsh-media-workflow` owns the versioned semantic node-definition registry and the Browser-independent media DAG engine shared by Validator, Editor adapters, later Provider executors, and Agent summaries. It does not own Canvas durability, Session events, Browser rendering, Provider SDKs, model selection, admission policy, Job lifecycle, retry, or durable Run state.

## Registry contract

The default export is `MediaNodeRegistry`, mounted as `ctx.mediaNodes`. Definitions are keyed by `(type, version)` and registration is effect-scoped to the calling plugin fiber. Registering the same key twice fails; unloading/HMR of the registrant removes exactly the definition that fiber installed. Registry consumers therefore see one live source of node metadata rather than copying switch statements into each subsystem.

The registry owns a process-local monotonic mutation `revision`. `snapshot()` returns `{ revision, definitions }` from one synchronous read, with definitions in stable type/version order. Every successful registration and exact unregistration advances the revision once; validation and duplicate-registration failures do not. The revision belongs to the current Registry instance and is rebuildable, not durable Session state or a cross-restart generation number.

A `MediaNodeDefinition` declares semantic `type`/`version`, stable display metadata, typed named ports, a Zod config schema/default, execution metadata (`capability`, optional deployment `feature`, `deterministic`, `supportsPartialRun`), intrinsic lifecycle, and stable UI identifiers. The registry deliberately stores no React component, Provider client, secret, concrete model id, mutable deployment state, or binary media. Schema objects remain plugin-owned metadata by reference; the remaining definition data is frozen when registered.

`parseConfig()` resolves the exact node version and applies that definition's schema/defaults. `assertCreatable()` rejects definitions that must stay readable but cannot be newly authored. `assertExecutable()` enforces intrinsic lifecycle only. Deployment feature checks, permission, model/provider availability, quota, and concurrency are later admission inputs rather than N10/N12 registry state.

The Host `canvasFeatures.listNodes()` seam projects one client-safe `{ revision, entries }` catalog from the Registry snapshot. Runtime schemas/functions remain Host-only. A Browser consumer preserves the returned Host revision with the entries it loaded; it must not fabricate a local revision or maintain a second node-registry authority.

## DAG validation and scheduling

`@deepseek-ai/dsh-media-workflow/engine` exposes the N12 execution library. `validateMediaWorkflow()` and `assertValidMediaWorkflow()` consume the active exact-version Registry and check duplicate/dangling structure, output identities, config schemas, intrinsic executability, source/target ports, port types, input multiplicity, required inputs, cycles, and output reachability. Topological order is deterministic: ties are ordered by stable node id rather than caller array order.

`planMediaWorkflowExecution()` supports four explicit scopes. `all` schedules the complete DAG. `selected` schedules the selected targets plus their complete upstream closure. `from-node` schedules the seed plus descendants; any incoming edge from an unscheduled producer becomes a required boundary. `downstream` excludes the seed nodes and treats their outgoing values as boundaries. Partial scheduling never silently runs an omitted upstream node, and any scheduled definition with `supportsPartialRun=false` rejects the plan.

Boundary values are keyed by stable edge id. Missing boundary data fails before that node executor runs. Values are checked against the target port type. Executor input arrays within one target port are ordered by edge id, making multi-input behavior independent from workflow array ordering.

## Immutable execution and executor registry

`MediaWorkflowEngine.prepare()` validates the workflow, normalizes every config through its exact Definition, fills the exact node version, detaches caller-owned arrays/objects, and recursively freezes the resulting workflow snapshot before execution begins. Later edits to the live Canvas workflow cannot mutate the running snapshot.

`MediaNodeExecutorRegistry` is an open-world exact `(type, version)` table with duplicate rejection and an idempotent registration disposer. It is deliberately a pure registry rather than a new shipped Cordis service: N12 has no Provider implementation that needs a process-wide executor service yet. N14 can own the process composition it needs while custom executors already participate without adding a switch to the engine.

The engine executes scheduled nodes sequentially in deterministic topological order. An executor receives the immutable workflow snapshot, exact Definition, inputs, node fingerprint, optional already-resolved execution identity, and optional `AbortSignal`. N12 never selects a model or Provider. N13 may later turn a resolved provider/model choice into the stable execution-identity key supplied to N12; Provider routing and credentials belong to N14.

Executor results are validated against exact output ports, required outputs, runtime value kinds, and non-empty content/provenance fingerprints. Results are detached and recursively frozen before they reach downstream nodes or cache storage. Cache hits are validated through the same path before reuse.

## Fingerprints and deterministic cache

Each `MediaNodeExecutionFingerprint` is SHA-256 over exact node type/version, normalized config, the optional resolved execution-identity key, and graph-identified upstream/content fingerprints. Incoming contributions include edge id, source node/port, target port, and the producer-provided content fingerprint, normalized by edge id. This keeps fingerprints stable under array reordering while preserving graph assignment and asset/content provenance.

Automatic cache reuse is permitted only when the exact Definition declares `deterministic=true`. Generative/non-deterministic nodes never auto-read or auto-write the cache even when their inputs repeat. `MemoryMediaNodeExecutionCache` is an explicit process-local implementation for tests or deployments that choose ephemeral reuse; it detaches values on both writes and reads.

## Runtime event and cancellation seams

A run may provide a `WorkflowEventSink`. The engine publishes in-band `node-started`, `node-cache-hit`, and `node-completed` runtime facts. These are provider-neutral runtime events, not Session events. N16 may adapt them into its durable Run/Job lifecycle; N12 itself never appends Canvas/Session state.

An optional `AbortSignal` is checked before planning/execution steps and again after cache/executor awaits. This prevents an executor that ignores its signal from being reported as a successful N12 node after cancellation was observed. Durable cancel races, terminal-state winner rules, Provider cancellation, retry, and reconciliation remain N16 responsibilities.

## Port vocabulary and built-ins

The semantic port vocabulary is `text`, `image`, `video`, `image-list`, `video-list`, and `mask`. Port metadata records name, type, requiredness, optional multiplicity, and optional human-readable description.

`@deepseek-ai/dsh-media-workflow/builtins` registers seven V1 semantic node kinds on its own Cordis fiber:

| Type | Key ports | Execution metadata |
|---|---|---|
| `asset.input@1` | image/video outputs | deterministic source |
| `prompt@1` | text output | deterministic source |
| `image.generate@1` | prompt + optional image-list references → image-list | `text-to-image` |
| `image.edit@1` | image + prompt + optional mask → image | `image-edit` |
| `video.generate@1` | prompt → video | `text-to-video`, requires N09 `video` feature at admission |
| `video.image-to-video@1` | image + optional prompt → video | `image-to-video`, requires N09 `video` feature at admission |
| `output@1` | image-list/video-list inputs | deterministic sink |

The definitions remain registered and readable even when a deployment feature is disabled, preserving historical workflow rendering/migration. Later authoring/admission layers decide whether a currently registered node may be created or run.

## Composition

The shipped `dsh-base` mounts `@deepseek-ai/dsh-media-workflow` for `ctx.mediaNodes` and `@deepseek-ai/dsh-media-workflow/builtins` for V1 Definition registration. N12 adds no new shipped process service. The `./engine` export is a pure execution library constructed by later orchestration with the Registry, an Executor Registry, and an optional cache.

Definition metadata and engine cache are not Session state. HMR/unload may replace active Definitions/Executors without appending Canvas events. Historical Workflow values stay durable in Canvas/Session; N16 later owns durable Run lifecycle around an immutable N12 workflow snapshot.

## Model Experience

None directly. The package registers no model-facing tool and contributes no prompt text. N18 may use the same Definition catalog to summarize nodes and advertise currently available capabilities, but N12 does not add model-visible input.

#### Token effect

Zero direct tokens.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **No model resolver** — N13 maps semantic requirements or explicit model selection to a concrete compatible model and supplies the resolved identity used by later execution/admission.
- **No Provider adapter** — N14 turns N12 executor calls into Provider, Python/local, or remote-workflow execution and owns provider error normalization/cancellation handles.
- **No admission/governance** — N15 owns authorization, feature checks, asset availability, provider availability, concurrency, quota/cost, approval, and idempotency admission before a costly task starts.
- **No durable Run/Job lifecycle** — N16 owns Canvas Run state, Jobs, retry/backoff, cancel races, idempotency, restart reconciliation, and terminal milestones.
- **No persistent media cache/store** — N12 only defines deterministic fingerprint/cache seams; N17/N21 own asset storage and later persistence policy.
- **Registry revision is not durable** — it identifies mutation order only within the current Registry instance; a Host restart rebuilds the registry.
