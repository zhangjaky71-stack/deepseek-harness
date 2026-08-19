# @deepseek-ai/dsh-canvas

[English](README.md) | 中文

`dsh-canvas` 负责会话范围内的媒体 Canvas 领域及第一条持久 Host 写入链路：语义媒体工作流、彼此独立的 workflow/run revision、持久媒体引用、Schema Migration、严格 Session Replay，以及 `ctx.canvas` mutation。Session Event 是唯一 durable authority；Provider 执行、Projection、Remote、Authorization、Agent Tool 和 UI 属于后续 Canvas 层。

## 领域模型

`CanvasSnapshot` 包含稳定的 `CanvasId`、`MediaWorkflow | null` 语义工作流、彼此独立的 `workflowRevision` 和 `runRevision`、可选的当前 variant id、当前或最近一次 `CanvasRunSnapshot`，以及当前 `CanvasOutput`。语义工作流编辑只推进 `workflowRevision`；运行生命周期只推进 `runRevision`。选择已经生成的输出候选不改变这两个 revision。

`MediaWorkflow` 与 UI、Provider 无关，只包含语义节点、语义边、输出节点 id 和 JSON-safe 节点配置。React Flow 坐标、viewport、Provider credential、Provider 请求 payload、二进制媒体和 bearer URL 都不属于工作流数据。

`CanvasLayoutSnapshot` 与语义工作流独立版本化，因此编辑器坐标和 viewport 修改不会推进 `workflowRevision`。`CanvasRunHistoryEntry` 是从 Session History 派生的 bounded DTO，不是第二套 authority。

`CanvasOutput` 保存持久引用而不是 bytes。图片复用 `ImageAttachmentRef`；视频使用 opaque `VideoAssetRef`。一次结果可以包含多个候选，并通过 `primaryAssetIndex` 选择主要结果。

## 构造与校验

Package root 导出品牌 id 工厂、`createMediaWorkflow()`、`createCanvasSnapshot()`、`assertCanvasJsonValue()`、`assertMediaWorkflow()`、`assertCanvasSnapshot()`、`isCanvasRunTerminal()` 和 `deriveCanvasProductState()`。Id 工厂本身不校验；持久／领域边界的不变式会拒绝空 id。

`assertCanvasSnapshot()` 校验 Schema Version、安全整数 revision 和时间戳、workflow identity 关系、run 生命周期时间、output revision 关系、候选选择、持久 asset metadata 和 JSON-safe workflow 配置。环检测和注册节点端口兼容性属于 media-workflow engine，而不是本 package。

`deriveCanvasProductState()` 返回 `EMPTY`、`READY`、`DIRTY_READY`、`RUNNING`、`COMPLETED`、`FAILED`、`CANCELLED` 或 `INTERRUPTED`。用户把当前工作流编辑到更高 revision 时，冻结在旧 revision 上的 run 仍显示 `RUNNING`；旧 run 结束后，如果成功输出来自旧 workflow revision，则显示 `DIRTY_READY`。

## 持久 Decode 与 Migration

N02 建立了明确的持久读取链路：`decode stored value → migrate to current runtime value → run current domain invariant`。`migrateStoredMediaWorkflow()` 和 `migrateStoredCanvasSnapshot()` 在关系不变量之前停止，而 `decodeMediaWorkflow()` 和 `decodeCanvasSnapshot()` 会继续执行当前领域校验。

当前版本由 `CANVAS_CHANGE_VERSION`、`CANVAS_LAYOUT_SCHEMA_VERSION`、`MEDIA_WORKFLOW_SCHEMA_VERSION`、`CANVAS_SCHEMA_VERSION` 和每种节点的 `MEDIA_WORKFLOW_NODE_VERSIONS` 导出。未知未来 Schema/Node Version 使用稳定 `CanvasMigrationError` 显式失败，不猜测降级；历史 Session Event 永不重写。

Golden fixture 固定 `workflow-v1`、`snapshot-v1`、`layout-v1`、`run-history-v1` 和一个退役的 pre-registry `image.create@v1` 节点。该退役别名只在读取历史值时接受，迁移为 `image.generate@v1`，同时产生 lifecycle 为 `deprecated` 的 `CANVAS_DEPRECATED_NODE` notice；当前 writer 不会写出该别名。

## Event Sourcing 与 Replay

N03 新增持久 `canvas/change` 事件。每个被接受的 mutation 都携带完整 post-change `CanvasSnapshot`；`clear` 携带 `canvas: null`。`decodeCanvasChange()`、`applyCanvasChange()`、`applyCanvasEvent()` 和 `foldCanvas()` 构成严格 replay 链路。Replay 除了校验 snapshot 自身值不变量，还校验 operation 之间的关系，包括 workflow/run revision 单调性，以及每种 operation 允许修改的有限字段。

Package invariant companion 会独立 fold 已挂载 Session 的日志，并在每个 `session/event` 发布前先验证候选状态。格式错误或不可能的 Canvas transition 会在进入日志之前被拒绝。Service cache 只是一种增量优化：cold replay 与 live state 必须完全一致。

## CanvasService

Package 默认导出 `CanvasService`，挂载为 `ctx.canvas`。它是 N03 引入的唯一 Canvas 业务 mutation 入口。它接收拥有该 Session 的精确 live Agent，从 Session Event 重建／同步 cache，在内存构造完整候选 snapshot，完成校验后才调用 `session.append('canvas/change', ...)`；只有 append 成功后才发布 cache 状态。

`create()` 安装初始 workflow；`replaceWorkflow()` 和 `editWorkflow()` 使用 `WorkflowRef { canvasId, workflowId, workflowRevision }` 做 compare-and-set。该 fence 故意不包含 `runRevision`，所以 Editor 持有合法 workflow ref 时，即使某个 run 已启动，也不会无关地让语义编辑 stale。`editWorkflow()` 会把完整 `WorkflowEditOperation[]` 批次应用到 detached draft，只有最终 workflow 全部通过校验后才 append 一次。`selectOutput()` 只修改 `primaryAssetIndex`／`updatedAt`，`clear()` 记录 null tombstone。

`CanvasServiceError` 扩展 Harness 错误词汇，提供 `CANVAS_STALE_WORKFLOW_REVISION`、`CANVAS_INVALID_EDIT`、`CANVAS_OUTPUT_NOT_FOUND` 等稳定 service code。N04 会加入 authorization、actor 与 audit metadata；N03 不把 policy 偷塞进 Browser 或 service caller。

## 模型体验

### Session-native Canvas service

#### 模型看到什么

目前没有直接内容。N03 不注册工具、Prompt section、请求上下文或模型可见结果。后续 Canvas Tool 消费 `ctx.canvas`；任何模型可见的 Canvas 上下文仍必须能由 Session Log 重建。

#### Token 影响

直接影响为零。Event Sourcing、Migration、Replay 和 Host Mutation 不改变模型请求。

#### KV Cache 影响

没有。本 package 目前不参与 Prompt 组装。

## 已知限制与后续工作

- **Authorization/Audit 下一节点实现** — N03 只接受精确 live Agent，并记录最小的版本化 metadata seam；N04 负责 Canvas Authorization、actor、source、request/correlation id 和敏感数据规则。
- **尚无 Client Projection/Remote** — Browser 读取与 mutation 由 N05/N06 加入。在此之前 `ctx.canvas` 仅 Host 可用，尚无 shipped UI 消费它。
- **尚未实现 Run Execution** — N03 只定义严格的 `run-start`／`run-complete` replay 词汇，用于验证 workflow CAS 和 output selection；Jobs、Provider 执行、Retry、Cancel 与完整 Run Lifecycle 属于 N16。
- **尚无 DAG 执行校验** — 环、注册节点端口定义、能力解析和调度器检查属于 media-workflow engine。
- **尚无视频存储实现** — `VideoAssetRef` 只表示持久 metadata；独立 media-asset capability 负责 bytes、授权和 Range 读取。
