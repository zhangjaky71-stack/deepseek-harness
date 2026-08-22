# Agent Note: Agent-to-Canvas live command bridge

Status: implemented

## Problem

Harness 将 Infinite Canvas 作为独立运行的应用嵌入，而 Agent loop 与持久 Session 日志位于 Host。模型可调用的 Canvas 动作因此需要跨越 Host、Web 客户端、外层 Canvas frame 和当前经典 Canvas，同时不能把 Canvas 执行搬进 Harness，也不能让 React 组件直接消费 Cordis。

Canvas 命令还是一种副作用。如果把普通 Session 历史当作执行队列，页面重载或 resume 会再次执行旧生成；如果依赖已经打开的 `Session` 对象，冷 Session 或屏幕外 Session 又会丢失命令，因为会话窗口本来就是延迟物化的。

## Decision

`@deepseek-ai/dsh-tool-canvas` Consumer 在发布的 Web `standard` 与 `code` Agent preset 中注册一个高层 `canvas` 工具。Phase 1 支持 `action: "generate"`；执行时校验模型参数，创建不透明 `commandId`，并向调用 Agent 的 Session 追加一条仅用于日志的 `canvas/command` 事件。工具结果表述为命令已排队，而不是生成已完成。

Agent loop 保持不变。命令事件是 Host 的持久事实，并且不会进入有序 conversation surface 或派生模型历史。

## Live delivery

浏览器 runtime 会把 mux 新到达的每条 `session/event` 通过通用 `session/live-event` 客户端事件发布，再由具体功能解释。该事件只代表实时到达；历史读取不会触发它。

`ui-layout` 拥有 Canvas 集成，因为它拥有 Canvas 列。其 apply 层校验 `canvas/command`，在 framework snapshot store 中按 Session 只保留已观察到的最高序号，并通过 slot inject hooks compartment 将该数据源提供给 `AppFrame`。`AppFrame` 仍是无 Cordis 访问的纯组件，只转发当前 Session 尚未发送的命令。

该拆分也让 browser runtime 不依赖 `dsh-tool-canvas`：runtime 只负责通用传输插件扩展的 Session event，功能拥有者在消费端解释自己的事件。

## Canvas execution

Phase 0 的版本化 `postMessage` 通道新增 `host:command` 与 `canvas:command-result`。Harness 仍要求消息来自精确的外层 iframe window，并且 origin 必须是 `127.0.0.1:3000`。

外层 Infinite Canvas 只会在经典 Canvas iframe 处于活动状态时路由命令。经典页面再次校验并按命令 ID 去重，然后复用已有图操作，而不是引入另一套生成实现。

对于 active target，Canvas 会在可用时复用当前选中的图片生成节点；否则创建提示词节点和生成器节点并建立连接。提示词必须保留为上游 prompt 节点，因为现有 generator 执行从图输入中派生提示词。显式 node target 必须解析到已有图片生成器。可选 model 会应用到生成器，而 provider/model 兼容性和实际生成请求仍由 Canvas 决定。

`canvas:command-result` 只确认浏览器端执行结果。Phase 1 不会把它追加到 Session 日志，也不会反向修改已经结束的工具结果。

## Alternatives considered

**从 Session 历史重放 `canvas/command`。** 拒绝，因为历史用于状态重建，不是 exactly-once 副作用队列。除非再引入一套持久投递协议，否则打开或 resume Session 会重新生成旧图片。

**只在 Session 打开后通过 `SessionManager` 投递。** 拒绝，因为冷 Session 会刻意停止实时 conversation-window 维护，并依赖历史回填。Canvas 命令需要不依赖聊天窗口是否物化的即时实时观察。

**在 browser runtime 中解析 Canvas 专属事件。** 拒绝，因为 runtime 拥有通用 mux 投递，而不是 Canvas 功能。`session/live-event` 保留通用扩展点，`ui-layout` 则拥有功能专属投影。

**让 `AppFrame` 直接订阅 Cordis。** 拒绝，因为 slot system 要求展示组件接收 framework 绑定的 hook 与 callback，而不是 `ctx`。订阅由 apply 层持有，组件只接收 selector hook。

**把提示词直接写到新建 generator 节点。** 拒绝，因为经典 Canvas 的生成逻辑从已连接的上游 source 读取 prompt。直接塞字段会让节点看起来创建成功，但执行时提示词为空。

**在 Harness 中重新实现生成。** 拒绝，因为 Infinite Canvas 已拥有 provider 配置、图语义、生成、持久化和节点刷新。bridge 只传递高层意图并调用这套既有权威实现。

## Verification

包级测试通过真实 `ToolRuntime` 和真实 `Session` 执行 Canvas 工具，并验证持久事件、输入归一化、Agent 所有权要求与取消行为。客户端 bridge 测试固定协议校验、source/origin 检查以及 command/result 消息形式。AppFrame 测试继续通过注入的命令 hook 验证布局，而不引入 Canvas 业务机制。

发布的 Agent preset 配置属于真实 Web 组合，因此配置校验必须能从 CLI 发布依赖中解析 `@deepseek-ai/dsh-tool-canvas`，不能只依赖测试环境手动挂载。

## Consequences

第一条垂直链能够触达真实 Canvas 图模型，同时不修改 Agent loop，也不重写 Canvas 生成引擎。持久意图与实时执行具有不同含义，因此重载不会重复旧工作，模型也不会把 Host 已排队误认为生成已完成。

代价是当前投递尚不可恢复：若命令提交时没有 Web 客户端观察实时 mux 事件，该命令仍会持久存在，但重连后不会执行。浏览器失败只有瞬时确认，不持久也不对模型可见。视频、编辑、工作流构建、持久执行状态、重试和用户可见失败提示继续作为后续能力，而不是隐藏进 Phase 1 的 generate 命令。
