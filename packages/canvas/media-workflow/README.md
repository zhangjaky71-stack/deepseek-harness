# @deepseek-ai/dsh-media-workflow

English | [中文](README.zh.md)

`dsh-media-workflow` owns the versioned semantic node-definition registry shared by the future media Workflow Validator, Editor adapters, Agent summaries, and Executor. It does not own Canvas durability, Session events, Browser rendering components, Provider SDKs, model routing, scheduling, or run state.

## Registry contract

The default export is `MediaNodeRegistry`, mounted as `ctx.mediaNodes`. Definitions are keyed by `(type, version)` and registration is effect-scoped to the calling plugin fiber. Registering the same key twice fails; unloading/HMR of the registrant removes exactly the definition that fiber installed. Registry consumers therefore see one live source of node metadata rather than copying switch statements into each subsystem.

A `MediaNodeDefinition` declares:

- semantic `type` and positive integer `version`;
- stable display name;
- typed named input/output ports;
- Zod `configSchema` and JSON-safe `defaultConfig`;
- execution metadata (`capability`, optional N09 deployment `feature`, `deterministic`, `supportsPartialRun`);
- intrinsic lifecycle (`deprecated`, `creatable`, `executable`, optional replacement);
- stable string UI metadata (`category`, `icon`, `inspectorKind`).

The registry deliberately stores no React component, browser callback, Provider client, secret, model id, mutable deployment state, or binary media. Zod schema objects remain plugin-owned metadata by reference; the remaining registered definition data is frozen into a stable snapshot so a caller cannot mutate registry behavior after registration.

`parseConfig()` resolves the exact node version and applies that definition's schema/defaults. `assertCreatable()` rejects definitions that must stay readable but cannot be newly authored. `assertExecutable()` enforces intrinsic lifecycle only; N12 combines it with graph validation and N09 deployment feature state before actual execution.

## Port vocabulary

N10 uses the Canvas semantic port vocabulary: `text`, `image`, `video`, `image-list`, `video-list`, and `mask`. Port metadata records name, type, requiredness, optional multiplicity, and optional human-readable description. N12 owns connection compatibility, required-input satisfaction, cycle checks, topological scheduling, and output reachability; this package supplies the metadata those checks consume.

## Built-in V1 definitions

`@deepseek-ai/dsh-media-workflow/builtins` is a function plugin that registers the seven initial semantic node kinds on its own Cordis fiber:

| Type | Key ports | Execution metadata |
|---|---|---|
| `asset.input@1` | image/video outputs | deterministic source |
| `prompt@1` | text output | deterministic source |
| `image.generate@1` | prompt + optional image-list references → image-list | `text-to-image` |
| `image.edit@1` | image + prompt + optional mask → image | `image-edit` |
| `video.generate@1` | prompt → video | `text-to-video`, requires N09 `video` feature |
| `video.image-to-video@1` | image + optional prompt → video | `image-to-video`, requires N09 `video` feature |
| `output@1` | image-list/video-list inputs | deterministic sink |

All seven current V1 definitions are intrinsically creatable/executable and not deprecated. Deployment availability is separate: for example, the Video definitions remain registered and resolvable when N09 `video.enabled=false`, which lets historical workflows render and migrate, while Editor creation lists and execution admission can filter them through the shared feature policy.

## Lifecycle policy

Lifecycle is intentionally independent from schema migration and deployment feature policy.

A deprecated definition may stay resolvable and executable for historical Sessions while `creatable=false` prevents new authoring. A future replacement can point to another `(type, version)` without rewriting the historical node. `executable=false` is a hard intrinsic block and `assertExecutable()` rejects it before a later scheduler/provider path can run the node.

Unknown definitions fail with stable registry errors rather than being silently treated as generic executable nodes. N02 still owns durable schema migration; N10 only supplies the active definition catalog that later validation and presentation consume.

## Composition

The shipped `dsh-base` mounts two rows:

- `@deepseek-ai/dsh-media-workflow` — registry service (`ctx.mediaNodes`);
- `@deepseek-ai/dsh-media-workflow/builtins` — V1 definition registration.

This keeps registry lifetime process-local and rebuildable. Definition metadata is not Session state, so HMR/unload can replace an active registration without appending Canvas events. Historical workflow node values remain durable in Canvas/Session; registry state describes how this running deployment understands them.

## Model Experience

None directly. The package registers no model-facing tool and contributes no prompt text. N18 may use the same definitions to summarize nodes and advertise only currently creatable capabilities, but that model surface is not implemented here.

#### Token effect

Zero direct tokens.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **No graph validator/scheduler yet** — N12 owns cycles, port compatibility, required inputs, topology, partial execution, and fingerprints.
- **No visual editor node library yet** — N11 consumes this registry; N10 does not add React renderers or Inspector forms.
- **No Provider/model registry** — N13/N14 resolve execution capability to concrete models/providers.
- **No Agent Canvas tools** — N18 consumes definitions for summaries/tool availability.
- **No runtime execution from `executable=true` alone** — intrinsic lifecycle is one admission input; N09 feature policy and later run governance still apply.
