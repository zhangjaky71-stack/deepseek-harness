# @deepseek-ai/dsh-client-ui-canvas

[English](README.md) | 中文

基于 Session-native Canvas Domain 的 Browser-only Canvas Conversation View。该插件只注册一个名为 `canvas` 的 `conversation.view`；它不拥有 Conversation Session、Composer、Canvas durability 或 Provider execution。当前 Canvas 与 Editor Layout 状态只来自标准 Session Projection hook（`canvas` / `canvasLayout`）。

## Surface 契约

View 在同一个 projected Canvas 上提供两种 presentation mode。**Minimal** 只展示产品状态与生成结果引用，不暴露 Workflow topology。**Editor** 展示以 Workflow 为中心的 shell，包括语义 Node/Edge 数量、Revision/Layout 信息以及节点列表；N07 有意停在可视化 DAG 编辑之前。

Mode 是每个 Session 的 Browser-local state，永远不会成为 Session Event。窄屏默认 Minimal，较宽屏默认 Editor；用户可以自由切换，且不会产生 Canvas mutation。Mode ledger 不依赖 Remote、Session write 或 persistence。

Conversation Composer 始终由 `ui-conversation` 在 `conversation.view` ring 之外常驻拥有。因此在 Chat/Trajectory/Canvas 之间切换只会切换 Session body；输入仍使用普通 Conversation Composer，不复制一套 Canvas 专属输入框。

## Product State

Shell 使用与 Host Domain N01 完全同构的产品状态规则，但 Browser bundle 不 value-import Host Canvas code：

- `EMPTY` — 还没有语义 Workflow。
- `READY` — Workflow 已存在，但还没有当前终态结果。
- `DIRTY_READY` — 旧结果继续可见，但属于较旧的 Workflow Revision。
- `RUNNING` — Media execution 处于 queued 或 running。
- `COMPLETED` — 当前 Workflow Revision 拥有已完成结果。
- `FAILED`、`CANCELLED`、`INTERRUPTED` — 当前 Workflow Revision 的非成功终态。

Primary control skeleton 是确定的：READY/COMPLETED/DIRTY_READY → Run，失败类状态 → Retry，RUNNING → **只显示 Cancel**，EMPTY → 不显示 Primary Action。N07 中 Run/Retry/Cancel 都有意保持 disabled，因为真实 Media execution/cancellation 属于后续 Run Engine 节点；UI 不发布假的 Remote success path。

`DIRTY_READY` 会保留旧结果并明确标记其与当前 Workflow 不一致。Minimal 与 Editor 因而共享同一个 Product State Machine 和同一个 projected Canvas，不维护两套独立 Result lifecycle。

## Projection 与 Client Boundary

`@deepseek-ai/dsh-canvas/client` 只以 type-only 方式提供 Canvas DTO 与 SessionProjectionMap declaration merge。Browser bundle 自己持有一个很小的同构 product-state helper，从而不需要在运行时加载 Host-domain JavaScript。Client 不执行 Canvas fold：Host 计算 whole projection value，标准 Session runtime 将其推送给 View。

该 Shell 目前不会解析生成图片／视频 bytes。Result card 只展示 durable media reference metadata；授权媒体 Route 和更完整预览属于后续 Asset/UI 节点。

`SaveStatus` 在 N07 只是固定为 `saved` 的 presentation skeleton。Draft ownership、debounce、autosave、conflict handling 与真实 saving/error transition 属于后续 Editor Draft 节点。

## 模型体验

无直接影响。该 Package 是 Browser presentation plugin，不贡献 Tool、Prompt Section、Request Context 或模型可见结果。

#### KV Cache 影响

无。

## 已知限制与后续工作

- **没有真实 Run/Retry/Cancel 行为** — 控件的状态语义已经正确，但在 Host Media execution/cancellation 接通前保持 disabled。
- **Editor 只是 Shell，不是 DAG Editor** — Graph interaction、连线、Inspector editing、Undo/Redo 与 partial execution 属于后续 Canvas UI 节点。
- **Media card 只是 metadata placeholder** — 真实图片／视频展示依赖授权 Asset delivery。
- **Save status 仍是静态 skeleton** — Draft/Autosave 延后处理；N07 不建立第二套 durable source。
- **Mode 有意保持 Local** — Minimal/Editor preference 只存在于 Browser client 挂载生命周期，不通过 Session History 同步。
