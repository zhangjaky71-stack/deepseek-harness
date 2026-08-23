# @deepseek-ai/dsh-client-ui-canvas

[English](README.md) | 中文

基于 Session-native Canvas Domain 的 Browser-only Canvas 产品面。该插件不拥有 Conversation Session、Composer、Canvas durability、部署 Capability Policy、Layout Shell 或 Provider execution。当前 Canvas 与 Editor Layout 状态只来自标准 Session Projection hook（`canvas` / `canvasLayout`），部署能力则来自 Host 只读 `canvasFeatures` Remote。

## Surface 契约

Canvas 产品面注册到通用、session-scoped 的 `shell.main` 区域。`ui-layout` 只声明和排列通用 `shell.left` / `shell.main` / `shell.right`，不会理解 Canvas Workflow、Run、Asset、Selection、Mode 或 mutation state。`ui-conversation` 继续在 `shell.right` 拥有 Conversation/Composer，并在内部继续使用自己的 `conversation.view` composition。Canvas 因而不需要抢占 Conversation view ring，也不会创建第二套 Composer。

Surface 在同一个 projected Canvas 上提供两种 presentation mode。**Minimal** 只展示产品状态与生成结果引用，不暴露 Workflow topology。**Editor** 展示以 Workflow 为中心的 shell，包括语义 Node/Edge 数量、Revision/Layout 信息以及可选择的 Node/Edge card；完整可视化 DAG mutation 仍由后续 Editor 节点负责。

Mode 是每个 Session 的 Browser-local state，永远不会成为 Session Event。用户可以自由切换 Minimal/Editor，且不会产生 Canvas mutation。Mode ledger 不依赖 Session write 或 persistence。

普通 Conversation Composer 始终常驻在 Conversation-owned `shell.right` 产品面。位于 `shell.main` 的 Canvas 复用这条既有 Prompt 路径参与 Agent Turn，而不会复制一套 Canvas 专属输入框。

## 部署 Capability

Browser 对部署级 Canvas capability 采取 fail-closed 策略。Plugin 会等待 generated `remote.canvasFeatures`，调用其 deployment-global 只读 `get()`；只有返回的 effective `canvas.enabled=true` 时才向 `shell.main` 贡献 Canvas 产品面。Feature Remote 缺失、业务失败、Transport 失败，或查询完成前 Plugin 已 dispose，都不会发布 Canvas main surface。Capability discovery 不写入 Session State，也不会成为第二套业务状态 authority。

写能力与只读渲染有意解耦。Canvas 已启用后，Projection 驱动的 Minimal surface 不要求 `remote.canvas` mutation transport 常驻；mutation transport 缺失或重连时，写操作会返回明确的 offline/save 结果，而不是抹掉可读 Projection。如果 Editor 已启用但 node catalog discovery 失败，本次 activation 会禁用 Editor，同时保留 Minimal 只读产品面。

`editor.enabled=false` 时，即使 Browser-local Mode Store 里仍保存着 `editor`，Surface 也会强制使用 Minimal，并且不渲染 Mode Switch。已有本地偏好不会被重写，因此未来部署重新开启 Editor 时仍可沿用普通的 local preference 语义，不需要 Session mutation。

关闭能力不会删除历史数据。尤其是当 `video.enabled=false` 时，历史 `video.generate` 或 `video.image-to-video` Node 仍会在 Editor 中显示，但标记为“当前部署不可用”；已有 Video Output Reference 也继续可见。这样能明确区分“当前不能使用该能力”和“历史 Workflow/Result 已不存在”。

Send-time Interaction Preparer 只会在 Canvas capability 已启用的 scope 内注册。`regionEdit.enabled=false` 时，如果 Browser-local store 中还残留旧 Region Selection，会在 stage 一条其它方面合法的 Prompt 前先剥掉 Region；Host 同时会独立拒绝直接携带 Region 的 stage 调用，因此 UI 过滤只是交互友好层，不是安全或 enforcement 边界。

## 部署 Settings

当 Harness Settings UI 存在时，`ui-canvas` 会独立绑定 durable `canvas` Settings namespace，并为全部 8 个部署 Feature Flag 贡献 Canvas Settings 区块。这个 Settings contribution 有意放在当前 `canvas.enabled` 产品面 scope 之外：即使当前 Host effective capability 为 `canvas.enabled=false`，Settings 区块仍然可见，用户因此可以为下一次 activation 重新开启 Canvas，而不会因为关闭产品面后连恢复开关也一起消失。

Settings 编辑是 restart-applied configuration，不是 live capability channel。切换 checkbox 会通过 `SettingsScope.set()` 写入 user layer；**Reset** 使用 `SettingsScope.unset()` 删除该 user override，使值重新继承 composition/schema。当前 Canvas 产品面和 affordance 在本次 activation 内仍只服从 Host `remote.canvasFeatures` 的 effective snapshot。因此保存 checkbox 并不会让当前已关闭的 Host 假装 Canvas 或 Editor 已经生效；更新后的值会在 Host/Feature Service restart 或 remount 后生效。

Settings 集成对 Canvas 渲染是可选依赖。若 `settingsScope` 或 Settings UI shell 不存在，则不贡献 Canvas Settings 区块；Capability-gated Canvas 渲染仍照旧只依赖 Host Feature Remote。

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

`@deepseek-ai/dsh-canvas/client` 只以 type-only 方式提供 Canvas DTO、Capability DTO、Interaction DTO 与 SessionProjectionMap declaration merge。Browser bundle 自己持有很小的同构 product-state/interaction builder，从而不需要在运行时加载 Host-domain Canvas JavaScript。Client 不执行 Canvas fold，也不实现 Feature Policy：Host 负责计算 whole Projection Value 和 effective deployment capabilities。

该 Shell 目前不会解析生成图片／视频 bytes。Result card 只展示 durable media reference metadata；授权媒体 Route 和更完整预览属于后续 Asset/UI 节点。

`SaveStatus` 仍只是固定为 `saved` 的 presentation skeleton。Draft ownership、debounce、autosave、conflict handling 与真实 saving/error transition 属于后续 Editor Draft 节点。

## 模型体验

当且仅当用户发送 Prompt 时存在具体 Canvas Selection，本 Package 才会贡献模型可见内容。Context 会说明采样时的 Canvas/Workflow Revision，以及被选择的 Node、Edge、durable asset、focused output 或已启用的 Region。Revision 发生漂移时会明确标记 stale，并要求 Agent 在修改被选 Workflow Target 前先执行 `canvas_read`。没有 Selection 就没有 Canvas Context。

Feature discovery 本身不增加任何模型 Token。Canvas 被关闭时 Browser Selection Preparation 整条路径不会注册；其它 Flag 只改变 UI affordance，不会被注入常驻 Prompt。

#### KV Cache 影响

不会增加常驻 Prompt Prefix。Interaction Context 是 turn-local 的 user-role plugin context，因此只有真正携带 Selection 的 Turn 会增加 Token；其精确文本会与该 Turn 一起写入 Log，可被完整 Replay。

## 已知限制与后续工作

- **没有真实 Run/Retry/Cancel 行为** — 控件的状态语义已经正确，但在 Host Media execution/cancellation 接通前保持 disabled。
- **Editor Selection 不是 DAG Editing** — Node/Edge Selection 已为自然语言指代上线，但连线 Mutation、Inspector Editing、Undo/Redo 与 Partial Execution 属于后续节点。
- **不会伪造尚未实现的 Feature Surface** — History/Variant/Partial Run/Provider Fallback 已有 capability value，但对应 UI 只会随各自实现节点真正出现。
- **Region Selection 只是 Seam，不是可视化 Mask Editor** — DTO/Store 通路已存在，但绘制 Mask/Region 以及 Inpaint/Outpaint 操作属于后续 UI/Workflow 工作。
- **Media card 只是 metadata placeholder** — 真实图片／视频展示依赖授权 Asset delivery。
- **Save status 仍是静态 skeleton** — Draft/Autosave 延后处理；UI 仍不建立第二套 durable source。
- **Mode 与 Selection 有意保持 Local** — 它们只存在于 Browser client 挂载生命周期，不通过 Session History 同步；只有真正被某次 Turn 消费的模型可见 Context 会写入 Log。