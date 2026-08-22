# N14 — Executor / Media Provider Adapter、Runtime Routing 与 Mock Provider（V2.2 Remediation）

## 1. 节点状态

`REVIEW`

N14 已在 `fix/canvas-n14-v2.2-provider-mock` 上完成核心实现、focused tests、built-LIB smoke 与 package docs。节点不得在 repository-pinned install/typecheck/lint/build/coverage/focused tests 真正执行前标记为 `ACCEPTED`。

当前还有两个外部 validation blocker：

1. N13/N14 新增 workspace package，`pnpm-lock.yaml` 需要由仓库固定 pnpm toolchain 重新生成 importer；禁止手工编辑 generated lockfile 伪造通过。
2. 当前 Canvas stacked PR 的 GitHub Actions 存在 runner infrastructure 故障：standard jobs 可能在 `steps=[]` 下直接失败并返回 Azure `BlobNotFound`，enterprise Node 24 jobs 可能持续 queued。只有 exact-head project steps 实际执行后，红/绿结果才可用于验收。

## 2. 节点目标

在 N12 Browser-independent Executor contract 与 N13 Model Registry/Resolver 之上建立 Provider Runtime Adapter 层：

- N13 选择具体 Provider/Model；
- N14 只路由并执行该已解析 Provider；
- N12 不解析 Provider/Model，也不调用 Provider SDK；
- Canvas Domain、Session、Browser 不接触 Provider credential/raw payload；
- 用可故障注入的 Mock Provider 完整验证 image/video Provider-backed execution；
- Python/local transform/runtime executor 保持并列扩展路径，不被强塞进 `MediaProvider`。

## 3. 前置依赖

`N12, N13`

N12 提供：

- exact node Definition/Executor dispatch；
- immutable run snapshot；
- Provider-neutral execution context；
- caller-provided opaque `MediaNodeExecutionIdentity.key`；
- fingerprint/cache/cancellation/event seams。

N13 提供：

- `ctx.mediaModels`；
- Provider/Model descriptors；
- strict/auto/fallback requirement resolution；
- concrete `executionIdentityKey`；
- Provider/model enablement metadata。

## 4. 本节点范围

### 4.1 Provider Runtime Contract

在 `@deepseek-ai/dsh-media-provider/runtime` 发布：

- `MediaProvider`；
- Provider-neutral semantic request union；
- Host-only image/video byte output；
- inline/polling/callback operation shape；
- serializable `MediaProviderOperationHandle`；
- start/resume/cancel；
- normalized Provider error vocabulary；
- output materialization seam。

### 4.2 Runtime Registry

`MediaProviderRuntimeRegistry` 挂载为 `ctx.mediaProviders`：

- exact `providerId` routing；
- registration 必须已有 N13 Provider descriptor；
- duplicate adapter fail-loud；
- effect-scoped registration/disposal；
- stable list；
- post-commit、non-vetoing change notification。

Registry 在 Service activation 时捕获 N13 `MediaModelRegistry`。这样 Cordis Service method tracing 仍可让 registration effect 归 caller fiber 所有，同时调用方不需要为了内部 registry check 额外 inject `mediaModels`。

### 4.3 ProviderExecutor Bridge

Generic bridge 把 N12 `MediaNodeExecutorContext` 转成 semantic Provider request。

当前 built-in bindings：

| Node | Capability | Raw output contract |
|---|---|---|
| `image.generate@1` | `text-to-image` | `count` images |
| `image.edit@1` | `image-edit` | 1 image |
| `video.generate@1` | `text-to-video` | 1 video |
| `video.image-to-video@1` | `image-to-video` | 1 video |

Bridge 必须：

1. 要求 N12 execution identity；
2. 通过 N13 `getModelByExecutionIdentity()` 精确反查 Model，**不得解析 executionIdentityKey 字符串格式**；
3. fail-closed 检查 Provider/Model 仍 enabled；
4. 检查 Model 宣告目标 capability；
5. 构造 semantic request；
6. 通过 exact Provider id 获取 runtime adapter；
7. 执行 operation driver；
8. **先验证 Provider raw output kind/count，再调用 materializer**；
9. materialized output 再验证 kind/fingerprint；
10. 返回 N12 executor result。

四个 built-in Provider executor 的批量注册是 transactional：任何 exact-version 冲突会回滚本次此前已加入的 binding，返回 disposer 可完整卸载。

### 4.4 Output Materialization Boundary

原计划“Mock bytes 经 N17/N21 store seam 落盘”在实施时被修正为明确 dependency seam：

```text
Provider bytes
   ↓
N14 validate raw kind/count/metadata
   ↓
MediaProviderOutputMaterializer
   ↓
N17 image attachment / N21 video asset store
   ↓
stable N12 asset value + fingerprint
```

原因：N17/N21 是后续节点，N14 不能越级实现它们的 durable binary authority。

N14 测试使用 in-memory materializer。N17/N21 后续提供真正 durable implementation。Provider 不直接写 Canvas/Session，也不直接决定 durable asset id。

## 5. 明确不在本节点处理

- Provider 不直接调用 `CanvasService` 或 Session append。
- Browser 不持有 Provider credential、SDK object、raw response 或 bearer URL。
- Workflow config 不保存真实 Provider wire payload。
- N14 不做 Authorization / Feature / Quota / Cost / Approval / Concurrency / Idempotency admission；属于 N15。
- N14 不做 durable Run/Job lifecycle、retry terminal race、restart reconciliation；属于 N16。
- N14 不实现 durable image/video asset store；属于 N17/N21。
- N14 不实现真实 Cloud Image Provider；属于 N20。
- N14 不实现 production async video callback/reconciliation；属于 N22。
- Python/local transform executor 不强塞进 `MediaProvider` interface。

## 6. 核心 Ownership 关系

```text
MediaWorkflow Node
      ↓
N12 NodeExecutor
      ↓
N13-resolved executionIdentity
      ↓
N14 ProviderExecutor binding
      ↓
Semantic MediaProviderRequest
      ↓
ctx.mediaProviders exact adapter
      ↓
Provider SDK / API implementation
      ↓
Normalized Provider completion
      ↓
N14 raw validation
      ↓
N17/N21 materializer seam
      ↓
N12 executor result
```

并列 executor 仍允许：

```text
TransformExecutor
PythonCodeRuntimeExecutor
RemoteWorkflowExecutor
ProviderExecutor
```

## 7. Credential / Payload Boundary

Provider credential 永远不进入：

- MediaWorkflow；
- Canvas Snapshot；
- Session；
- Projection；
- Tool result；
- Browser；
- `MediaProviderRequest`。

Semantic request 只包含：

- resolved Provider/Model identity；
- node type/version；
- normalized semantic config；
- prompt/reference semantic inputs；
- operation-specific semantic fields。

Provider endpoint、credential ref/value、SDK client、Provider-native payload 由真实 Adapter/Deployment config 私有持有。

## 8. Operation Lifecycle

### Inline

`start()` 直接返回 completion。

### Polling / Callback

`start()` 返回：

```text
providerId
mode
providerTaskId
```

`resume()` 返回 pending/retry hint 或 completed。

`callback` 在 N14 只表示 resumable async operation contract，不代表本节点实现 HTTP callback receiver；真实 ingress/reconciliation 属于 N22。

### Cancellation

`runMediaProviderOperation()` 使用 caller `AbortSignal`：

- async operation abort 后只请求一次 Provider cancel；
- 自动 cancel 不把已经 aborted 的 signal 再传给 Provider，否则 Provider 无法完成 cancellation I/O；
- sync throw / async reject 的 cancel failure 都被 containment，不能覆盖主 `MEDIA_PROVIDER_ABORTED`；
- Driver 等待该 cancellation request settlement 后才返回 ABORTED；
- 显式 reconciliation cancel 使用独立 `cancelMediaProviderOperation()`，可以带自己的 signal，并保留 normalized error。

Durable cancel intent/result 仍由 N16/N22 管理。

## 9. Provider Result Hardening

Provider completion 在进入 materializer 前验证：

- outputs 非空；
- kind 仅 image/video；
- media type 非空、control-free、长度受限；
- image output 必须是 `image/*`，video output 必须是 `video/*`；
- bytes 必须为非空 `Uint8Array`；
- provider task/request/output id 非空、control-free、长度受限；
- bytes clone/detach 后交给上层；
- binding-specific kind/count 必须匹配。

真实 binary magic/dimension/duration/storage quota 由 N17/N21 durable materializer 再验证；N14 不复制它们的职责。

## 10. Error Normalization

稳定错误包括：

- invalid registration / duplicate / adapter not found；
- execution identity/model missing；
- invalid operation/result；
- rate limit；
- Provider server error；
- rejected；
- timeout；
- aborted；
- generic Provider failure。

SDK-shaped status `429` 归一化为 `MEDIA_PROVIDER_RATE_LIMIT`，`5xx` 归一化为 `MEDIA_PROVIDER_SERVER_ERROR`。

Public error message 不复制 Provider raw response/body/secret-bearing SDK message。Original cause 可以留在 Host process-local Error `cause` 供 diagnostics，但不是 Provider semantic result contract，也不得直接进入 Browser/Session。

## 11. Mock Provider

独立 package：`@deepseek-ai/dsh-media-provider-mock`。

特点：

- opt-in；
- 不加入 shipped production profile；
- 注册 `mock-media / mock-universal-v1`；
- 支持四种 semantic capability；
- deterministic byte fixtures；
- inline / polling / callback；
- delay；
- 429 / 503 / rejection / timeout；
- start/resume stage failure；
- cancel；
- duplicate completion idempotence。

Mock bytes 不是合法 production image/video，它只验证 N14 Provider/runtime/materialization contract；N17/N21 分别测试真实 media storage/validation。

## 12. Runtime/Catalog Invariant

N13 的空 invariant 在 N14 升级为真实 cross-authority invariant：

```text
forall providerId in ctx.mediaProviders:
  ctx.mediaModels.getProvider(providerId) must exist
```

Runtime registration 自身已在 commit point 强制该关系；Invariant 用独立 diagnostics path 捕获非法 reconstructed composition state。

Mock package 自己的 `./invariant` 保持有意为空，并带 package-specific `No runtime invariant:` 理由：Mock 没有独立 shared authority，scenario queue/task map 是 test-local Adapter implementation state。

## 13. Package / Build Wiring

`@deepseek-ai/dsh-media-provider`：

- root；
- `./types`；
- `./runtime`；
- `./invariant`；
- declaration output `lib/types/**`；
- runtime JS `lib/*.js`。

`@deepseek-ai/dsh-media-provider-mock`：

- root；
- `./invariant`；
- declaration output `lib/types/**`；
- Host aggregate project reference；
- 不加入 shipped composition。

两个 package 都遵循 direct workspace dependency + tsconfig project reference 规则。

## 14. 测试矩阵

### Runtime Registry / Driver

- [x] catalog descriptor required before runtime registration。
- [x] duplicate runtime adapter rejected。
- [x] caller 只 inject `mediaProviders` 也可注册；内部 catalog dependency 不泄漏给 caller topology。
- [x] effect/HMR disposal。
- [x] observer failure non-vetoing。
- [x] inline byte detachment。
- [x] polling resume。
- [x] async abort → exactly-one cancel request → wait settlement → ABORTED。
- [x] 429 / 5xx normalization 且 public message 不泄漏 raw payload。
- [x] malformed completion / kind-mediaType mismatch rejection。

### ProviderExecutor

- [x] semantic request construction。
- [x] request 不包含 credential/url。
- [x] executionIdentity required / stale identity fail-closed。
- [x] raw output kind/count 在 materializer 前验证。
- [x] safe materialization provenance。
- [x] image-list fingerprint。
- [x] transactional built-in registration rollback。
- [x] complete disposer。

### Mock Provider

- [x] text-to-image。
- [x] image-edit。
- [x] text-to-video。
- [x] image-to-video。
- [x] polling / callback。
- [x] duplicate completion idempotence。
- [x] rate-limit / 5xx / rejected / timeout。
- [x] resume-stage failure。
- [x] cancel。

### Full DAG

- [x] Real N10 registry + built-ins。
- [x] Real N12 `MediaWorkflowEngine`。
- [x] Real N13 model registry。
- [x] Real N14 runtime registry + generic ProviderExecutor。
- [x] Mock plugin。
- [x] `prompt@1 -> image.generate@1 -> output@1` without cloud service。
- [x] In-memory materializer replaces only future N17 durable storage seam。
- [x] Mock fiber disposal removes catalog and runtime registration。

### Built output

- [x] source test defines plain-Node smoke for built `lib/index.js` + `lib/runtime.js`。
- [x] source test defines plain-Node smoke for built Mock package registration/execution/disposal。
- [ ] repository-pinned build must actually produce and execute these artifacts on exact head。

## 15. 验收标准

### Architecture

- [x] N13 selects; N14 routes/executes。
- [x] N12 Scheduler/Engine 不修改为 Provider-aware。
- [x] Canvas Domain 不引用 Provider SDK/credential。
- [x] Provider 不直接写 Canvas/Session。
- [x] real Provider 可以通过 Adapter/registration/config 扩展，不需要修改 Canvas Domain/N12 scheduler。

### Security / Data Boundary

- [x] semantic request 不含 credential。
- [x] Provider bearer URL/raw response 不进入 stable workflow/result contract。
- [x] normalized error 不复制 raw Provider body。

### Lifecycle

- [x] catalog/runtime exact registration disposal。
- [x] non-vetoing notifications。
- [x] async cancel semantics 明确。
- [x] duplicate completion 可幂等验证。

### Repository gates

- [ ] pinned pnpm 重新生成 lockfile importer。
- [ ] frozen install。
- [ ] Host typecheck。
- [ ] lint / export-JSDoc / package docs gates。
- [ ] build。
- [ ] coverage/focused tests。
- [ ] built-LIB smoke 真执行。
- [ ] exact-head CI project steps 真执行。

## 16. 风险与禁止项

- 禁止把 Provider-native payload 当 MediaWorkflow config。
- 禁止解析 `executionIdentityKey` 的字符串格式来推断 Provider/Model。
- 禁止让 Browser 或 Session 获得 credential/raw Provider response/bearer URL。
- 禁止让 Mock 进入 production shipped profile。
- 禁止让 N14 越级拥有 N17/N21 binary storage。
- 禁止把 catalog `enabled` 或 runtime adapter presence 当 Authorization/Admission。
- 禁止把 generated `pnpm-lock.yaml` 手工写成“看起来正确”。

## 17. Definition of Done

当前实现/文档证据满足 source-level N14 scope，但节点保持 `REVIEW`。

只有以下条件全部满足后才能进入验收：

1. repository-pinned pnpm 生成真实 lockfile importer；
2. exact-head install/typecheck/lint/build/coverage/focused tests 真实执行；
3. built output smoke 真实执行；
4. 无未解释的 regression；
5. implementation record 与 Agent Note 和 exact-head evidence 一致。
