# N01 — Canvas Domain、类型系统与状态不变量

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

建立 Canvas 的纯业务模型，使 Session、Remote、Agent Tool、UI、Workflow Engine 都依赖同一套稳定语义。

## 2. 前置依赖

`N00`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- CanvasId、WorkflowId、NodeId、EdgeId、RunId、VariantId 等品牌 ID。
- MediaWorkflow、Node、Edge、Port、CanvasSnapshot、CanvasRunSnapshot、CanvasOutput。
- workflowRevision/runRevision 双 revision 规则。
- CanvasErrorCategory / CanvasErrorCode。
- Canvas product state：EMPTY/READY/DIRTY_READY/RUNNING/COMPLETED/FAILED/CANCELLED/INTERRUPTED。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/canvas/src/types.ts`
- `packages/canvas/canvas/src/domain.ts`
- `packages/canvas/canvas/src/invariant.ts`
- `packages/canvas/canvas/README.md`
- `packages/canvas/canvas/tests/`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

核心状态结构建议保持：

```ts
interface CanvasSnapshot {
  schemaVersion: number
  id: CanvasId
  workflowRevision: number
  runRevision: number
  workflow: MediaWorkflow | null
  currentVariantId?: CanvasVariantId
  run: CanvasRunSnapshot | null
  output: CanvasOutput | null
  createdAt: number
  updatedAt: number
}
```

硬性规则：

```text
Workflow semantic edit → workflowRevision + 1
Run lifecycle change     → runRevision + 1
Run 必须记录其固定执行的 workflowRevision
Binary 不进入任何 Domain Snapshot
```

## 7. 实施步骤

1. 按仓库 types-only 约束建立 `src/types.ts`，不得放运行时逻辑。
2. 建立 Domain constructor/normalizer/helper，但不引入 React Flow 或 Provider SDK 类型。
3. 建立 Product State 派生函数，例如 `deriveCanvasProductState(snapshot)`。
4. 定义稳定错误 code，并让 category 与恢复策略有明确映射。
5. 建立 invariant 对 ID、revision、安全整数、output index、run terminal 状态做检查。
6. README 写清每个字段是 durable semantic state、runtime state 还是引用。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] 空 Canvas 派生为 EMPTY。
- [ ] 存在 Workflow 无 output 派生 READY。
- [ ] output revision 小于 workflowRevision 派生 DIRTY_READY。
- [ ] running Run 派生 RUNNING。
- [ ] runRevision 更新不改变 workflowRevision。
- [ ] primaryAssetIndex 越界被 invariant 拒绝。

## 10. 验收标准

- [ ] `types.ts` 不包含运行时实现。
- [ ] Domain 不依赖 UI、Provider SDK、HTTP、Jobs。
- [ ] 所有其他节点都能以本节点类型作为唯一业务模型。
- [ ] 双 revision 规则有单测锁定。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 过早把 Provider-specific config 写进 Domain；必须保持 semantic config + provider adapter 边界。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N01`、`检查 N01`、`验收 N01` 或 `修复 N01 验收问题`。
