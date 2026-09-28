# N19 — Run History、Variant、Restore、Provenance 与 Asset Library

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

让用户可以查看过去结果、恢复旧 Workflow、创建方案分支，并把历史资产重新作为输入。

## 2. 前置依赖

`N06, N17, N18`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- listRuns/getRun。
- CanvasVariantMeta。
- restoreWorkflow。
- Generation History UI。
- Asset Library 当前 Session scope。
- “再来一版” lineage。
- 旧输出作为输入。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/canvas/src/history.ts`
- `packages/client/ui-canvas/src/client/HistoryPanel.tsx`
- `AssetLibrary.tsx`
- `tests/history.test.ts`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

History 不塞 current Projection。

Restore：

```text
old revision 7
→ create new current revision 16
```

绝不回滚/删除 Session Event。

V1 Asset Library scope：

```text
current Session only
```

## 7. 实施步骤

1. 从 Session event/index 派生 paged run history。
2. 实现 Variant parent/baseRun metadata。
3. 实现 restore workflow 产生新 revision。
4. History UI 支持查看、设 primary、继续编辑、作为参考。
5. Asset Library 合并 uploads + generated current-session assets。
6. Agent `createVariant` 路径与用户“再来一版”语义接通。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] 一个 Variant 多 Run。
- [ ] restore 旧 Workflow 生成新 revision。
- [ ] 历史不进入 current projection。
- [ ] 跨 Session 不泄漏 Asset。
- [ ] 历史图片可作为 image.edit/image-to-video 输入。

## 10. 验收标准

- [ ] 用户不会因连续生成丢掉上一版。
- [ ] 方案与执行记录语义分离。
- [ ] 历史结果可以继续创作。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 把完整历史数组塞 CanvasSnapshot；禁止。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N19`、`检查 N19`、`验收 N19` 或 `修复 N19 验收问题`。
