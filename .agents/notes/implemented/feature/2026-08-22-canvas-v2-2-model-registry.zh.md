# Canvas v2.2 Media Model Registry / Requirement Resolver 职责边界

N13 新增 `@deepseek-ai/dsh-media-provider`，作为 process-local Media Provider/Model capability metadata 与 pure requirement resolution 的权威来源。这样 Agent、Inspector、Workflow Execution 与后续 Provider Routing 可以消费同一套 descriptor vocabulary，而不是在多个 layer 各自维护 capability if-else table。

## Registry 只拥有 Catalog Metadata，不拥有 Provider Runtime

`MediaModelRegistry` 是 Cordis Service（`ctx.mediaModels`）。Provider plugin 会把一个 Provider descriptor 与该 fiber 拥有的全部 Model descriptor 作为一组注册。

注册是 atomic 且 effect-scoped：任意 bad descriptor 或 duplicate 都会在 commit 前拒绝整个 candidate；owning fiber dispose 时，只撤销该 Provider 与它的 Models。Process-local revision 是可重建 Deployment Metadata，不属于 Session Durability。

N14 仍负责 Credential、Provider Client、Network Request、Operation Handle、Runtime Health 与 Provider Cancellation。N13 不执行任何 Network Call。

## Model Availability 不等于 Run Admission

`provider.enabled` 与 `model.enabled` 只表示 entry 是否可参与 Model Resolution。Disabled entry 仍保留在 Catalog 中，因此 Settings、Diagnostic 与历史 Provenance 仍可引用它们。

这不是 Authorization。任何收费或长耗时 task 启动前，N15 必须把 N09 Feature Policy、Authorization、Provider Runtime Availability、Concurrency、Quota/Cost、Approval、Idempotency 与 N13 Resolution Result 一起执行 Admission。

把两层含义分开，可以避免一个 Catalog checkbox 意外变成安全或计费边界。

## Provider Plugin 注册一组 Atomic Ownership

一次 Provider registration 拥有：

```text
ProviderDescriptor
+ all MediaModelDescriptor values for that Provider
```

Model id 使用精确 `(providerId, modelId)` identity。`executionIdentityKey` 在 live catalog 内还必须全局唯一，因为 N12 会把它作为 concrete Provider/Model/version 的 opaque execution identity 纳入 fingerprint。

Registration 会 canonicalize 并 freeze capability metadata。等价比例会归一化为同一个表示（`18:32` → `9:16`），normalize 后重复的 ratio 属于 invalid descriptor。

## Change Notification 在 Commit 后发布，不能 Veto Commit

最终 source audit 发现初版 N13 有一个细微事务问题：Catalog 已经 mutation 后才执行 `onChange` callback，但 observer exception 会从 `register()` 逃出。这样会让已成功提交的操作看起来失败，并阻断后续 observer。

最终 Registry 把 change notification 定义为 non-vetoing diagnostic。每个同步 observer failure 都会被隔离并记录日志，后续 observer 仍能收到已提交 revision。Registration/disposal state 不依赖 observer 是否成功。

这符合仓库“只在 commit point 发布 state”的规则，也避免制造假的 rollback contract。

## Requirements 保持 Provider-neutral

`MediaModelRequirements` 只表达 semantic execution need：

- media operation；
- width/height；
- aspect ratio；
- duration；
- reference-image count；
- mask；
- seed；
- audio。

Matcher 不知道 Provider SDK 的 request shape。

当 width 与 height 同时存在时，即使 caller 没有单独给 `aspectRatio`，N13 也会从尺寸推导比例，并应用 Model 的 ratio capability。如果显式 ratio 与尺寸冲突，则 request 本身 invalid，而不是仅仅与某个 Model incompatible。这样可以避免内部矛盾的 request 误选 Model。

## Strict / Auto / Fallback 的 Authority 不同

Strict 携带一个精确 preferred Provider/Model，不携带 routing policy，也永远不会切换 Model。Unknown、disabled 或 incompatible preferred model 都显式失败；incompatible failure 会携带完整 mismatch list。

Auto 与 Fallback 消费 caller-owned ordered `candidateOrder`。Resolver 不会从 Plugin Registration Order、字符串排序或隐藏 global default 推测 preference。

Fallback 会先保留显式 preference；只有无法使用时才替换。发生替换时返回 `MEDIA_MODEL_FALLBACK_USED`，记录 preferred/actual reference 与已知 preferred mismatch。

Duplicate 或 unknown policy candidate 是 configuration error，不会被静默忽略。

## Nested Selection Discriminant 需要显式 Request Type Guard

Public request 被有意设计成 union：Strict 没有 `routing`，Auto/Fallback 必须有；discriminant 位于 `request.selection.mode` 这一层。

TypeScript 不会仅根据 nested discriminant 自动把外层 request union 缩窄。最终 review 抓到，如果依赖这种隐式 narrowing，仓库 typecheck 会在读取 `routing` 时失败。因此 Resolver 使用显式 type predicate，把 `MediaModelResolutionRequest` 缩窄到 `MediaModelPolicyResolutionRequest` 后才读取 policy-only field，没有使用 cast 来掩盖契约问题。

## N13 产生 N12 消费的 Execution Identity

成功 Resolution 返回实际 Provider/Model，以及：

```ts
executionIdentity: { key: model.executionIdentityKey }
```

Ownership 保持单向：

```text
requirements + deployment candidate order
                ↓
N13 Registry / Resolver
                ↓
actual Provider/model + executionIdentity
                ↓
N12 fingerprint / Executor input
```

N12 不应重新获得 model-resolver callback；N13 也不应执行 Provider Request。

## 首个 Consumer 出现前不增加 Shipped Composition Row

Package 已可 build，并已加入 Host TypeScript aggregate，但 N13 不增加 shipped base-composition service row。目前还没有 Provider runtime consumer，提前全局 mount 一个空 deployment catalog 只会制造没有当前 operation 使用的 state。

N14 可以在引入第一个真实 Provider Adapter 时，同时 mount `MediaModelRegistry` 与 Provider descriptor registration。

## Invariant Companion 当前有意为空

Package 发布 `@deepseek-ai/dsh-media-provider/invariant`，因为每个 package 都必须拥有 invariant companion。

当前 installer 带有 package-specific `No runtime invariant:` 理由。N13 只有一个 mutable catalog authority，而 Descriptor/Ownership/Duplicate/Mutation Rule 已在该 authority 的 commit point 强制。用同一 source 再验证一次同一值，并不是独立 runtime invariant。

N14 创建独立 Provider runtime registration authority 后，两套 authority 之间的关系才成为合理的 cross-authority invariant candidate。

## 新 Package 使用当前 Declaration Layout

根据 `packages/AGENTS.md` 的最终 review，N13 初版从旧式 `outDir: lib` 修正为当前 `lib/types` declaration layout。Runtime JS 仍位于 `lib/*.js`，`package.json` 的 type/export path 指向 `lib/types/*.d.ts`。

Root Host aggregate 显式引用 `packages/canvas/media-provider`，因此 repository typecheck 不会意外跳过这个新 project。

## Lockfile 是 Generated Toolchain Boundary

N13 创建了新的 pnpm workspace package，因此 `pnpm-lock.yaml` 需要由 repository-pinned pnpm toolchain 生成新的 importer，frozen install 才能视为有效。

当前 connected editing environment 没有可信的 pinned repository install path，因此不会手改 lockfile。该项被显式记录为 validation blocker，而不是用手工内容伪造通过状态。

## Validation Status

N13 保持 `REVIEW`。Source contract、tests、docs、invariant/package wiring 与 built-LIB smoke 已具备，但验收仍要求真实执行 repository-pinned lockfile generation、install、typecheck、lint、build、coverage/focused tests，以及 built output smoke。

当前 Canvas stack 的 GitHub Actions 多次在 project step 开始前失败（`steps=[]`、Azure `BlobNotFound`），enterprise runner 也可能长期 queued。如果 N13 exact-head 复现同一模式，它只能证明 infrastructure blocker，不能作为测试通过或失败结论。
