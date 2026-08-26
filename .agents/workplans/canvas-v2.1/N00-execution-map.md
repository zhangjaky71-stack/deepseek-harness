# N00 — 工程实施总图与节点契约（V2.2 / Harness rc.8 Revision）

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 原始基线：Canvas / Media Workflow V2.1 Production Hardening  
> 当前执行基线：Canvas V2.2 / Harness rc.8 Compatibility Revision  
> 上游目标：`deepseek-ai/deepseek-harness@141eb6fef83422698aef7a981029e843e8161534` (`dsh@0.1.0-rc.8`)  
> 原始 `SOURCE-V2.1-*` 保持历史快照，不因本次修订重写。

## 1. 节点目标

把整套 Canvas 项目变成可逐节点实施、逐节点验收、可中断后继续的工程计划，并在官方 Harness 持续升级的前提下冻结业务语义、扩展边界和发布门禁。

## 2. 前置依赖

`无`

## 3. 本节点范围

- 定义 N00-N25 与新增 N11.5 的依赖 DAG。
- 定义每个节点 Definition of Ready / Definition of Done。
- 冻结 Canvas 产品不变量与 rc.8 integration ownership。
- 规定 upstream baseline、升级记录、测试证据和偏差记录方式。

## 4. 明确不在本节点处理

- 不越级实现 Provider/UI/治理能力。
- 不修改 `SOURCE-V2.1-*` 历史来源快照。
- 不以 Browser state、Provider 直连或 Session 私有 hack 绕过正式架构。
- 不把“静态兼容审计”当“官方版本已完整同步”。

## 5. 当前新增基础文档

实施任意 rc.8 相关节点前，应同时读取：

- `RC8-UPSTREAM-BASELINE.md`
- `UPSTREAM-COMPATIBILITY-POLICY.md`
- `HARNESS-CANVAS-PLUGIN-ARCHITECTURE.md`
- `CANVAS-EVENT-PROTOCOL.md`
- `CANVAS-SETTINGS-INTEGRATION.md`
- `UPGRADE-MIGRATION-RUNBOOK.md`

## 6. 节点状态契约

```text
PLANNED → READY → IMPLEMENTING → REVIEW → ACCEPTED
                         └────────→ BLOCKED
```

依赖节点未 `ACCEPTED` 时不应把下游公开 API 视为稳定。上游同步/runner 不可用时允许标记 `BLOCKED`，但禁止用“理论上应该通过”替代测试结果。

## 7. rc.8 后新增工程不变量

1. `render-service` 持有 React application root；Canvas 不修改其私有挂载实现。
2. `ui-layout` 只持有布局/region/overlay，不持有 Canvas semantic authority。
3. `ui-canvas` 通过正式 dynamic client plugin + slot/service 进入应用。
4. `conversation.view` 可以继续作为 Canvas UI composition seam；Composer 仍属于 Conversation。
5. Canvas durable authority 仍是 Session Log + CanvasService。
6. `canvas/change` 继续作为 required/non-ignorable durable Canvas Session event，除非未来有显式 migration。
7. Minimal/Editor 是 Canvas presentation state，不是 Workflow semantic state。
8. Browser 不复制 Host Node/Provider catalog 真源。
9. 自定义节点采用 open-world registry；Domain/Migration 不维护 built-in node type whitelist。
10. Media binary 不进入 Session/Event/Projection/Typert JSON，只保存 Asset/Attachment refs。
11. Workflow Engine 不依赖 Browser、React、WebSocket、Session UI 或 Provider SDK。
12. Agent Tool、UI Action、Slash Command 最终必须收敛到同一 Canvas Domain command semantics。
13. Provider/Executor 不直接发布 Canvas durable state；commit point 由 Canvas/Run service 管理。
14. Canvas settings 复用 Harness settings/schema；credential 保持 Host-only。
15. 每次上游升级必须更新可复现 upstream SHA 和 compatibility status。

## 8. 推荐执行顺序

新增迁移节点插在现有 N11 与 N12 之间：

```text
... → N10 → N11 → N11.5 → N12 → N13 → N14 → ... → N25
```

N11.5 不推翻 N01-N11；它负责把已经形成的 Canvas 业务能力迁入 rc.8 的 dynamic client/runtime 基线。

## 9. 每节点实施步骤

1. 读取根/目标目录 `AGENTS.md`。
2. 读取 upstream baseline 与兼容策略。
3. 复核所有依赖节点公开 API。
4. 实现时优先使用 Harness 当前 service/slot/plugin seam。
5. 提交前记录文件清单、测试命令、真实测试结果、未解决事项。
6. 若改变跨节点不变量，先更新对应工作计划文档。
7. 若涉及官方升级，执行 `UPGRADE-MIGRATION-RUNBOOK.md`。

## 10. 测试要求

- [ ] 节点 DAG 无环。
- [ ] 每个后续节点都有独立验收标准。
- [ ] N11.5 成为 N12 前置 gate。
- [ ] rc.8 相关节点存在 dynamic plugin / REAL composition 验证要求。

## 11. Definition of Done

- [ ] typecheck/lint/build（按仓库对应命令）有真实结果。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] upstream baseline 与代码现实一致。
- [ ] 没有未说明架构偏差。

## 12. 风险与禁止项

- 禁止为了减少升级冲突而冻结在旧 Harness Web shell。
- 禁止在官方核心保护区长期堆 Canvas 特判。
- 禁止 runner 不可用时写“PASS”。

## 13. 验收输出

验收至少输出：文件清单、关键接口判断、测试证据、REAL composition/E2E、已知问题、`ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED`。

## 14. 实施指令示例

`实施 N11.5`、`验收 N12`、`按 rc.8 重新检查 N07`。
