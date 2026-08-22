# N16 — Durable Run Lifecycle、Jobs、Retry / Cancel（0.1.1-rc.2 Revision）

Status: `PLANNED`

## 1. 目标

消费 N15 admission permit，创建 durable Canvas Run / Job lifecycle，驱动 N12/N14 execution，处理 retry/cancel/crash/reconciliation，并保证 exact workflow/model/provider identity不会在 admit→start间漂移。

## 2. 依赖

`N12, N14, N15`

## 3. Permit consumption

N16只能使用 permit evidence中的：

- exact `WorkflowRef`；
- immutable Workflow；
- N12 plan；
- exact N13 execution identities/resolutions；
- checked cost/access provenance；
- providerIds。

禁止 start前重新读取“最新 Workflow”或重新 model resolve。

## 4. Durable lifecycle

建议状态机显式区分：

```text
ADMITTED → STARTING → RUNNING
                 ├→ SUCCEEDED
                 ├→ FAILED
                 ├→ CANCELLED
                 └→ INTERRUPTED / RECOVERING
```

具体枚举与已有 N01 domain保持一致。所有 terminal transition幂等并有 revision/CAS。

## 5. Jobs integration

实施前必须重新读取 0.1.1-rc.2 最新 Jobs package/command/UI contracts；Canvas不得冻结旧 rc.8 Job API。Job是执行/后台工作呈现，不取代 Canvas Run durable authority。

## 6. Concurrency lease

N15 permit lease由 N16接管：

- start失败也释放；
- terminal成功/失败/取消释放；
- duplicate callback/reconciliation重复释放安全；
- retry若代表新 execution attempt，需要明确是复用同 run attempt还是重新 admission/lease，不得暗中超额。

## 7. Idempotency

N16实现 N15 `CanvasRunIdempotencyPolicy` 的 durable authority，确保相同 logical request不会产生多个收费 Provider operation。

## 8. Retry

Retry必须定义：

- retry whole run vs selected failed node；
-是否需要重新 N15 admission（通常新的收费 attempt需要重新检查 feature/quota/provider availability）；
- workflow是否保持原 admitted snapshot；
- deterministic/cache-safe nodes是否复用；
- attempt provenance。

默认不得把 retry静默升级到最新 Workflow。

## 9. Cancel/race

覆盖：cancel-before-start、cancel-during-provider、provider-completes-while-cancel、late callback、process restart。最终 durable state只能由幂等 reconciliation规则决定。

## 10. 测试

- exact permit consumption；
- no latest-workflow TOCTOU；
- provider start only after durable run/start commit point定义成立；
- lease release every path；
- idempotency duplicate；
- retry admission/attempt semantics；
- cancel/completion race；
- crash/restart reconciliation；
- latest Jobs integration focused/REAL tests。

## 11. 验收

N11.5必须关闭 P0 upstream realignment，N15 exact permit contract通过后再实现本节点。
