# @deepseek-ai/dsh-tool-canvas

[English](README.md) | 中文

`dsh-tool-canvas` 为 Agent 提供一个面向用户可见 Infinite Canvas 的高层 `canvas` 工具。该工具负责模型输入校验与持久命令记录；Web 客户端和 Infinite Canvas 分别负责投递与执行。

发布的 Web `standard` 与 `code` Agent preset 会挂载此包。Headless 组合仍直接使用 base 工具树，不暴露 `canvas`。

## Tool

`canvas(action: "generate", prompt, nodeId?, model?)` 会向调用 Agent 的 Session 追加一条 `canvas/command` 事件。返回的 `{ accepted, commandId, action }` 只确认命令已经提交到 Session 日志，不代表浏览器已经收到命令，也不代表图片生成成功。

`prompt` 会先去除首尾空白，并且处理后必须非空。空白的可选 `nodeId` 与 `model` 会按未提供处理。`commandId` 由 Host 生成，并在 Web 投递链中保持不变，供 Canvas 端进行命令去重。

未提供 `nodeId` 时，经典 Canvas 会优先使用当前选中的图片生成节点；没有可用选中节点时，会创建提示词节点与图片生成节点、建立连接并启动生成。提供 `nodeId` 时，Canvas 要求该 ID 精确指向一个已有图片生成节点。提供 `model` 时，Canvas 会将其应用到目标生成节点，并继续负责判断 provider/model 是否兼容。

## Delivery semantics

`canvas/command` 会持久保存以支持审计和 Session 持久化，但浏览器执行刻意只消费实时事件。Web runtime 将新到达的 `session/event` 通过 `session/live-event` 发出；`ui-layout` 按 Session 投影最新 Canvas 命令，并只把当前 Session 中尚未发送的序号交给版本化 Infinite Canvas bridge。读取已存历史不会重放命令，因此页面重载与 Session resume 不会重复执行旧副作用。

顶层 Infinite Canvas frame 只会把 `host:command` 路由给已经打开的经典 Canvas。Canvas 列表与不支持的编辑器会返回明确失败。经典 Canvas 会再次校验命令，按 `commandId` 去重，修改自身已有图模型，然后向 Harness 返回 `canvas:command-result`。Phase 1 将该确认保持为瞬时信息，不新增另一条持久 Session 事件。

## Config

Phase 1 没有包级配置。Canvas 的 provider/model 设置仍由 Infinite Canvas 自己管理。

## Model Experience

### System prompt

#### What the model sees

此包不增加 system-prompt section。能力是否可用由 `canvas` 工具 schema 表达。

#### Token effect

除工具 schema 外没有额外 prompt token 成本。成功调用会把简短结果 `Canvas queued generate command <commandId>.` 作为普通 tool-result 上下文提供给模型。

#### KV Cache effect

只要包版本和挂载的 preset 不变，schema 前缀保持稳定。调用与结果只追加在可复用请求前缀之后。

### Tool schema and result

#### What the model sees

Schema 暴露一个 `generate` action，要求提供 `prompt`，并允许可选的 `nodeId`/`model`。成功返回 `{ accepted: true, commandId, action: "generate" }`；Canvas 后续执行失败不会反向修改已经完成的该次工具调用。

#### Token effect

固定 schema 成本，加上每次调用的一条短结果。持久 `canvas/command` 事件本身仅存在于日志中，不进入模型历史。

#### KV Cache effect

Schema 可跨 turn 复用缓存；随机生成的 `commandId` 只出现在前缀之后的工具结果中。

## Known Limitations and Deferred Work

- Phase 1 只支持经典 Canvas 的图片生成。视频、编辑、多步骤工作流构建与工作流执行需要后续独立 action。
- 投递只消费实时事件。若命令提交时没有连接中的 Web 客户端观察到对应 mux frame，该命令仍会保留在历史里，但重连后不会重放到 Canvas。
- `canvas:command-result` 目前是瞬时信息，不追加到 Session 日志，也不返回给模型。持久执行状态、重试策略与用户可见失败提示留待后续实现。
- active-target 路径可以创建提示词 + 生成器节点，但在没有配置 Canvas provider 时不会替用户选择 provider；Infinite Canvas 继续拥有该职责，并可能拒绝执行。
