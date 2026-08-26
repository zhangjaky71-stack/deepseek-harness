# N16 — Run Lifecycle、Jobs、Retry、Idempotency、Cancel 与 Reconciler

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

把 Workflow Execution 变成长任务安全运行链路，支持 node-level state、后台 Jobs、取消、重试、Host 重启中断恢复判断。

## 2. 前置依赖

`N12, N14, N15`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- CanvasRunSnapshot / CanvasNodeRunSnapshot 更新。
- JobKindMap media。
- CanvasRunId 与 JobId 分离。
- retry error classification/backoff。
- idempotency。
- cancel race。
- RunReconciler。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/canvas/src/runtime.ts`
- `reconciler.ts`
- `packages/canvas/media-workflow/**`
- `tests/run*.test.ts`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

Run 执行固定 Workflow Snapshot。

Terminal：

```text
completed
failed
cancelled
interrupted
```

terminal → non-terminal 状态回退禁止。

V1 Host restart + jobs-local：

```text
missing job → interrupted
```

## 7. 实施步骤

1. 扩展 JobKindMap `media`。
2. CanvasService startRun 建立 runId，再创建 job。
3. 更新 queued/running/node state/terminal durable milestone。
4. progress 百分比暂不写 Session。
5. Retry 仅针对 transient category，指数退避+jitter。
6. Provider 支持 idempotency 时使用稳定 key。
7. Cancel 调 jobs kill + provider cancel，保证幂等。
8. 实现 startup reconciler 扫描 non-terminal run。
9. 定义 cancel vs late completion 的 terminal winner 规则。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] Browser 关闭 Host run 继续。
- [ ] Cancel 真正传到 Provider。
- [ ] 429 retry。
- [ ] rejected 不 retry。
- [ ] 重复 retry 不创建重复收费 task。
- [ ] Host restart → interrupted。
- [ ] cancel/completion race 状态单调。

## 10. 验收标准

- [ ] Run 生命周期 durable、可解释、可取消。
- [ ] 不会永久 running。
- [ ] workflowRevision 不被 run 状态污染。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 把 progress 每个百分点 append Session；禁止。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N16`、`检查 N16`、`验收 N16` 或 `修复 N16 验收问题`。
