# Canvas v2.2 Media Workflow Engine 职责边界

N12 为 `@deepseek-ai/dsh-media-workflow` 增加了与 Browser 解耦的 Media DAG Engine。Package 现在负责静态 Graph Validation、确定性 Planning、不可变 Execution Snapshot、精确版本 Executor Dispatch、Execution Fingerprint、Deterministic Cache Reuse、Cancellation Seam，以及可选 Runtime Event Sink。它仍不拥有 Canvas durable state、Model/Provider 选择、Admission 或 Jobs。

## Engine 是 Library，不是新的 Deployment Authority

`MediaWorkflowEngine` 消费现有 N10 `MediaNodeRegistry`、caller 提供的 `MediaNodeExecutorRegistry` 和可选 Cache。N12 不为了让 Executor Registry 全局可达就新增一条 shipped Cordis service row。目前还没有 Provider-backed consumer 要求这种 deployment lifetime；N14 在 Provider Adapter 存在后，可以按其 owning layer 挂载或适配 executor registration seam。

这样既保持 N10 Definition Registry 作为当前 Host catalog authority，又让 Engine execution 保持 open-world：custom node 只需注册 Definition 和精确 `(type, version)` Executor，即可参与执行，不需要在 Engine 中添加 node switch。

## Model Resolution 必须留在 Engine 外

早期 N12 prototype 曾在 run request 上接受 `resolveModelKey()` callback。这样会让 model selection 在 execution loop 内发生，削弱 N13 ownership。

最终 request 改为接受 caller 已经解析完成的可选 `MediaNodeExecutionIdentity`。N12 把非空稳定 `key` 当成 opaque execution identity：它会把 key 纳入 node fingerprint 并传给 Executor，但不会选择 Model/Provider，也不会做 fallback。

N13 负责 Model Descriptor 与 strict/fallback resolution；N14 负责 Provider Adapter/routing；N15 负责 Deployment Feature、Authorization、Quota/Cost/Approval/Concurrency Admission；N16 负责 durable Run/Job lifecycle、Retry、Cancel Race 与 Reconciliation。

## Fingerprint 必须保留 Graph Identity

Node fingerprint 包含精确 type/version、经过 Schema normalize 的 config、可选 resolved execution identity，以及 upstream contribution。每个 upstream contribution 都带有 edge id、source node id、source port、target port 与 producer content fingerprint。

这是有意设计。如果同一个 port 的多个值只按 content fingerprint 排序，不同 Graph connection 可能产生同一个 cache key。N12 因而 canonicalize graph-aware contribution data；只要 topology 的变化可能影响语义，即使 content hash 恰好相同，fingerprint 也会变化。

只有 `execution.deterministic=true` 的 Definition 才参与 automatic cache read/write。Generative/non-deterministic node 默认不缓存。

## Cache Hit 不能被当成可信 Executor Output

Cached value 穿过 Storage seam，不能绕过 Executor result contract。Cache hit 必须根据精确 Definition 再验证 output port/type/requiredness 和 producer fingerprint 要求，然后 detach/freeze，才允许进入 downstream。

Process-local Memory Cache 在 read/write 时也会 detach。这样以后替换 Cache implementation 时，Cache content 不会成为第二套 semantic authority。

## Partial Execution 使用显式 Boundary

`selected`、`from-node` 与 `downstream` plan 都不会偷偷重跑被排除的 upstream node。从 unscheduled producer 跨入 scheduled scope 的 edge 会变成显式 boundary requirement。Boundary value 缺失或类型不兼容时，Engine 明确失败。

Deterministic topological order 使用稳定 node/edge identity，而不是 caller array 顺序。声明 `supportsPartialRun=false` 的 Definition 在 partial scope 调度到它时会拒绝执行。

## Runtime Event 是 In-band、非 Durable

`WorkflowEventSink` 接收 `node-started`、`node-cache-hit` 与 `node-completed` runtime fact。Publish 属于当前 Engine call 的一部分：Sink rejection 会让本次调用失败。这个 Sink 不是 Session Event API，N12 不会持久化它。

N16 后续可以把这些 fact 适配进 durable Run/Job state machine。在那之前，caller 不应把 N12 event stream 当成可 replay state。

## Cancellation 检查 Engine 可控制的 Settlement Point

Caller 的 `AbortSignal` 会传给 Executor，但 Engine 不假设所有 Executor 都正确响应 signal。它会在开始工作前，以及 asynchronous cache/executor operation 返回后再次检查 cancellation。Executor 在取消后晚到的结果不会被当成成功 node completion 接受。

这只是 execution cancellation seam。User-visible cancel lifecycle、Provider cancel、Idempotency、Terminal Winner Rule 与 Reconciliation 仍归 N16。

## Published Path Evidence

Package 暴露 `@deepseek-ai/dsh-media-workflow/engine`。Built-LIB smoke 会要求 `lib/engine.js` 存在，并在 plain Node + real Cordis Registry/Builtins fiber 上执行 built `prompt@1` DAG，防止“源码测试成功但 published subpath 损坏”被隐藏。

N12 在验收前仍需要 repository-pinned exact-head validation。当前 Canvas stack 的 Actions 多次在 project step 开始前就失败（`steps=[]` / log `BlobNotFound`），或者长期 queued 在 enterprise runner，因此这些基础设施失败既不是 Engine 通过测试的证据，也不是 Engine 测试失败的证据。
