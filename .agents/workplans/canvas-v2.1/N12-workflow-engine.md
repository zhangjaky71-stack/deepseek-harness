# N12 — Media Workflow Engine v2.2：Validator、Scheduler、Executor、Partial Run 与 Fingerprint

> 上游前置：N11.5 完成后的 Harness rc.8 基线。
>
> 当前实施分支：`fix/canvas-n12-v2.2-workflow-engine`。历史 `agent/canvas-n12-workflow-engine` 相对当前基线 behind 290 / ahead 5，`agent/canvas-n12-workflow-engine-v2` behind 282 / ahead 1；两者仅用于设计审计，未作为继续开发基线。

## 1. 节点目标

建立独立于现有 Harness WorkflowEngine 和 Browser 的媒体 DAG 执行引擎，支持静态验证、确定性拓扑、完整/局部执行、不可变 run snapshot、open-world executor dispatch、fingerprint 与 deterministic cache seam。

## 2. 前置依赖

`N10, N11.5`

## 3. 本节点范围

- static validation / cycle detection。
- port/type/multiplicity/required input validation。
- deterministic topological order。
- execution target：all / selected / from-node / downstream。
- partial-run boundary inputs。
- immutable workflow run snapshot。
- exact type/version executor registry。
- NodeExecutionFingerprint。
- deterministic cache seam。
- optional in-band `WorkflowEventSink` seam。
- cancellation signal seam。
- future Python code-runtime / Transform / Provider / Remote Workflow executor seam。

## 4. 明确不在本节点处理

- 不把现有 `ctx.workflowEngine` 改造成媒体 DAG。
- 不依赖 Browser/React/WebSocket/ui-canvas。
- 不直接 append Session durable events。
- 不解析或选择模型；N13 负责 Model Registry / Requirement Resolver。
- 不接真实 Provider credential/network；N14 负责 Provider Adapter/routing。
- 不组合 N09 feature、权限、quota、approval 或 concurrency admission；N15 负责准入。
- 不实现 durable Run/Jobs/retry/cancel/reconciler；N16 负责生命周期。

## 5. 实际代码位置

- `packages/canvas/media-workflow/src/validate.ts`
- `packages/canvas/media-workflow/src/scheduler.ts`
- `packages/canvas/media-workflow/src/fingerprint.ts`
- `packages/canvas/media-workflow/src/executor.ts`
- `packages/canvas/media-workflow/src/cache.ts`
- `packages/canvas/media-workflow/src/engine.ts`
- `packages/canvas/media-workflow/src/engine-types.ts`
- `packages/canvas/media-workflow/tests/`

## 6. 核心接口 / 行为契约

### Execution selection

```ts
type MediaWorkflowExecutionSelection =
  | { mode: 'all' }
  | { mode: 'selected'; nodeIds: readonly WorkflowNodeId[] }
  | { mode: 'from-node'; nodeId: WorkflowNodeId }
  | { mode: 'downstream'; nodeIds: readonly WorkflowNodeId[] }
```

语义：

- `all`：完整 DAG。
- `selected`：目标节点 + 必要 upstream closure。
- `from-node`：seed + descendants；未选 upstream 通过 boundary input 显式提供。
- `downstream`：seed 下游，seed 本身不调度，可作为 boundary producer。

缺失 boundary input 必须失败，不能偷偷重跑未调度上游。Boundary/runtime value 必须再次匹配 target port type。

### Executor Registry

```text
node type/version
   ↓
MediaNodeExecutorRegistry
   ↓
Executor
```

禁止 giant switch。custom node 只要 Definition + exact-version Executor 注册即可参与 Engine。N12 的 Registry 是纯 process-local 对象；本节点没有无当前 consumer 地新增 shipped Cordis service row，N14 如需要 process-wide provider-backed registration 可在其 owning layer 挂载。

### Runtime Event Sink

Engine 可以通过可选、in-band sink 发布非 durable 运行事实，但不拥有 Session/Browser：

```ts
interface WorkflowEventSink {
  publish(event: WorkflowRuntimeEvent): Promise<void> | void
}
```

Sink rejection 会使当前 Engine 调用失败；N16 决定是否/如何把这些事实映射为 durable Run/Job state。

### Execution identity ownership

N12 不提供 `resolveModelKey()`，也不选择 Provider/Model。调用方可为每个 node 传入已经解析好的稳定 identity：

```ts
interface MediaNodeExecutionIdentity {
  readonly key: string
}
```

N13 后续负责从 requirements/deployment policy 产生实际 Provider/Model identity；N12 只把该 key 传给 Executor 并纳入 fingerprint。空 identity key 必须失败。

### Fingerprint

至少包含：

```text
node type/version
normalized config
caller-provided resolved execution identity key
ordered edge/source/target identities
upstream/content fingerprints
asset/content fingerprints represented by executor outputs
```

同一 target port 的多输入不能只按内容 hash 排序；edge/source/target identity 必须参与 canonical payload，避免不同图结构产生错误 cache alias。生成节点默认 `cacheable=false`；只有 Definition 声明 `deterministic=true` 时 Engine 才自动读写 cache。

Cache hit 不是 trusted bypass：返回值仍必须经过同一 output port/type/fingerprint validation，并 detach/freeze 后才能进入 downstream。

### Cancellation

`AbortSignal` 至少在 run 开始、每个 node 开始、cache read 后、executor 返回后检查。Executor 即使忽略 signal，取消后返回的结果也不能继续被 Engine 当作成功 completion。

## 7. Python Runtime Seam

rc.8 新增 `code-runtime-python` fd-3 protocol。N12 不直接依赖具体 Python node，但 Executor contract 允许后续：

```text
PythonCodeRuntimeExecutor
TransformExecutor
ProviderExecutor
RemoteWorkflowExecutor
```

接入仍通过同一 exact-version Executor Registry，不为 Python 特设 Workflow schema。

## 8. 实施结果

1. [x] structural/static validation 与 Registry-based Definition/config resolution。
2. [x] deterministic topo sort，不依赖 caller node/edge array 偶然顺序。
3. [x] all/selected/from-node/downstream execution scope + explicit boundary calculation。
4. [x] immutable workflow snapshot：normalize config、detach、deep-freeze semantic workflow。
5. [x] exact type/version executor registry + output validation/disposal。
6. [x] graph-aware fingerprint + deterministic cache policy。
7. [x] Engine 依 topo 顺序执行 Mock/custom DAG。
8. [x] AbortSignal seam，含 executor 返回后的再次检查。
9. [x] optional in-band `WorkflowEventSink`。
10. [x] published `./engine` export 与 built-LIB smoke。

## 9. 测试要求

- [x] valid DAG。
- [x] duplicate node/edge id。
- [x] missing node/port/output node。
- [x] type mismatch/multiplicity/missing required input。
- [x] cycle / no output / unreachable warning。
- [x] topo 顺序对输入数组重排仍稳定。
- [x] all/selected/from-node/downstream。
- [x] partial boundary 缺失失败、类型不匹配失败。
- [x] supportsPartialRun=false 阻止局部执行。
- [x] immutable snapshot 不受原对象后续 mutation 影响。
- [x] Mock executors 跑完整 DAG。
- [x] custom Definition+Executor 无需修改 Engine switch。
- [x] deterministic same input fingerprint same。
- [x] execution identity/config/edge/input 变化 fingerprint 变化。
- [x] non-deterministic/generative definition 不自动 cache。
- [x] cached executor output 仍通过 output validation/snapshot contract。
- [x] executor registry duplicate/disposal/error paths。
- [x] AbortSignal before/after executor seam。
- [x] runtime event sink success/failure 与 cache-hit event。
- [x] built `lib/engine.js` 在 plain Node + real Cordis fibers 中执行 DAG。

## 10. 验收标准

- [x] Engine 完全不依赖 Browser。
- [x] Mock/custom executor 可跑完整 DAG。
- [x] Partial Run 不需要重写 scheduler API。
- [x] Engine 不直接写 Session durable state。
- [x] open-world custom node 不要求修改 Engine。
- [x] N13/N14/N15/N16 可在现有 seam 上继续，无需把职责拉回 N12。

以上为源码/测试设计状态，不等价于仓库 CI 验收。Repository-pinned exact-head jobs 必须真实执行后才能把节点状态从 REVIEW 提升为 ACCEPTED。

## 11. Definition of Done

- [ ] repository-pinned typecheck/lint/build/coverage 有真实执行结果。
- [ ] focused engine tests 在 CI/受支持本地 toolchain 有真实执行结果。
- [x] README/JSDoc 更新。
- [x] 不提前绑死 N13-N16 Provider/Admission/Jobs 细节。
- [x] 不手工修改 lockfile/generated artifacts。

当前状态：`REVIEW`。已知 GitHub Actions runner/account 基础设施会出现 `steps=[]`、日志 `BlobNotFound` 或 enterprise runner 长时间 queued；这些不能作为代码通过证据，也不能被误判为 N12 assertion failure。

## 12. 风险与禁止项

- giant node switch。
- partial run 偷跑 boundary upstream。
- fingerprint 忽略 resolved execution identity 或 graph edge identity。
- cache hit 绕过 executor output validation。
- executor 返回后不再检查 cancellation。
- Engine 自己选择模型/Provider。
- Engine 直接依赖 Session/Browser/Provider SDK/Jobs/Admission。
