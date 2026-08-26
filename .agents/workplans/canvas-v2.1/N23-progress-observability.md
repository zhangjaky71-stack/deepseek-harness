# N23 — 实时 Progress、Observability、Metrics 与诊断链路（rc.8 Revision）

## 1. 节点目标

让用户看到真实运行阶段，让工程师能从 Session 一路追踪到 WorkflowRun、NodeRun、Provider request，同时保证 dynamic client subscription/disposal 和 reconnect 正确。

## 2. 前置依赖

`N16, N20, N22`

## 3. 本节点范围

- `canvas/run-progress` ephemeral event。
- Remote/client event forwarding allowlist。
- ui-canvas progress store。
- structured logs / trace / metrics。
- correlation/request references。

## 4. 核心关联链

```text
sessionId
  → canvasId
  → workflowId + workflowRevision
  → workflowRunId
  → nodeRunId
  → providerRequestId/providerTaskId
  → correlationId/requestId
```

高基数 ID 用于 log/trace，不作为普通 metrics label。

## 5. Durable vs Ephemeral

Progress 是 ephemeral，不每个百分点写 Session。terminal Run state 必须 durable。

Provider 没真实百分比时显示 phase/spinner，不制造假数字。

## 6. 实施步骤

1. progress DTO 显式包含 session/canvas/workflowRun/nodeRun 关联字段。
2. event forwarding allowlist。
3. ui-canvas dynamic plugin 订阅；session switch/dispose 后清理。
4. terminal Projection 到达后移除 transient progress。
5. structured logging 统一字段。
6. telemetry 覆盖 queue/provider/asset/retry/failure/cancel/interrupted。
7. UI error 只显示安全 reference。

## 7. 测试要求

- [ ] 断线丢 progress 不影响 authoritative Run。
- [ ] reconnect 后通过 Projection/Run query 收敛。
- [ ] terminal 后 progress 清理。
- [ ] 无真实百分比不显示伪数字。
- [ ] session switch 不串 progress。
- [ ] ui-canvas dispose 无遗留 subscription。
- [ ] 日志不泄漏 credential/raw provider payload。

## 8. 验收标准

- [ ] 用户能理解当前阶段。
- [ ] 工程师能从 session 定位到 provider request。
- [ ] Progress 不造成 Session 膨胀。
- [ ] dynamic client lifecycle 安全。
