# @deepseek-ai/dsh-media-workflow

[English](README.md) | 中文

`dsh-media-workflow` 同时负责版本化语义 Node Definition Registry 与 Browser-independent Media DAG Engine，供 Validator、Editor Adapter、后续 Provider Executor 与 Agent Summary 共用。它不拥有 Canvas durability、Session Event、Browser Rendering、Provider SDK、模型选择、Admission Policy、Job Lifecycle、Retry 或 Durable Run State。

## Registry 契约

Package 默认导出 `MediaNodeRegistry`，挂载为 `ctx.mediaNodes`。Definition 以 `(type, version)` 为 key，注册生命周期归调用 Plugin Fiber 所有；相同 key 重复注册会失败，Registrant unload/HMR 时只移除该 Fiber 安装的精确 Definition。各 Consumer 因而读取同一套实时 Node Metadata Authority，而不是在多个子系统复制 switch/if-else。

Registry 维护 process-local、单调递增的 mutation `revision`。`snapshot()` 在一次同步读取中返回 `{ revision, definitions }`，Definition 稳定按 type/version 排序。每次成功注册或精确注销恰好推进一次 revision；Validation 与 duplicate registration 失败不推进。该 revision 只属于当前 Registry Instance，可重建，不是 Durable Session State，也不是跨 restart generation number。

`MediaNodeDefinition` 声明语义 `type`/`version`、稳定 display metadata、typed named ports、Zod config schema/default、Execution Metadata（`capability`、可选 deployment `feature`、`deterministic`、`supportsPartialRun`）、Intrinsic Lifecycle 与稳定 UI identifier。Registry 有意不保存 React Component、Provider Client、Secret、具体 Model id、可变 Deployment State 或 Binary Media。Schema Object 保持 defining plugin 拥有的引用；其余 Definition Data 在注册时冻结。

`parseConfig()` 解析 Node 精确版本并应用对应 Schema/Default。`assertCreatable()` 拒绝历史仍需可读但不能新建的 Definition。`assertExecutable()` 只执行 Intrinsic Lifecycle 检查。Deployment Feature、Permission、Model/Provider Availability、Quota 与 Concurrency 都属于后续 Admission，而不是 N10/N12 Registry State。

Host `canvasFeatures.listNodes()` 从 Registry Snapshot 投影 client-safe `{ revision, entries }` Catalog；Runtime Schema/Function 仍只存在于 Host。Browser 必须把 Host 返回的 revision 与本次 entries 一起保留，不得自建 Local Revision 或第二套 Registry Authority。

## DAG Validation 与 Scheduling

`@deepseek-ai/dsh-media-workflow/engine` 暴露 N12 Execution Library。`validateMediaWorkflow()` 与 `assertValidMediaWorkflow()` 消费 active exact-version Registry，检查 duplicate/dangling structure、Output Identity、Config Schema、Intrinsic Executability、Source/Target Port、Port Type、Input Multiplicity、Required Input、Cycle 与 Output Reachability。Topological Order 完全确定：tie 按 stable node id 排序，不依赖 caller array order。

`planMediaWorkflowExecution()` 支持四种显式 Scope。`all` 运行完整 DAG；`selected` 运行目标节点及其完整 upstream closure；`from-node` 运行 seed 与 descendants，所有来自未调度 producer 的 incoming edge 都变成 required boundary；`downstream` 不执行 seed node，并把 seed 的 outgoing value 作为 boundary。Partial Scheduling 绝不会偷偷执行被排除的上游节点；任何 scheduled Definition 的 `supportsPartialRun=false` 都会拒绝计划。

Boundary Value 以 Stable Edge ID 为 key。缺失 boundary 会在该 Node Executor 运行前失败，Value Kind 还必须与 Target Port Type 一致。同一 Target Port 下的 Executor Input 按 Edge ID 排序，因此 multi-input 行为不受 Workflow Array Ordering 影响。

## Immutable Execution 与 Executor Registry

`MediaWorkflowEngine.prepare()` 会先 Validation，再通过精确 Definition Normalize 每个 Config、补全精确 Node Version、Detach Caller-owned Array/Object，并递归冻结 Workflow Snapshot。运行开始后，对 Live Canvas Workflow 的后续编辑不会改变正在执行的 Snapshot。

`MediaNodeExecutorRegistry` 是 open-world exact `(type, version)` table，重复注册失败，Registration 返回 idempotent disposer。它有意保持 Pure Registry，而不是现在就新增一个 shipped Cordis Service：N12 还没有需要 process-wide Executor Service 的 Provider Implementation。N14 可以拥有它真正需要的 Process Composition，同时 Custom Executor 已经可以通过注册参与执行，无需修改 Engine Switch。

Engine 按确定的 Topological Order 顺序执行 Scheduled Node。Executor 收到 Immutable Workflow Snapshot、Exact Definition、Inputs、Node Fingerprint、可选的 already-resolved Execution Identity 与可选 `AbortSignal`。N12 不选择 Model 或 Provider。N13 后续可以把最终 Provider/Model Resolution 投影成稳定 Execution Identity Key 再交给 N12；Provider Routing 与 Credential 属于 N14。

Executor Result 会按 Exact Output Port、Required Output、Runtime Value Kind 与非空 Content/Provenance Fingerprint 验证，并在进入 Downstream Node 或 Cache 前 Detach + Recursively Freeze。Cache Hit 也必须经过同一条 Validation Path 才能复用。

## Fingerprint 与 Deterministic Cache

每个 `MediaNodeExecutionFingerprint` 都是 SHA-256，输入包括 Exact Node Type/Version、Normalized Config、可选 Resolved Execution Identity Key，以及带 Graph Identity 的 Upstream/Content Fingerprint。每个 Incoming Contribution 包含 Edge ID、Source Node/Port、Target Port 与 Producer 提供的 Content Fingerprint，并按 Edge ID Normalize。这样既能抵抗 Array Reorder，又保留 Graph Assignment 与 Asset/Content Provenance。

只有 Exact Definition 声明 `deterministic=true` 时才允许 Automatic Cache Reuse。Generative/Non-deterministic Node 即使输入完全相同也不会自动读写 Cache。`MemoryMediaNodeExecutionCache` 是显式的 Process-local 实现，适合 Test 或主动选择 Ephemeral Reuse 的 Deployment；读写两端都会 Detach Value。

## Runtime Event 与 Cancellation Seam

Run 可以提供 `WorkflowEventSink`。Engine 会 in-band 发布 `node-started`、`node-cache-hit` 与 `node-completed` Runtime Fact。它们是 Provider-neutral Runtime Event，不是 Session Event。N16 后续可以把这些事实适配进 Durable Run/Job Lifecycle；N12 自己绝不 append Canvas/Session State。

可选 `AbortSignal` 会在 Planning/Execution 步骤前检查，并在 Cache/Executor Await 返回后再次检查。因此即使 Executor 忽略 Signal，只要 Cancellation 已被观察到，该 Node 也不会被 N12 当作成功结果返回。Durable Cancel Race、Terminal Winner、Provider Cancel、Retry 与 Reconciler 仍属于 N16。

## Port Vocabulary 与 Built-ins

语义 Port Vocabulary 为 `text`、`image`、`video`、`image-list`、`video-list`、`mask`。Port Metadata 记录 Name、Type、Required、可选 Multiplicity 与可选说明。

`@deepseek-ai/dsh-media-workflow/builtins` 会在自己的 Cordis Fiber 上注册 7 个 V1 Semantic Node：

| Type | 关键 Port | Execution Metadata |
|---|---|---|
| `asset.input@1` | image/video output | deterministic source |
| `prompt@1` | text output | deterministic source |
| `image.generate@1` | prompt + 可选 image-list reference → image-list | `text-to-image` |
| `image.edit@1` | image + prompt + 可选 mask → image | `image-edit` |
| `video.generate@1` | prompt → video | `text-to-video`，Admission 时要求 N09 `video` feature |
| `video.image-to-video@1` | image + 可选 prompt → video | `image-to-video`，Admission 时要求 N09 `video` feature |
| `output@1` | image-list/video-list input | deterministic sink |

即使 Deployment Feature 被关闭，Definition 仍保持 Registered/Readable，以保证历史 Workflow 可以 Rendering/Migration；后续 Authoring/Admission Layer 决定当前是否允许新建或运行。

## Composition

Shipped `dsh-base` 只挂载 `@deepseek-ai/dsh-media-workflow`（`ctx.mediaNodes`）与 `@deepseek-ai/dsh-media-workflow/builtins`（V1 Definition Registration）。N12 不新增 shipped process service。`./engine` 是 Pure Execution Library，由后续 Orchestration 使用 Registry、Executor Registry 与可选 Cache 构造。

Definition Metadata 与 Engine Cache 都不是 Session State。HMR/unload 可以替换 Active Definition/Executor，而无需 Append Canvas Event。历史 Workflow Value 继续 Durable 地存在 Canvas/Session；N16 后续围绕 Immutable N12 Workflow Snapshot 持有 Durable Run Lifecycle。

## 模型体验

没有直接影响。本 Package 不注册 Model-facing Tool，也不贡献 Prompt Text。N18 后续可以用同一 Definition Catalog 总结 Node 并广告当前可用 Capability，但 N12 不增加 Model-visible Input。

#### Token 影响

直接影响为零。

#### KV Cache 影响

无。

## 已知限制与后续工作

- **尚无 Model Resolver** — N13 把 Semantic Requirement 或 Explicit Model Selection 解析到真正兼容的 Model，并向后续 Execution/Admission 提供 Resolved Identity。
- **尚无 Provider Adapter** — N14 把 N12 Executor Call 转成 Provider、Python/Local 或 Remote Workflow Execution，并拥有 Provider Error Normalization/Cancel Handle。
- **尚无 Admission/Governance** — N15 负责 Authorization、Feature Check、Asset Availability、Provider Availability、Concurrency、Quota/Cost、Approval 与 Idempotency Admission，且必须发生在收费任务启动前。
- **尚无 Durable Run/Job Lifecycle** — N16 负责 Canvas Run State、Jobs、Retry/Backoff、Cancel Race、Idempotency、Restart Reconciliation 与 Terminal Milestone。
- **尚无 Persistent Media Cache/Store** — N12 只定义 Deterministic Fingerprint/Cache Seam；N17/N21 负责 Asset Storage 与后续 Persistence Policy。
- **Registry Revision 不是 Durable 数据** — 它只表示当前 Registry Instance 内的 Mutation Order；Host Restart 会重建 Registry。
