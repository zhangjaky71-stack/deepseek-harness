# N06 — Typert Remote、Mutation API 与 History Query API

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

建立 Browser → Host 的稳定 mutation/query 接口，并接入现有 api-remotes mount。

## 2. 前置依赖

`N04, N05`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- editWorkflow/replaceWorkflow/createVariant/restoreWorkflow/selectOutput/run/cancel/clear/saveLayout Remote 名称冻结。
- History：listRuns/getRun。
- 当前状态仍从 Projection 读取，不重复造 getCurrent RPC。
- API Remotes client contribution。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/canvas/src/index.ts`
- `packages/canvas/canvas/src/client.ts`
- `packages/canvas/canvas/remote 生成物`
- `packages/api/remotes/src/client/index.ts`
- `packages/canvas/canvas/tests/remote.test.ts`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

原则：

```text
Current Canvas read → Session Projection
Mutation             → Typert Remote
Paged History        → Typert Remote query
Large binary         → 不走 Typert
```

## 7. 实施步骤

1. 按 GoalService 的 Remote 模式实现浏览器 mutation wrapper。
2. 所有 Remote 根据 sessionId 解析正确 Host Agent/Session 权限上下文。
3. 挂载 canvasRemote contribution 到 api-remotes client。
4. History query 提供 cursor/limit 并限制最大 page size。
5. 确保 Remote 返回稳定业务 DTO，不返回 runtime provider object。
6. 为 generated typert artifacts 按仓库构建流程更新。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] Remote edit → Session event → Projection。
- [ ] Unauthorized Remote 被 Host 拒绝。
- [ ] History pagination 稳定。
- [ ] 不存在 current-state 双源。

## 10. 验收标准

- [ ] 浏览器可完成所有人工 mutation。
- [ ] 历史读取分页可用。
- [ ] API Remotes 正确 mount Canvas。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 用 Remote 传视频/图片 bytes；禁止。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N06`、`检查 N06`、`验收 N06` 或 `修复 N06 验收问题`。
