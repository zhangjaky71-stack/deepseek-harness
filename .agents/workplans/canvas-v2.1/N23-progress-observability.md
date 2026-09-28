# N23 — 实时 Progress、Observability、Metrics 与诊断链路

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

让用户看到真实运行进度/阶段，让开发者能从 sessionId→runId→nodeId→provider 定位性能与故障。

## 2. 前置依赖

`N16, N20, N22`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- `canvas/run-progress` ephemeral event。
- API remote forwarded allowlist。
- progress UI store。
- structured logs。
- metrics。
- correlationId/requestId。
- 安全 error reference。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/api/remotes/src/remote-events.ts`
- `packages/client/ui-canvas/**`
- `Canvas/Provider logging integration`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

Progress：

```text
ephemeral
```

不写每个百分点到 Session。

Provider 没真实百分比时只显示 phase/spinner，不制造假数字。

## 7. 实施步骤

1. 定义 progress event DTO，显式包含 sessionId/runId/nodeId。
2. 加 forwarded event allowlist。
3. UI 订阅，terminal projection 后清理 progress。
4. 统一结构化日志字段。
5. 接仓库现有 telemetry seam。
6. 指标覆盖 run/queue/provider/asset/retry/failure/cancel/interrupted。
7. metric label 避免 runId 等高基数值。
8. UI 错误显示安全 request/correlation reference。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] 断线丢 progress 不影响 authoritative Run。
- [ ] terminal 后 progress 清理。
- [ ] 无百分比 Provider 不显示伪进度。
- [ ] 日志不泄漏 credential。

## 10. 验收标准

- [ ] 用户可理解当前运行阶段。
- [ ] 工程师能关联一次 Run 的主要阶段耗时。
- [ ] Progress 不造成 Session 膨胀。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 把 correlationId 作为 metric label 导致高基数；只用于 log/trace。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N23`、`检查 N23`、`验收 N23` 或 `修复 N23 验收问题`。
