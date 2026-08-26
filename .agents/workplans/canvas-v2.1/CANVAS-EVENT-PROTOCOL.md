# Canvas Event Protocol — Session、Workflow、Run 与 Client Projection

## 1. 目标

定义 Agent、Session、CanvasService、Workflow Engine 与 Browser 之间的稳定事件边界，使“实时调用画布”建立在正式 Domain event/projection 上，而不是依赖 UI 内部状态或零散 tool-call 解析。

## 2. 两类消息

### Command

表示“请求系统做某件事”，由 Remote、Agent Tool 或 UI action 发起。

### Event

表示“Host 已经接受并提交的事实”或“运行中的临时通知”。

```text
UI / Agent Tool / Slash Command
          │
          ▼
     Canvas Command
          │
          ▼
 CanvasService / Run Service
          │
          ├─ durable Session Event
          └─ ephemeral Runtime Event
```

## 3. Durable Canvas Events

Durable event 必须可 replay，并能重建当前 Canvas projection。

rc.8/V2.2 当前 wire authority 继续使用：

```text
canvas/change
```

每个已接受的业务 mutation 携带完整 post-change `CanvasSnapshot`；`clear` 携带 null tombstone。若未来拆成更细事件，必须提供 migration/fold 兼容，不能同时创建第二份 authority。

当前 operation vocabulary：

```text
create
workflow-edit
workflow-replace
run-start
run-update
output-select
clear
```

历史 `run-complete` 只作为 N03 早期 Session replay compatibility 保留，不是当前 writer vocabulary。

`run-update` 负责 durable lifecycle milestone：

```text
queued
running
completed
failed
cancelled
interrupted
```

它不代表 Provider progress 百分比；progress 仍属于 ephemeral channel。

## 4. Durable writer / reader compatibility

历史 reader path：

```text
CanvasChange meta v1 → readable
CanvasChange meta v2 → readable
legacy run-complete   → readable
```

当前 live writer path：

```text
meta v2 required
actor/source required
run lifecycle uses run-update
sensitive workflow credential/binary fields rejected precommit
```

可读兼容不意味着旧协议仍可继续写。

## 5. Session Commit Point

```text
build candidate
→ detached fold preflight
→ Session internal/dispatch precommit invariant
→ Session log push = logical commit
→ session/event postcommit observers
→ cache / Projection / persistence consumers
```

任何 Browser/cache state 都不得先于 Session commit 发布。

CanvasService 还必须确认 Agent 与 Session 都是当前 Host registry/store 的 exact live object；detached Session 不能作为 durable mutation target。

## 6. Ordering / Identity / Idempotency

- Workflow semantic mutation：`workflowRevision +1`，`runRevision` 不变。
- Run lifecycle mutation：`runRevision +1`，`workflowRevision` 不变。
- Semantic no-op 不产生 revision/event。
- `CanvasId` 与 `CanvasRunId` 在同一 Session 历史内都不得复用。
- Run terminal 后不得回到 non-terminal。
- `running → queued` 禁止。
- Browser 收到旧 revision event 不得覆盖更高 revision Projection。
- Provider duplicate completion 在 N16 必须幂等收敛到已有 terminal state。

## 7. Clear / destructive mutation

`clear` 必须使用当前 `WorkflowRef { canvasId, workflowId, workflowRevision }` CAS，而不是只有 CanvasId。

```text
non-terminal run
→ clear rejected
→ cancel/interrupted durable terminal
→ clear allowed
```

避免已经收费/运行中的 Job/Provider task 失去 Canvas owner。

## 8. Ephemeral Events

不进入 Session Log：

```text
canvas/run-progress
canvas/node-progress
canvas/provider-phase
canvas/transient-warning
```

断线丢失 ephemeral event 不得影响 durable correctness；重新连接后通过 Projection/Run 查询恢复权威状态。

## 9. Interaction Context

`CanvasInteractionContext` 不是 durable Canvas event。

它是用户发送当前 turn 时采样的 session-scoped UI snapshot：

```text
workflowRevision
selectedNodeIds
selectedEdgeIds
selectedAssets
focusedOutput
regionSelection?
```

只用于帮助 Agent 解释“这个/这张/这里”。Session 切换或 revision 过期后不得继续沿用。

## 10. Run Event 关联字段

运行/观测链路至少能关联：

```text
sessionId
canvasId
workflowId
workflowRevision
workflowRunId
nodeRunId?
providerRequestId?
correlationId?
```

高基数 ID 用于 log/trace，不直接作为 metrics label。

## 11. Browser Consumption

Browser 只消费：

1. Session Projection：当前 authoritative semantic state。
2. Remote query：历史/详情/大型数据。
3. Ephemeral event：进度与临时运行信息。

Browser 不通过监听 Agent token/tool text 来推断 Canvas 已经变更，也不自己维护第二份 semantic workflow authority。

## 12. 安全边界

Durable event 中禁止出现：

- Provider credential；
- Authorization/API key/token/password/callback secret；
- raw image/video bytes；
- base64/data URL/blob media；
- private provider request payload 中的敏感字段。

Binary 必须通过 Attachment/Asset authorization route 获取。

CanvasService 会在业务入口扫描；Canvas invariant 还会在 Session live precommit 再检查一次，防止其它 Host plugin 直接 append 绕过 Service。
