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

Canvas Authorization 属于 Host，并由所有 transport/tool consumer 共用。`CanvasPermission` 为 Browser Remote、Agent Tool、History、Asset、Restore、Variant 和 Layout 路径定义统一 action。`CanvasAuthorizationService` 是可选 Cordis Service；挂载后 CanvasService 始终调用它，未挂载时使用同一 allow-list policy implementation 作为当前单用户 fallback。UI 是否显示控件从来不承担权限 Enforcement。

请求 identity 是显式数据。`CanvasAccessContext` 包含 `human`、`agent` 或 `system` actor、已知 request source，以及可选 request/correlation id。直接 Host 调用省略该上下文时，CanvasService 默认使用 owning exact live Agent；Browser、Agent Tool、Reconciler 和 Asset Route consumer 负责提供实际 source context。

`canvas/change.meta` 与 event envelope 独立演进。历史 metadata schema version 1 保持可读，不会事后虚构从未记录的 actor。当前 writer 使用 metadata schema version 2，只持久化规范化 actor/source/request/correlation 字段。Authorization decision 本身不作为第二套 durable authority；真正的持久事实是被接受的 mutation 及其 actor/source attribution。

Credential 和 binary 通过两层规则排除。Audit metadata 使用 allow-list projection，不序列化任意 caller context；语义 Workflow config 在 commit 前拒绝明显 credential/header/binary 字段。Diagnostic 只命名禁止字段／路径，从不回显被拒绝的 secret value。因此 Provider credential、Authorization Header、Callback Secret 和 binary payload 都不会进入 Workflow 或 Session data。

实施工作拆分为 [Canvas V2.1 workplan](../../../workplans/canvas-v2.1/README.md) 中可独立评审的节点。Canvas package 在 Projection、Remote、Provider 执行和 UI 之前，负责 Domain Value、Migration、严格 Replay、Runtime Invariant、Host Write Service，以及 Host Authorization/Audit。

## Alternatives considered

**继续把 Canvas 作为独立 iframe 应用** — 不作为长期 authority 模型。iframe 可以继续承担 presentation integration，但独立进程／数据库无法提供同时由 Harness Tool 和 Browser 直接编辑、并可通过 Session replay 重建的单一状态。

**复用现有由模型编写脚本的 WorkflowEngine 执行媒体 DAG** — 不采用。该引擎执行 orchestration script，不负责可编辑媒体节点、持久输出、媒体局部执行、Provider capability 解析或 Canvas revision 语义。

**让浏览器编辑器成为 authority，再把 Agent 修改同步进去** — 不采用。这样 durability 会依赖浏览器生命周期和重连行为，而且 Agent 工作无法在不增加第二套同步协议的情况下由 Session log 重建。

**工作流编辑和运行进度共用一个 revision** — 不采用。长耗时图片／视频任务会持续让彼此独立的编辑 mutation stale，使 compare-and-set 冲突与语义图修改无关。

**Schema 改变时重写历史 Session Event** — 不采用。Event History 保持 append-only；reader 把旧值 decode/migrate 成当前 runtime value，不支持的未来版本显式失败。

**把 node-level delta event 作为 Canvas authority** — 不采用。细粒度 delta 会让 replay 与 atomic multi-operation edit 依赖部分中间状态。每个已接受业务 mutation 只记录一个完整 post-change snapshot，使 Session Log 足以 replay，同时 semantic operation 仍只是 request-side 输入。

**在追加 Session Event 前先更新 Service Cache** — 不采用。Cache 是 derived state，不能在 durable commit point 前对外可见；append 失败必须同时保持 Log 与 Live View 不变。

**只在 Browser 或 Agent Tool Adapter 做 Authorization** — 不采用。第二种 caller 可以直接绕过检查。Canvas permission 由所有当前和未来 consumer 共用的 Host Service 决定。

**为了 Audit 直接序列化任意 Request Context** — 不采用。Request object 可能含 credential、header、callback 或 binary。Durable audit 只保留小型 allow-listed actor/source record。

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
- 每个 CanvasService read/mutation 都经过 Host Authorization；被拒绝时 Session Log 保持不变。
- Human、Agent、System Actor 共用同一 Permission Vocabulary，System Reconciler mutation 能在 durable audit metadata 中被识别。
- 历史 metadata v1 原样 replay，当前 writer 记录规范化 metadata v2。
- Audit serialization 丢弃任意 caller extra 字段；credential/header/binary Workflow 数据在 Session append 前被拒绝，且错误信息不回显 secret value。
- Projection、Remote、Provider 执行、Agent Tool、Asset Route 与 UI 继续作为同一 CanvasService/Authorization seam 的独立 consumer，而不是绕过它们。

## Risks

相比 delta event，完整 snapshot 会让单个 Canvas Event 更大，因此 `CanvasSnapshot` 必须保持 UI-scale：不得加入 Binary Payload、Full History、Provider Raw Response 或 Progress History。Service Cache 必须始终只是优化而不是 authority，所以任何 cache 行为都要有等价 cold-replay 结果。当前 Authorization Policy 只区分 Actor Kind，还不是完整 Tenant/ACL Ownership；后续 Identity 和 Governance 层必须在同一个 Host seam 后增强 policy，不能把 Authorization 逻辑分叉进每个 consumer。
