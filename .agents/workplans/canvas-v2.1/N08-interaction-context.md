# N08 — Canvas Interaction Context 与自然语言指代（rc.8 Revision）

## 1. 节点目标

让 Agent 在发送当前用户 turn 时获得准确的 Canvas selection/focus 快照，从而理解“这个 / 这张 / 这里 / 这一段”，并与 rc.8 Session/Client plugin 生命周期兼容。

## 2. 前置依赖

`N07`

## 3. 本节点范围

- CanvasInteractionContext。
- selectedNodeIds / selectedEdgeIds / selectedAssets。
- focusedOutput。
- CanvasRegionSelection seam。
- workflowRevision。
- session-scoped context builder。
- 用户发起 Agent turn 时的一次性采样。

## 4. 明确不在本节点处理

- Interaction Context 不写入 Workflow。
- 不把 selection 作为 durable Session event。
- 不解析 Agent 输出文本来猜 Canvas selection。

## 5. 预计代码位置

- `packages/client/ui-canvas/**`
- Harness 当前 prompt/request context extension seam

## 6. 核心契约

```text
Interaction Context
= 当前 turn 的 transient UI snapshot
≠ durable Workflow state
≠ Session Projection
```

必须携带 `workflowRevision`。Agent 如果发现 revision 已过期，应先 `canvas_read/inspect`。

rc.8 下现有 `canvas/change` 仍是 durable Canvas Session event；Interaction Context 与它是两个不同层级，不得合并。

## 7. 实施步骤

1. 定义 DTO。
2. Editor/Minimal 把 selection/focused output 写入同一 session-scoped presentation store。
3. 发送 user message 时通过官方当前 request/context seam 注入。
4. Agent instructions 明确代词优先解释 selection。
5. session switch/dispose 清空 presentation context。
6. stale revision 触发重新 read，而不是 silent edit。

## 8. 测试要求

- [ ] node A + “修改这个”指向 A。
- [ ] 第 3 张 output + “用这张做视频”指向正确 AssetRef。
- [ ] 无 selection 时不虚构 target。
- [ ] session 切换不泄漏上一 session selection。
- [ ] plugin dispose/reload 不复用 stale context。
- [ ] context 不产生 `canvas/change`。

## 9. 验收标准

- [ ] 自然语言指代与 Canvas 当前选择打通。
- [ ] 不污染 Session Domain。
- [ ] 跨 session/revision 安全。
- [ ] 不依赖 rc.7 Web shell 私有 send path。

## 10. Definition of Done

- [ ] typecheck/lint/build。
- [ ] request-context integration test。
- [ ] session isolation/disposal test。

## 11. 风险与禁止项

禁止把 UI selection 持久化到 Workflow/Session 以图省事。
