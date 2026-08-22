# N23 — Progress / Observability / Traceability（0.1.1-rc.2 Revision）

Status: `PLANNED`

## 1. 目标

建立从 Session/Canvas command到 Workflow Run、Node attempt、Provider operation和最终 stable asset的可追踪链路，同时不以高频progress event污染durable Session log。

## 2. 依赖

`N16, N20, N22`

## 3. Trace hierarchy

推荐稳定关联：

```text
sessionId
→ canvasId / workflowRef
→ runId / attempt
→ nodeId / nodeAttempt
→ resolved provider/model execution identity
→ provider operation id
→ stable image attachmentId or video assetId
```

Request-image `variantId`可以作为debug/request telemetry，但不是Canvas semantic output identity。

## 4. Progress ownership

- coarse lifecycle/terminal state可durable；
-高频百分比/token/poll ticks走live observable/telemetry channel；
- Browser refresh通过durable Run + provider reconciliation恢复，不依赖错过的live ticks。

## 5. Logging safety

禁止记录：credential、Authorization header、signed provider URL、raw image/video bytes/base64、DeepSeek Files bearer data、完整敏感prompt如果现有Harness logging policy不允许。

稳定error code优先；provider raw diagnostic做bounded/redacted映射。

## 6. Metrics

可度量：admission latency、queue wait、provider start/terminal latency、materialization latency、cache hit、retry count、cancel outcome、cost estimate vs observed usage（如safe）、orphan/reconciliation count。

## 7. Tests

- end-to-end trace correlation；
- progress does not advance workflowRevision；
- refresh can reconstruct without live ticks；
- secret/url/binary redaction；
- duplicate callback produces one terminal semantic record；
- image output links stable attachment id；
- video output links stable video id。

## 8. 验收

至少 image/video各一条真实或高保真运行能从Agent/Browser intent追踪到stable output，且日志/Session不存在敏感transport数据。
