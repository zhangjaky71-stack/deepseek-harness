# Agent Note: Session-native generative media Canvas

Status: proposed

[English](2026-08-19-session-media-canvas.md) | 中文

## Problem

Harness 需要一个由 Agent 和人共同操作的媒体创作界面，同时不能把 authority 分裂到仅浏览器存在的编辑器状态、独立应用数据库和模型工具状态中。图片和视频生成还会产生长耗时任务与持久二进制产物，这些内容不应进入 Session JSON payload。

## Proposal

Canvas 成为会话范围内的领域，其持久 authority 是 Session log。Host Canvas service 负责所有 mutation；Browser Remote 和面向模型的 Canvas 工具调用同一个 service。Minimal 与 Editor 展示同一个语义工作流的 projection，而不是维护两套 document model。

领域将 `workflowRevision` 与 `runRevision` 分离。语义工作流编辑只推进 `workflowRevision`；queued/running/terminal 生命周期变化只推进 `runRevision`。每个 run 记录其实际执行的不可变工作流 revision，因此旧 run 继续运行时编辑当前工作流既不会改变该 run，也不会让 progress 更新把编辑器的 compare-and-set fence 无关地置为 stale。

语义工作流只包含媒体领域节点、边、输出 id 和 JSON-safe 配置。浏览器图布局与 selection 属于展示数据，Provider 请求 payload 属于 Provider 数据，生成媒体使用持久引用表示，而不是保存二进制 bytes 或 bearer URL。图片复用 `dsh-attachment` 已拥有的 attachment identity；视频存储属于独立 capability。

实施工作拆分为 [Canvas V2.1 workplan](../../../workplans/canvas-v2.1/README.md) 中可独立评审的节点。第一个节点先建立纯 `@deepseek-ai/dsh-canvas` 词汇、品牌 id、构造器、产品状态派生和 value invariant，再引入 Session 事件或 Provider 执行。

## Alternatives considered

**继续把 Canvas 作为独立 iframe 应用** — 不作为长期 authority 模型。iframe 可以继续承担临时展示集成，但独立进程／数据库无法提供同时由 Harness 工具和 Browser 直接编辑、并可通过 Session replay 重建的单一状态。

**复用现有由模型编写脚本的 WorkflowEngine 执行媒体 DAG** — 不采用。该引擎执行 orchestration script，不负责可编辑媒体节点、持久输出、媒体局部执行、Provider capability 解析或 Canvas revision 语义。

**让浏览器编辑器成为 authority，再把 Agent 修改同步进去** — 不采用。这样 durability 会依赖浏览器生命周期和重连行为，而且 Agent 工作无法在不增加第二套同步协议的情况下由 Session log 重建。

**工作流编辑和运行进度共用一个 revision** — 不采用。长耗时图片／视频任务会持续让彼此独立的编辑 mutation stale，使 compare-and-set 冲突与语义图修改无关。

## Acceptance criteria

- 纯 Canvas package 拥有品牌 Canvas／workflow／node／edge／run／variant id 和媒体领域类型，不依赖 UI 或 Provider SDK。
- Workflow revision 与 run revision 具有彼此独立的不变式和测试。
- Canvas snapshot 拒绝非 JSON 工作流配置和携带二进制内容的领域值。
- 产品状态区分 empty、ready、dirty-ready、running、completed、failed、cancelled、interrupted，包括 run 执行旧 workflow revision 的情况。
- 后续 Session、Remote、Agent、workflow engine、asset、图片和视频节点可以直接消费该领域，而无需引入第二个 Canvas authority。

## Risks

在真实 Provider 与 Editor consumer 出现前，领域可能编码过早假设。只保留已接受 workplan 当前需要的概念，利用仓库预发布阶段允许纠正命名和字段的空间，并要求每个后续节点通过第一个真实 consumer 校验领域，而不是增加推测性的兼容层。
