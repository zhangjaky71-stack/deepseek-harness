# N02 — Schema Migration、Node Version 与 Golden Fixtures

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

保证未来 Schema/节点升级后，已有 Session 里的 Canvas/Workflow 仍能打开、验证和运行，避免上线后被历史数据锁死。

## 2. 前置依赖

`N01`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- CanvasChange version、CanvasSnapshot schemaVersion、MediaWorkflow schemaVersion。
- Node-level nodeVersion。
- `migration.ts` 和 decode → migrate → validate 流程。
- Golden fixtures：workflow-v1、snapshot-v1、layout-v1、run-history-v1、deprecated-node-v1。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/canvas/src/migration.ts`
- `packages/canvas/canvas/tests/fixtures/`
- `packages/canvas/canvas/tests/migration.test.ts`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

历史事件保持不可变：

```text
Stored V1 Event
   ↓ decode
Runtime migration
   ↓
Current Runtime Shape
   ↓ invariant
```

禁止直接重写历史 Session Event。未知未来版本必须 fail loud，不得猜测降级。

## 7. 实施步骤

1. 建立 version decoder，并明确 current version 常量。
2. 编写最小 v1 fixture，即使初版 runtime 也是 v1，也提前固定文件。
3. 为 Node Version 建立迁移入口，避免未来所有变更都抬高 Workflow schema。
4. 定义 unsupported future schema 错误。
5. Golden fixture 文件只新增、不覆盖旧版本 shape。
6. 测试 migration 后再过 N01 invariant。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] workflow-v1 fixture 可迁移到 current。
- [ ] snapshot-v1 fixture 可迁移。
- [ ] unknown future schema 明确失败。
- [ ] deprecated node fixture 能安全读取并标记生命周期状态。
- [ ] Migration 多次运行不会继续改变已是 current 的对象。

## 10. 验收标准

- [ ] 历史 fixture 已进入测试目录。
- [ ] Migration 与 invariant 完全解耦但串联执行。
- [ ] 任何 schema 版本不匹配都有稳定行为。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 把 migration 逻辑散落进 fold/UI；必须集中在 decoder/migration seam。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N02`、`检查 N02`、`验收 N02` 或 `修复 N02 验收问题`。
