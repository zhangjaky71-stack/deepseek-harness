# N08 — Canvas Interaction Context 与自然语言指代

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

让 Agent 能正确理解用户在 Canvas 上选中的节点、边、资产、输出或区域，从而支持“这个 / 这张 / 这里 / 这一段”。

## 2. 前置依赖

`N07`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- CanvasInteractionContext。
- selectedNodeIds / selectedEdgeIds / selectedAssets。
- focusedOutput。
- CanvasRegionSelection seam。
- 用户发起下一次 Agent turn 时采样 UI context。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/client/ui-canvas/src/client/store.ts`
- `packages/client/ui-canvas/src/client/interaction.ts（建议）`
- `Agent request/context 现有扩展点对应文件`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

Interaction Context：

```text
不是 durable Workflow state
不是长期 Projection
是发送当前用户消息时的一次性上下文快照
```

必须带 workflowRevision，便于 Agent 判断上下文是否已经过期。

## 7. 实施步骤

1. 定义 Interaction Context DTO。
2. Editor selection 写入 UI-local store。
3. Minimal focused output/selected candidate 写入同一 context builder。
4. 发送 user message 时把 context 放入现有 Agent request/context seam。
5. Agent tool instructions 明确代词优先解释 selection。
6. 如果 selection 指向过时 revision，Agent 应 `canvas_read` 后再行动。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] 选择 node A 后“修改这个”能把 A 传给 Agent。
- [ ] 选择第 3 张 output 后“用这张做视频”能解析正确 asset。
- [ ] 没有 selection 时不虚构 target。
- [ ] 切换 session 不泄漏上一 session selection。

## 10. 验收标准

- [ ] 自然语言指代和 Canvas 当前选择打通。
- [ ] Interaction Context 不污染 Session Domain。
- [ ] 上下文跨 session 隔离。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 把 UI selection 持久化到 Workflow；禁止。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N08`、`检查 N08`、`验收 N08` 或 `修复 N08 验收问题`。
