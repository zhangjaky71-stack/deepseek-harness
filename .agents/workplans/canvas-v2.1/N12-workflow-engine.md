# N12 — Media Workflow Engine v2.2：Validator、Scheduler、Executor、Partial Run 与 Fingerprint

> 上游前置：N11.5 完成后的 Harness rc.8 基线。

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
- Runtime Adapter / WorkflowEventSink seam。
- future Python code-runtime adapter seam。

## 4. 明确不在本节点处理

- 不把现有 `ctx.workflowEngine` 改造成媒体 DAG。
- 不依赖 Browser/React/WebSocket/ui-canvas。
- 不直接 append Session durable events。
- 不接真实 Provider credential/network（N14+）。
- 不实现 Jobs durable lifecycle（N16）。

## 5. 预计代码位置

- `packages/canvas/media-workflow/src/validate.ts`
- `scheduler.ts`
- `fingerprint.ts`
- `executor.ts`
- `cache.ts`
- `engine.ts`
- `engine-types.ts`
- `tests/`

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
- `downstream`：seed 下游，seed 本身可作为 boundary producer。

缺失 boundary input 必须失败，不能偷偷重跑未调度上游。

### Executor Registry

```text
node type/version
   ↓
MediaNodeExecutorRegistry
   ↓
Executor
```

禁止 giant switch。custom plugin node 只要 Definition + Executor 注册即可参与执行。

### Runtime Adapter

Engine 可以通过抽象 sink 发布运行事实，但不拥有 Session/Browser：

```ts
interface WorkflowEventSink {
  publish(event: WorkflowRuntimeEvent): Promise<void> | void
}
```

N16 决定如何把 runtime event 转成 durable Run/Job state。

### Fingerprint

至少包含：

```text
node type/version
normalized config
resolved model identity/modelKey
ordered upstream/content fingerprints
asset content fingerprints
```

生成节点默认 `cacheable=false`；只有 Definition 声明 deterministic 时自动读写 cache。

## 7. Python Runtime Seam

rc.8 新增 `code-runtime-python` fd-3 protocol。N12 不直接依赖具体 Python node，但 Executor contract 必须允许后续：

```text
PythonCodeRuntimeExecutor
TransformExecutor
ProviderExecutor
RemoteWorkflowExecutor
```

接入时仍通过同一 Executor Registry，不为 Python 特设 Workflow schema。

## 8. 实施步骤

1. structural validation。
2. registry-based Definition resolution/config parse。
3. deterministic topo sort（不能依赖输入数组偶然顺序）。
4. execution scope + boundary calculation。
5. immutable snapshot：normalize config、freeze semantic workflow。
6. executor registry + output validation。
7. fingerprint + cache policy。
8. engine 依 topo 顺序执行 Mock DAG。
9. cancellation signal seam。
10. RuntimeAdapter/EventSink 保持可选、provider-neutral。

## 9. 测试要求

- [ ] valid DAG。
- [ ] duplicate node/edge id。
- [ ] missing node/port。
- [ ] type mismatch/multiplicity/missing required input。
- [ ] cycle。
- [ ] topo 顺序对输入数组重排仍稳定。
- [ ] all/selected/from-node/downstream。
- [ ] partial boundary 缺失失败。
- [ ] supportsPartialRun=false 阻止局部执行。
- [ ] immutable snapshot 不受原对象后续 mutation 影响。
- [ ] Mock executors 跑完整 DAG。
- [ ] custom node Definition+Executor 无需改 engine switch。
- [ ] deterministic same input fingerprint same。
- [ ] modelKey/config/input 变化 fingerprint 变化。
- [ ] generative node 不自动 cache。
- [ ] cached executor output 仍通过 output validation/snapshot contract。

## 10. 验收标准

- [ ] Engine 完全不依赖 Browser。
- [ ] Mock executor 可跑完整 DAG。
- [ ] Partial Run 不需要重写 scheduler API。
- [ ] Engine 不直接写 Session durable state。
- [ ] open-world custom node 不要求修改 Engine。
- [ ] N13/N14/N16 可在现有 seam 上继续，无需 breaking redesign。

## 11. Definition of Done

- [ ] typecheck/lint/build。
- [ ] focused engine tests 全部有真实执行结果。
- [ ] README/JSDoc 更新。
- [ ] 不提前绑死 N13-N16 Provider/Jobs 细节。

## 12. 风险与禁止项

- giant node switch。
- partial run 偷跑 boundary upstream。
- fingerprint 忽略 resolved model identity。
- Engine 直接依赖 Session/Browser/Provider SDK。
