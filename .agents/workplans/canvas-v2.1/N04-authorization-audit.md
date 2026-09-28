# N04 — Authorization、Actor、Audit 与敏感数据边界

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

让 Remote、Agent Tool、History、Asset Route 使用统一 Host 权限模型，并能追踪每次 mutation 的操作者与来源。

## 2. 前置依赖

`N03`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- CanvasAuthorizationService seam。
- CanvasPermission action 集。
- CanvasActor、CanvasChangeMeta。
- human/agent/system actor。
- 日志脱敏与敏感字段禁止范围。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/canvas/src/authorization.ts（或按仓库习惯落位）`
- `packages/canvas/canvas/src/types.ts`
- `packages/canvas/canvas/tests/authorization.test.ts`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

至少覆盖：

```text
canvas.read
canvas.edit
canvas.run
canvas.cancel
canvas.history.read
canvas.asset.read
canvas.asset.export
canvas.asset.delete
canvas.workflow.restore
canvas.variant.create
canvas.layout.write
```

所有安全决定 Host enforce。

## 7. 实施步骤

1. 定义 authorization request/decision。
2. 先提供符合当前单用户环境的默认实现，但保留严格 seam。
3. CanvasService mutation 接入权限检查。
4. CanvasChange meta 记录 actor/source/requestId/correlationId。
5. 规定 API key、Authorization header、callback secret、binary 永不进入日志/Session。
6. 为后续 Remote/Tool/Asset Route 写明确接入点。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] read allow/edit deny。
- [ ] agent run allow/human run deny 的可配置测试。
- [ ] system reconciler actor 能被 audit 识别。
- [ ] 日志/序列化对象不包含 credential。

## 10. 验收标准

- [ ] UI 隐藏按钮不是唯一权限控制。
- [ ] Canvas mutation 都有 actor/source。
- [ ] 后续节点可以复用同一 authorization seam。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 权限逻辑分散到 UI、Tool、Asset 三套实现；必须统一。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N04`、`检查 N04`、`验收 N04` 或 `修复 N04 验收问题`。
