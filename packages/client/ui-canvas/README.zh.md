# @deepseek-ai/dsh-client-ui-canvas

[English](README.md) | 中文

基于 Session-native Canvas Domain 的 Browser-only Canvas Conversation View。该插件只注册一个名为 `canvas` 的 `conversation.view`；它不拥有 Conversation Session、Composer、Canvas durability 或 Provider execution。当前 Canvas 与 Editor Layout 状态只来自标准 Session Projection hook（`canvas` / `canvasLayout`）。

## Surface 契约

View 在同一个 projected Canvas 上提供两种 presentation mode。**Minimal** 只展示产品状态与生成结果引用，不暴露 Workflow topology。**Editor** 展示以 Workflow 为中心的 shell，包括语义 Node/Edge 数量、Revision/Layout 信息以及可选择的 Node/Edge card；N08 仍有意停在可视化 DAG mutation 之前。

Mode 是每个 Session 的 Browser-local state，永远不会成为 Session Event。用户可以自由切换 Minimal/Editor，且不会产生 Canvas mutation。Mode ledger 不依赖 Session write 或 persistence。

Conversation Composer 始终由 `ui-conversation` 在 `conversation.view` ring 之外常驻拥有。因此在 Chat/Trajectory/Canvas 之间切换只会切换 Session body；输入仍使用普通 Conversation Composer，不复制一套 Canvas 专属输入框。

## Interaction Selection 与 Agent Turn

N08 新增一套独立的 per-session Browser-local interaction store。Editor 的 Node/Edge card，以及 Minimal/Editor 的 Output Candidate 都可以被选择；后续 Region/Mask Editor 可以通过同一套 `CanvasRegionSelection` seam 接入。Selection 属于 presentation context，不是 Canvas Domain State：选择、清除或聚焦都不会 append Session Event、改变 Projection，也不会推进 Canvas revision。

每次语义选择都会锚定在用户点击当时观察到的 `{ canvasId, workflowId, workflowRevision }`。如果同一个 Workflow 在下一条 Prompt 发送前推进到更高 Revision，旧 Revision 会被保留，让 Host 明确标记 target 已 stale；如果当前 Canvas 或 Workflow identity 已完全替换，则旧 selection 不会自动重绑到新文档，也不会附加 target。

Output selection 同时保存 durable selected asset reference，以及仍然有效时的 `{ runId, assetIndex }` focus。这样“用这张图片／这个视频”即使在后续 Run 成为 Current 后仍可指向原 durable asset；而“第 3 张”这种 Current Candidate focus 一旦不再属于当前 Output 就会被移除。

在普通 Conversation 的发送边界，Canvas Plugin 会同步冻结 Selection、Mode 与当前 Canvas Projection。没有具体 Selection 时不会注册 Interaction Context，Agent 也不得虚构 Target；有 Target 时，会在普通 Prompt 真正进入 Transport 前，通过 generated `canvasInteraction` Remote 把该快照 stage 到这条 Prompt 的精确 RPC id。Prompt Admission 失败时会回滚该 stage。

Host 随后把这个 RPC id 绑定到精确的已接收 user-message id；只有当这条 Message 真正保留并进入 `agent/pre-step` 时，才会在它前面放入一条可记录的 Canvas plugin-context message。Browser-local Selection 本身永不 durable；进入 Session Log 的只有模型实际收到的 Context Text，因此仍满足仓库“model-visible content 必须走 logged channel”的规则。

## Product State

Shell 使用与 Host Domain N01 完全同构的产品状态规则，但 Browser bundle 不 value-import Host Canvas code：

- `EMPTY` — 还没有语义 Workflow。
- `READY` — Workflow 已存在，但还没有当前终态结果。
- `DIRTY_READY` — 旧结果继续可见，但属于较旧的 Workflow Revision。
- `RUNNING` — Media execution 处于 queued 或 running。
- `COMPLETED` — 当前 Workflow Revision 拥有已完成结果。
- `FAILED`、`CANCELLED`、`INTERRUPTED` — 当前 Workflow Revision 的非成功终态。

Primary control skeleton 是确定的：READY/COMPLETED/DIRTY_READY → Run，失败类状态 → Retry，RUNNING → **只显示 Cancel**，EMPTY → 不显示 Primary Action。Run/Retry/Cancel 仍保持 disabled，因为真实 Media execution/cancellation 属于后续 Run Engine 节点；UI 不发布假的 Remote success path。

`DIRTY_READY` 会保留旧结果并明确标记其与当前 Workflow 不一致。Minimal 与 Editor 因而共享同一个 Product State Machine 和同一个 projected Canvas，不维护两套独立 Result lifecycle。

## Projection 与 Client Boundary

`@deepseek-ai/dsh-canvas/client` 只以 type-only 方式提供 Canvas DTO、Interaction DTO 与 SessionProjectionMap declaration merge。Browser bundle 自己持有很小的同构 product-state/interaction builder，从而不需要在运行时加载 Host-domain Canvas JavaScript。Client 不执行 Canvas fold：Host 计算 whole projection value，标准 Session runtime 将其推送给 View。

该 Shell 目前不会解析生成图片／视频 bytes。Result card 只展示 durable media reference metadata；授权媒体 Route 和更完整预览属于后续 Asset/UI 节点。

`SaveStatus` 仍只是固定为 `saved` 的 presentation skeleton。Draft ownership、debounce、autosave、conflict handling 与真实 saving/error transition 属于后续 Editor Draft 节点。

## 模型体验

当且仅当用户发送 Prompt 时存在具体 Canvas Selection，本 Package 才会贡献模型可见内容。Context 会说明采样时的 Canvas/Workflow Revision，以及被选择的 Node、Edge、durable asset、focused output 或 Region。Revision 发生漂移时会明确标记 stale，并要求 Agent 在修改被选 Workflow Target 前先执行 `canvas_read`。没有 Selection 就没有 Canvas Context。

#### KV Cache 影响

不会增加常驻 Prompt Prefix。Interaction Context 是 turn-local 的 user-role plugin context，因此只有真正携带 Selection 的 Turn 会增加 Token；其精确文本会与该 Turn 一起写入 Log，可被完整 Replay。

## 已知限制与后续工作

- **没有真实 Run/Retry/Cancel 行为** — 控件的状态语义已经正确，但在 Host Media execution/cancellation 接通前保持 disabled。
- **Editor Selection 不是 DAG Editing** — Node/Edge Selection 已为自然语言指代上线，但连线 Mutation、Inspector Editing、Undo/Redo 与 Partial Execution 属于后续节点。
- **Region Selection 只是 Seam，不是可视化 Mask Editor** — DTO/Store 通路已存在，但绘制 Mask/Region 以及 Inpaint/Outpaint 操作属于后续 UI/Workflow 工作。
- **Media card 只是 metadata placeholder** — 真实图片／视频展示依赖授权 Asset delivery。
- **Save status 仍是静态 skeleton** — Draft/Autosave 延后处理；UI 仍不建立第二套 durable source。
- **Mode 与 Selection 有意保持 Local** — 它们只存在于 Browser client 挂载生命周期，不通过 Session History 同步；只有真正被某次 Turn 消费的模型可见 Context 会写入 Log。
