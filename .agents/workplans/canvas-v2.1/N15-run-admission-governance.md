# N15 — Run Admission、Quota/Cost、Feature、权限与并发治理

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

在创建任何收费/长耗时 Provider task 前完成完整准入检查，防止非法、超额或不支持的执行进入后台。

## 2. 前置依赖

`N04, N09, N13, N14`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- Authorization。
- static/runtime validation。
- Asset availability。
- Model resolution。
- Provider availability。
- Session/global/provider concurrency。
- Quota/Cost seam。
- Approval seam。
- Idempotency precheck。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/canvas/src/admission.ts`
- `相关 config/tests`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

固定准入顺序：

```text
Authorization
→ Static Validation
→ Runtime Validation
→ Asset Availability
→ Model Resolution
→ Provider Availability
→ Concurrency/Backpressure
→ Quota
→ Cost Estimate
→ Approval
→ Idempotency
→ Start
```

失败不得创建 Provider task。

## 7. 实施步骤

1. 实现 admission result/error 分类。
2. 接 N04 authorization。
3. 接 N09 feature flags。
4. 接 N13 resolver。
5. 定义 CanvasQuotaService seam，可先默认允许。
6. 定义 estimated usage/cost DTO。
7. 实现 per-session active run 限制。
8. 预留 global/provider semaphore/queue。
9. 实现 queue capacity 和 timeout 配置。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] permission deny 不调用 Provider。
- [ ] unsupported model 不调用 Provider。
- [ ] quota deny 不调用 Provider。
- [ ] provider concurrency full → queued/拒绝符合配置。
- [ ] queue timeout。
- [ ] strict feature disabled。

## 10. 验收标准

- [ ] 任何 Provider task 都有明确 admission 证据。
- [ ] 浏览器与 Agent 的 Run 都无法绕过治理。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 只在 Agent Tool 做费用/审批，Browser Remote 会绕过；必须 Host 下沉。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N15`、`检查 N15`、`验收 N15` 或 `修复 N15 验收问题`。
