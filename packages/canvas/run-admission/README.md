# `@deepseek-ai/dsh-canvas-run-admission`

English | [中文](README.zh.md)

Host-only, transport-independent pre-start governance for Canvas media runs. This package implements N15 and is the mandatory gate before N16 may create a durable Run/Job or N14 may start a chargeable Provider operation.

Current upstream integration target: Harness `dsh@0.1.1-rc.2`.

## What admission proves

A successful permit proves that one exact workflow execution intent passed the current Host authorities:

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

No Provider operation, durable Run, Job or Canvas Session event is created inside this package.

## Request contract

`CanvasRunAdmissionRequest` carries the target Session, Host-minted access provenance, an exact `WorkflowRef`, the matching `MediaWorkflow`, optional partial-run selection/boundary values, per-scheduled-provider-node model requests, an idempotency key and optional cancellation signal.

The caller may not provide one workflow identity while supplying a different workflow value. During the 0.1.1-rc.2 Session Projection migration, the Host integration must additionally ensure that the ref/value pair is the authoritative current revision rather than an arbitrary Browser-composed stale pair.

## Permit contract

`CanvasRunAdmissionPermit` contains immutable evidence:

- exact workflow ref and workflow value;
- deterministic N12 execution plan;
- Host access provenance;
- exact N13 resolutions/execution identities;
- stable resolved Provider ids;
- checked cost estimate;
- an idempotent concurrency lease.

N16 must consume those exact identities. It must not re-read the latest workflow or re-resolve a newer model/provider before starting.

## Governance ports

Deployment composition supplies explicit ports for:

- existing input asset availability;
- cost estimation;
- quota;
- approval;
- durable idempotency precheck;
- global/session/provider concurrency and queueing.

There is no silent default-allow implementation in the admission coordinator.

## Asset boundary

Partial-run boundary media values carry stable Canvas AssetRefs. Image refs ultimately resolve through the synchronized Harness Attachment authority; `RequestImageAttachment`, request `variantId`, cache paths or remote Files identities are not durable boundary assets. Video refs are supplied by N21.

## Concurrency

Concurrency is acquired last so model resolution, quota checks and user approval do not occupy scarce run/provider slots. N16 owns the lease after permit handoff and must release it on every terminal or failed-start path. Release is idempotent.

## Failure semantics

Failures use stable `CANVAS_RUN_*` codes. Any rejection before permit returns with no Provider/Run/Job/Session side effect. Internal policy/provider errors are normalized; Browser/Agent surfaces should not depend on arbitrary underlying `Error.message` text.

## Upstream revalidation

The coordinator/order/evidence design is retained. The 0.1.1-rc.2 migration must reconnect:

- N04 authorization to the current Session/Remote exposure model;
- N09 features to the synchronized Settings/capability authority;
- image asset availability to official Attachment-backed refs;
- package/build/generated outputs to the current repository gates.

See `.agents/workplans/canvas-v2.1/N15-run-admission-governance.md` and N16.