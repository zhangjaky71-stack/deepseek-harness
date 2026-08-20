# N01 — Canvas Domain、类型系统与状态不变量

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 当前执行基线：Canvas V2.2 / Harness rc.8 Compatibility Revision  
> 历史来源：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 状态：`REVIEW — NEEDS ADJUSTMENT/RE-VERIFICATION`  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

建立 Canvas 的纯业务模型，使 Session、Remote、Agent Tool、UI、Workflow Engine 都依赖同一套稳定语义，同时保证 Domain 对媒体节点类型保持 **open-world**：Domain 负责结构合法性，N10/N12 Registry 负责“当前是否安装、端口/配置是否合法、是否可执行”。

## 2. 前置依赖

`N00`

N01 不依赖 Browser、Provider、Jobs、Session event implementation 或具体媒体执行器。

## 3. 本节点范围

- CanvasId、MediaWorkflowId、WorkflowNodeId、WorkflowEdgeId、CanvasRunId、CanvasVariantId、VideoAssetId 等品牌 ID。
- MediaWorkflow、Node、Edge、CanvasSnapshot、CanvasRunSnapshot、CanvasOutput、CanvasAssetRef。
- workflowRevision/runRevision 双 revision **语义**。
- CanvasDomainError / CanvasErrorCode 与 CanvasRunError 的边界。
- Canvas product state：EMPTY/READY/DIRTY_READY/RUNNING/COMPLETED/FAILED/CANCELLED/INTERRUPTED。
- JSON-safe semantic config、ID/revision/timestamp/run/output/asset 的纯值不变量。
- open-world `MediaWorkflowNodeType` structural admission。

## 4. 明确不在本节点处理

- 不判断某个 node type 当前是否已安装。
- 不判断 node config 是否符合某个 Node Definition schema。
- 不判断 source/target port 是否存在或类型兼容。
- 不判断节点是否 executable / deprecated / creatable。
- 不做 DAG cycle detection / scheduler validation。
- 不执行 Provider、Jobs、HTTP、Browser 或 Session mutation。
- 不负责相邻 durable event 的 revision transition；该职责属于 N03。
- 不负责 durable decode/migration 对未知 plugin node 的兼容；该职责属于 N02。

## 5. 代码 ownership

N01 主要代码位置：

- `packages/canvas/canvas/src/types.ts`
- `packages/canvas/canvas/src/domain.ts`
- `packages/canvas/canvas/src/index.ts`
- `packages/canvas/canvas/tests/domain.spec.ts`
- `packages/canvas/canvas/README.md`

注意：当前仓库中的 `packages/canvas/canvas/src/invariant.ts` 已在后续节点演进为 **Session durable stream invariant companion**，属于 N03/N05 的实现 ownership，不应再作为 N01 pure value invariant 的实现位置。N01 的纯值校验位于 `domain.ts`。

## 6. Open-world Node Contract

### 6.1 Domain 只检查结构

`MediaWorkflowNode.type` 是 durable semantic identifier。N01 必须允许当前未安装插件产生的合法非空字符串，例如：

```text
plugin.example.custom-transform
comfyui.workflow
vendor.video.interpolate
```

N01 `assertMediaWorkflow()` 只应检查：

```text
node.id 非空
node.type 非空字符串
nodeVersion（若存在）为正 safe integer
name（若存在）为 string
config 为 JSON-safe
edge 引用已存在 node
outputNodeIds 引用已存在 node
node/edge/output id 不重复
```

禁止 N01 使用：

```ts
NODE_TYPES.has(node.type)
```

或任何 built-in whitelist 判定 Domain 合法性。

### 6.2 Known types 与 executable types 分离

`MediaWorkflowNodeTypeMap` 可以继续作为 TypeScript composition 的 known-type / declaration-merge surface；但 durable Domain 的 `MediaWorkflowNodeType` 必须是 open-world string identifier。

是否可执行由：

```text
N10 MediaNodeRegistry
        ↓
N12 Validator / ExecutorRegistry
```

决定。

### 6.3 卸载插件后的历史工作流

目标系统语义：

```text
历史 Workflow 含 custom node
        ↓
插件当前未安装
        ↓
Domain 仍可承载/显示
        ↓
Registry 标记 unavailable
        ↓
Execution validation 拒绝执行或要求替换
```

不能在 N01 Domain 阶段把整个 Workflow 判为非法。

> 注意：N02 当前 migration 仍存在 built-in node whitelist，这是 N02 的 P0 follow-up，不能把 N01 的 open-world 修复误认为整个 durable reload 链已经完成。

## 7. Revision Ownership

系统级规则保持：

```text
Workflow semantic edit → workflowRevision + 1
Run lifecycle change   → runRevision + 1
Run 固定记录其执行的 workflowRevision
```

但职责分层如下。

### N01 snapshot invariant

N01 负责：

- revision 是非负 safe integer；
- 有 workflow 时 workflowRevision > 0；
- 无 workflow 时 workflowRevision = 0；
- run/output 不得指向未来 workflowRevision；
- run/workflow/output identity 关系合法。

N01 **不可能**仅凭单个 snapshot 判断 `6 → 7` 还是 `2 → 7`。

### N03 transition invariant

相邻 durable mutation 的严格推进由 N03 `fold.ts` / event transition validation 负责：

```text
workflow-edit/replace → workflowRevision exactly +1, runRevision unchanged
run lifecycle         → runRevision exactly +1, workflowRevision unchanged
output-select         → both revisions unchanged
```

因此“双 revision 规则有测试锁定”必须由 N01 value tests + N03 transition tests共同证明。

## 8. Error Ownership

### CanvasDomainError

N01 拥有稳定的结构/值错误：

```text
CanvasErrorCode
CANVAS_INVALID_ID
CANVAS_INVALID_REVISION
CANVAS_INVALID_TIMESTAMP
CANVAS_INVALID_JSON_VALUE
CANVAS_INVALID_WORKFLOW
CANVAS_INVALID_ASSET
CANVAS_INVALID_RUN
CANVAS_INVALID_OUTPUT
```

### CanvasRunError

`CanvasRunError.category` 使用稳定高层 category，但 `code: string` 允许 Provider/Runtime 在后续节点提供来源特定机器码。

恢复策略、retry/cancel/reconcile、用户可见诊断分别属于 N16/N23，不要求 N01 预定义所有 Provider/Runtime error code。

## 9. Product State Contract

`deriveCanvasProductState(snapshot)` 必须覆盖：

```text
EMPTY
READY
DIRTY_READY
RUNNING
COMPLETED
FAILED
CANCELLED
INTERRUPTED
```

关键语义：

- queued/running 都映射 RUNNING；
- 旧 revision run 仍在运行时仍为 RUNNING；
- 当前 revision terminal run 映射对应 terminal state；
- 旧 revision terminal run 不覆盖当前 workflow 的 READY/DIRTY_READY 判定；
- 旧成功 output + 新 workflow revision → DIRTY_READY。

## 10. 工程约束

- `src/types.ts` 保持 types-only。
- Domain 不依赖 React/React Flow、Browser、Provider SDK、HTTP、Jobs。
- Binary 不进入 CanvasSnapshot/MediaWorkflow JSON。
- Provider-specific payload/credential 不进入 Domain config。
- package 行为变化同步 README/JSDoc。
- `./invariant` companion 仍需满足仓库 aggregate/build 规则，但其 Session-stream逻辑不计入 N01 pure-domain ownership。

## 11. 测试要求

- [ ] EMPTY。
- [ ] READY。
- [ ] DIRTY_READY。
- [ ] queued → RUNNING。
- [ ] running → RUNNING。
- [ ] COMPLETED。
- [ ] FAILED。
- [ ] CANCELLED。
- [ ] INTERRUPTED。
- [ ] old-revision terminal + no output → READY。
- [ ] runRevision 可独立变化而不改变 workflowRevision。
- [ ] future run/output revision 被拒绝。
- [ ] primaryAssetIndex 越界被拒绝。
- [ ] binary / NaN / cyclic config 被拒绝。
- [ ] duplicate node/edge/output 与 dangling edge/output 被拒绝。
- [ ] 任意非空 custom node type 通过 N01 structural invariant。
- [ ] 空 node type 被拒绝。

## 12. 验收标准

- [ ] `types.ts` 不包含运行时实现。
- [ ] Domain 不依赖 UI、Provider SDK、HTTP、Jobs。
- [ ] Domain 对 node type 不使用 built-in whitelist。
- [ ] custom/unknown node 可作为结构合法的 MediaWorkflowNode 被承载。
- [ ] node availability / config / port / executable 判断明确留给 N10/N12。
- [ ] Product State 八种状态有 Domain-level tests。
- [ ] revision snapshot invariant 与 N03 transition invariant ownership 没有混淆。
- [ ] Domain Error 与 Run Error ownership 清晰。

## 13. Definition of Done

- [ ] N01 source adjustments 完成。
- [ ] focused domain tests 有真实执行结果。
- [ ] typecheck/lint/build 有真实执行结果。
- [ ] `pnpm-lock.yaml` Canvas importer 已在最终 rc.8 workspace 基线生成。
- [ ] `docs/module-graph.md` 已在最终 rc.8 workspace 基线重新生成。
- [ ] README/JSDoc 与公开行为一致。
- [ ] N02 unknown-plugin migration blocker 已有独立跟踪，不被隐藏。

在 N11.5 尚未完成 rc.8 baseline 之前，lockfile/module graph 与整仓 gate 可保持 `BLOCKED/UNVERIFIED`，不得伪报 PASS。

## 14. 当前已知 Follow-up

### P0 — N02 durable migration

N01 放开 runtime Domain 后，`migration.ts` 仍通过 `MEDIA_WORKFLOW_NODE_VERSIONS/NODE_TYPES` 拒绝未知 plugin node。N02 必须调整为“结构保留未知节点、Registry 决定可执行性”。

### Gate — rc.8 generated artifacts

`pnpm-lock.yaml` 和 `docs/module-graph.md` 应在 N11.5 完成最终 rc.8 workspace/package graph 后统一生成，避免在 rc.7/过渡基线上重复生成。

## 15. 验收时应输出的结果

1. 实际修改文件清单。
2. open-world node contract 是否满足。
3. Product State tests 是否覆盖八态。
4. revision ownership 是否与 N03 对齐。
5. 测试命令与真实结果。
6. lock/module graph/gates 状态。
7. 未解决问题及严重度。
8. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 16. 实施指令示例

后续可以直接说：`检查 N01`、`验收 N01`、`修复 N01 验收问题` 或 `继续 N02 检查`。