# Canvas V2.2 — rc.8 Compatibility 不等于仓库已完成 rc.8 同步

[English](2026-08-22-canvas-v2-2-rc8-compatibility-boundary.md) | 中文

## 决策

Canvas 可以已经**兼容**新版 Harness Client Contract，但私有仓库仍然**没有机械完整同步**到该 Harness Release。这是两个独立的工程状态，绝不能共用同一个“完成”标签。

对于当前 `dsh@0.1.0-rc.8` 目标，N11.5 已经修复此前最明确的两个 Web Client Ownership 缺口：动态 `ui-renderer` 已接管 React Application Root，Web Kernel 也已经改为消费 rc.8 风格的 `window.__ModuleLoader__` queue/create facade，而不是自行构造私有 Module System。N11.5 仍必须保持 `BLOCKED / REVIEW`，因为 Release-wide Version/Package/Build/Lock/Generated Reconciliation 与 REAL assembled validation 还没有闭环。

## 声称 Full Sync 所需的证据

Compatibility Note 或祖先中存在一个名为 `sync/*` 的 Branch 都不够。只有真实 Tree 证明目标 Ownership 与 Package Graph 已落地，才可以把某个 Release 标记为完整同步。

对于 rc.8，最小证据包括：

- official target commit `141eb6fef83422698aef7a981029e843e8161534`；
- private pre-sync 与 post-sync commit；
- Package/Version Graph 与 rc.8 target 对齐，或存在明确审计过的 private-version policy；
- official `packages/client/ui-renderer` 已进入 private tree；
- React Root 由 dynamic `ui-renderer` 持有，并通过 `ctx.uiRenderer.mount(container)` 暴露；
- Framework-free Web Boot 在 Client Roster 激活后把 Container 交给 `uiRenderer`；
- rc.8 Module Bootstrap Ownership：Host 安装 `__ModuleLoader__` queue、parser preload、`create()`，随后切换到 live registration；
- Build/tsconfig/bundle/lock/generated graph 通过 Repository Toolchain 完整 reconcile；
- REAL assembled boot 与 lifecycle evidence。

只要仍缺少任何必需的 Repository-wide Evidence，正确状态只能是 `PARTIAL BACKPORT`、`SYNC INCOMPLETE` 或 `REVIEW`。

## N11.5 已完成的 Ownership Remediation

此前关于 React Root 与 Bootstrap Ownership 的直接反证，在当前 remediation branch 上已经不再成立。

### Dynamic Renderer 已接管 Application Root

`packages/client/ui-renderer` 已作为动态 Browser Renderer Package 存在。它持有 `createRoot` / `hydrateRoot`，安装 React Slot Renderer、组装 Root Slot、投影 Durable Session Title、暴露 `ctx.uiRenderer.mount(container)`，并返回 Application Root 的 unmount disposer。

`packages/client/web` 不再持有 `AppRoot`、`app-shell` 或 Final React Root。它的 Boot Path 已经 framework-free，只会在 Client Graph settle 后执行 handoff。若 `uiRenderer` 缺失，会在 Boot Failure Surface 上明确 fail-loud，而不是永久等待。

### rc.8 Module Bootstrap Ownership 已恢复

Client Module Protocol 现在遵循 rc.8 的 queue/create 模型：

```text
Host index transform
  → queue mode 安装 window.__ModuleLoader__
  → parser-preload modules + runtime bundles
  → 注入 window.__DSH_BOOT__
  → Web kernel 调用 __ModuleLoader__.create(...)
  → module system 排空提前到达的 registrations
  → facade 切换为 live registration
```

旧的私有 `window.__DSH_MODULES__` adoption seam 与 Shell 侧 static `MODULES_ID` registration 已删除。rc.8 的 `external` module-graph contract、`/client` normalization、dynamic provider ordering、self/cycle rejection、bootstrap-module retention 与 invalidate semantics 也已进入当前树。

`client-modules` 的核心实现文件来自 official target；写回后 Browser Index、Manifest、System、Host Index 与 Invariant Source 的 Blob Hash 与官方 rc.8 对应 Blob 完全一致。

## 当前仍存在的 Repository-wide 反证

仓库仍不能描述为完整 rc.8 Release Sync，因为更大范围的 Release Evidence 还没有闭环：

- Root Release Metadata 仍把私有 baseline 标识为 `0.1.0-rc.7`；
- Official rc.8 的完整 Package/Version Family 尚未作为一次 Release Operation 机械 reconcile；
- Private Build External Partition 尚未证明与 official rc.8 final-tree Build Contract 完全一致；
- Workspace Lockfile 与 Generated Artifacts 尚未由 pinned Repository Toolchain 针对本次迁移重新生成；
- Repository CI 尚未在 exact head 上真实执行并通过 REAL assembled Web Boot / Lifecycle 验证。

现在真正的 Blocker 是这些项。旧文档中“Private Web Kernel 仍直接拥有 React `createRoot()`”已经失效，不得继续作为反证引用。

## Canvas Compatibility Overlay 已经正确的部分

### Dynamic Package Boundary

`@deepseek-ai/dsh-client-ui-canvas/client` 运行时只暴露 Cordis Loading Face：`apply` 与 `inject`。Components、Stores、Pure Helpers 保持 Package Internal。Shared Contract 只以 Type-only 形式离开 Package。

### Product Composition

Canvas 动态把产品面贡献给通用 `shell.main`。`ui-layout` 只负责渲染这个 Generic Slot，不 import Canvas，也不持有 Workflow、Run、Mode、Selection、Draft 或 Mutation State。

旧的 `conversation.view` Ownership 假设已经失效。Conversation/Composer 继续由 Conversation Domain 独立拥有，Canvas 不创建第二套 Composer。

### Client State Discipline

Mode 与 Semantic Selection 保持稳定的 Browser-local Observable Source，因为 Prompt-preparation Bridge 也读取同一份值。Render Code 通过 reserved `hooks` compartment 消费它们。

Editor Draft、Save Status、Undo/Redo、Clipboard 与 Transient Layout Position 属于 Presentation-only State，因此使用 slot-declared Store。Durable Workflow Truth 仍只来自 Session Projection。

### External Authorities

Canvas 不会在 Browser 再造 Harness Settings、Effective Deployment Capabilities、Media Node Registry/Catalog Revision 或 Session Projection/Durable Canvas State。这些 Authority 继续属于 Host/Framework。

## Root Ownership 是架构不变量，不是命名细节

当前 private remediation branch 已经实现的 rc.8 Ownership Chain 是：

```text
framework-free Web boot
  → activate dynamic roster
  → verify uiRenderer service
  → dependency-fiber uiRenderer.mount(container)
  → ui-renderer owns hydrate/create/unmount
```

这对 HMR 与 Disposal 很重要：Renderer Replacement 可以通过正常 Cordis Service Lifecycle 先撤销旧 Root 再重新挂载。Web Kernel 发起 Service Call，不代表它重新拥有 React Root。

## Regression Gate

N11.5 现在同时机械固定 Canvas Overlay 与已修复的 rc.8 Kernel Boundary：

- Canvas `/client` runtime exports 精确为 `apply` / `inject`；
- Canvas 在 Dynamic Web Roster 中只出现一次；
- Canvas 注入 `shell.main`，而不是 `conversation.view`；
- AppFrame Generic Render `shell.main`，没有 Canvas Import/Type Dependency；
- `ui-renderer` 存在于 Web Roster，并持有 `createRoot` / `hydrateRoot`；
- Web Boot 不包含 Application `createRoot`、`AppRoot` 或 Shell-owned Final App Assembly；
- Graph Activation 完成后才 mount，dispose 会撤销 Renderer Root；
- 缺失 `uiRenderer` 时 fail-loud；
- 升级后的 Modules Tests 覆盖 Bootstrap queue/create/live registration 与 Dynamic External Ordering；
- Built-client enable/disable/dispose 会随 Plugin Lifetime 正确增删 Canvas 产品面；
- Built-client Node Catalog Fixture 使用 versioned `{ revision, entries }` DTO。

这些 Test Source 是 Regression Contract，不等价于 Repository CI 已经真实执行成功。

## 后续升级规则

从 rc.9 开始，也要始终维护两套显式 Ledger：

1. **Compatibility Overlay Ledger** — Canvas Package 已经遵守哪些新版 Public API/Lifecycle Rule。
2. **Upstream Sync Ledger** — 哪些 Official Tree/Package/Root-owner/Build/Version Change 已机械存在于 Private Repository。

绝不能因为第一套 Ledger 完成，就升级第二套 Ledger 的状态。反过来，一旦某个明确 Ownership Gap 已经修复，也必须从 Counter-evidence 中删除，不能让过期文档持续低估真实 Tree。
