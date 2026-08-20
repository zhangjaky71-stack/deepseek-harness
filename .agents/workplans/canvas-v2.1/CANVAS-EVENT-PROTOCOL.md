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

rc.8 compatibility rule：现有 `canvas/change` 仍视为 Canvas durable state 所需的 required/non-ignorable Session event；若未来拆成更细事件，必须提供 migration/fold 兼容。

建议语义族：

```text
canvas/change
canvas/workflow-created
canvas/workflow-updated
canvas/workflow-restored
canvas/run-created
canvas/run-terminal
canvas/output-selected
canvas/asset-linked
```

实际 wire name 以实施时仓库契约为准，不要求为了文档立即拆分既有 `canvas/change`。

## 4. Ephemeral Events

不进入 Session Log：

```text
canvas/run-progress
canvas/node-progress
canvas/provider-phase
canvas/transient-warning
```

断线丢失 ephemeral event 不得影响 durable correctness；重新连接后通过 Projection/Run 查询恢复权威状态。

## 5. Interaction Context

`CanvasInteractionContext` 不是 durable event。

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

## 6. Run Event 关联字段

所有运行事件至少能关联：

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

其中高基数 ID 用于 log/trace，不直接作为 metrics label。

## 7. Ordering / Idempotency

- Durable mutation 由 CanvasService/CAS 决定 revision 顺序。
- Run 使用 immutable workflow snapshot。
- Provider duplicate completion 必须幂等。
- Browser 收到旧 revision event 不得覆盖更高 revision Projection。
- ephemeral progress 可以乱序/丢失，但 terminal durable state 必须最终收敛。

## 8. Browser Consumption

Browser 只消费：

1. Session Projection：当前 authoritative semantic state。
2. Remote query：历史/详情/大型数据。
3. Ephemeral event：进度与临时运行信息。

Browser 不通过监听 Agent token/tool text 来推断 Canvas 已经变更。

## 9. 安全边界

事件中禁止出现：

- Provider credential
- raw image/video bytes
- base64 media
- private provider request payload 中的敏感字段

Binary 必须通过 Attachment/Asset authorization route 获取。
