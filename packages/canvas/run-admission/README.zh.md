# `@deepseek-ai/dsh-canvas-run-admission`

[English](README.md) | 中文

Canvas Media Run 的 Host-only、transport-independent pre-start governance。本包实现 N15，是 N16 创建 durable Run/Job 或 N14 启动收费 Provider operation 之前的强制 gate。

当前上游集成目标：Harness `dsh@0.1.1-rc.2`。

## Admission 证明什么

成功 permit 证明一条 exact Workflow execution intent 已经通过当前 Host authorities：

```text
request/abort/idempotency-key shape
→ exact WorkflowRef/value consistency
→ canvas.run authorization
→ immutable workflow snapshot
→ N12 validate + deterministic plan
→ current scheduled features
→ partial boundary type + asset availability
→ N13 model resolution
→ N14 Provider runtime availability
→ cost estimate
→ quota
→ approval
→ durable idempotency precheck
→ concurrency acquire LAST
→ permit
```

本包内部不创建 Provider operation、durable Run、Job 或 Canvas Session event。

## Request 契约

`CanvasRunAdmissionRequest` 携带目标 Session、Host-minted access provenance、exact `WorkflowRef`、与其匹配的 `MediaWorkflow`、optional partial-run selection/boundary values、每个 scheduled Provider node 的 model request、idempotency key 与 optional cancellation signal。

Caller不能提供一个 Workflow identity，却提交另一份 Workflow value。0.1.1-rc.2 Session Projection迁移时，Host integration还必须证明该 ref/value pair来自authoritative current revision，而不是Browser任意拼出的stale pair。

## Permit 契约

`CanvasRunAdmissionPermit` 包含 immutable evidence：

- exact WorkflowRef 与 Workflow value；
- deterministic N12 execution plan；
- Host access provenance；
- exact N13 resolutions/execution identities；
- stable resolved Provider ids；
- checked cost estimate；
- idempotent concurrency lease。

N16必须消费这些exact identities；start前不得重新读取latest Workflow或重新resolve另一个Model/Provider。

## Governance Ports

Deployment composition显式提供：

- existing input asset availability；
- cost estimation；
- quota；
- approval；
- durable idempotency precheck；
- global/session/provider concurrency 与 queueing。

Admission coordinator不存在silent default allow。

## Asset 边界

Partial-run boundary media value携带stable Canvas AssetRef。Image ref最终通过同步后的 Harness Attachment authority解析；`RequestImageAttachment`、request `variantId`、cache path或remote Files identity不是durable boundary asset。Video ref由N21提供。

## Concurrency

Concurrency最后 acquire，避免 model resolution、quota check、user approval 期间占用稀缺run/provider slot。Permit handoff后lease由N16拥有，任何terminal或failed-start path都必须release；release幂等。

## Failure 语义

Failure使用稳定 `CANVAS_RUN_*` code。Permit前任何拒绝都不能产生Provider/Run/Job/Session side effect。内部policy/provider异常要normalized；Browser/Agent surface不能依赖底层任意 `Error.message`。

## Upstream Revalidation

Coordinator/order/evidence设计继续保留。0.1.1-rc.2迁移必须重新接：

- N04 authorization到current Session/Remote exposure model；
- N09 feature到同步后的Settings/capability authority；
- Image asset availability到official Attachment-backed ref；
- package/build/generated outputs到当前repository gates。

参考 `.agents/workplans/canvas-v2.1/N15-run-admission-governance.md` 与 N16。