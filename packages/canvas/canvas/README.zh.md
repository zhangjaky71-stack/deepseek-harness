# @deepseek-ai/dsh-canvas

[English](README.md) | 中文

`dsh-canvas` 负责 Session 范围内的媒体 Canvas Domain 与 Host control plane：语义 Media Workflow、彼此独立的 workflow/run revision、durable media reference、Schema Migration、严格 Session Replay、Host Authorization/Audit、部署 Feature Policy、bounded Session Projection、独立 Editor Layout State、Typert Browser mutation、有界 Run History Query、request-local Canvas Interaction Context，以及 `ctx.canvas`。Session Event 仍是唯一 durable Canvas authority；Provider 执行、Agent Tool、Media Asset 实现和 UI 保持独立。

## 领域模型

`CanvasSnapshot` 包含稳定的 `CanvasId`、`MediaWorkflow | null` 语义工作流、彼此独立的 `workflowRevision` 和 `runRevision`、可选当前 variant id、当前或最近一次 `CanvasRunSnapshot`，以及当前 `CanvasOutput`。语义工作流编辑只推进 `workflowRevision`；运行生命周期只推进 `runRevision`。选择已经生成的输出候选不会改变这两个 revision。

`MediaWorkflow` 与 UI、Provider 无关，只包含语义 Node、语义 Edge、Output Node id 和 JSON-safe Node config。图坐标、viewport、Provider credential、Provider request payload、二进制媒体、bearer URL、Browser Selection、Interaction Focus 与部署 Feature Flag 都不属于 Workflow data。

`CanvasLayoutSnapshot` 独立保存 Editor Node 坐标与 viewport，不属于语义 Workflow State。保存 Layout 不推进 `workflowRevision` 或 `runRevision`。`CanvasRunHistoryEntry` 是由 Session History 派生的 bounded DTO，不是第二套 authority。

`CanvasOutput` 保存 durable reference 而不是 bytes。图片复用 `ImageAttachmentRef`；视频使用 opaque `VideoAssetRef`。一次结果可以包含多个候选，并通过 `primaryAssetIndex` 选择主要结果。

## 构造与校验

Package root 导出 branded id factory、`createMediaWorkflow()`、`createCanvasSnapshot()`、Canvas/Layout constructor 与 decoder、Product State 派生、Interaction decode/render、Deployment Capability helper，以及当前 value invariant。Id factory 本身不做校验；durable/domain boundary 的 invariant 会拒绝无效 id 和关系。

`assertCanvasSnapshot()` 校验 Schema Version、安全整数 revision/时间戳、Workflow identity、Run lifecycle 时间、Output revision、候选选择、durable asset metadata 和 JSON-safe workflow config。`assertCanvasLayoutSnapshot()` 校验独立版本化 Layout、finite 坐标、非负时间戳和正数 viewport zoom。Cycle 与注册 Node Port 兼容性属于 Media Workflow Engine，不属于本 package。

`deriveCanvasProductState()` 返回 `EMPTY`、`READY`、`DIRTY_READY`、`RUNNING`、`COMPLETED`、`FAILED`、`CANCELLED` 或 `INTERRUPTED`。用户把当前 Workflow 编辑到更高 revision 时，冻结在旧 revision 的 Run 仍保持 `RUNNING`；旧 Run 结束后，如果成功 Output 来自旧 workflow revision，则显示 `DIRTY_READY`。

## Durable Decode 与 Migration

Durable Canvas 值统一遵循 `stored JSON → migrateStoredX() → current structural value → current invariant`。`migrateStoredMediaWorkflow()` 与 `migrateStoredCanvasSnapshot()` 在关系 invariant 前停止，`decodeMediaWorkflow()` 与 `decodeCanvasSnapshot()` 再执行当前 Canvas Domain 校验。Layout 使用同样的分层：`migrateStoredCanvasLayoutSnapshot()` 只做 structural migration，`decodeCanvasLayoutSnapshot()` 再执行 `assertCanvasLayoutSnapshot()`。

当前 Canvas-owned Version 由 `CANVAS_CHANGE_VERSION`、`CANVAS_LAYOUT_SCHEMA_VERSION`、`MEDIA_WORKFLOW_SCHEMA_VERSION`、`CANVAS_SCHEMA_VERSION` 与 `CORE_MEDIA_WORKFLOW_NODE_VERSIONS` 导出。Node Version Map 有意只闭合于 Canvas 自己拥有的 Node Kind，不代表系统中全部合法 Workflow Node。未知 Plugin Node 即使当前未安装，也会保留其 type、可选正整数 nodeVersion、JSON-safe config 与图关系并保持可读；当前 Host 是否存在对应 `type@version` Definition/Executor 由 N10/N12 决定。

Future Canvas/Core Schema 与 Future Canvas-owned Node Version 使用稳定 `CanvasMigrationError` fail loud，不猜测降级。Unknown Plugin Node Version 会被原样保留，而不是被误判为 Core future version。Current-version durable object 会拒绝 unsupported field，避免 Writer 新增持久字段却忘记显式改 Version/Migration 时，被旧 Reader 静默丢弃。历史 Session Event 永不重写。

Golden fixture 固定 V1 workflow、snapshot、layout、run-history compatibility data、一个退役的 pre-registry `image.create@v1` Node，以及一份 unavailable plugin-node workflow。退役别名只在读取历史数据时接受，迁移为 `image.generate@v1` 并产生 `CANVAS_DEPRECATED_NODE` notice；当前 Writer 永不写出该别名。Plugin fixture 证明 Durable Workflow 在不查询 Plugin Registry 的情况下仍保持可读。

`CanvasRunHistoryEntry` 继续是由 Session 派生的 bounded query/compatibility DTO，不是第二套 Durable Schema Authority。其 decoder 校验当前 DTO field、Run Lifecycle 时间与 Media Reference metadata；未来任何物理 History Cache 都必须可从 Session History 重建，并独立版本化自己的存储格式。

## Event Sourcing 与 Replay

每个被接受的语义 Canvas mutation 都对应一个 `canvas/change` Session Event，并携带完整 post-change `CanvasSnapshot`；`clear` 携带 `canvas: null`。`decodeCanvasChange()`、`applyCanvasChange()`、`applyCanvasEvent()` 与 `foldCanvas()` 构成严格 Replay 链路。当前 Run writer 使用 `run-start` 后接 `run-update`；`run-update` 覆盖 queued/running milestone，以及 `completed`、`failed`、`cancelled`、`interrupted` 四种 terminal 状态。早期 N03 的 `run-complete` 仅为历史 Session replay compatibility 保留。

严格 Fold 会在整个 Session 范围跟踪 CanvasId 与 RunId。`CanvasRunId` 在完成后不能复用，即使清空 Canvas 后又在同一 Session 创建新 Canvas 也不能复用。Run lifecycle update 必须保持 Run/Workflow identity 与 `startedAt` 不变，只推进 `runRevision`；禁止 `running → queued`，terminal 后也绝不允许回到 non-terminal。`completed` 必须同时发布属于该 Run 的 durable output。

CanvasService 自己拥有独立 preflight boundary：调用 `Session.append()` 前先 clone 当前 Fold state，并在 detached state 上完整 `applyCanvasChange()`。随后 Session 提供第二道仓库级边界：同步 `internal/dispatch` invariant 可在 log push 前 veto；log push 是 logical commit point；`session/event` 是 post-commit observe-only publication。Cache 只在 append 成功后同步，因此 append/invariant 失败时 Session Log 与 live Canvas cache 都保持不变。

Editor Layout 使用独立 `canvas/layout-change` Event，每次携带完整 `CanvasLayoutSnapshot` 与当前 audit metadata。`foldCanvasLayout()` 重建最新 durable layout history。Package invariant 在 Session 发布前联合 fold Canvas 与 Layout stream，因此 Layout Event 不能指向另一个 Workflow，也不能引用当前 Workflow 中不存在的 Node。

Invariant companion 还保护其它 Host 代码直接调用 `Session.append('canvas/change', ...)` 的路径。历史 metadata schema version 1 和 legacy `run-complete` 在 replay 时保持可读，但新的 live Canvas writer 必须使用带规范 actor/source 的 metadata schema v2，Run lifecycle 必须写 `run-update`，并再次通过与 CanvasService 相同的 credential/header/binary Workflow audit-safe 检查。也就是说“旧数据可读”不等于“旧 writer protocol 仍可继续写”。

Deployment Feature Flag 有意完全不进入 durable Canvas Event。能力开关只改变“当前部署现在允许做什么”，绝不会重写历史 Session 所记录的事实。

## Session Projection 与 Editor Layout

当 `ctx.sessionProjections` 被组合时，CanvasService 注册两个 whole-value projection unit：`canvas → CanvasSnapshot | null` 与 `canvasLayout → CanvasLayoutSnapshot | null`。Client-safe `@deepseek-ai/dsh-canvas/client` outlet 携带同一组 Projection、Interaction 与 Capability type declaration，不导入 Host Service。

Projection fold 故意 fail-soft：无关 Event 和格式错误的 Canvas-shaped Event 返回同一 state reference，避免一个 plugin 把共享 projection drive 打断。严格拒绝由 write-side service、durable decoder 和 package invariant 负责。Current-state Projection 保持 UI-scale，不包含 Run History、Binary Media、Provider Raw Response、Log、Progress History、Browser Selection 或 Feature Config。

语义 Workflow 编辑会保留当前 Layout Projection，因为 Layout 有自己的 Event Stream 与 Revision 语义。Canvas `create` 与 `clear` 会把当前 `canvasLayout` Projection 重置为 `null`；旧 Layout Event 仍保留在 Session History，但新当前 Canvas 不会仅因为复用相同 `workflowId` 就继承旧坐标。

`CanvasService.saveLayout()` 接收当前 Workflow id、部分 Node Position 与可选 viewport。它在 Host enforce `canvas.layout.write`，拒绝未知 Node id 或不匹配 Workflow id，由 Host 分配单调时间戳，准确 append 一个 `canvas/layout-change`，且不修改语义 Canvas Snapshot 或任一 Canvas revision。

## Host Authorization 与 Audit

`CanvasPermission` 定义 CanvasService 与 Remote、Agent Tool、History、Asset、Restore、Variant、Layout consumer 共用的 Host action 集，包括 Canvas read/edit/run/cancel、History read、Asset read/export/delete、Workflow restore、Variant create 与 Layout write。

`CanvasAuthorizationService` 是可选 Cordis Service，暴露为 `ctx.canvasAuthorization`。默认 `CanvasAuthorizationPolicy` 适合当前单用户部署，允许 human、agent、system actor；部署可以按 permission 覆盖允许的 actor kind。CanvasService 始终在 Host 做 Authorization，包括 Browser Remote 与 Layout write。创建带 `currentVariantId` 的初始 Canvas 时，除普通 `canvas.edit` 外还必须通过专门的 `canvas.variant.create` permission。

`CanvasAccessContext` 只携带 durable-safe actor/source id 和可选 request/correlation id。Audit metadata 通过 allow-list materialize。语义 Workflow config 在 commit 前扫描受禁 credential/header/binary 类字段；拒绝诊断只说明字段位置，不回显字段值。Package invariant 会在 live Session pre-commit 再执行一次 audit-safe 检查，因此 direct Host append 不能变成 credential bypass。

Authorization 与 Feature Policy 是独立检查。Authorization 回答“这个 actor 是否有权执行”；Deployment Capability 回答“这个安装当前是否提供这项能力”。Canvas mutation/query entry 会先做 Authorization，再在 domain commit 前做 Feature Policy；Feature Flag 不会替代 ACL，也不能通过直接调用 Host Service 绕过已关闭能力。

## Deployment Feature Policy

N09 新增 `CanvasFeatureService`，从 `@deepseek-ai/dsh-canvas/feature-service` 挂载为 `ctx.canvasFeatures`，并发布 deployment-global Typert namespace `canvasFeatures`。其经过校验的 Cordis Config 统一拥有 8 个开关：`canvas.enabled`、`editor.enabled`、`history.enabled`、`video.enabled`、`variants.enabled`、`partialRun.enabled`、`regionEdit.enabled`、`providerFallback.enabled`。

Shipped default 与当前实际已存在能力保持一致：Canvas、Editor Shell、History 默认开启；Video、Variants、Partial Run、Region Edit、Provider Fallback 默认关闭。`canvas.enabled` 是父能力：它为 false 时，即使某个 child raw toggle 为 true，所有 child effective capability 也都会是 false。`remote.canvasFeatures.get()` 只返回 immutable effective capability map，不暴露 raw deployment config。

Feature Policy 控制“新的使用”，不抹掉“历史可读性”。即使 Canvas 或某个 child capability 关闭，`CanvasService.get()` 仍保持授权后的可读，Session Replay/Projection 仍继续解析旧数据。因此 `video.enabled=false` 时历史 Video Workflow 仍可打开；用户可以删除/断开 disabled Video Node，或整体替换成当前支持的 Workflow，但不能新增 Video Node、修改或主动使用 disabled Video Node，也不能让该 Workflow 通过 `assertWorkflowExecutable()`。

当前 Host enforcement 已覆盖 Canvas mutation、Browser Editor write、Editor Layout save、Run History query、初始 Variant identity 与带 Region 的 Interaction Stage。`editor.enabled=false` 会阻止 Browser 手工 Workflow mutation 与 Layout write，但保留 Host/Agent 语义编辑能力，供后续 Agent Tool path 使用；`history.enabled=false` 阻止 History Query；`variants.enabled=false` 阻止新的 Variant identity；`regionEdit.enabled=false` 即使 caller 绕过 UI 直接提交带 Region 的 Stage 也会被 Host 拒绝。

`run` 当前尚未实现，因此 N09 不为了测试 Flag 而发布假的 execution endpoint。`CanvasFeatureService.assertWorkflowExecutable()` 是被冻结的 Host Admission seam，N15/N16 在创建任何 Provider/Job work 前必须调用；N10/N18 也应消费同一个 `ctx.canvasFeatures`，决定哪些 Node/Tool capability 可以创建或对模型广告。

## CanvasService

Package 默认导出 `CanvasService`，挂载为 `ctx.canvas` 并发布到 Typert namespace `canvas`。它是当前 Canvas read、已接受 Canvas/Layout write 和 bounded Session-derived History 的单一 Host façade。它要求 Agent 必须是 `ctx.agents` 中的 exact live object，同时 `agent.session` 也必须是当前 `ctx.sessions` 中注册的 exact live Session；仅把一个 detached `Session.create()` 包进已注册 Agent 不构成合法 durable write path。之后才会执行 Authorization、适用的 Deployment Capability、Semantic/Layout invariant、Audit Safety，以及完整 detached Fold transition；只有 append 成功后才同步 derived cache。

`create()` 安装初始 Workflow；`replaceWorkflow()` 与 `editWorkflow()` 使用 `WorkflowRef { canvasId, workflowId, workflowRevision }` 做 compare-and-set。Canvas identity、Workflow identity 与 revision mismatch 分别返回不同稳定错误；`runRevision` 仍故意不进入 semantic fence。若 edit/replace 得到的最终 Workflow 与当前 Workflow 语义完全相同，则直接返回 current state，不 append、也不制造新 revision。否则 `editWorkflow()` 把完整 `WorkflowEditOperation[]` 应用到 detached draft，最终校验后只 commit 一次。

`selectOutput()` 只改变 primary result selection，并同样具备 no-op 语义；`saveLayout()` 写独立 Layout Stream。`clear()` 是 destructive mutation，因此同样接收 `WorkflowRef` CAS，而不是只有 CanvasId；当前 Run 仍为 queued/running 时拒绝 tombstone。N16 必须先把该 Run durable 收敛成 `cancelled` 或 `interrupted`，之后才能 clear，避免长时间 Provider/Job 失去 Canvas owner。

## Browser Remote 与 Run History

生成的 `./remote` contribution 现在从同一个 package 暴露 3 个 namespace：durable `canvas`（`editWorkflow`、`replaceWorkflow`、`selectOutput`、`saveLayout`、`clear`、`listRuns`、`getRun`）、deployment-global 只读 `canvasFeatures`（`get`），以及 request-local `canvasInteraction`（`stage`、`discard`）。Generated artifact 仍是 build output，绝不手工维护。

Browser caller 不会为普通 Canvas mutation 传入 `CanvasAccessContext`：专用 Remote wrapper 会在 Host 创建 `human` + `browser-remote` access，再调用与其它 consumer 共用的 CanvasService 方法。Mutation 只返回小型 receipt；Browser 通过 Session Projection 读取已提交的当前 Canvas/Layout，因此刻意不存在 `getCurrent` RPC。`clear` Remote 现在携带 `WorkflowRef`，因此 stale Browser Tab 无法删除更新后的 semantic revision。

`listRuns()` 与 `getRun()` 直接从 `canvas/change` Event 派生 History。分页 newest-first，默认 20 条，超过 100 会拒绝；opaque cursor 锚定 run-start Session sequence，因此分页过程中后来新增的 Run 不会重排已经开始的游标遍历。History 只返回 durable run/output DTO，不建立第二套 History Database。N09 在 Host Authorization 后再用 effective History capability gate 这两个调用。

公开的 `CanvasRemoteMethodName` 仍预留 `createVariant`、`restoreWorkflow`、`run` 与 `cancel`，交给后续 owning Domain。Host 行为不存在时不会注册这些 Remote endpoint；UI 不发布假的 success path。

## Request-local Canvas Interaction Context

`CanvasInteractionContext` 有意处于 `CanvasSnapshot`、`MediaWorkflow`、`canvas/change` 与 Session Projection 之外。它是一次性 Browser Snapshot，用来解释“这个 / 这张 / 这里 / this / this image / this node / here”等指代。DTO 携带 `canvasId`、`workflowId`、采样时 `workflowRevision`、可选 UI mode、selected node/edge ids、durable selected assets、current-output focus，以及可选 normalized region/mask seam。

`decodeCanvasInteractionContext()` 会严格限制并解码 Browser 输入。Stage 时 `resolveCanvasInteractionContext()` 校验 Canvas/Workflow identity、同 revision 的 Node/Edge membership、Current Output focus，并把 revision drift 保留成显式 stale state，而不是偷偷把 selection 重绑到新 revision。Selected asset 还必须能证明是同一 Session 的精确历史 Canvas Output。

Host 通过 `@deepseek-ai/dsh-canvas/interaction-service` 挂载 `CanvasInteractionService`。它是本 package 中一个直接 `TypertRemoteService`，发布为 `canvasInteraction` namespace，不拥有 durable state。`stage()` 保存短寿命 `{ agent, rpcId } → interaction snapshot` correlation；`discard()` 在 Prompt admission 失败时删除尚未绑定的 stage。N09 让该 bridge 必须依赖 `canvasFeatures`，并在 stage 前 enforce Canvas/Region Edit capability。

Browser Prompt carrier 本来就会在 transport 前 mint ordinary Prompt RPC id。`ui-conversation` 允许 feature prepare 这个 exact id，因此 `ui-canvas` 可以在普通 `session.prompt` 发出前 stage 已冻结 Selection，而无需扩宽 Host Prompt payload。Host 随后把 RPC id 绑定到精确 User Message id；并发发送或长时间 Queue 都不会靠时间猜测把一条 Selection 错绑到另一条 Prompt。

在 `agent/pre-step`，只有真正 surviving downstream policy 的 bound User Message 才会获得 Canvas Context。Bridge 会在这条精确 Prompt 前插入一条 user-role plugin `snapshot` message，然后消费 binding。正常 Agent Loop 会在 Model Request 前把两条 Message 都写进 Session History。Browser Selection 本身仍是 ephemeral；durable 的只有模型实际收到的 Context Text，因此满足“model-visible content 必须走 logged channel”的系统不变量。

如果 Prompt 排队期间 Workflow Revision 已推进，Context 会渲染 `STALE` 并要求 Agent 在修改采样 Target 前先执行 `canvas_read`；如果 Prompt admission 后 Canvas/Workflow 已不可用，这条已接收 Prompt 仍会以 `STALE/UNAVAILABLE` Context 继续运行，而不是事后失败。缺失 Selection Field 会被显式说明，模型不得自行猜 Target。

## Browser Presentation Consumer

Shipped Web 把 `@deepseek-ai/dsh-client-ui-canvas` 挂载成 capability-gated `conversation.view` consumer。它先通过 `remote.canvasFeatures.get()` 获取 effective capabilities；Canvas disabled 或 discovery 失败时不注册 Canvas Tab。启用后，当前 Canvas/Layout 仍只来自 Session Projection，而 Minimal/Editor Mode 与 Interaction Selection 保持为 per-session Browser-local presentation state。常驻 Conversation Composer 仍由 `ui-conversation` 在 view ring 之外拥有。

N09 在 `editor.enabled=false` 时强制 Minimal-only；对于历史 disabled Video Node/Result 不会隐藏数据，而是保留并把不支持的 Video Node 标记为 unavailable。N08 的 Node/Edge/Output Selection 继续承担自然语言指代；Region Edit 关闭时 Browser Send Boundary 会剥掉 Region，同时 Host 仍独立拒绝绕过 UI 直接提供 Region。

Canvas client outlet 对 Browser 保持 runtime-free：UI package 只以 type-only 方式消费 DTO/Projection/Interaction/Capability declaration，不会把 Host-domain Canvas JavaScript 加载进 Browser bundle。

## 模型体验

### Session-native Canvas Interaction Context

#### 模型看到什么

不会增加常驻 Canvas Prompt 或 Feature Table。当且仅当普通 User Prompt 携带具体且已启用的 Canvas Selection 时，模型才会在该 Prompt 前收到一条 logged plugin-context message。它只包含实际存在的采样/当前 Workflow Revision 状态，以及 selected Node、Edge、durable asset、focused output 或已启用 Region。Stale Selection 会明确要求模型先调用 `canvas_read`；没有 Selection 就不会贡献 Canvas Message，也不得猜测。

#### Token 影响

Event Sourcing、Projection、Layout Persistence、Migration、Authorization、Audit、Feature Discovery、Replay、Remote Mutation 与 History 都不直接增加模型 Token。Interaction Context 只在真正携带 Selection 的 Prompt 上增加 bounded turn-local token；其精确文本之所以 durable，是因为它作为 model-visible history 被记录，而不是从未来 Browser State 重建。

#### KV Cache 影响

不会增加新的常驻 System Prefix。Interaction Message 属于普通 turn-local history，只从使用 Selection 的那一 Turn 起影响 Conversation suffix。

## 已知限制与后续工作

- **Feature Policy 是 Capability，不等于实现本身** — Future Video/Variants/Partial Run/Provider Fallback 的 Flag 现在存在，是为了让后续节点共享同一 Deployment Truth；把 Flag 打开不会凭空生成尚未实现的 Endpoint、Provider 或 UI。
- **没有真实 Run/Retry/Cancel 行为** — `run` 与 `cancel` 仍是预留名，不是已注册 endpoint；N15/N16 必须在 Jobs/Provider work 前调用 N09 的 execution-capability seam。N03 这里只冻结 durable `run-start` / `run-update` lifecycle vocabulary。
- **Interaction Selection 不是 Agent Tool** — Interaction Context 已给模型 grounded referent，但真实 Canvas read/edit/run Tool 属于后续节点；stale guidance 引用规划中的 `canvas_read` contract。
- **Region 支持只是 Seam，不是可视化 Mask Editor** — normalized region/mask DTO 已支持并受 Feature gate 控制，但绘制/编辑 Mask 与 Inpaint/Outpaint 仍属于后续 Workflow/UI。
- **当前 Authorization Policy 只按 Actor Kind 判断** — Identity Ownership、多用户 Tenant、Workspace ACL、Approval Policy、Quota 与 Provider Cost Admission 属于同一 Host seam 后的后续治理层。
- **Variant Create 与 Workflow Restore 尚未实现** — Remote 名称已预留，但在 Host mutation 存在前不会发布 endpoint。
- **尚无 DAG 执行校验** — Cycle、注册 Node Port Definition、Capability Resolution 与 Scheduler check 属于 Media Workflow Engine。
- **尚无 Video Storage 实现** — `VideoAssetRef` 只表示 durable metadata；独立 Media Asset capability 负责 bytes、Authorization 与 Range read。
