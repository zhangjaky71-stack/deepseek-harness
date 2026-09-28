# N07 — Canvas UI Shell、Minimal/Editor 与产品状态机

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

把 Canvas 作为 `conversation.view` 接入 Web，会话 Composer 保持可用，并用统一产品状态机驱动 Minimal/Editor 行为。

## 2. 前置依赖

`N05, N06`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- `ui-canvas` package。
- `conversation.view` slot。
- CanvasView / MinimalCanvas / WorkflowEditor shell。
- EMPTY/READY/DIRTY_READY/RUNNING/COMPLETED/FAILED/CANCELLED/INTERRUPTED UI。
- SaveStatus skeleton 与移动端策略。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/client/ui-canvas/**`
- `packages/bundle/web-app/cordis.patch.yml`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

模式：

```text
Minimal / Editor
=
UI-local preference
```

不会产生 Canvas workflow mutation。

Composer 继续属于 Conversation Shell，不创建第二个 Canvas Chat。

## 7. 实施步骤

1. 按 ui-trajectory 模式注册 `conversation.view`。
2. 按 ui-goal 模式从 session binding/projection 读取 `canvas`。
3. 实现 Minimal / Editor mode store。
4. 根据产品状态机控制 Run/Cancel/Retry/结果显示。
5. 加入 SaveStatus 占位，为 N11 Draft/Autosave 接入。
6. 窄屏默认 Minimal；Editor 可以全屏/简化进入。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] Canvas tab 可见。
- [ ] 切模式不产生 Session Event。
- [ ] RUNNING 只显示 Cancel，不允许重复 Run。
- [ ] DIRTY_READY 保留旧结果并提示工作流未运行修改。
- [ ] Composer 在 Canvas view 下仍存在。

## 10. 验收标准

- [ ] UI 不维护第二份 authoritative Canvas。
- [ ] Minimal/Editor 显示同一 Projection。
- [ ] 所有产品状态有明确 UI。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- UI 自己拼业务状态；优先复用 N01 derive function 或同构规则。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N07`、`检查 N07`、`验收 N07` 或 `修复 N07 验收问题`。
