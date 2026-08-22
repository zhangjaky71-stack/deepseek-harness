# @deepseek-ai/dsh-media-provider

[English](README.md) | 中文

`dsh-media-provider` 负责 process-local Media Provider/Model Capability Catalog，以及后续 Canvas execution layer 共用的纯 Model Requirement Resolver。N13 不调用 Provider API、不解析 Credential、不执行 Canvas Permission/Feature Admission、不创建 Job，也不写 Session State。

## Registry 契约

Package 默认导出 `MediaModelRegistry`，composition 安装后挂载为 `ctx.mediaModels`。Provider plugin 会把一个 `MediaProviderDescriptor` 与其拥有的全部 `MediaModelDescriptor` 作为一组注册。注册是 atomic 且 effect-scoped：Descriptor validation 或任意 duplicate 会在 commit 前拒绝整个 candidate；owning Cordis fiber unload 时，只移除该 Provider 与它的精确 Model 集合。

Registry `revision` 是 process-local 的，每次成功 Provider registration 或精确 unregistration 恰好推进一次。`snapshot()` 会在一次同步读取中返回 immutable view，Provider 与 Model 都按稳定 id 顺序排列。该 revision 是可重建 Deployment Metadata，不是 durable Canvas/Session State，也不能跨 Host restart 比较。

Provider 与 Model id 都是 opaque branded string。Model 以 `(providerId, modelId)` 为 key。`executionIdentityKey` 在 live catalog 内也必须唯一；它表示具体 Provider/Model/version execution identity，只要其语义发生变化，就必须让 N12 execution fingerprint 失效。

Provider 和 Model 可以以 `enabled=false` 注册。Disabled entry 仍可用于 Settings、Diagnostic 与历史 Provenance，但 Resolver 永远不会选择它们。

## Model Capability Descriptor

`MediaModelCapabilities` 是 Provider-neutral metadata。单个 Model 声明：

- 支持的 semantic operation，例如 `text-to-image`、`image-edit`、`text-to-video`、`image-to-video`；
- 支持的 aspect ratio：`any` 或显式 allowlist；
- 可选 width/height range 与 step；
- 可选 duration range 与 step；
- 最大 reference image 数量；
- mask、seed、audio 支持能力。

Aspect ratio 在注册时会归一化为最简正整数比，因此 `18:32` 与 `9:16` 表示同一比例。若两个 ratio 只是在 normalize 之后才变成 duplicate，注册也会拒绝。

Width/height constraint 是彼此独立的 numeric limit。当 request 同时给出 width 与 height 时，即使没有单独提供 aspect ratio，Resolver 也会从尺寸推导比例，并应用 Model 的 aspect-ratio policy。如果显式 ratio 与 width/height 冲突，这是 invalid input，而不是 Model mismatch。

## Requirement Resolution

`MediaModelRequirements` 描述一次 execution 所需的 semantic operation 与能力：dimension、ratio、duration、reference count、mask、seed、audio。

Resolution 有三种显式模式。

### Strict

`strict` 携带精确 preferred `(providerId, modelId)`，不接受 routing policy。Unknown/disabled preference 会失败；Model 可用但不兼容时，会返回完整 mismatch list。Strict 永远不会静默换模型。

### Auto

`auto` 必须携带 caller-owned `MediaModelRoutingPolicy.candidateOrder`。Resolver 严格按该顺序寻找第一个 enabled 且 compatible 的 Model，不会把 plugin registration order、字符串排序或隐藏的全局 default 当成偏好。

### Fallback

`fallback` 会先保留显式 preferred model，只要该 Model enabled 且 compatible；否则沿与 `auto` 相同的显式 candidate order 查找。成功替换时返回 `MEDIA_MODEL_FALLBACK_USED`，其中记录 preferred 与实际 Model/Provider reference，以及 preferred model 已知的 compatibility mismatch。

Routing 中 duplicate 或 unknown entry 会作为 policy error 显式失败，不会静默忽略。没有 enabled compatible candidate 时，Resolver 返回 `MEDIA_MODEL_NO_COMPATIBLE_MODEL`。

## N12 Execution Identity

成功 Resolution 会返回实际 Provider descriptor、实际 Model descriptor、warning，以及：

```ts
{ executionIdentity: { key: model.executionIdentityKey } }
```

N12 的 `MediaWorkflowEngine` 消费这个 opaque identity：它只负责 fingerprint 与转交给 Executor，不负责选择 Model。Ownership 始终单向：

```text
requirements + routing policy
        ↓
N13 MediaModelRegistry / Resolver
        ↓
actual Provider/model + executionIdentity
        ↓
N12 Executor call / fingerprint
```

## 与 N14 / N15 的职责关系

N13 catalog availability 不等于 run admission。`provider.enabled` / `model.enabled` 只说明该 catalog entry 是否有资格参与 Model Resolution。

N14 负责 Provider Adapter、Credential、Network Operation、Operation Handle 与 runtime Provider availability。N15 会在任何收费/长耗时 Provider task 开始前，把 N09 Canvas Feature Policy、Authorization、Provider Availability、Concurrency、Quota/Cost、Approval、Idempotency 与 N13 Resolution result 一起执行准入。

因此 N13 暂时不挂进 shipped base composition。N14 会引入第一个 Provider runtime consumer，并可同时挂载 N13 Registry 与 Provider descriptor/adapter registration。N13 此时提前增加一个没有 consumer 的 service row，只会制造没有实际操作使用的 Deployment State。

## Invariant Companion

`@deepseek-ai/dsh-media-provider/invariant` 当前注册一份有意为空的 package contribution。N13 只有一个 process-local authority，Descriptor、Ownership、Duplicate Key 与 Registration Mutation 都在 Registry commit point 强制；目前没有第二个 independent mutable/event source 可做关系校验。N14 引入 Provider runtime registration 后，可以再增加真实的 cross-authority runtime invariant。

## 模型体验

没有直接影响。N13 不注册 model-facing Tool，也不贡献 Prompt Text。后续 Agent/UI consumer 可以读取同一套 Descriptor，而不是各自维护 Model capability table。

#### Token 影响

直接影响为零。

#### KV Cache 影响

无。

## 已知限制与后续工作

- **没有 Provider Adapter 或 Network Execution** — N14 负责 Provider runtime behavior 与 Credential。
- **尚无 Deployment Routing Policy Service** — N13 要求 `auto`/`fallback` caller 显式提供完整 candidate order；N14/N15 后续可以从 Deployment Config 生成该顺序。
- **没有 Canvas Feature/Authorization/Quota Admission** — N15 会在 execution 前组合这些决策；N13 找到兼容 Model 本身并不代表允许启动 task。
- **尚无 Browser/Agent Catalog Consumer** — 后续 Inspector 与 Agent surface 可以消费同一 Descriptor，避免复制 capability map。
- **Registry revision 不是 durable 数据** — Host restart 会重建 catalog 与 revision sequence。
