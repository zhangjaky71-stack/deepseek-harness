# Agent Note：Session-native 生成式媒体 Canvas

Status: proposed

[English](2026-08-19-session-media-canvas.md) | 中文

## Problem

Harness 需要一个由 Agent 和人共同操作的媒体创作界面，同时不能把 authority 分裂到仅浏览器存在的编辑器状态、独立应用数据库和模型工具状态中。图片和视频生成还会产生长耗时任务与 durable binary artifact，这些内容不应进入 Session JSON payload。

## Proposal

Canvas 是会话范围内的领域，其 durable authority 是 Session log。Host Canvas service 负责业务 mutation；Browser Remote 与面向模型的 Canvas Tool 调用同一个 service。Minimal 与 Editor 投影同一个语义 Workflow，而不是维护两套 document model。

领域将 `workflowRevision` 与 `runRevision` 分离。语义 Workflow 编辑只推进 `workflowRevision`；运行生命周期变化只推进 `runRevision`。每个 run 记录实际执行的不可变 workflow revision，因此旧 run 继续运行时编辑当前 Workflow 不会改变该 run，也不会让 progress update 把 Editor compare-and-set fence 无关地置为 stale。

语义 Workflow 只包含媒体领域节点、边、输出 id 和 JSON-safe config。Editor Layout 是独立持久化的 presentation value；Provider 请求 payload 属于 Provider data，生成媒体使用 durable reference，而不是保存 binary bytes 或 bearer URL。图片复用 `dsh-attachment` 已拥有的 attachment identity；视频存储属于独立 capability。

Durable Canvas value 在执行当前领域 invariant 前先经过明确的 decode/migration 链路。历史 Session data 保持 append-only；旧值只在内存中迁移。未知 future Canvas/Core Schema Version 和 Canvas-owned Node Version 显式失败，不猜测降级。未知 Plugin Node 在 Registry Definition 缺失时仍保持结构可读，并保留 Stored Type/Version/Config；当前是否可用和可执行由 Node Registry/Engine 决定。退役历史 Core Node Alias 产生明确 lifecycle notice，同时不能成为当前 writer 的合法输出。详细 ownership 与 strict current-schema 规则见 [Canvas open-world node migration](../architecture/2026-08-20-canvas-open-world-migration.zh.md)。

每个被接受的语义 Canvas mutation 对应一个 `canvas/change` Session Event，并携带完整 post-change `CanvasSnapshot`；`clear` 携带 null tombstone。严格纯 fold 校验相邻 mutation 的关系，package invariant 在 Session 发布前独立 stage 下一份 fold state。Host `CanvasService` cache 只从 committed log 派生，在 `session.append()` 成功前不会发布 cache state。

Workflow 编辑使用 `WorkflowRef { canvasId, workflowId, workflowRevision }` 做 compare-and-set。该 fence 故意排除 `runRevision`，因此运行生命周期变化不会让无关语义编辑 stale。一批 Workflow operation 先应用到 detached draft，再作为完整 Workflow 校验，最终只会由一个 Event 整体提交，或者完全不提交。

Canvas Authorization 属于 Host，并由所有 transport/tool consumer 共用。`CanvasPermission` 为 Browser Remote、Agent Tool、History、Asset、Restore、Variant 和 Layout 路径定义统一 action。`CanvasAuthorizationService` 是可选 Service；挂载后 CanvasService 始终调用它，未挂载时使用同一 allow-list policy implementation 作为当前单用户 fallback。UI 是否显示控件不承担权限 enforcement。

Request identity 是显式数据。`CanvasAccessContext` 包含 `human`、`agent` 或 `system` actor、已知 request source，以及可选 request/correlation id。`canvas/change.meta` 与 event envelope 独立演进：历史 metadata schema version 1 保持可读，当前 writer 记录规范化 actor/source metadata v2。Durable audit 使用 allow-list，语义 Workflow data 在 commit 前拒绝受禁 credential/header/binary 类字段。

Editor Layout 拥有独立 durable stream。`canvas/layout-change` 每次携带完整 `CanvasLayoutSnapshot` 与当前 audit metadata。Layout write 使用 `canvas.layout.write` 权限，必须指向当前 Workflow identity，不能引用当前 Workflow 中不存在的节点，也不会推进任何 Canvas revision。Combined package invariant 会在 Session 发布前联合校验 Canvas 与 Layout stream。

Browser current state 使用 Projection，而不是查询第二套数据库。当 Session Projection 被组合时，CanvasService 注册 `canvas → CanvasSnapshot | null` 和 `canvasLayout → CanvasLayoutSnapshot | null`。两个 Projection 都是 whole-value、UI-scale，不包含 History、Binary Payload、Provider Raw Response、Log 或 Progress History。Projection fold 故意 fail-soft，对无关／格式错误 Event 返回同一 state reference；严格拒绝仍由 durable write/replay path 负责。

语义 Workflow 编辑会保留 current Layout，因为 Layout 有独立 stream。Canvas `create` 与 `clear` 会把 current layout projection 重置为 null，避免后续 Canvas 仅因为复用了相同 `workflowId` 就继承旧坐标。历史 Layout Event 继续保留在 Session Log，因此仍可作为历史审计／重放数据存在，但不会成为当前状态。

Client-safe `@deepseek-ai/dsh-canvas/client` outlet 携带 Canvas 与 Layout Projection 类型，不导入 Host Service。Browser current state 因而只来自 Session Projection；Canvas 不提供 `getCurrent` Remote 方法。

Browser mutation 使用同一个 `CanvasService` 上的 Typert Remote wrapper。Wrapper 只接收业务参数，在 Host 构造 `human` + `browser-remote` access，再调用普通 Host mutation，因此 Browser 无法伪造 system 或 Agent actor。Mutation 只返回小型 receipt；后续 current value 由 Projection 到达 Browser。

Run History 是从 `canvas/change` 派生的 bounded query view，不是第二套 durable store。`listRuns` 按 newest-first 返回，默认 20 条，硬上限 100；opaque cursor 锚定 run-start Session sequence，因此分页过程中后来 append 的新 run 不会重排已经开始的遍历。`getRun` 按 run id 派生同一 DTO。History response 只包含 durable reference 与 run metadata，不包含 binary media 或 Provider runtime object。

Remote namespace 只发布 Host 上已经存在的行为。当前 active endpoint 是 `editWorkflow`、`replaceWorkflow`、`selectOutput`、`saveLayout`、`clear`、`listRuns` 和 `getRun`。公开 method-name type 预留 `createVariant`、`restoreWorkflow`、`run` 与 `cancel`，但在对应 Host mutation 存在前不注册 endpoint。生成的 `./typert` 与 `./remote` artifact 继续属于 build output，而不是手工维护源码。

`dsh-base` 在每个 profile 中挂载 `@deepseek-ai/dsh-canvas`。Browser Remote 与后续 Agent Tool 因而解析到同一个 Host Service，不依赖 Web-only Canvas owner。

Web 表层现在把 `@deepseek-ai/dsh-client-ui-canvas` 作为一个 `conversation.view` consumer 挂载在上述 Projection 之上。Minimal 与 Editor 是同一 authoritative state 上的 Browser-local presentation mode；切换 mode 不产生 Session Event，常驻 Conversation Composer 继续位于 view ring 之外。N07 shell 实现八状态 Product State 与 stale-result 行为，但在 Host execution 存在前保持 Run/Retry/Cancel disabled。UI 专属 rationale 由 [Canvas Web Shell Agent Note](2026-08-20-canvas-web-shell.zh.md) 负责。

实施工作拆分为 [Canvas V2.1 workplan](../../../workplans/canvas-v2.1/README.md) 中可独立评审的节点。Canvas package 负责 Domain Value、Migration、严格 Replay、Runtime Invariant、Host Authorization/Audit、bounded Projection、独立 Layout Persistence、Typert Mutation/History API 与单一 Host façade。Web Presentation 是独立 Consumer；Provider 执行、Agent Tool 与 Media Asset 仍属于后续层。

## Alternatives considered

**继续把 Canvas 作为独立 iframe 应用** — 不作为长期 authority 模型。iframe 可以承担 presentation integration，但独立进程／数据库无法提供同时由 Harness Tool 和 Browser 直接编辑、并可通过 Session replay 重建的单一状态。

**复用现有由模型编写脚本的 WorkflowEngine 执行媒体 DAG** — 不采用。该引擎执行 orchestration script，不负责可编辑媒体节点、durable output、媒体局部执行、Provider capability 解析或 Canvas revision 语义。

**让浏览器 Editor 成为 authority，再把 Agent 修改同步进去** — 不采用。这样 durability 会依赖浏览器生命周期和重连行为，而且 Agent 工作无法在不增加第二套同步协议的情况下由 Session log 重建。

**把节点坐标放入 `MediaWorkflow`** — 不采用。拖动节点会产生 semantic workflow revision，使 Agent/Editor CAS fence stale，并让执行 fingerprint 依赖纯 presentation state。

**通过独立 `getCurrent` RPC 暴露当前 Canvas** — 不采用。第二套 current-state query path 会与 Session Projection 竞争。Browser 当前状态来自 Projection；Remote 只负责 mutation 与 bounded history query。

**把 Run History 持久化到独立 Canvas 数据库** — 不采用。Session 已记录 durable Run lifecycle 与 Output；第二个 store 会引入同步与冲突规则。History query 直接从 append-only Session log 派生。

**允许 Browser caller 传入 `CanvasAccessContext`** — 不采用。Actor/source attribution 是 Host transport 责任；由 Browser 提供会让不可信 caller 冒充其他 actor kind。

**工作流编辑和运行进度共用一个 revision** — 不采用。长耗时媒体任务会持续让彼此独立的编辑 mutation stale。

**把 node-level delta event 作为 Canvas authority** — 不采用。细粒度 delta 会让 replay 与 atomic multi-operation edit 依赖部分中间状态。Whole post-change value 让 Session replay 足以恢复状态。

**只在 Browser 或 Agent Tool Adapter 做 Authorization** — 不采用。第二种 caller 可以绕过检查。Canvas permission 由所有 consumer 共用的 Host Service 决定。

## Acceptance criteria

- Canvas/workflow/run value、Schema Migration 和语义 invariant 与 UI/Provider 解耦。
- 包含当前 unavailable Plugin Node 的 Durable Workflow 仍保持可读、可 Replay；执行可用性由当前 Node Registry/Engine 在后续决定。
- `canvas/change` cold replay 与 live Canvas state 完全一致。
- Workflow CAS 只 fence semantic revision；run revision change 不会让 edit stale。
- 当前 Canvas read/mutation 都经过 Host Authorization，被接受 mutation 带 durable actor/source attribution。
- `canvas/layout-change` 与 semantic workflow revision 独立，指向错误 Workflow 或不存在节点时必须被拒绝。
- `CanvasService.saveLayout()` 不改变 `workflowRevision` 或 `runRevision`。
- Session Projection 对本领域只暴露 `canvas` 与 `canvasLayout` 两个 whole current value，并且不会随 Session History 线性膨胀。
- Canvas/Layout mutation 后 cold projection replay 与 live projection state 相等。
- Semantic Workflow edit 保留 Layout；Canvas create/clear 重置 current layout projection，同时不重写历史 Layout Event。
- Canvas Service fiber 卸载时 Projection registration 一并 disposal。
- Browser-facing Projection 与 Remote DTO type 通过 client-safe package face 提供。
- Canvas 不提供 `getCurrent` Remote endpoint；已提交 current state 继续通过 Session Projection 到达 Browser。
- Browser Remote mutation 使用 `human` + `browser-remote` attribution，并在 Session append 前经过 Host Authorization。
- 发出 cursor 后再 append 更新的 run，Run History 分页仍保持 bounded 且稳定。
- 生成的 Canvas Remote contribution 通过 `api-remotes` 挂载，built HTTP chain 可以实际修改 Host Canvas state。
- 所有 shipped profile 都通过 `dsh-base` 挂载同一个 Host `ctx.canvas` Service。
- Web Canvas View 消费 Session Projection，不替换 Conversation Composer，也不创建第二套 durable Canvas state。
- Provider 执行、Agent Tool、Asset Route 与 UI 继续作为同一 Session/Canvas authority 的 consumer，而不是独立状态源。

## Risks

Whole Canvas Event 比 delta 更大，因此 `CanvasSnapshot` 与 Projection value 必须保持 UI-scale。Layout 与 semantic graph 故意独立演进；未来 Editor 必须把坐标视为可选 presentation hint，并忽略与当前 graph 不相关的 entry。Projection 与 History 都是 derived view，不是 durability；Session replay 与严格 package invariant 仍是 authority。稳定 cursor 语义依赖 append-only Session sequence。当前 Browser human id 在单用户部署中只是 session-level surrogate；未来 Identity layer 必须替换该 attribution，同时仍把 Authorization 留在 Host。Browser Product State helper 有意与 Host 规则保持同构，而不是 runtime Host import，因此 State Machine 改动必须同步更新两侧并由测试固定。当前 Authorization Policy 只区分 Actor Kind，未来多用户 ownership 需要在同一 Host seam 后增强 policy，而不是把权限逻辑分叉到各 consumer。
