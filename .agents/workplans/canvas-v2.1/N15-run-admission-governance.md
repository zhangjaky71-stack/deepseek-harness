# N15 — Run Admission / Governance（0.1.1-rc.2 Revision）

Status: `IMPLEMENTING / REVALIDATE`

## 1. 节点目标

在创建任何收费、长耗时、异步 Provider operation / durable Run / Job / Session event **之前**，对一次 exact workflow execution intent完成统一 Host admission，并返回 N16 必须原样消费的一次性 permit/evidence + concurrency lease。

当前实际代码位置：

```text
packages/canvas/run-admission/
@deepseek-ai/dsh-canvas-run-admission
```

旧文档中“主要实现放在 `packages/canvas/canvas/src/admission.ts`”的假设已废弃。

## 2. 前置依赖

`N04, N09, N10, N12, N13, N14`

N16 是 permit/idempotency durable consumer，不是 N15 前置。

## 3. Authority input

`CanvasRunAdmissionAuthorities` 当前组合：

- N04 authorization port；
- N09 restart-applied feature port；
- N10 `MediaNodeRegistry`；
- N13 `MediaModelRegistry`；
- N14 `MediaProviderRuntimeRegistry`；
- deployment governance：asset availability / cost / quota / approval / idempotency / concurrency。

任何 policy 不得 silent default allow。

## 4. Exact request contract

一次 request 至少携带：

```text
sessionId
Host-minted CanvasAccessContext
WorkflowRef { canvasId, workflowId, workflowRevision }
MediaWorkflow value matching the ref
optional partial selection
optional boundaryInputs
per-scheduled-provider-node modelRequests
idempotencyKey
optional AbortSignal
```

N15首先验证 `workflowRef.workflowId === workflow.id`；代码迁移到最新 N05 后还必须确保 request中的 workflow value/ref来自同一 authoritative current revision，而不是 Browser可任意拼装的 stale pair。

## 5. 当前固定 admission 顺序

以当前实现为准：

```text
Abort / basic request + idempotency-key shape
→ Workflow identity consistency
→ N04 Authorization (canvas.run)
→ freeze exact Workflow + WorkflowRef
→ N12 static validation + execution planning
→ N09 scheduled feature checks
→ partial boundary type + asset availability
→ scheduled Provider-backed nodes
→ N13 model resolution
→ N14 Provider runtime availability
→ governance evidence freeze
→ Cost Estimate
→ Quota
→ Approval
→ Idempotency precheck
→ Concurrency acquire LAST
→ return permit
```

**Concurrency 必须最后 reserve**，避免用户审批/配额/model resolve等待期间占用稀缺运行槽位。

## 6. Feature checks

至少覆盖：

- `canvas`；
- partial selection时 `partialRun`；
- exact scheduled node definition所需 feature；
- fallback model selection时 `providerFallback`。

Feature disabled在 Host admission fail closed，不创建 Provider task。

## 7. Boundary assets

Partial Run 跨越 excluded upstream boundary时：

- 每条 boundary edge必须提供 input；
- value kind必须匹配 target exact-version port；
- image/video/mask/list中的每个 stable asset都必须通过 deployment asset availability/authorization-aware policy；
- N17/N21 提供最终 durable implementation。

0.1.1-rc.2 image policy要求 asset availability基于 stable attachment-backed ref；`RequestImageAttachment`/variant id不是 boundary durable asset。

## 8. Model / Provider

对所有 scheduled Provider-backed node：

- model request必须存在且 capability与 node definition一致；
- extra model request拒绝；
- N13 resolve failure稳定映射；
- resolved Provider必须在 N14 runtime registry当前存在；
- execution identities冻结到 permit，N16/N12必须使用这些 exact identities，不能 start前重新 resolve“最新模型”。

## 9. Governance

### Cost

三态：`not-applicable | unavailable | estimated`。Unknown cost不是免费；非法 currency/amount按 unavailable失败。

### Quota

在完整 resolved evidence + cost后判断。Policy throw与 deny都 fail closed。

### Approval

Host-level seam，不属于 Agent或Browser单独所有。UI/Agent可实现交互适配器，但最终 admission只认 policy outcome。

### Idempotency

N15只 precheck；durable idempotency authority由 N16提供。Duplicate必须在 concurrency reserve前拒绝。

### Concurrency

最后跨 global/session/provider ids原子 acquire，并返回 idempotent release lease。N16在 terminal settlement释放；若 permit构建过程中异常，N15立即释放。

## 10. Permit contract

成功返回：

```text
CanvasRunAdmissionPermit
├─ evidence
│  ├─ exact workflowRef
│  ├─ immutable workflow
│  ├─ deterministic N12 plan
│  ├─ access provenance
│  ├─ exact N13 resolutions/execution identities
│  ├─ stable providerIds
│  └─ checked costEstimate
└─ concurrency lease
```

N16不得：

- 重新读取 latest workflow替换 permit workflow；
- 重新选择 model/provider；
- 丢弃 admission evidence后自行重做另一套 permission/quota逻辑；
-忘记在 terminal/failed-start/cancel path释放 lease。

## 11. 0.1.1-rc.2 Revalidation

需要重新接线：

- N04 latest authorization exposure seam；
- N09 latest feature/Settings authority；
- N17 official Attachment-backed image asset availability；
- root package/build/gate graph。

N15 core ordering/permit architecture无需因 Attachment/Client更新而推翻。

## 12. 测试要求

当前已有 tests应覆盖并继续保持：

- permission/policy unavailable；
- invalid workflow/partial boundary；
- feature disabled；
- asset unavailable；
- missing/extra/invalid model request；
- model resolution/provider unavailable；
- cost unavailable/invalid；
- quota deny；
- approval deny/unavailable；
- duplicate idempotency；
- global/session/provider concurrency full；
- queue full/timeout/abort；
- concurrency确实最后 acquire；
- permit evidence immutable/exact。

新增跨 N05/N17/N16 integration：

- stale WorkflowRef不能 start；
- N16使用 exact permit ref/value/identities；
- image boundary ref按 official Attachment authority验证；
-任何 admission失败都没有 Provider operation/Run/Job/Session side effect。

## 13. 验收标准

- 所有 Provider operation都有可追溯 admission permit；
- Browser/Agent/Slash未来路径无法绕过同一 N15；
- exact WorkflowRef消除 admit→start TOCTOU；
- governance fail closed；
- concurrency lease生命周期可证明；
- exact-head repository-pinned tests/gates实际执行。
