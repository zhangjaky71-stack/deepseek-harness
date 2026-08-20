# @deepseek-ai/dsh-canvas

[English](README.md) | 中文

`dsh-canvas` 负责会话范围内的媒体 Canvas 领域及其 durable Host control plane：语义媒体工作流、彼此独立的 workflow/run revision、持久媒体引用、Schema Migration、严格 Session Replay、Host Authorization/Audit、bounded Session Projection、独立 Editor Layout State、Typert Browser mutation、有界 Run History Query，以及 `ctx.canvas`。Session Event 仍是唯一 durable Canvas authority；Provider 执行、Agent Tool、Media Asset 实现和 UI 保持为独立层。

## 领域模型

`CanvasSnapshot` 包含稳定的 `CanvasId`、`MediaWorkflow | null` 语义工作流、彼此独立的 `workflowRevision` 和 `runRevision`、可选当前 variant id、当前或最近一次 `CanvasRunSnapshot`，以及当前 `CanvasOutput`。语义工作流编辑只推进 `workflowRevision`；运行生命周期只推进 `runRevision`。选择已经生成的输出候选不改变这两个 revision。

`MediaWorkflow` 与 UI、Provider 无关，只包含语义节点、语义边、输出节点 id 和 JSON-safe 节点配置。图坐标、viewport、Provider 私密配置、Provider 请求 payload、二进制媒体和 bearer URL 都不属于 Workflow data。

`CanvasLayoutSnapshot` 独立保存 Editor 节点坐标和 viewport，不属于语义 Workflow state。保存 Layout 不会推进 `workflowRevision` 或 `runRevision`。`CanvasRunHistoryEntry` 是由 Session History 派生的 bounded DTO，不是第二套 authority。

`CanvasOutput` 保存 durable reference 而不是 bytes。图片复用 `ImageAttachmentRef`；视频使用 opaque `VideoAssetRef`。一次结果可以包含多个候选，通过 `primaryAssetIndex` 选择主要结果。

## 构造与校验

Package root 导出品牌 id factory、`createMediaWorkflow()`、`createCanvasSnapshot()`、Canvas/Layout 构造和 decoder、产品状态派生，以及当前 value invariant。Id factory 本身不校验；durable/domain boundary 的 invariant 会拒绝无效 id 和关系。

`assertCanvasSnapshot()` 校验 Schema Version、安全整数 revision 和时间戳、Workflow identity 关系、Run lifecycle 时间、Output revision 关系、候选选择、durable asset metadata 和 JSON-safe workflow config。`assertCanvasLayoutSnapshot()` 校验独立版本化的 Layout、finite 坐标、非负时间戳和正数 viewport zoom。Cycle 和注册节点端口兼容性属于 media-workflow engine，而不是本 package。

`deriveCanvasProductState()` 返回 `EMPTY`、`READY`、`DIRTY_READY`、`RUNNING`、`COMPLETED`、`FAILED`、`CANCELLED` 或 `INTERRUPTED`。用户把当前工作流编辑到更高 revision 时，冻结在旧 revision 上的 run 仍保持 `RUNNING`；旧 run 结束后，如果成功输出来自旧 workflow revision，则显示 `DIRTY_READY`。

## Durable Decode 与 Migration

Durable Canvas 值遵循 `decode stored value → migrate to current runtime value → run current domain invariant`。`migrateStoredMediaWorkflow()` 和 `migrateStoredCanvasSnapshot()` 在关系 invariant 前停止，而 `decodeMediaWorkflow()` 和 `decodeCanvasSnapshot()` 会继续执行当前领域校验。

当前版本由 `CANVAS_CHANGE_VERSION`、`CANVAS_LAYOUT_SCHEMA_VERSION`、`MEDIA_WORKFLOW_SCHEMA_VERSION`、`CANVAS_SCHEMA_VERSION` 和每种节点的 `MEDIA_WORKFLOW_NODE_VERSIONS` 导出。未知未来 Schema/Node Version 使用稳定 `CanvasMigrationError` 显式失败，不猜测降级；历史 Session Event 永不重写。

Golden fixture 固定 V1 workflow、snapshot、layout、run-history 和一个退役的 pre-registry `image.create@v1` 节点。该别名只在读取历史数据时接受，迁移为 `image.generate@v1` 并产生 `CANVAS_DEPRECATED_NODE` notice；当前 writer 不会写出该别名。

## Event Sourcing 与 Replay

每个被接受的语义 Canvas mutation 都对应一个 `canvas/change` Session Event，并携带完整 post-change `CanvasSnapshot`；`clear` 携带 `canvas: null`。`decodeCanvasChange()`、`applyCanvasChange()`、`applyCanvasEvent()` 和 `foldCanvas()` 构成严格 replay 链路。

Editor Layout 使用独立 `canvas/layout-change` Event，每次携带完整 `CanvasLayoutSnapshot` 与当前 audit metadata。`foldCanvasLayout()` 重建最新 durable layout history。Package invariant 会在 Session 发布前联合 fold Canvas 和 Layout stream，因此 Layout Event 不能指向另一个 Workflow，也不能引用当前 Workflow 中不存在的节点。

Invariant companion 会独立 stage 每个候选 `session/event`。格式错误或不可能的 transition 会在进入 Log 之前被拒绝。CanvasService cache 只是一种增量优化；cold replay 始终是恢复 authority。

`canvas/change.meta` 与 event envelope 独立版本化。历史 metadata schema version 1 保持可读，不会事后虚构 actor。当前 Canvas 与 Layout writer 使用 metadata schema version 2，记录规范化 actor/source 以及可选 request/correlation id。

## Session Projection 与 Editor Layout

当 `ctx.sessionProjections` 被组合时，CanvasService 注册两个 whole-value projection unit：`canvas → CanvasSnapshot | null` 与 `canvasLayout → CanvasLayoutSnapshot | null`。Client-safe `@deepseek-ai/dsh-canvas/client` outlet 携带同一组 Projection 类型声明，不导入 Host Service。

Projection fold 故意 fail-soft：无关 Event 和格式错误的 Canvas-shaped Event 返回同一 state reference，避免一个 plugin 把共享 projection drive 整体打断。严格拒绝由 write-side service、durable decoder 和 package invariant 负责。Current-state Projection 保持 UI-scale，不包含 Run History、Binary Media、Provider Raw Response、Log 或 Progress History。

语义 Workflow 编辑会保留当前 Layout Projection，因为 Layout 有自己的 Event Stream 与 Revision 语义。Canvas `create` 与 `clear` 会把当前 `canvasLayout` Projection 重置为 `null`；旧 Layout Event 仍保留在 Session History，但新当前 Canvas 不会仅因为复用了相同 `workflowId` 就继承旧坐标。

`CanvasService.saveLayout()` 接收当前 Workflow id、部分节点坐标与可选 viewport。它在 Host enforce `canvas.layout.write`，拒绝未知 Node id 或不匹配 Workflow id，由 Host 分配单调时间戳，准确 append 一个 `canvas/layout-change`，并且不修改语义 Canvas Snapshot 或任一 Canvas revision。

## Host Authorization 与 Audit

`CanvasPermission` 定义 CanvasService 与 Remote、Agent Tool、History、Asset、Restore、Variant、Layout consumer 共用的 Host action 集，包括 Canvas read/edit/run/cancel、History read、Asset read/export/delete、Workflow restore、Variant create 与 Layout write。

`CanvasAuthorizationService` 是可选 Cordis Service，暴露为 `ctx.canvasAuthorization`。默认 `CanvasAuthorizationPolicy` 适合当前单用户部署，允许 human、agent、system actor；部署可以按 permission 覆盖允许的 actor kind。CanvasService 始终在 Host 执行授权，包括 Browser Remote 与 Layout write。

`CanvasAccessContext` 只携带 durable-safe actor/source id 和可选 request/correlation id。Audit metadata 使用 allow-list materialize。语义 Workflow config 在 commit 前扫描受禁 credential/header/binary 类字段；拒绝诊断只说明字段位置，不回显字段值。

## CanvasService

Package 默认导出 `CanvasService`，挂载为 `ctx.canvas`，并发布到 Typert namespace `canvas`。它是当前 Canvas read、已接受 Canvas/Layout write 和有界 Session-derived History 的单一 Host façade。它在 append Session Event 前校验 exact live Agent、Authorization、Semantic/Layout invariant 和完整候选 state；只有 append 成功后才同步 derived cache。

`create()` 安装初始 Workflow；`replaceWorkflow()` 和 `editWorkflow()` 使用 `WorkflowRef { canvasId, workflowId, workflowRevision }` 做 compare-and-set。该 fence 故意不包含 `runRevision`，因此运行生命周期变化不会让无关语义编辑 stale。`editWorkflow()` 把完整 `WorkflowEditOperation[]` 应用到 detached draft，最终校验后只 commit 一次。`selectOutput()` 只改变 primary result selection，`saveLayout()` 写独立 Layout Stream，`clear()` 记录 Canvas tombstone，同时 current layout projection 独立重置。

## Browser Remote 与 Run History

生成的 `./remote` contribution 暴露 `editWorkflow`、`replaceWorkflow`、`selectOutput`、`saveLayout`、`clear`、`listRuns` 与 `getRun`。Browser caller 不会传入 `CanvasAccessContext`：专用 Remote wrapper 会在 Host 生成 `human` + `browser-remote` access，再调用与其他 consumer 共用的 CanvasService 方法。Mutation 只返回小型 receipt；Browser 通过 Session Projection 读取已提交的当前 Canvas 与 Layout，因此刻意不存在 `getCurrent` RPC。

`listRuns()` 与 `getRun()` 直接从 `canvas/change` Event 派生 History。分页按 newest-first，默认 20 条，超过 100 会拒绝；opaque cursor 锚定 run-start Session sequence，因此分页过程中后来新增的 run 不会重排已经开始的游标遍历。History 只返回 durable run/output DTO，不建立第二套 History Database。

公开的 `CanvasRemoteMethodName` 类型还预留 `createVariant`、`restoreWorkflow`、`run` 与 `cancel` 名称，交给对应后续 Domain 实现。Host 行为不存在时不会注册这些 Remote endpoint；N06 不提供假的成功路径。

Package 通过仓库 Typert build 发布生成的 `./typert` 与 `./remote` artifact，沿用 Goal 的 artifact-plane 模式。源码只维护 decorator 与 client-safe DTO；generated file 不手工维护。

## Browser Presentation Consumer

Shipped Web 现在把 `@deepseek-ai/dsh-client-ui-canvas` 作为一个 `conversation.view` consumer 挂载。它只从 Session Projection 读取当前 Canvas 与 Layout，并把 Minimal/Editor mode 保持为 Browser-local presentation state，因此 UI 不会成为第二套 Canvas authority。常驻 Conversation Composer 仍由 `ui-conversation` 在 view ring 之外拥有。

N07 提供 Minimal result presentation、Editor workflow shell、同一套八状态 Product State 规则、DIRTY_READY 旧结果保留，以及状态正确的 Run/Retry/Cancel control skeleton。真实 Run/Cancel 在 Host 行为存在前保持 disabled；Visual DAG editing、Draft/Autosave、Interaction Context 与授权 Media rendering 属于后续 UI 层。

Canvas client outlet 对 Browser 保持 runtime-free：UI package 只以 type-only 方式消费其 DTO 与 Projection declaration，不会把 Host-domain Canvas JavaScript 加载进 Browser bundle。

## 模型体验

### Session-native Canvas service

#### 模型看到什么

目前没有直接内容。本 package 不注册 Canvas Tool、Prompt Section、Request Context 或模型可见结果。后续 Canvas Tool 消费 `ctx.canvas`；任何模型可见 Canvas Context 仍必须能由 Session Log 重建。

#### Token 影响

直接影响为零。Event Sourcing、Projection、Layout Persistence、Migration、Authorization、Audit、Replay、Remote 调用、Host Mutation 与 Browser presentation consumer 都不改变模型请求。

#### KV Cache 影响

没有。本 package 目前不参与 Prompt 组装。

## 已知限制与后续工作

- **Canvas UI 目前仍是 Shell** — Minimal/Editor Rendering 已随 Web 发布，但真实 Media execution control、Visual DAG Editing、Draft/Autosave、Interaction Context 与授权 Media Preview 属于后续 Client/Host 工作。
- **当前 Authorization Policy 只按 Actor Kind 判断** — Identity Ownership、多用户 Tenant、Workspace ACL、Approval Policy、Quota 与 Provider Cost Admission 属于同一 Host seam 后的后续治理层。
- **尚未实现 Run Execution** — `run` 与 `cancel` 只是预留 Remote 名称，不是已注册 endpoint；Jobs、Provider 执行、Retry、Cancel 和完整 Run Lifecycle 保持独立实现。
- **尚未实现 Variant Create 与 Workflow Restore** — Remote 名称已预留，但在 Host mutation 存在前不会发布 endpoint。
- **尚无 DAG 执行校验** — Cycle、注册节点端口定义、Capability Resolution 和 Scheduler check 属于 media-workflow engine。
- **尚无视频存储实现** — `VideoAssetRef` 只表示 durable metadata；独立 media-asset capability 负责 bytes、Authorization 和 Range 读取。
