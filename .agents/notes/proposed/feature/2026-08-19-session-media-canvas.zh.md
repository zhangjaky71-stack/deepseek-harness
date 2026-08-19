# Agent Note：Session-native 生成式媒体 Canvas

Status: proposed

[English](2026-08-19-session-media-canvas.md) | 中文

## Problem

Harness 需要一个由 Agent 和人共同操作的媒体创作界面，同时不能把 authority 分裂到仅浏览器存在的编辑器状态、独立应用数据库和模型工具状态中。图片和视频生成还会产生长耗时任务与持久二进制产物，这些内容不应进入 Session JSON payload。

## Proposal

Canvas 是会话范围内的领域，其 durable authority 是 Session log。Host Canvas service 负责业务 mutation；Browser Remote 和面向模型的 Canvas Tool 调用同一个 service。Minimal 与 Editor 投影同一个语义工作流，而不是维护两套 document model。

领域将 `workflowRevision` 与 `runRevision` 分离。语义工作流编辑只推进 `workflowRevision`；运行生命周期变化只推进 `runRevision`。每个 run 记录实际执行的不可变 workflow revision，因此旧 run 继续运行时编辑当前工作流既不会改变该 run，也不会让 progress 更新把编辑器的 compare-and-set fence 无关地置为 stale。

语义工作流只包含媒体领域节点、边、输出 id 和 JSON-safe 配置。浏览器图布局与 selection 属于 presentation data，Provider 请求 payload 属于 Provider data，生成媒体使用 durable reference 表示，而不是保存二进制 bytes 或 bearer URL。图片复用 `dsh-attachment` 已拥有的 attachment identity；视频存储属于独立 capability。

Durable Canvas 值在执行当前领域不变量前先经过明确的 decode/migration 链路。历史 Session data 保持 append-only；旧值只在内存中迁移。未知未来 Schema/Node Version 显式失败，不猜测降级；已退役的历史节点别名产生明确 lifecycle notice，同时不能成为当前 writer 的合法输出。

每个被接受的 Canvas 业务 mutation 对应一个 `canvas/change` Session Event，并携带完整 post-change `CanvasSnapshot`；`clear` 携带 null tombstone。严格纯 fold 校验相邻 mutation 的关系，package invariant 在 Session 发布前独立 stage 下一份 fold state。Host `CanvasService` 的 cache 只从已提交日志派生，在 `session.append()` 成功前不会发布任何 cache 状态。

Workflow 编辑使用 `WorkflowRef { canvasId, workflowId, workflowRevision }` 做 compare-and-set。该 fence 故意排除 `runRevision`，因此运行生命周期变化不会让无关的语义编辑 stale。一批 workflow operation 先应用到 detached draft，再作为完整 workflow 校验，最终只会由一个事件整体提交，或者完全不提交。

`canvas/change.meta` 与 event envelope 独立版本化。初始 metadata version 不携带 actor 或 authorization decision；Authorization 节点会扩展该 metadata，同时保持历史数据可读。这样 Security Policy 一直由 Host 拥有，又不会迫使第一版 Event Sourcing 先发明一套不完整的权限模型。

实施工作拆分为 [Canvas V2.1 workplan](../../../workplans/canvas-v2.1/README.md) 中可独立评审的节点。Canvas package 在 Projection、Remote、Provider 执行和 UI 之前，先负责 Domain Value、Migration、严格 Replay、Runtime Invariant 与 Host Write Service。

## Alternatives considered

**继续把 Canvas 作为独立 iframe 应用** — 不作为长期 authority 模型。iframe 可以继续承担 presentation integration，但独立进程／数据库无法提供同时由 Harness Tool 和 Browser 直接编辑、并可通过 Session replay 重建的单一状态。

**复用现有由模型编写脚本的 WorkflowEngine 执行媒体 DAG** — 不采用。该引擎执行 orchestration script，不负责可编辑媒体节点、持久输出、媒体局部执行、Provider capability 解析或 Canvas revision 语义。

**让浏览器编辑器成为 authority，再把 Agent 修改同步进去** — 不采用。这样 durability 会依赖浏览器生命周期和重连行为，而且 Agent 工作无法在不增加第二套同步协议的情况下由 Session log 重建。

**工作流编辑和运行进度共用一个 revision** — 不采用。长耗时图片／视频任务会持续让彼此独立的编辑 mutation stale，使 compare-and-set 冲突与语义图修改无关。

**Schema 改变时重写历史 Session Event** — 不采用。Event History 保持 append-only；reader 把旧值 decode/migrate 成当前 runtime value，不支持的未来版本显式失败。

**把 node-level delta event 作为 Canvas authority** — 不采用。细粒度 delta 会让 replay 与 atomic multi-operation edit 依赖部分中间状态。每个已接受业务 mutation 只记录一个完整 post-change snapshot，使 Session Log 足以 replay，同时 semantic operation 仍只是 request-side 输入。

**在追加 Session Event 前先更新 Service Cache** — 不采用。Cache 是 derived state，不能在 durable commit point 前对外可见；append 失败必须同时保持 Log 与 Live View 不变。

## Acceptance criteria

- 纯 Canvas Domain 拥有品牌 Canvas／workflow／node／edge／run／variant id 与媒体领域类型，不依赖 UI 或 Provider SDK。
- Workflow revision 与 run revision 具有彼此独立的不变式和测试。
- Canvas Snapshot 拒绝非 JSON Workflow Config 和携带二进制内容的领域值。
- Durable workflow/snapshot decode 具备版本管理，Migration 与当前关系不变量分离，未知未来版本使用稳定 migration error 显式失败。
- Golden Fixture 固定 V1 workflow、snapshot、layout、run-history 与 deprecated-node compatibility 行为，同时不重写历史数据。
- `canvas/change` 足以通过 cold Session replay 重建当前 Canvas；`clear` replay 后得到 null。
- `CanvasService` 是 Host Mutation Owner，Cache State 只从已提交 Session Event 派生。
- 一批 Workflow Operation 只推进一次 `workflowRevision`，并且不能部分提交。
- Workflow CAS 拒绝过期 semantic revision，同时忽略独立的 `runRevision` 变化。
- Package Invariant 在 Session 发布前拒绝格式错误或不可能的 Canvas Transition。
- Authorization、Actor/Audit Metadata、Projection、Remote、Provider 执行、Agent Tool 与 UI 由各自节点负责，不能绕过 `CanvasService`。

## Risks

相比 delta event，完整 snapshot 会让单个 Canvas Event 更大，因此 `CanvasSnapshot` 必须保持 UI-scale：不得加入 Binary Payload、Full History、Provider Raw Response 或 Progress History。Service Cache 必须始终只是优化而不是 authority，所以任何 cache 行为都要有等价 cold-replay 结果。Authorization/Audit 字段加入时必须有意识地演进 Event Metadata Version，使历史 pre-authorization event 仍可读取，同时不能假装它们记录了从未存在的 actor。
