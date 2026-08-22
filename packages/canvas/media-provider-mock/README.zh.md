# @deepseek-ai/dsh-media-provider-mock

[English](README.md) | 中文

`dsh-media-provider-mock` 是 Canvas Media Workflow 的 opt-in N14 测试 Provider。它会注册一组 N13 Provider/Model 与一个 N14 Runtime Adapter，生成 deterministic Host-local image/video bytes，支持同步与可恢复 operation mode，并且可以在不连接 Cloud Service 的情况下注入规范化 Provider failure。

该 package 属于 test/support infrastructure。它不会进入 shipped profile，也不能替代真实 Provider 的 Credential、Billing、Quota、Moderation、Latency 或 Network Behavior。

## Registration

Function plugin 依赖 `ctx.mediaModels` 与 `ctx.mediaProviders`。在同一个 owning Cordis fiber 上会注册：

- Provider id `mock-media`；
- Model id `mock-universal-v1`；
- execution identity `mock-media/mock-universal-v1@1`；
- `text-to-image`、`image-edit`、`text-to-video`、`image-to-video` 四种 capability；
- 同一 Provider id 下的 `MockMediaProvider` runtime adapter。

Fiber dispose 时，Model Catalog contribution 与 Runtime Adapter 都会通过 Registry effect lifetime 移除。Mock package 不注册 Canvas、Session、Browser 或 Job State。

## Deterministic Outputs

成功 operation 会返回非空 `Uint8Array` fixture，其 JSON 文本只记录安全测试 metadata：Provider id、Model id、semantic capability、node type、sequence number 与 output index。Image operation 使用 `image/png`，Video operation 使用 `video/mp4`。

`text-to-image` 返回 request 指定的 `count`；`image-edit`、`text-to-video`、`image-to-video` 都返回一个 output。这些 bytes 有意不是有效 production media file。N14 测试只需要 deterministic Host-local payload 来验证 ProviderExecutor 与 Output Materialization seam；真实 Binary Validation/Storage 属于 N17/N21。

## Operation Modes

没有 queued scenario 时，`MockMediaProvider.start()` 直接 inline completed。`enqueue()` 可以为后续 start 配置：

```ts
mock.enqueue({
  mode: 'polling',        // inline | polling | callback
  pendingResumes: 2,
  retryAfterMs: 1,
  delayMs: 0,
})
```

Polling 与 Callback scenario 会返回 opaque `providerTaskId`。`resume()` 先按配置返回若干 `pending`，随后返回一份 immutable completion。之后重复调用 `resume()` 会得到同一 completion，因此 duplicate-completion 测试是 deterministic 的。`cancel()` 会把 task 标记为 cancelled，之后 resume 以 `MEDIA_PROVIDER_ABORTED` 失败。

Callback mode 只模拟 N14/N22 的 resumable handle contract，不实现 HTTP callback server。真实 callback receiver/reconciliation 属于 N22。

## Failure Injection

Queued scenario 可以注入：

- `rate-limit` → SDK-shaped `429`，由 N14 归一化为 `MEDIA_PROVIDER_RATE_LIMIT`；
- `server-error` → SDK-shaped `503`，归一化为 `MEDIA_PROVIDER_SERVER_ERROR`；
- `rejected` → `MEDIA_PROVIDER_REJECTED`；
- `timeout` → `MEDIA_PROVIDER_TIMEOUT`。

Failure 可以发生在 `start` 或第一次 `resume`。429/503 fixture 会故意携带假的 raw response string，用于证明 N14 normalized public message 不会复制 Provider response text。

## Full-DAG Use

测试可以把 Mock 与真实 N10/N12 Registry/Engine 组合：

```text
prompt@1
  ↓ text
image.generate@1
  ↓ image-list
output@1
```

通用 N14 ProviderExecutor 会把已经解析出的 Mock execution identity 路由到该 Adapter。测试 Materializer 再把返回 bytes 转成稳定 test asset ref。这样无需 Credential 或 External Service，就可以走与未来真实 Adapter 相同的 Provider-neutral N12 execution path。

## Invariant Companion

`@deepseek-ai/dsh-media-provider-mock/invariant` 有意不增加独立 runtime check。Mock 除 N13 Catalog 与 N14 Runtime registration 之外没有自己的 durable/shared authority，而两套 authority 的关系已经由 `dsh-media-provider` invariant 负责。

## 模型体验

没有直接影响。Mock 不注册 model-facing Tool，也不贡献 Prompt Text；它只服务于 deterministic keyless test，以及显式 opt-in 的 development composition。

#### Token 影响

直接影响为零。

#### KV Cache 影响

无。

## 已知限制与后续工作

- **Fixture bytes 不是有效 production media** — N17/N21 会单独测试真实 Attachment/Media Asset Validation 与 Storage。
- **没有 Credential 或 Endpoint Behavior** — Mock 有意不保存 Secret，也不建立 Network Connection。
- **没有真实 Billing/Quota/Moderation 语义** — N15 Governance 与真实 Provider Adapter 负责这些行为。
- **Callback mode 只模拟 resumable state** — N22 负责真实 Callback Ingress 与 restart-safe reconciliation。
- **没有 shipped composition row** — Test/Example 必须显式 opt in；Production profile 不应依赖该 package。
