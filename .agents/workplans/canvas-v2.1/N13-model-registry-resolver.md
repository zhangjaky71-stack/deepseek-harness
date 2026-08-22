# N13 — Media Model Registry 与 Requirement Resolver

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 实施基线：`fix/canvas-n12-v2.2-workflow-engine` / PR #42 exact head  
> 实施分支：`fix/canvas-n13-v2.2-model-registry`  
> 状态：`REVIEW` — 代码/文档已实施，仍等待 repository-pinned install/typecheck/lint/build/test evidence。  
> 总原则：N13 只拥有 process-local Provider/Model capability catalog 与 pure requirement resolution；Provider I/O、Credential、Run Admission、Jobs 与 durable Canvas/Session state 不进入本节点。

## 1. 节点目标

统一描述媒体模型能力，并把“需求 → 实际 Provider/Model”的判断从 Agent/UI/Provider adapter 的 if-else 中抽离。

N13 的输出必须能直接成为：

- N12 `MediaNodeExecutionIdentity` 的来源；
- N14 Provider adapter/routing 的模型身份输入；
- N15 Admission 的已解析模型事实；
- 后续 Inspector/Agent 的同源 capability descriptor。

## 2. 前置依赖

`N10, N12`

- N10 提供 semantic media capability vocabulary。
- N12 接受 caller 已解析的 opaque `MediaNodeExecutionIdentity.key`，不自己选择模型。
- N12 仍处于 `REVIEW`，因此 N13 作为 stacked node 同样不能越级标记 accepted。

## 3. 本节点范围

- `MediaProviderDescriptor`。
- `MediaModelDescriptor`。
- Provider-local model ids 与 stable execution identity。
- Effect-scoped `MediaModelRegistry`。
- Atomic Provider + Models registration/disposal。
- Immutable process-local registry snapshot/revision/change notification。
- Provider-neutral `MediaModelRequirements`。
- width/height range + step。
- aspect-ratio normalization/validation。
- duration range + step。
- mask/reference count/seed/audio capability。
- strict/auto/fallback resolution。
- explicit deployment-owned candidate order。
- fallback warning + actual Provider/Model result。
- N12 execution identity handoff。
- package README/JSDoc、`./invariant`、Host TypeScript aggregate、built-LIB smoke。

## 4. 明确不在本节点处理

- 不调用真实 Provider network/API。
- 不读取/解析 Provider credential。
- 不拥有 Provider runtime health/operation handle/cancel API（N14）。
- 不把 N09 Canvas feature flag 当成 Model Resolver 输入。
- 不做 authorization/quota/cost/approval/concurrency/idempotency admission（N15）。
- 不创建/持久化 Run/Job，不写 Session durable event（N16）。
- 不在 Browser/Agent 内复制 capability table。
- 不把 plugin registration order 当 deployment routing policy。
- 不把 Registry revision 当 durable/global revision。

## 5. 实际代码位置

- `packages/canvas/media-provider/src/types.ts`
- `packages/canvas/media-provider/src/brand.ts`
- `packages/canvas/media-provider/src/model-registry.ts`
- `packages/canvas/media-provider/src/resolver.ts`
- `packages/canvas/media-provider/src/index.ts`
- `packages/canvas/media-provider/src/invariant.ts`
- `packages/canvas/media-provider/tests/`
- `packages/canvas/media-provider/README.md`
- `packages/canvas/media-provider/README.zh.md`
- `packages/canvas/media-provider/README.i18n.yaml`
- `packages/canvas/README.md`
- `packages/canvas/README.zh.md`
- `packages/canvas/README.i18n.yaml`
- `tsconfig.host.json`

## 6. Registry Contract

### 6.1 Atomic Provider ownership

一个 Provider plugin 一次注册：

```text
MediaProviderDescriptor
+ all MediaModelDescriptor owned by that Provider
→ one atomic registry commit
```

任一 descriptor invalid、Provider/model duplicate、execution identity duplicate 时，整个 candidate 在 commit 前失败，不能留下半套 catalog。

### 6.2 Effect-scoped lifetime

注册调用使用 Cordis caller fiber lifetime：

- owning Provider fiber dispose/HMR 时移除精确 Provider + models；
- unregister 只删除当前 registration 自己仍拥有的 identity；
- revision 每次成功 register/unregister 推进一次；
- change listeners 也是 effect-scoped。

### 6.3 Notifications are non-vetoing

Catalog state 在 notification 前已经 commit。`onChange` observer failure 必须被隔离并记录 diagnostic，不能：

- 让已经提交的 `register()` 对 caller 表现成失败；
- 阻断后续 observer；
- 形成“state changed but API threw”伪事务。

### 6.4 Snapshot

`snapshot()` 返回同一同步 revision 下的 immutable Provider/model view，并使用稳定 id 排序。

该 revision：

- process-local；
- Host restart 后可重建；
- 不进入 Session durable state；
- 不跨进程比较。

## 7. Descriptor / Capability Contract

### Provider

至少包括：

```ts
interface MediaProviderDescriptor {
  id: MediaProviderId
  displayName: string
  enabled: boolean
}
```

### Model

至少包括：

```ts
interface MediaModelDescriptor {
  providerId: MediaProviderId
  id: MediaModelId
  displayName: string
  enabled: boolean
  executionIdentityKey: string
  capabilities: MediaModelCapabilities
}
```

`executionIdentityKey` 是 N12 fingerprint 使用的实际 Provider/Model/version identity。只要可影响执行语义的 concrete model identity 改变，key 必须改变。

### Capabilities

当前 capability descriptor 覆盖：

- semantic media operation；
- aspect ratio：`any` 或 allowlist；
- width/height inclusive range；
- width/height step；
- duration min/max/step；
- `maxReferenceImages`；
- `supportsMask`；
- `supportsSeed`；
- `supportsAudio`。

Aspect ratio 在 registration 时归一化到最简正整数比：`18:32 == 9:16`。

当 requirement 同时有 width+height 时，即使 caller 没单独给 ratio，也必须用尺寸推导 ratio 做 capability matching；显式 ratio 与尺寸推导 ratio 冲突属于 invalid requirements，而不是 model mismatch。

## 8. Resolution Contract

### 8.1 Strict

```text
preferred Provider/model + strict
→ exact model or explicit error
```

Strict：

- 不需要 routing policy；
- unknown preferred 失败；
- disabled preferred 失败；
- incompatible preferred 返回完整 mismatch list；
- 永远不 silent fallback。

### 8.2 Auto

```text
requirements + explicit candidateOrder
→ first enabled compatible candidate
```

候选顺序由 caller/deployment policy 明确提供。Resolver 不使用：

- plugin registration order；
- 字符串排序；
- 隐藏 global default；
- Provider adapter 内另一份 capability table。

### 8.3 Fallback

Fallback 先尝试 explicit preferred；只有它 unavailable/incompatible 时才按同一 explicit candidate order 找 replacement。

成功切换必须返回 `MEDIA_MODEL_FALLBACK_USED`，记录：

- preferred ref；
- actual resolved ref；
- preferred model 已知 mismatch。

### 8.4 Routing policy integrity

Duplicate/unknown candidate 是 invalid routing policy，不能静默跳过。Disabled Provider/model 可以留在 catalog，但不会成为 resolved candidate。

## 9. 与 N12/N14/N15/N16 的 Ownership

```text
requirements + deployment candidate order
                ↓
N13 Registry / Resolver
                ↓
actual Provider/model + executionIdentity
                ↓
N15 admission ─────→ N14 Provider runtime
                ↓
N12 Engine/Executor fingerprint + dispatch seam
                ↓
N16 durable Run/Job lifecycle
```

边界：

- N13 的 `enabled` 是 catalog eligibility，不是 run permission。
- N14 决定 Provider runtime/credential/network/operation behavior。
- N15 决定 feature/auth/quota/cost/approval/concurrency/idempotency admission。
- N16 决定 durable lifecycle/retry/cancel race/reconciliation。

## 10. Deployment / Composition Decision

N13 新 package 暂不加入 shipped base composition。

原因：当前没有 Provider runtime consumer；单独安装一个空 catalog service row 只会产生没有操作消费的 deployment state。N14 引入首个 Provider adapter 后，应一起 mount `MediaModelRegistry` + Provider registrations。

这不影响 package 的 Host aggregate/build：`packages/canvas/media-provider` 已加入 `tsconfig.host.json`，workspace/build glob 会覆盖该 package。

## 11. Invariant Decision

新增 package 提供 `@deepseek-ai/dsh-media-provider/invariant`。

当前 contribution 有意为空，并带 package-specific `No runtime invariant:` 原因：

- descriptor/ownership/duplicate identity/mutation 都在 Registry commit point 强制；
- N13 当前只有这一套 process-local mutable authority；
- 没有第二个独立 event/data authority 可做关系校验。

N14 引入 Provider runtime registrations 后再增加真实 cross-authority invariant。

## 12. 测试要求与当前覆盖

- [x] 9:16 / equivalent ratio normalization。
- [x] width/height range + step。
- [x] width+height 自动推导 ratio。
- [x] explicit ratio 与尺寸冲突失败。
- [x] duration min/max/step。
- [x] mask。
- [x] reference count。
- [x] seed/audio。
- [x] strict unknown/disabled/incompatible failure。
- [x] strict 永不 fallback。
- [x] auto 按 explicit candidate order。
- [x] fallback 只选择 enabled compatible model。
- [x] fallback warning 记录 preferred/actual。
- [x] disabled Provider/model 不被选中。
- [x] duplicate/unknown routing candidate 失败。
- [x] Provider + Models atomic registration。
- [x] Provider/model/execution identity duplicate 无 partial commit。
- [x] HMR/fiber disposal 精确撤销 catalog。
- [x] listener disposal。
- [x] observer failure non-vetoing + 后续 observer 继续收到事件。
- [x] immutable/stable snapshot order。
- [x] descriptor normalization/hardening。
- [x] invariant companion lifecycle。
- [x] built-LIB plain-Node exact model resolution smoke。

## 13. 验收标准

- [x] Agent/Inspector 后续不需要猜模型能力或复制 capability table。
- [x] Strict preference 不会静默切换。
- [x] Auto/Fallback 只使用 caller 明确的 deployment candidate order。
- [x] Resolution 返回实际 Provider/model 与 N12 execution identity。
- [x] Registry registration/disposal/HMR 安全。
- [x] Engine/Resolver 不执行 Provider I/O。
- [x] N14/N15 可以在现有 seam 上继续，不需要把 model selection 再塞回 N12。
- [ ] repository-pinned install/typecheck/lint/build/focused tests 真正执行并通过。

## 14. Definition of Done

- [x] package API/JSDoc 已实现。
- [x] README 中英文 + pairing 已更新。
- [x] Canvas group README 中英文 + pairing 已更新。
- [x] `./invariant` 已提供并说明当前 empty reason。
- [x] Host aggregate 已加入新 package。
- [x] built-LIB smoke 已加入。
- [ ] `pnpm-lock.yaml` 由 repository-pinned pnpm 正式重生成并验证；禁止手改生成 lockfile。
- [ ] exact-head CI 真正执行 project steps。
- [ ] typecheck/lint/build/coverage/focused tests 有可信 evidence。

## 15. 当前验证阻塞

当前 Canvas stacked PR 的 GitHub Actions 存在已确认 runner/account infrastructure 问题：标准 runner jobs 会在 project step 前以 `steps=[]` 失败，job log endpoint 返回 Azure `BlobNotFound`；enterprise Node24 jobs 可能长期 queued。

N13 还新增了 workspace package，因此 repository-pinned pnpm 必须重生成 lockfile importer。当前工具环境不能安全执行仓库固定 pnpm install，且仓库规则禁止手改生成 lockfile，因此该项保留为显式 blocker。

结论：**N13 保持 `REVIEW`，不得标记 `ACCEPTED`。**

## 16. 风险与禁止项

- 在每个 Provider adapter 外重复维护能力表。
- 让 N12 Engine 重新选择/解析 Model。
- Strict mode 静默 fallback。
- 使用 plugin load order 作为 routing preference。
- 把 `provider.enabled/model.enabled` 当 authorization。
- Registry commit 后让 observer error 把 API 伪装成失败。
- 把 Registry revision 写入 durable Session state。
- 为 N13 提前接真实 Provider credential/network。
- 手工编辑 `pnpm-lock.yaml` 伪造 pinned-toolchain 验收。

## 17. 验收时应输出的结果

后续要求“验收 N13”时至少输出：

1. exact-head SHA / stacked base。
2. 实际修改文件清单。
3. Registry/Resolver ownership 与关键接口。
4. lockfile/install evidence。
5. typecheck/lint/build/focused/coverage 命令及真实结果。
6. built-LIB smoke 结果。
7. CI runner 是否真正执行 steps。
8. 未解决问题及严重度。
9. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。
