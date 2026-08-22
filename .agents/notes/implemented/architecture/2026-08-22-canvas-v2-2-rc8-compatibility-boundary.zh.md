# Canvas V2.2 — rc.8 Compatibility 不等于仓库已完成 rc.8 同步

[English](2026-08-22-canvas-v2-2-rc8-compatibility-boundary.md) | 中文

## 决策

Canvas 可以已经**兼容**新版 Harness Client Contract，但私有仓库仍然**没有机械完整同步**到该 Harness Release。这是两个独立的工程状态，绝不能共用同一个“完成”标签。

对于当前 `dsh@0.1.0-rc.8` 目标，Canvas Overlay 已经吸收多条 rc.8 规则，但仓库仍保留 rc.7-era Web Root Ownership。因此 N11.5 必须继续保持 `BLOCKED / REVIEW`。

## 声称 Full Sync 所需的证据

Compatibility Note 或祖先中存在一个名为 `sync/*` 的 Branch 都不够。只有真实 Tree 证明目标 Ownership 与 Package Graph 已落地，才可以把某个 Release 标记为完整同步。

对于 rc.8，最小证据包括：

- official target commit `141eb6fef83422698aef7a981029e843e8161534`；
- private pre-sync 与 post-sync commit；
- Package/Version Graph 与 rc.8 target 对齐，或存在明确审计过的 private-version policy；
- official `packages/client/ui-renderer` 已进入 private tree；
- React Root 由 dynamic `ui-renderer` 持有，并通过 `ctx.uiRenderer.mount(container)` 暴露；
- Framework-free Web Boot 在 Client Roster 激活后把 Container 交给 `uiRenderer`；
- Build/tsconfig/bundle/lock/generated graph 通过 Repository Toolchain 完整 reconcile；
- REAL assembled boot 与 lifecycle evidence。

只要其中任何一项仍缺失，正确状态只能是 `PARTIAL BACKPORT`、`SYNC INCOMPLETE` 或 `REVIEW`。

## 当前 Private Tree 的直接反证

当前私有树仍然有可以机械观察到的 rc.7-era Ownership：

- root `package.json` 仍为 `0.1.0-rc.7`；
- `packages/client/ui-renderer` 不存在；
- `packages/client/web/src/boot.tsx` 仍 import ReactDOM `createRoot()`；
- Web Boot 仍拥有 `AppRoot` 与 shell-own `APP_SHELL_ID` assembly；
- Final App 仍通过 `appShell.renderApp()` 产生，而不是由 dynamic `uiRenderer` mount service 挂载。

这些事实比历史 Branch Name 更有证明力。在真正完成 Root Ownership Migration 前，它们会阻止任何“已完整同步 rc.8”的结论。

## Canvas Compatibility Overlay 已经正确的部分

N11.5 被同步问题阻塞，并不否定当前 Stack 中已经完成的 Canvas-level Compatibility 工作。

### Dynamic Package Boundary

`@deepseek-ai/dsh-client-ui-canvas/client` 运行时只暴露 Cordis Loading Face：`apply` 与 `inject`。Components、Stores、Pure Helpers 保持 Package Internal。Shared Contract 只以 Type-only 形式离开 Package。

### Product Composition

Canvas 动态把产品面贡献给通用 `shell.main`。`ui-layout` 只负责渲染这个 Generic Slot，不 import Canvas，也不持有 Workflow、Run、Mode、Selection、Draft 或 Mutation State。

旧的 `conversation.view` Ownership 假设已经失效。Conversation/Composer 继续由 Conversation Domain 独立拥有，Canvas 不创建第二套 Composer。

### Client State Discipline

Mode 与 Semantic Selection 保持稳定的 Browser-local Observable Source，因为 Prompt-preparation Bridge 也要读取同一份值。Render Code 通过 reserved `hooks` compartment 消费它们。

Editor Draft、Save Status、Undo/Redo、Clipboard 与 Transient Layout Position 属于 Presentation-only State，因此使用 slot-declared Store。Durable Workflow Truth 仍只来自 Session Projection。

### External Authorities

Canvas 不会在 Browser 再造以下 Authority：

- Harness Settings；
- Effective Deployment Capabilities；
- Media Node Registry / Catalog Revision；
- Session Projection / Durable Canvas State。

这些 Authority 继续属于 Host/Framework。

## Root Ownership 是架构不变量，不是命名细节

Official rc.8 有意把 React Root Ownership 从 Web Boot Kernel 移出去。这会改变 HMR/Disposal Responsibility：

```text
Web boot
  → activate dynamic roster
  → wait for uiRenderer service
  → uiRenderer.mount(container)
```

因为 Renderer 是 Plugin，所以替换或 remount 该 Dependency 时，可以通过正常 Cordis Lifecycle 替换 Application Root。若 Private Shell 仍直接拥有 `createRoot()`，即使 Business Plugin 都使用相同 Slot API，其 Lifecycle Semantics 仍然不同。

因此 Canvas-level Slot Compatibility 不能代替 Repository-level Root Migration。

## Regression Gate

N11.5 会机械固定已经正确的 Overlay 部分：

- `/client` runtime exports 精确为 `apply` / `inject`；
- Canvas 在 Dynamic Web Roster 中只出现一次；
- Canvas 注入 `shell.main`，而不是 `conversation.view`；
- AppFrame Generic Render `shell.main`，没有 Canvas Import/Type Dependency；
- Built-client enable/disable/dispose 会随 Plugin Lifetime 正确增删产品面；
- Built-client Node Catalog Fixture 使用当前 versioned `{ revision, entries }` DTO。

这些 Test 用来保护已完成的 Overlay，同时更大范围的 Upstream Sync 仍保持 Blocked。

## 后续升级规则

从 rc.9 开始，也要始终维护两套显式 Ledger：

1. **Compatibility Overlay Ledger** — Canvas Package 已经遵守哪些新版 Public API/Lifecycle Rule。
2. **Upstream Sync Ledger** — 哪些 Official Tree/Package/Root-owner Change 已机械存在于 Private Repository。

绝不能因为第一套 Ledger 完成，就升级第二套 Ledger 的状态。这样可以防止后续 Node 建立在一个只存在于注释和 Adapter Code 中的 Release Baseline 上。
