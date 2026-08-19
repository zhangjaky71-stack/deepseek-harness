# N18 — Agent Canvas Tools、Intent Semantics 与 Canvas Read/Inspect

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

让 Harness Agent 通过稳定、低上下文开销的工具控制同一个 Canvas，并正确区分修改、重生成、变体和新方案。

## 2. 前置依赖

`N08, N16, N17`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- canvas_read。
- canvas_inspect。
- canvas_generate。
- canvas_write_workflow。
- canvas_edit_workflow。
- canvas_run。
- canvas_cancel。
- Agent Preset composition。
- 自然语言 intent 语义。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/tool-canvas/**`
- `packages/preset/agent-presets/** 对应 preset`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

默认语义：

```text
“修改/调整/改成”       → edit current workflow
“重新生成/再生成一次” → same workflow, new run
“再来一版/另一个方案” → create Variant
“从头做/新建”         → new workflow/root variant
```

工具只调用 CanvasService，不直接 Provider/Attachment/Jobs/Session append。

## 7. 实施步骤

1. 实现 read summary，避免默认返回大 Workflow。
2. 实现 inspect 特定 nodes/full detail。
3. generate 使用 Host 内建标准模板构建合法 workflow。
4. write/edit 带 workflowRevision CAS。
5. tool execution 使用 `exec.agent`。
6. Interaction Context 中 selection 进入模型可理解上下文。
7. 把 tool-canvas 放目标 Agent Preset，不放 Web 全局模型工具平面。
8. Tool result 返回 runId/revision 等短结果。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] Agent generate → Canvas output。
- [ ] 人工修改后 canvas_read 能看到。
- [ ] selected asset + “这张”被正确使用。
- [ ] stale edit 后 Agent 可重新 read。
- [ ] tool 不直接调用 Provider。

## 10. 验收标准

- [ ] Agent 和 Browser 真正共享同一 Domain。
- [ ] 大型 Workflow 默认不会完全塞入模型上下文。
- [ ] 自然语言连续创作行为稳定。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 系统 prompt 写大量 Provider 细节；优先用 tool schema + registry 摘要。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N18`、`检查 N18`、`验收 N18` 或 `修复 N18 验收问题`。
