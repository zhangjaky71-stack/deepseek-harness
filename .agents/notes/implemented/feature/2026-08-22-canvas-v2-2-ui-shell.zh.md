# Agent Note：Canvas V2.2 动态 UI Shell Ownership

Status: implemented

[English](2026-08-22-canvas-v2-2-ui-shell.md) | 中文

## 问题

最初的 N07 Canvas Shell 把 `conversation.view` 当成 Canvas 产品面。但这个 seam 已由 `ui-conversation` 用于 Conversation body 切换，同时 Conversation/Composer 产品本身需要保持常驻。再把 Canvas 作为另一个产品 owner 注册进这个 ring，会让彼此独立的插件受注册顺序影响，也会让中央 Canvas 体验依赖 Conversation 内部实现。

另一种看似直接的做法是把 Canvas 接进 `ui-layout`，但这会造成更严重的 ownership 违规：layout package 将不得不理解 Canvas-specific props、store 或 lifecycle。仓库契约要求 `render-service` 保持 React root ownership，`ui-layout` 保持通用布局职责，`ui-conversation` 拥有 Conversation/Composer 行为，`ui-canvas` 拥有 Canvas presentation。

## 决策

N07 使用通用、session-scoped 的 `shell.main` slot 作为 Canvas 产品区域。`ui-layout` 只声明并渲染 `shell.left`、`shell.main` 与可选 `shell.right`，完全不了解 Canvas Workflow、Run、Asset、Selection、Mode 或 mutation API。`ui-canvas` 向 `shell.main` 贡献唯一 Canvas 产品面；`ui-conversation` 继续在 `shell.right` 拥有 Conversation/Composer，并在自身内部继续使用 `conversation.view` composition。

Canvas UI 状态仍只从标准 Session Projection 派生。Minimal 与 Editor 是同一份 projected Canvas 上的 presentation mode；切换 mode 永远不会 append Session Event，也不会推进 Workflow revision。Browser-local mode 与 interaction row 只在对应 Session 存活期间保留，并在 plugin/HMR dispose 时清理。

部署 gating 与写能力分开处理。`remote.canvasFeatures` 是 fail-closed deployment gate：Canvas 被关闭或 capability discovery 失败时，不发布 Canvas main surface。一旦 Canvas 已启用，Projection 驱动的只读产品面不要求 `remote.canvas` mutation transport 常驻；mutation Remote 缺失或重连时，写操作明确返回不可用，而不是把当前 Projection 隐藏。Editor node catalog discovery 也可以独立降级为 Minimal，不应带崩 Canvas 只读产品面。

## 考虑过的替代方案

**继续把 Canvas 放进 `conversation.view`** — 否决。这样会让 Canvas 产品依赖 Conversation-owned view ring，并让产品 ownership、Composer/body 行为可能受注册顺序影响。

**让 `ui-layout` 理解 Canvas** — 否决。这样会把 Workflow/Run/mode state 下沉到 layout owner，并制造第二个业务集成点。

**Canvas 自己挂第二个 React root** — 否决。`render-service` 必须继续是唯一 root owner，官方 boot/failure 行为不能被旁路。

**必须等 mutation Remote 存在才渲染** — 否决。Session Projection 已经是读取 authority；短暂写不可用不应抹掉可读状态。

## 结果

Web Shell 的 ownership 被明确拆开：通用 layout region、中央 Canvas 产品面、常驻 Conversation/Composer 区域。Canvas 可以通过标准 plugin/slot lifecycle 安装、移除或 HMR 替换，不接管 React root，也不把 Canvas state 存进 layout。Mutation service 抖动时只读能力仍可保持，而部署级 Canvas disable 继续 fail-closed。

代价是 `shell.main` 成为明确的通用 composition contract，因此必须有 layout regression test。测试需要证明这个 region 始终 business-agnostic，并且 Canvas register/dispose 不会产生重复 slot entry 或泄漏 session-local row。

## 验证

`ui-canvas` focused test 应固定 `shell.main` register/dispose、Canvas capability gating、可选 mutation Remote、Editor catalog degradation、local-state pruning 与产品状态渲染。`ui-layout` test 应固定通用 left/main/right composition，且不能出现 Canvas-specific state。built-client coverage 必须证明打包后的 plugin 注册的是 `shell.main` 而不是 `conversation.view`，同时不触碰 Conversation/Composer ownership。

N07 从 REVIEW 进入 ACCEPTED 前，仍必须通过仓库级 typecheck、lint、build、hygiene、documentation/translation gates 与 REAL composition。