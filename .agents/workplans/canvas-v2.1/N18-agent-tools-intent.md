# N18 — Agent Canvas Tools、Command Bus、Intent Semantics 与 Canvas Read/Inspect（rc.8 Revision）

## 1. 节点目标

让 Harness Agent 通过稳定、低上下文开销的工具控制同一个 Canvas，并让 Agent Tool、Browser UI Action、Slash Command 收敛到同一 Domain command semantics，而不是形成三套业务逻辑。

## 2. 前置依赖

`N08, N11.5, N16, N17`

## 3. 本节点范围

Agent-facing tools：

```text
canvas_read
canvas_inspect
canvas_generate
canvas_write_workflow
canvas_edit_workflow
canvas_run
canvas_cancel
```

Domain command semantics：

```text
canvas.create / canvas.open / canvas.set-mode(presentation only)
workflow.create / workflow.update / workflow.validate / workflow.run / workflow.cancel / workflow.retry
node.create / node.update / node.delete / node.run
asset.attach / asset.unlink / asset.inspect / output.select
```

具体 tool 名可以少于 Domain command 数量；Tool 是 Agent 入口，不是 Domain API 本身。

## 4. 明确不在本节点处理

- Tool 不直接 Provider/Attachment/Jobs/Session append。
- Browser 不监听 tool text 解析 Canvas state。
- 不把完整大型 Workflow 默认塞入模型上下文。
- Agent Teams experimental API 不成为 Canvas V1 必需依赖。

## 5. 目标架构

```text
Agent Tool ──────┐
UI Action ───────┼──► Canvas Domain Command / CanvasService
Slash Command ───┘               │
                                  ├─ durable Canvas Event/Projection
                                  └─ Run Service / N12-N16
```

Browser 最终通过 Projection/Event 看到结果，不因为“Agent 调了 tool”而走旁路。

## 6. Intent semantics

```text
“修改/调整/改成”       → edit current workflow
“重新生成/再生成一次” → same workflow, new run
“再来一版/另一个方案” → create Variant
“从头做/新建”         → new workflow/root variant
```

Interaction Context 的 selection/focused asset 作为当前 turn 指代辅助；stale revision 先 read。

## 7. 实施步骤

1. `canvas_read` 返回摘要而不是全部 DAG。
2. `canvas_inspect` 获取定点 node/asset/full detail。
3. generate 使用 Host registry/template 生成合法 workflow。
4. write/edit 使用 workflowRevision CAS。
5. tool execution 使用统一 actor/audit identity。
6. run/cancel 走 N15/N16，不直调 Provider。
7. tool result 保持短：revision/runId/asset ids/status。
8. Command handler 与 Browser Remote 复用 Domain operation 层。
9. Canvas Event Protocol 作为 Agent/Browser 状态收敛契约。

## 8. rc.8 Compatibility

- 继续使用 Harness 当前 Agent preset/tool composition；不 patch core model transport。
- DeepSeek reasoning transport 修复由官方 runtime 负责，Canvas Tool 不复制 reasoning state。
- Client dynamic plugin 只负责 UI/context，不持有 Agent tool authority。

## 9. 测试要求

- [ ] Agent generate → Canvas output。
- [ ] Browser edit 后 Agent read 可见。
- [ ] selected asset + “这张”正确。
- [ ] stale edit 重新 read。
- [ ] Tool 不直接 Provider。
- [ ] UI 和 Agent 对同一 workflow update 得到相同 revision semantics。
- [ ] tool result 不含 binary/credential/超大 workflow。

## 10. 验收标准

- [ ] Agent 与 Browser 共享同一 Domain。
- [ ] Tool/UI/Slash Command 没有互相分叉的核心业务语义。
- [ ] 自然语言连续创作稳定。
- [ ] Canvas 状态由 Session Projection/Event 收敛。
