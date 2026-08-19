# @deepseek-ai/dsh-canvas

[English](README.md) | 中文

`dsh-canvas` 负责会话范围内的媒体 Canvas 领域词汇：语义媒体工作流、彼此独立的 workflow/run revision、持久媒体引用、run/output 摘要、由这些值派生的展示状态，以及历史 Canvas 数据的 durable decode/migration seam。N01/N02 都有意保持无状态；Session 事件、projection、Remote、Agent 工具、Provider 和 UI 属于后续 Canvas 层。

## 领域模型

`CanvasSnapshot` 包含稳定的 `CanvasId`、`MediaWorkflow | null` 语义工作流、彼此独立的 `workflowRevision` 和 `runRevision`、可选的当前 variant id、当前或最近一次 `CanvasRunSnapshot`，以及当前 `CanvasOutput`。只有语义工作流内容变化才推进 `workflowRevision`；运行生命周期更新只使用 `runRevision`，不会让原本有效的工作流编辑无关地变成 stale。

`MediaWorkflow` 与 UI、Provider 无关，只包含语义节点、语义边、输出节点 id 和 JSON-safe 节点配置。React Flow 坐标、viewport、Provider credential、Provider 请求 payload、二进制媒体和 bearer URL 都不属于工作流数据。

`CanvasLayoutSnapshot` 与语义工作流使用独立 schema version，因此编辑器坐标和 viewport 变化不会推进 `workflowRevision`。`CanvasRunHistoryEntry` 是有界的历史 DTO，计划从 Session history 派生，不能成为第二套 authority。

`CanvasOutput` 保存持久引用而不是 bytes。图片复用 `ImageAttachmentRef`，视频使用 opaque `VideoAssetRef`。一次结果可包含多个候选，并通过 `primaryAssetIndex` 选择主要结果。

## 构造与校验

Package root 导出品牌 id 工厂、`createMediaWorkflow()`、`createCanvasSnapshot()`、`assertCanvasJsonValue()`、`assertMediaWorkflow()`、`assertCanvasSnapshot()`、`isCanvasRunTerminal()` 和 `deriveCanvasProductState()`。Id 工厂本身不校验；持久／领域边界的不变式会拒绝空 id。

`assertCanvasSnapshot()` 校验 schema version、安全整数 revision 和时间戳、workflow identity 关系、run 生命周期时间、output revision 关系、候选选择、持久 asset metadata 和 JSON-safe workflow 配置。环检测与注册节点端口兼容性属于 media-workflow engine，而不是这个 value package。

`deriveCanvasProductState()` 返回 `EMPTY`、`READY`、`DIRTY_READY`、`RUNNING`、`COMPLETED`、`FAILED`、`CANCELLED` 或 `INTERRUPTED`。当用户把当前工作流编辑到更高 revision 时，冻结在旧 revision 上的 run 仍显示 `RUNNING`；旧 run 结束后，旧成功输出对应 `DIRTY_READY`。

单独发布的 `./invariant` companion 目前注册带说明的空运行时不变式，因为 N01/N02 只拥有不可变值与 decode 逻辑。等 Canvas service 层存在持久 Canvas 事件后，该层会加入 Session 事件／数据关系检查。

## 持久数据解码与迁移

N02 增加明确的 durable boundary：`decode stored value → migrate 到 current runtime shape → 执行当前 N01 invariant`。`migrateStoredMediaWorkflow()` 和 `migrateStoredCanvasSnapshot()` 有意停在关系不变量之前；`decodeMediaWorkflow()` 与 `decodeCanvasSnapshot()` 则把 migration 和当前领域校验串起来。

当前版本通过 `CANVAS_CHANGE_VERSION`、`CANVAS_LAYOUT_SCHEMA_VERSION`、`MEDIA_WORKFLOW_SCHEMA_VERSION`、`CANVAS_SCHEMA_VERSION` 和逐节点 `MEDIA_WORKFLOW_NODE_VERSIONS` 导出。遇到未知 future schema/node version 时，读取会抛出带稳定 code 的 `CanvasMigrationError`，不会猜测降级；历史 Session event 永远不重写。

Golden fixtures 固化 `workflow-v1`、`snapshot-v1`、`layout-v1`、`run-history-v1`，以及退役的 pre-registry `image.create@v1` 节点。这个退役别名只在读取历史形状时被接受，并迁移为 `image.generate@v1`，同时返回 lifecycle 为 `deprecated` 的 `CANVAS_DEPRECATED_NODE` notice；当前写入路径永远不会生成这个别名。完成迁移后的 runtime shape 再次读取保持幂等。

## 模型体验

### 纯 Canvas 领域

#### 模型看到什么

没有直接内容。该包不注册工具、Prompt section、请求上下文或模型可见结果；后续 Canvas Consumer 负责把这些值投影到模型表面。

#### Token 影响

直接影响为零。领域构造、迁移与校验不会改变模型请求。

#### KV Cache 影响

没有。该包不参与 Prompt 组装。

## 已知限制与后续工作

- **尚无持久 authority** — N01/N02 只定义、迁移并校验 Canvas 值，不追加 Session 事件、不折叠回放、也不暴露 service；事件溯源 service 属于 N03。
- **当前只有 V1** — migration seam 与 golden fixtures 已固定兼容行为，但在真正存在 V2 schema 前，不会虚构 V1→V2 workflow/snapshot transform。
- **尚无 DAG 执行校验** — 环、注册节点端口定义、能力解析和调度器检查属于 media-workflow engine。
- **尚无视频存储实现** — `VideoAssetRef` 只表示持久元数据；独立 media-asset 能力负责 bytes、授权和 Range 读取。
