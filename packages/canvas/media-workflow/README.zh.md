# @deepseek-ai/dsh-media-workflow

[English](README.md) | 中文

`dsh-media-workflow` 负责未来 Media Workflow Validator、Editor Adapter、Agent Summary 与 Executor 共用的版本化语义 Node Definition Registry。它不拥有 Canvas durability、Session Event、Browser Rendering Component、Provider SDK、模型路由、Scheduler 或 Run State。

## Registry 契约

Package 默认导出 `MediaNodeRegistry`，挂载为 `ctx.mediaNodes`。Definition 以 `(type, version)` 为 key，注册生命周期归调用 plugin 的 Cordis fiber 所有。同一个 key 重复注册会失败；registrant unload/HMR 时，只会移除该 fiber 安装的精确 definition。因此各 consumer 读取的是一套实时 Node Metadata authority，而不是在多个子系统中复制 switch/if-else。

Registry 还拥有一个 process-local、单调递增的 mutation `revision`。`snapshot()` 会在一次同步读取中返回 `{ revision, definitions }`，Definition 顺序与 `list()` 相同，稳定按 type/version 排序。每次成功注册或精确注销都会让 revision 恰好推进一次；Definition validation 失败或 duplicate registration 不推进。因而 HMR 风格的 unload 后重新注册会表现为两个独立 mutation，而不是在同一个 catalog identity 下静默替换 metadata。该 revision 只属于当前 Registry instance，可重建；它不是 durable Session State，也不是跨 restart generation number。

`MediaNodeDefinition` 声明：

- 语义 `type` 与正整数 `version`；
- 稳定 display name；
- 有名称和类型的 input/output port；
- Zod `configSchema` 与 JSON-safe `defaultConfig`；
- execution metadata（`capability`、可选 N09 deployment `feature`、`deterministic`、`supportsPartialRun`）；
- intrinsic lifecycle（`deprecated`、`creatable`、`executable`、可选 replacement）；
- 稳定字符串 UI metadata（`category`、`icon`、`inspectorKind`）。

Registry 有意不保存 React Component、Browser callback、Provider client、Secret、Model id、可变 Deployment State 或二进制媒体。Zod Schema 对象作为 defining plugin 拥有的 metadata 保持引用；其它注册后的 Definition data 会冻结成稳定快照，因此 caller 不能在注册后通过修改原对象改变 Registry 行为。

`parseConfig()` 会解析 Node 精确版本并应用对应 Definition 的 Schema/Default。`assertCreatable()` 会拒绝“历史仍需可读、但不能继续新建”的 Definition。`assertExecutable()` 只负责 intrinsic lifecycle；N12 在真实执行前再把它与 Graph Validation 和 N09 Deployment Feature State 组合起来。

Host `canvasFeatures.listNodes()` seam 会从 Registry snapshot 投影一份 client-safe `{ revision, entries }` catalog；runtime schema/function 仍只存在于 Host。Browser consumer 必须把 Host 返回的 revision 与本次加载的 entries 一起保留，不得自己生成 local revision，也不得维护第二套 Node Registry authority。Catalog discovery 失败时不宣称任何 Host revision；Presentation 可以独立降级，但历史 Workflow 的可读性不受影响。

## Port Vocabulary

N10 使用 Canvas 的语义 Port Vocabulary：`text`、`image`、`video`、`image-list`、`video-list`、`mask`。Port metadata 记录 name、type、required、可选 multiplicity 与可选说明。连接兼容、必填输入满足、Cycle、Topological Scheduling 与 Output Reachability 属于 N12；本 package 只提供这些检查共用的 metadata。

## Built-in V1 Definition

`@deepseek-ai/dsh-media-workflow/builtins` 是一个 Function Plugin，会在自身 Cordis fiber 上注册最初 7 个语义 Node：

| Type | 关键 Port | Execution Metadata |
|---|---|---|
| `asset.input@1` | image/video output | deterministic source |
| `prompt@1` | text output | deterministic source |
| `image.generate@1` | prompt + 可选 image-list reference → image-list | `text-to-image` |
| `image.edit@1` | image + prompt + 可选 mask → image | `image-edit` |
| `video.generate@1` | prompt → video | `text-to-video`，要求 N09 `video` feature |
| `video.image-to-video@1` | image + 可选 prompt → video | `image-to-video`，要求 N09 `video` feature |
| `output@1` | image-list/video-list input | deterministic sink |

当前 7 个 V1 Definition 的 intrinsic lifecycle 都是 creatable/executable 且未 deprecated。Deployment availability 与此分离：例如 N09 `video.enabled=false` 时，Video Definition 仍会注册并可解析，因此历史 Workflow 仍能显示和迁移；Editor 新建列表与 Execution Admission 再通过同一 Feature Policy 过滤它们。

## Lifecycle Policy

Lifecycle 有意与 Schema Migration、Deployment Feature Policy 分离。

Deprecated Definition 可以为了历史 Session 继续 resolvable/executable，同时 `creatable=false` 阻止新建；未来 replacement 可以指向另一个 `(type, version)`，但不会重写历史 Node。`executable=false` 是 intrinsic hard block，`assertExecutable()` 会在后续 Scheduler/Provider path 执行前拒绝该 Node。

未知 Definition 使用稳定 Registry Error 显式失败，不会被静默当成 generic executable node。N02 仍负责 durable Schema Migration；N10 只提供 active Definition catalog，供后续 Validation 与 Presentation 使用。

## Composition

Shipped `dsh-base` 挂载两行：

- `@deepseek-ai/dsh-media-workflow` — Registry Service（`ctx.mediaNodes`）；
- `@deepseek-ai/dsh-media-workflow/builtins` — V1 Definition Registration。

Registry lifetime 因而保持 process-local 且可重建。Definition metadata 不是 Session State，因此 HMR/unload 可以替换 active registration，而无需 append Canvas Event。历史 Workflow Node Value 仍 durable 地存在 Canvas/Session；Registry State 只描述“当前运行中的 Deployment 如何理解这些 Node”。

## 模型体验

### Registry metadata 本身不直接对模型可见

#### 模型看到什么

本 Package 自身不会让模型看到任何内容。`MediaNodeRegistry` 与其 client-safe catalog 仍是 Host/runtime metadata；未来如 N18 的 model-facing consumer 可以选择并渲染这些 Definition，而由该 consumer 对最终 model-visible text 负责。

#### Token 影响

本 Package 自身不会增加 standing 或 turn-local token；只有下游 model-facing consumer 真正渲染所选 Registry metadata 时才产生 token。

#### KV Cache 影响

本 Package 自身不安装 prompt prefix 或 tool schema，因此无直接 KV Cache 影响；任何缓存影响归实际渲染 Registry metadata 的下游 consumer 所有。

## 已知限制与后续工作

- **尚无 Graph Validator/Scheduler** — Cycle、Port Compatibility、Required Input、Topology、Partial Execution 与 Fingerprint 属于 N12。
- **尚无可视化 Editor Node Library** — N11 消费 Registry；N10 不添加 React Renderer 或 Inspector Form。
- **尚无 Provider/Model Registry** — N13/N14 把 Execution Capability 解析到具体 Model/Provider。
- **尚无 Agent Canvas Tool** — N18 消费 Definition 做 Summary/Tool Availability。
- **`executable=true` 本身不等于可立即运行** — intrinsic lifecycle 只是 Admission 输入之一；N09 Feature Policy 与后续 Run Governance 仍然生效。
- **Registry revision 不是 durable 数据** — 它只标识当前 Registry instance 内的 mutation 顺序。Host restart 会重建 Registry；Browser consumer 必须把重新获取的 snapshot 当作 authority，而不能跨 Host lifetime 比较 revision number。
