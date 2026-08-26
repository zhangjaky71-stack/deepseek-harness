# N03 — Canvas Event Sourcing、Fold、CanvasService 与原子提交

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.2 + Harness rc.8 compatibility revision  
> 状态：`REVIEW — source remediation complete, repository validation pending`  
> 文档性质：工程实施节点文档  
> 总原则：Session log 是 Canvas 唯一 durable authority；cache、Projection、Browser state 都只能由已提交 Session event 派生。

## 1. 节点目标

建立不可绕过的 Canvas Host 写入边界，保证：

- exact-live Agent + exact-live Session 才能通过 CanvasService 读写；
- 每个业务 mutation 先在 detached Fold state 上完整 preflight，再进入 Session commit point；
- Session cold replay 与 live cache 收敛到同一 Canvas；
- workflowRevision 与 runRevision 独立；
- Run durable vocabulary 足以支撑 N16 的 queued/running/completed/failed/cancelled/interrupted，而 N03 不实现 Job/Provider；
- 直接 `Session.append('canvas/change', ...)` 也不能绕过 durable stream invariant、current audit metadata 与敏感字段边界。

## 2. 前置依赖

`N01, N02`

N01/N02 未正式 ACCEPTED 前，本节点保持 REVIEW。

## 3. 本节点范围

- `canvas/change` full post-change snapshot event。
- `decodeCanvasChange` / `applyCanvasChange` / `applyCanvasEvent` / `foldCanvas`。
- `CanvasFoldState` 的 CanvasId / RunId Session-wide identity tracking。
- `CanvasService` Session-backed cache、sync、authorization entry、CAS、preflight、commit。
- Workflow operation batch 原子应用与 semantic no-op suppression。
- `get/create/replace/edit/selectOutput/clear` 等不涉及执行后端的 mutation。
- Durable Run transition vocabulary：`run-start` + current `run-update`；历史 `run-complete` 只保留 replay compatibility。
- package invariant 的 live-writer contract：meta v2、敏感 workflow config 拦截、legacy writer vocabulary 拒绝。

## 4. 明确不在本节点处理

- Provider SDK、Job queue、retry/backoff、cancel propagation、startup reconciler：N16。
- Node Definition/Executor 可执行性：N10/N12。
- Browser current-state Projection ownership：N05。
- Remote transport/generation artifacts：N06 / N11.5。
- Run-history DTO 扩展（例如 canvasId）：N06/N19。
- workflow/event 容量、配额、backpressure：N15/N24/N25。
- `SOURCE-V2.1-*` 历史设计快照不得改写。

## 5. 实际代码位置

- `packages/canvas/canvas/src/events.ts`
- `packages/canvas/canvas/src/fold.ts`
- `packages/canvas/canvas/src/runtime.ts`
- `packages/canvas/canvas/src/invariant.ts`
- `packages/canvas/canvas/src/audit.ts`
- `packages/canvas/canvas/tests/service.spec.ts`
- `packages/canvas/canvas/tests/fold.spec.ts`
- `packages/canvas/canvas/tests/invariant.spec.ts`
- `packages/canvas/canvas/tests/authorization.spec.ts`

## 6. Session commit point（rc.8/current Session）

当前 Harness Session append 顺序是本节点的正式基础：

```text
CanvasService builds candidate
        ↓
clone CanvasFoldState
        ↓
applyCanvasChange(candidate)      ← Service-owned preflight
        ↓
Session.append(...)
        ↓
internal/dispatch                ← synchronous pre-commit veto / invariant
        ↓
Session log push                 ← durable logical commit point
        ↓
session/event                    ← post-commit observe-only notification
        ↓
CanvasService sync/cache
Projection/persistence observers
```

约束：

1. Service cache 不得在 log push 前更新。
2. `session/event` listener failure 不得回滚已提交 log。
3. invariant 是防御 direct append 的第二道边界，不替代 CanvasService 自己的 transition preflight。
4. CanvasService 必须验证：

```text
ctx.agents.get(agent.id) === agent
AND
ctx.sessions.get(agent.session.id) === agent.session
```

仅注册了 Agent、但 Session 是 `Session.create()` detached object，不属于合法 durable write path。

## 7. `canvas/change` 当前契约

```ts
interface CanvasChange {
  kind: 'canvas/change'
  version: 1
  operation:
    | 'create'
    | 'workflow-edit'
    | 'workflow-replace'
    | 'run-start'
    | 'run-update'
    | 'run-complete' // historical replay compatibility only
    | 'output-select'
    | 'clear'
  canvas: CanvasSnapshot | null
  meta: CanvasChangeMeta
}
```

当前 writer：

```text
meta.schemaVersion = 2
actor + source required
```

历史 replay：

```text
meta v1 readable
meta v2 readable
legacy run-complete readable
```

新的 pre-commit writer：

```text
meta v1              → reject
run-complete          → reject; use run-update
credential/binary key → reject
```

因为仓库仍处于 pre-release Canvas 协议开发阶段，本轮保留 `canvas/change.version = 1` 并修正 operation vocabulary；正式兼容冻结前由 N11.5/N25 再确认 envelope-version policy。

## 8. Revision 与 Run 不变量

### Workflow mutation

```text
workflowRevision = previous + 1
runRevision      = unchanged
run/output       = unchanged
workflow.id      = unchanged
```

若最终 semantic workflow 与当前 workflow deep-equal：

```text
return current
no append
no revision bump
```

### Run start

```text
runRevision      = previous + 1
workflowRevision = unchanged
new RunId        = Session-wide unique
status           = queued | running
run.workflowRevision = current workflowRevision
```

### Run update

```text
same RunId
same workflowId/workflowRevision/startedAt
runRevision = previous + 1
workflowRevision unchanged
```

允许：

```text
queued  → queued | running | completed | failed | cancelled | interrupted
running → running | completed | failed | cancelled | interrupted
```

禁止：

```text
running → queued
terminal → any later lifecycle mutation
RunId reuse anywhere in same Session
```

`completed` 必须同时发布属于该 run 的 output；其它 terminal 状态不得篡改已有 successful output。

## 9. Workflow CAS 与 clear

`WorkflowRef`：

```ts
{
  canvasId,
  workflowId,
  workflowRevision,
}
```

错误分类：

```text
canvasId mismatch        → CANVAS_NOT_FOUND
workflowId mismatch      → CANVAS_WORKFLOW_ID_MISMATCH
workflowRevision mismatch→ CANVAS_STALE_WORKFLOW_REVISION
```

`runRevision` 不进入 workflow CAS。

`clear` 是 destructive mutation，必须同样提交 `WorkflowRef`，并且：

```text
queued/running run
→ clear rejected
→ 先由后续 Run layer cancel/interrupted 并 durable terminal
→ 再 clear
```

避免 Provider/Job 仍运行而 Canvas owner 已被 tombstone 掉。

## 10. Authorization 与安全边界

CanvasService mutation 通过 N04 Host authorization。

当 create 携带 `currentVariantId` 时必须同时满足：

```text
canvas.edit
canvas.variant.create
```

此外 package invariant 在 live Session precommit 重新检查 Workflow audit-safe 约束，防止其它 Host plugin 绕过 CanvasService 直接 append：

- Authorization/API key/token/credential/password 等字段禁止；
- base64/dataUrl/blob/raw binary-shaped 字段禁止；
- 错误不得回显 secret value。

## 11. 原子编辑

```text
clone current workflow
→ apply operations[]
→ validate complete graph
→ audit-safe validation
→ semantic equality check
→ construct one post-change CanvasSnapshot
→ detached fold preflight
→ append one canvas/change
→ sync cache from committed Session
```

任何步骤失败：

```text
Session seq unchanged
Canvas cache unchanged
cold replay unchanged
```

## 12. 测试要求

- [x] cold replay 与 live cache 语义一致（源码测试已写；runner 尚未验证）。
- [x] operation batch 失败不部分落盘。
- [x] semantic no-op 不 bump revision / 不 append。
- [x] workflow CAS 忽略 runRevision。
- [x] identity / workflow identity / revision 错误分类。
- [x] exact-live Agent + Session；detached Session 被拒绝。
- [x] Session precommit veto 后 cache/log 不变。
- [x] Run terminal 四态可 replay。
- [x] running→queued 被拒绝。
- [x] RunId Session-wide 不可复用。
- [x] active run 不能 clear；clear 使用 WorkflowRef CAS。
- [x] direct append 无法绕过 meta v2 / sensitive workflow invariant。
- [x] historical meta v1 / run-complete 仍可 cold replay。
- [ ] repository-pinned Vitest/typecheck/lint/build/coverage 实际执行。

## 13. 验收标准

- [ ] 所有业务 writer 都以 CanvasService/后续统一 command layer 为入口。
- [ ] Session log 是唯一 durable Canvas authority。
- [ ] Service 在没有 invariant companion 时仍不会生成非法 transition。
- [ ] direct Session append 在 invariant 启用时无法绕过安全/transition contract。
- [ ] workflow/run revisions 和 identity monotonicity 可证明。
- [ ] 没有 active-run tombstone orphan path。
- [ ] repository-pinned validation 有真实证据。

## 14. Deferred / 不应在 N03 偷做

以下为已知但明确延后：

- RunHistory DTO 是否增加 canvasId → N06/N19。
- full snapshot / operation batch size limits → N15/N24/N25。
- timestamp 允许相等；ordering 由 Session seq authority 保证 → 不作为 N03 blocker。
- pnpm-lock、module graph、Typert generated artifacts、正式 rc.8 composition regeneration → N11.5。

## 15. Definition of Done

源码/测试/文档 remediation 已完成，但在以下真实命令/runner 证据完成前保持 `REVIEW`：

- package tests；
- repository typecheck/lint/build；
- invariant/REAL composition tests；
- generated artifact/lock/module graph consistency；
- N01/N02 正式验收。

不得把静态审阅描述成“测试已通过”。
