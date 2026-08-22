# @deepseek-ai/dsh-media-provider

[English](README.md) | 中文

`dsh-media-provider` 负责 Canvas Media Execution 的两套 Host-side authority：N13 的 process-local Provider/Model Capability Catalog 与 Requirement Resolver，以及 N14 的 Provider Runtime Adapter Registry 与通用 N12 Executor Bridge。该 package 不写 Canvas/Session State，不把 Credential 暴露给 Workflow，也不执行 Run Admission。

## N13 Model Catalog

Package 默认导出 `MediaModelRegistry`，composition 安装后挂载为 `ctx.mediaModels`。Provider plugin 会把一个 `MediaProviderDescriptor` 与其拥有的全部 `MediaModelDescriptor` 作为一组注册。注册是 atomic 且 effect-scoped：无效 metadata 或任意 duplicate 会在 commit 前拒绝整个 candidate；owning Cordis fiber unload 时，只移除该 Provider 与它的 Models。

Registry `revision` 是 process-local 的，每次成功 Provider registration 或精确 unregistration 恰好推进一次。`snapshot()` 会在一次同步读取中返回 immutable view，Provider 与 Model 都按稳定 id 顺序排列。该 revision 是可重建 Deployment Metadata，不是 durable Canvas/Session State，也不能跨 Host restart 比较。

Provider 与 Model id 都是 opaque branded string。Model 以 `(providerId, modelId)` 为 key。`executionIdentityKey` 在 live catalog 内也必须唯一，并表示 N12 fingerprint 使用的具体 Provider/Model/version identity。`getModelByExecutionIdentity()` 提供反向查询，因此 N12/N14 caller 无需解析这个 opaque key。

Provider 和 Model 可以以 `enabled=false` 注册。Disabled entry 仍可用于 Settings、Diagnostic 与历史 Provenance，但 Resolver 永远不会选择它们。

## Model Capability Descriptor

`MediaModelCapabilities` 是 Provider-neutral metadata。单个 Model 声明：

- semantic operation，例如 `text-to-image`、`image-edit`、`text-to-video`、`image-to-video`；
- 支持的 aspect ratio：`any` 或显式 allowlist；
- 可选 width/height range 与 step；
- 可选 duration range 与 step；
- 最大 reference image 数量；
- mask、seed、audio 支持能力。

Aspect ratio 在注册时会归一化为最简正整数比，因此 `18:32` 与 `9:16` 表示同一比例。若两个 ratio 只在 normalize 之后才重复，注册仍会拒绝。

Width/height constraint 是彼此独立的 numeric limit。当 request 同时给出 width 与 height 时，即使没有单独提供 aspect ratio，Resolver 也会从尺寸推导比例，并应用 Model 的 aspect-ratio policy。如果显式 ratio 与 width/height 冲突，这是 invalid input，而不是 Model mismatch。

## Requirement Resolution

`MediaModelRequirements` 只描述一次 execution 所需的 semantic operation 与能力。Resolution 有三种显式模式。

### Strict

`strict` 携带精确 preferred `(providerId, modelId)`，不携带 routing policy。Unknown、disabled 或 incompatible preference 都会失败。Strict 永远不会静默切换 Model。

### Auto

`auto` 必须携带 caller-owned `MediaModelRoutingPolicy.candidateOrder`。Resolver 严格按该顺序寻找第一个 enabled 且 compatible 的 Model，不会把 plugin registration order、字符串排序或隐藏 global default 当成偏好。

### Fallback

`fallback` 会先保留显式 preferred model，只要该 Model enabled 且 compatible；否则沿与 `auto` 相同的显式 candidate order 查找。成功替换时返回 `MEDIA_MODEL_FALLBACK_USED`，其中记录 preferred/actual reference 与已知 preferred mismatch。

Routing 中 duplicate 或 unknown entry 会作为 policy error 显式失败。没有 enabled compatible candidate 时，Resolver 返回 `MEDIA_MODEL_NO_COMPATIBLE_MODEL`。

成功 Resolution 会返回实际 descriptor，以及 N12 使用的 opaque execution identity：

```ts
{ executionIdentity: { key: model.executionIdentityKey } }
```

## N14 Runtime Adapter Registry

`@deepseek-ai/dsh-media-provider/runtime` subpath 导出 `MediaProviderRuntimeRegistry`，挂载为 `ctx.mediaProviders`。N13 选择 Model；N14 只根据已经解析出的 `providerId` 路由。Runtime registration 要求对应 N13 Provider descriptor 已经存在，duplicate adapter 会失败；registration 也是 effect-scoped，因此 HMR/plugin disposal 会移除精确 adapter。

一个 `MediaProvider` 实现三个 operation：

```ts
start(request, signal)  // inline completion、polling task 或 callback task
resume(handle, signal)  // pending 或 completed
cancel(handle, signal)  // Provider-owned cancellation
```

`MediaProviderOperationHandle` 只保存安全 opaque task identity：`providerId`、`mode`、`providerTaskId`。N14 保持其可序列化，以便 N16/N22 后续持久化并 reconcile asynchronous operation；N14 自身不承诺跨 Host restart 的 handle durability。

Provider-specific Credential、Endpoint、SDK Object 与 Wire Payload 只留在 Adapter/Deployment Implementation 内。Semantic `MediaProviderRequest` 只包含已解析 Provider/Model identity、node type/version、normalized workflow config、semantic prompt/reference input 与 operation-specific requirement。Browser、Workflow、Session、Tool result 都不会从这一层拿到 Credential 或 Provider bearer URL。

`runMediaProviderOperation()` 用同一个 `AbortSignal` 驱动 inline、polling 与 callback-backed resume。异步 task 被 abort 时会请求 `provider.cancel(handle)`，operation 以 `MEDIA_PROVIDER_ABORTED` 结束。Restart-safe retry/reconciliation 仍由 N16/N22 负责。

## Provider Error Normalization

Adapter 可以抛 SDK/Provider error，但 runtime surface 只暴露稳定 `MediaProviderError` code。HTTP-like `429` 归一化为 `MEDIA_PROVIDER_RATE_LIMIT`，`5xx` 归一化为 `MEDIA_PROVIDER_SERVER_ERROR`；Adapter 也可以使用 `MEDIA_PROVIDER_REJECTED`、`MEDIA_PROVIDER_TIMEOUT` 等稳定 code。

公开 error message 不复制 Provider raw response body 或可能含 secret 的 SDK text。原始 cause 可以作为 Error 的 process-local diagnostic 保留，但不是 semantic Provider result contract 的一部分。

## N12 ProviderExecutor Bridge

`registerBuiltinMediaProviderExecutors()` 为当前 Provider-backed built-in 安装 exact-version N12 Executor：

- `image.generate@1` → `text-to-image`；
- `image.edit@1` → `image-edit`；
- `video.generate@1` → `text-to-video`；
- `video.image-to-video@1` → `image-to-video`。

Bridge 要求 N12 已获得 N13 execution identity，通过 `MediaModelRegistry` 解析精确 Model，确认 Model 仍存在、enabled 且支持目标 capability，然后才路由到对应 runtime adapter。N12 继续保持 Provider-neutral，也不会解析 Provider/Model identity string。

Provider media bytes 会先按照 binding 的预期 kind/count 完成校验，再允许任何 storage side effect。随后 Bridge 调用 `MediaProviderOutputMaterializer`，把 Host-local bytes 转成稳定 image/video asset ref 与 content fingerprint。N14 测试使用 in-memory materializer；N17/N21 负责真正 durable attachment/media-asset implementation。Provider 永远不直接写 Canvas/Session State。

## Runtime/Catalog Invariant

`@deepseek-ai/dsh-media-provider/invariant` 现在检查 N13/N14 的 cross-authority relation：每个已注册 runtime adapter 都必须有对应 N13 Provider descriptor。Runtime registration 自身已在 commit point 强制该关系；Invariant 额外用于捕获非法 reconstructed composition state。

## 与 N15/N16/N17/N21/N22 的职责关系

Catalog availability 与 runtime adapter presence 都不等于 Run Admission。N15 会在收费或长耗时 operation 开始前，把 N09 Feature Policy、Authorization、Runtime Availability、Concurrency、Quota/Cost、Approval、Idempotency 与 N13 Model Resolution 一起执行准入。

N16 负责 durable Run/Job lifecycle、retry、terminal-state race 与 reconciliation。N17/N21 负责 durable image/video byte storage 与授权 Asset Read。N22 负责 production asynchronous video Provider resume/reconciliation。N14 提供这些 layer 消费的 Adapter/Handle/Error/Materialization seam。

当前仍没有把 N14 Service 或 Mock Provider 加入 shipped base profile。本节点唯一 Provider implementation 是 opt-in test Mock；真实 deployed Provider 会在 N20/N22 引入，并与自己的 Adapter/Config 一起 mount Catalog/Runtime Service。

## 模型体验

没有直接影响。该 package 不注册 model-facing Tool，也不贡献 Prompt Text；它只在 Model Selection/Admission layer 已提供运行所需输入后，执行已经规划好的 media node。

#### Token 影响

直接影响为零。

#### KV Cache 影响

无。

## 已知限制与后续工作

- **当前没有真实 Cloud Provider** — N14 只建立 Adapter/Runtime seam；N20/N22 再加入 production image/video adapter。
- **Output Materialization 只是 seam，不是 Storage** — N17/N21 必须先 durable save bytes，再返回稳定 ref；目前只有测试提供 in-memory materializer。
- **Async Handle 尚未 durable** — N14 可以在单进程内 start/resume/cancel polling 或 callback task；N16/N22 负责 restart-safe persistence 与 reconciliation。
- **没有 Run Admission** — N15 必须在 execution 前授权并治理 resolved runtime operation；Catalog eligibility 与 Adapter presence 本身都不授权工作。
- **尚无 shipped Provider composition** — Mock 保持 test-only，真实 Deployment Config 推迟到真实 Provider 节点。
- **Registry revision 与 runtime registration 都是 process-local** — Host restart 会从 composition 重建两套 authority。
