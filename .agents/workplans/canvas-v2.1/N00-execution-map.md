# N00 — 工程实施总图与节点契约

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

把整套 Canvas 项目变成可逐节点实施、逐节点验收、可中断后继续的工程计划，并冻结节点编号、依赖关系和交付约定。

## 2. 前置依赖

`无`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- 定义所有节点编号、依赖 DAG、推荐 PR 边界和执行顺序。
- 定义每个节点统一的 Definition of Ready / Definition of Done。
- 规定跨节点公共架构不变量，以及何时允许修改已冻结接口。
- 规定开发记录、测试证据、验收记录、偏差记录的保存方式。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `docs/canvas/（建议后续将本套文档落入仓库）`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

节点状态统一使用：

```text
PLANNED → READY → IMPLEMENTING → REVIEW → ACCEPTED
                         └────────→ BLOCKED
```

每个节点只有在其依赖节点 `ACCEPTED` 后才进入 `READY`；紧急并行开发必须明确写出临时假设。

## 7. 实施步骤

1. 建立节点台账，记录 node id、branch/PR、owner、状态、开始/完成日期。
2. 实现前读取仓库根 `AGENTS.md`、`packages/AGENTS.md` 以及目标目录更近的 `AGENTS.md`。
3. 每个节点实现前先复核依赖节点公开 API，避免沿用过时草案。
4. 每个节点提交时附带：实现摘要、文件清单、测试命令、测试结果、未解决事项。
5. 任何偏离 V2.1 的架构决策必须写 ADR/偏差记录，不能只存在聊天里。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] 确认索引中的全部依赖无环。
- [ ] 确认每个后续节点都有独立验收标准。

## 10. 验收标准

- [ ] 可以只通过节点编号唯一定位开发范围。
- [ ] 每个节点明确依赖、输出、测试、验收和下一节点。
- [ ] 不存在必须同时完成多个节点才能判断单个节点是否完成的模糊定义。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 节点过大导致 PR 难评审；解决：按本索引进一步拆子 PR，但不改变节点验收边界。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N00`、`检查 N00`、`验收 N00` 或 `修复 N00 验收问题`。
