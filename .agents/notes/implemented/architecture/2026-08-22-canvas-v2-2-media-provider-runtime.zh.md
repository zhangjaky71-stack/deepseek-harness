# Canvas V2.2 Media Provider Runtime Ownership

## 决策

Canvas 的 Media Provider Execution 拆成四个独立职责层：

```text
N13 Model Catalog / Resolver
        ↓ 已解析的 opaque execution identity
N14 Provider Runtime / Semantic Adapter
        ↓ 已校验的 Provider media bytes
N17/N21 Output Materializer / Durable Asset Storage
        ↓ 稳定 Media Asset Ref
N12 Execution Result，由后续 N16 Run/Job Orchestration 消费
```

N14 不从 Workflow Data 中解析 Model Selection Policy，也不把 Provider bytes 直接持久化到 Canvas 或 Session State。它只把 N13 已解析的 execution identity 路由到精确 Provider runtime adapter，驱动 operation、校验 Provider result，然后把通过校验的 bytes 交给显式 Materializer seam。

## 为什么 Execution Identity 必须保持 Opaque

N13 负责 Provider/Model Capability Resolution。`executionIdentityKey` 表示具体 execution identity；其语义变化必须让 N12 fingerprint 失效。

N14 不能通过解析该字符串推导 `providerId` 或 `modelId`。否则 opaque invalidation key 会被偷偷变成第二套 routing protocol。`MediaModelRegistry.getModelByExecutionIdentity()` 是唯一 exact reverse lookup；N14 通过该 API 找到 Model，再按 Model 的 `providerId` 路由 Runtime Adapter。

这样 Provider/Model identity 仍只有一个 Authority，同时 execution key 格式未来可以变化，而无需改写 ProviderExecutor。

## Runtime Registration 必须跟随 Catalog Registration

只有当 N13 Catalog 中存在对应 Provider Descriptor 时，Provider Runtime Adapter 才允许存在。`MediaProviderRuntimeRegistry.register()` 在 commit 前强制这一点；package invariant 还会在 reconstructed composition startup 时独立检查同一关系。

Runtime Registry 在 Service Activation 时捕获 N13 Registry，而 Registration Effect 仍归调用它的 plugin fiber 所有。这个区别很重要：Cordis Service Method Tracing 会把 `this.ctx` 绑定到 caller context；如果 `register()` 内使用 `this.ctx.mediaModels`，会错误地要求每个仅消费 `mediaProviders` 的 caller 也额外 inject `mediaModels`。

## Provider Request 必须保持 Semantic

N14 Request Vocabulary 只包含四个 V1 Provider-backed node 所需的媒体语义：Prompt、Image/Mask/Reference Asset、output count、Workflow Config，以及已经解析出的 Model Identity。

Credential、Endpoint URL、SDK Object、Provider Request Body、Bearer Download URL 和 Raw Provider Response 都属于 Adapter-owned Deployment Data。它们不得进入 MediaWorkflow Config、Canvas Durable State、Session Log、Browser State 或 Generic ProviderExecutor Result。

因此接入真实 Provider 只需要注册 Catalog Metadata 和 Runtime Implementation；Canvas Domain 与 N12 Scheduler 不增加 Provider-specific switch。

## 必须先校验，再 Materialize

N14 先校验 Provider Completion Metadata，再校验 Node Binding 期望的 Media Kind/Count，之后才调用 `MediaProviderOutputMaterializer`。

这个顺序是强约束。N17/N21 后续会让 Materializer 具备 Durable Storage。如果先 Materialize 再校验，Malformed Provider Response 可能在 Operation 最终失败前制造 Durable Orphan Object。

Materializer 是 Capability Seam，而不是 N14 Storage Implementation，因为 Asset Authority 属于 N17/N21。N14 Test 使用 In-memory Materializer；Production Assembly 后续必须提供真实 Durable Implementation。

## Cancellation 是一个 Lifecycle Operation

异步 Provider Operation 用一个 opaque `(providerId, mode, providerTaskId)` Handle 表示。Owning AbortSignal 触发时，N14 恰好请求一次 Provider Cancellation。

自动 Abort Cancellation 不会把已经 aborted 的 signal 再传给 `provider.cancel()`。Cancel 同步 throw 或异步 reject 都会被 containment，不能覆盖主要的 `MEDIA_PROVIDER_ABORTED` 结果。N14 会等待这一次 Cancellation Request settlement 后，才向 caller 返回 aborted operation。

未来 N16/N22 Reconciliation 使用的显式 Cancellation 保持为独立函数，并会把规范化后的 Cancellation Failure 返回给 caller，而不是吞掉。

## Error Normalization

Provider SDK/Network Failure 会归一化为稳定的 N14 Error Code。Public Error Message 可以携带安全的 Provider id、status 与 retry delay metadata，但不能复制 Raw Provider Response Body、Credential、URL 或 SDK Payload Text。

Raw Cause 只允许作为 process-local diagnostic cause 存在，不是 Transport、Session、Tool Result 或 Browser Contract。

## Mock Provider 的职责

`@deepseek-ai/dsh-media-provider-mock` 是 opt-in test/support Provider，不是 Production Provider。它注册一个 N13 Model 与一个 N14 Adapter，支持 deterministic image/video bytes、可恢复 polling/callback state、fault injection、cancellation 与 duplicate completion test。

它不会进入 shipped profile。其 bytes 是 fixture，不是有效 production media；也不会模拟 Credential、Billing、Quota、Moderation 或真实 Network Behavior。

## 维护规则

- Model Selection 留在 N13。N14 只消费已解析 identity，不选择 fallback model。
- Feature/Authorization/Quota/Approval/Concurrency Admission 留在 N15。Provider compatible/runtime available 不等于允许启动任务。
- Durable Run/Job Ownership 与 restart reconciliation 留在 N16/N22。
- Durable Attachment/Media Storage 留在 N17/N21。禁止 Provider Adapter 直接写 Canvas/Session/Storage。
- 在调用 Durable Materializer 前必须先校验 Provider Result Semantic。
- 禁止把 `executionIdentityKey` 变成可解析的 Routing Format。
- Provider Registry/Catalog Notification 必须 post-commit 且 non-vetoing；Observer Failure 不能让已提交状态看起来失败。
- Mock Provider 必须保持 opt-in，不能成为 shipped production dependency。
