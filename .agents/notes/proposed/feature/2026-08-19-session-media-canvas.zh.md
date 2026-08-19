# Agent Note：Session-native 生成式媒体 Canvas

Status: proposed

[English](2026-08-19-session-media-canvas.md) | 中文

## Problem

Harness 需要一个由 Agent 和人共同操作的媒体创作界面，同时不能把 authority 分裂到仅浏览器存在的编辑器状态、独立应用数据库和模型工具状态中。图片和视频生成还会产生长耗时任务与 durable binary artifact，这些内容不应进入 Session JSON payload。

## Proposal

Canvas 是会话范围内的领域，其 durable authority 是 Session log。Host Canvas service 负责业务 mutation；Browser Remote 与面向模型的 Canvas Tool 调用同一个 service。Minimal 与 Editor 投影同一个语义 Workflow，而不是维护两套 document model。

领域将 `workflowRevision` 与 `runRevision` 分离。语义 Workflow 编辑只推进 `workflowRevision`；运行生命周期变化只推进 `runRevision`。每个 run 记录实际执行的不可变 workflow revision，因此旧 run 继续运行时编辑当前 Workflow 不会改变该 run，也不会让 progress update 把 Editor compare-and-set fence 无关地置为 stale。

语义 Workflow 只包含媒体领域节点、边、输出 id 和 JSON-safe config。Editor Layout 是独立持久化的 presentation value；Provider 请求 payload 属于 Provider data，生成媒体使用 durable reference，而不是保存 binary bytes 或 bearer URL。图片复用 `dsh-attachment` 已拥有的 attachment identity；视频存储属于独立 capability。

Durable Canvas value 在执行当前领域 invariant 前先经过明确的 decode/migration 链路。历史 Session data 保持 append-only；旧值只在内存中迁移。未知未来 Schema/Node Version 显式失败，不猜测降级；退役历史节点别名产生明确 lifecycle notice，同时不能成为当前 writer 的合法输出。

每个被接受的语义 Canvas mutation 对应一个 `canvas/change` Session Event，并携带完整 post-change `CanvasSnapshot`；`clear` 携带 null tombstone。严格纯 fold 校验相邻 mutation 的关系，package invariant 在 Session 发布前独立 stage 下一份 fold state。Host `CanvasService` cache 只从 committed log 派生，在 `session.append()` 成功前不会发布 cache state。

Workflow 编辑使用 `WorkflowRef { canvasId, workflowId, workflowRevision }` 做 compare-and-set。该 fence 故意排除 `runRevision`，因此运行生命周期变化不会让无关语义编辑 stale。一批 Workflow operation 先应用到 detached draft，再作为完整 Workflow 校验，最终只会由一个 Event 整体提交，或者完全不提交。

Canvas Authorization 属于 Host，并由所有 transport/tool consumer 共用。`CanvasPermission` 为 Browser Remote、Agent Tool、History、Asset、Restore、Variant 和 Layout 路径定义统一 action。`CanvasAuthorizationService` 是可选 Service；挂载后 CanvasService 始终调用它，未挂载时使用同一 allow-list policy implementation 作为当前单用户 fallback。UI 是否显示控件不承担权限 enforcement。

Request identity 是显式数据。`CanvasAccessContext` 包含 `human`、`agent` 或 `system` actor、已知 request source，以及可选 request/correlation id。`canvas/change.meta` 与 event envelope 独立演进：历史 metadata schema version 1 保持可读，当前 writer 记录规范化 actor/source metadata v2。Durable audit 使用 allow-list，语义 Workflow data 在 commit 前拒绝受禁 credential/header/binary 类字段。

Editor Layout 拥有独立 durable stream。`canvas/layout-change` 每次携带完整 `CanvasLayoutSnapshot` 与当前 audit metadata。Layout write 使用 `canvas.layout.write` 权限，必须指向当前 Workflow identity，不能引用当前 Workflow 中不存在的节点，也不会推进任何 Canvas revision。Combined package invariant 会在 Session 发布前联合校验 Canvas 与 Layout stream。

Browser current state 使用 Projection，而不是查询第二套数据库。当 Session Projection 被组合时，CanvasService 注册 `canvas → CanvasSnapshot | null` 和 `canvasLayout → CanvasLayoutSnapshot | null`。两个 Projection 都是 whole-value、UI-scale，不包含 History、Binary Payload、Provider Raw Response、Log 或 Progress History。Projection fold 故意 fail-soft，对无关／格式错误 Event 返回同一 state reference；严格拒绝仍由 durable write/replay path 负责。

语义 Workflow 编辑会保留 current Layout，因为 Layout 有独立 stream。Canvas `create` 与 `clear` 会把 current layout projection 重置为 null，避免后续 Canvas 仅因为复用了相同 `workflowId` 就继承旧坐标。历史 Layout Event 继续保留在 Session Log，因此仍可作为历史审计／重放数据存在，但不会成为当前状态。

Client-safe `@deepseek-ai/dsh-canvas/client` outlet 携带 Canvas 与 Layout Projection 类型，不导入 Host Service。Browser transport 与 rendering 因而可以把 Session Projection 作为唯一 current-state source，同时所有 mutation 继续经过 Host API。

实施工作拆分为 [Canvas V2.1 workplan](../../../workplans/canvas-v2.1/README.md) 中可独立评审的节点。Canvas package 在 Remote、Provider 执行、Agent Tool、Media Asset 和 UI 之前，负责 Domain Value、Migration、严格 Replay、Runtime Invariant、Host Authorization/Audit、bounded Projection、独立 Layout Persistence 与单一 Host write façade。

## Alternatives considered

**继续把 Canvas 作为独立 iframe 应用** — 不作为长期 authority 模型。iframe 可以承担 presentation integration，但独立进程／数据库无法提供同时由 Harness Tool 和 Browser 直接编辑、并可通过 Session replay 重建的单一状态。

**复用现有由模型编写脚本的 WorkflowEngine 执行媒体 DAG** — 不采用。该引擎执行 orchestration script，不负责可编辑媒体节点、durable output、媒体局部执行、Provider capability 解析或 Canvas revision 语义。

**让浏览器 Editor 成为 authority，再把 Agent 修改同步进去** — 不采用。这样 durability 会依赖浏览器生命周期和重连行为，而且 Agent 工作无法在不增加第二套同步协议的情况下由 Session log 重建。

**把节点坐标放入 `MediaWorkflow`** — 不采用。拖动节点会产生 semantic workflow revision，使 Agent/Editor CAS fence stale，并让执行 fingerprint 依赖纯 presentation state。

**通过独立 `getCurrent` RPC 暴露当前 Canvas** — 不采用。第二套 current-state query path 会与 Session Projection 竞争。Browser 当前状态来自 Projection；未来 Remote 只负责 mutation 与 bounded history query。

**工作流编辑和运行进度共用一个 revision** — 不采用。长耗时媒体任务会持续让彼此独立的编辑 mutation stale。

**把 node-level delta event 作为 Canvas authority** — 不采用。细粒度 delta 会让 replay 与 atomic multi-operation edit 依赖部分中间状态。Whole post-change value 让 Session replay 足以恢复状态。

**只在 Browser 或 Agent Tool Adapter 做 Authorization** — 不采用。第二种 caller 可以绕过检查。Canvas permission 由所有 consumer 共用的 Host Service 决定。

## Acceptance criteria

- Canvas/workflow/run value、Schema Migration 和语义 invariant 与 UI/Provider 解耦。
- `canvas/change` cold replay 与 live Canvas state 完全一致。
- Workflow CAS 只 fence semantic revision；run revision change 不会让 edit stale。
- 当前 Canvas read/mutation 都经过 Host Authorization，被接受 mutation 带 durable actor/source attribution。
- `canvas/layout-change` 与 semantic workflow revision 独立，指向错误 Workflow 或不存在节点时必须被拒绝。
- `CanvasService.saveLayout()` 不改变 `workflowRevision` 或 `runRevision`。
- Session Projection 对本领域只暴露 `canvas` 与 `canvasLayout` 两个 whole current value，并且不会随 Session History 线性膨胀。
- Canvas/Layout mutation 后 cold projection replay 与 live projection state 相等。
- Semantic Workflow edit 保留 Layout；Canvas create/clear 重置 current layout projection，同时不重写历史 Layout Event。
- Canvas Service fiber 卸载时 Projection registration 一并 disposal。
- Browser-facing Projection type 通过 client-safe package face 提供。
- Remote、Provider 执行、Agent Tool、Asset Route 与 UI 继续作为同一 Session/Canvas authority 的 consumer，而不是独立状态源。

## Risks

Whole Canvas Event 比 delta 更大，因此 `CanvasSnapshot` 与 Projection value 必须保持 UI-scale。Layout 与 semantic graph 故意独立演进；未来 Editor 必须把坐标视为可选 presentation hint，并忽略与当前 graph 不相关的 entry。Projection 是 current-state cache，不是 durability；Session replay 与严格 package invariant 仍是 authority。当前 Authorization Policy 只区分 Actor Kind，未来多用户 ownership 需要在同一 Host seam 后增强 policy，而不是把权限逻辑分叉到各 consumer。
