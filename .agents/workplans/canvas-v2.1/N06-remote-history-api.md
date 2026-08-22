# N06 — Remote、Mutation 与 History API（0.1.1-rc.2 Revision）

Status: `REVIEW / REVALIDATE`

## 1. 目标

通过 Harness Typert Remote 暴露 Canvas current mutation/history 能力，同时保持 CanvasService 为 Host authority、Session Projection 为 current read authority、history 为有界/分页独立查询。

## 2. 依赖

`N04, N05`

## 3. 已确认可保留

当前私有 Typert `RemoteResult<T>` 与官方 0.1.1-rc.2 已一致：业务失败通过 `{ ok:false,error }` 返回，只有 assembly/transport fault 才 reject。N06 不需要重新设计 RemoteResult。

## 4. 需要重验

- current Canvas read 应优先通过最新 Session Projection wire view；
- Remote mutation/history lookup 要适配最新 Session/Projection identity seam；
- N04 authorization 必须覆盖 direct Remote caller；
- Browser mutation transport unavailable 时 Minimal current read 仍可工作。

## 5. Mutation API

Workflow/layout mutation必须携带 exact identity/revision fence，例如：

```text
sessionId
canvasId
workflowId
expected workflowRevision / layoutRevision
operations
```

Host 再读取 authoritative current state 并执行 CAS，不信任 Browser 暗示的 current object。

## 6. History API

History 按 Canvas generation/identity 作用域分页/索引，返回：

- stable run/workflow/variant ids；
- terminal state；
- stable asset refs/provenance；
- safe model/provider identity；
- restore 所需 semantic references。

不返回大 binary/request-image bytes/provider temp URLs。

## 7. Failure hygiene

- known business conflicts 用稳定 error code；
- internal Error.message 不直接泄漏 Browser；
- malformed weak/source-mode wire payload 在业务读取前 bounded decode；
- unauthorized 和 not-found 行为遵循当前 Harness error disclosure policy。

## 8. 测试

- exact revision CAS；
- stale workflow/layout conflict；
- unauthorized direct Remote；
- history generation isolation；
- refresh/reconnect current Projection independent from mutation Remote；
- malformed payload redaction；
- RemoteResult official shape/builded client smoke。

## 9. 验收

PR #34 的历史实现可保留为基础，但必须在 N05 新 Projection 与 N04 新 exposure authorization 上重新接线并运行 exact-head focused/REAL tests 后才可 ACCEPTED。
