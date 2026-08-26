# Agent Note：基于 Session Projection 的 Canvas Web Shell

Status: proposed

[English](2026-08-20-canvas-web-shell.md) | 中文

## Problem

Session-native Canvas Domain 现在已经具备 durable Session Event、current-state Projection、Editor Layout Persistence、Host Authorization、Browser Mutation 与 bounded History Query。Web 应用仍需要一个产品表层，同时支持简单生成体验和 Workflow-oriented 体验，但不能因此产生 Browser-owned Canvas state、替换常驻 Conversation Composer，或假装 Media execution 已经存在。

## Proposal

把 `@deepseek-ai/dsh-client-ui-canvas` 作为一个 `conversation.view` contribution 加入 Web Browser roster。它通过标准 Session Projection hook 读取 `canvas` 与 `canvasLayout`，并在同一组值上提供两种 UI-local presentation mode：

- **Minimal** — 展示 Product State 与当前生成结果 reference，隐藏 Workflow topology。
- **Editor** — 展示 Workflow shell，包括语义 Node/Edge 数量、Workflow Revision、已保存 Layout 状态、语义 Node card，以及同一个 Current Output。

Mode choice 是每个 Session 的 Browser-local state。它不是 Canvas mutation，不 append Session Event，也不会成为第二套 durable preference document。窄屏默认 Minimal，宽屏默认 Editor；用户可以手动切换任一模式。

`ui-conversation` 继续拥有 Session shell 与 Composer。Canvas 只占用 `conversation.view` body。因为 Composer 位于该 view ring 之外，所以在 Chat/Trajectory/Canvas 之间切换不会移除 Prompt 输入，也不会增加 Canvas 专属的重复 Composer。

UI 使用与 N01 相同的八个 Product State：`EMPTY`、`READY`、`DIRTY_READY`、`RUNNING`、`COMPLETED`、`FAILED`、`CANCELLED`、`INTERRUPTED`。Browser implementation 采用 N01 规则的同构复制，而不是在运行时 value-import Host Canvas package。`@deepseek-ai/dsh-canvas/client` 继续只是 Type/DTO/Declaration-merge boundary；Browser bundle 不产生隐藏的 Host-domain JavaScript runtime edge。

Primary Action 选择是确定的：READY/COMPLETED/DIRTY_READY 显示 Run，FAILED/CANCELLED/INTERRUPTED 显示 Retry，RUNNING **只显示 Cancel**，EMPTY 不显示 Primary Action。N07 中这些按钮是 disabled capability skeleton，因为 Host run/cancel behavior 属于后续 Media Execution 节点。把不存在或假的 Remote endpoint 接到可点击按钮上会让 UI 对系统能力撒谎。

`DIRTY_READY` 有意保留之前的 Output。旧结果仍是 durable、可用的创作上下文；在当前语义 Workflow 已推进的情况下，UI 会标记它属于较旧 Revision，直到后续 Run 为当前 Revision 产生新结果。

`SaveStatus` 在 N07 也只是 Shell contract。它预留 saved/saving/error 词汇，但在 Editor Draft/Autosave 节点真正拥有 Browser Draft、Debounce、Conflict 与 Save Lifecycle 之前固定为 saved。

本节点不读取 Generated Media Bytes。Output card 只渲染 durable image/video reference metadata。授权 Media Route 与真实媒体展示属于负责 Delivery/Access Policy 的 Asset/UI 节点。

`dsh-web-app` 在 `ui-conversation` 之后显式挂载 `ui-canvas` 并声明 Package dependency。根 Client aggregate 引用新 Project，使 Browser purity 与 package tests 进入普通 Client gate。

## Alternatives considered

**把 Canvas 做成 Conversation Shell 之外的独立页面** — 不采用。它会复制 Session selection 与 Composer 行为，并削弱“同一个 Session、同一个 Authority”的产品模型。

**在 Minimal Canvas 内再放一个 Prompt 输入框** — 不采用。常驻 Conversation Composer 已经拥有用户输入，并在所有 Conversation View 下保持可见。

**把 Minimal/Editor mode 持久化进 Session** — N07 不采用。Mode 是 presentation preference，不是 collaborative Canvas state。持久化会产生没有语义价值的 Session churn，并让一个 Client 的界面偏好影响其他 Consumer。

**运行时从 Host Canvas package 导入 `deriveCanvasProductState()`** — 不采用。Canvas 不是 Web Module roster 中的 Browser Plugin。UI 保持 Client outlet type-only，并通过等价测试固定同构纯规则。

**把 Run/Cancel Button 接到 placeholder method** — 不采用。N06 只预留这些 Remote 名称，并在 Host 行为存在前不注册 endpoint。N07 同样保持诚实：状态语义正确，但 Control disabled。

**DIRTY_READY 时隐藏旧结果** — 不采用。旧结果仍是 durable useful artifact，也是用户决定是否重新运行修改后 Workflow 时最需要的上下文。

## Acceptance criteria

- Web 恰好发布一个 id 为 `canvas` 的 `conversation.view` entry。
- Canvas View 的当前业务状态只来自 `useProjection('canvas')` 与 `useProjection('canvasLayout')`。
- Minimal/Editor 切换只改变 Browser-local mode，不产生 Session Event。
- 窄屏默认 Minimal，宽屏默认 Editor，两者都可手动选择。
- `ui-canvas` 不 claim 或替换常驻 Conversation Composer。
- N01 八个 Product State 都有确定 presentation behavior。
- RUNNING 只渲染 Cancel primary control，不同时渲染 Run/Retry。
- DIRTY_READY 保留 previous output，并标记其与当前 Workflow 不一致。
- 在真实 Host execution/cancellation 存在前，Run/Retry/Cancel 保持 disabled。
- Editor 在 N07 明确只是 Shell，不隐藏实现 DAG editing。
- Canvas Browser bundle 只使用 Canvas client types，不依赖 Host Canvas JavaScript runtime。
- Built client artifact coverage 通过真实 SlotRegistry ring 证明 Plugin 注册／撤回 Canvas View，并且不 claim Composer。
- `dsh-web-app` roster 与 dependency manifest 都包含 `ui-canvas`。

## Risks

由于 Package boundary 禁止 runtime Host-domain import，Browser 中存在一份 Host Product State derivation 的同构复制。Domain State Machine 改动时必须通过测试保持两边规则同步。N07 Result Card 有意只是 placeholder，因此在 Asset Delivery 节点落地前不应长出 ad-hoc 未授权 Media URL 逻辑。Mode State 只存在于当前 Browser client 挂载生命周期；未来如果增加 persistence，也必须保持为 UI preference，不能变成 Canvas durable authority。
