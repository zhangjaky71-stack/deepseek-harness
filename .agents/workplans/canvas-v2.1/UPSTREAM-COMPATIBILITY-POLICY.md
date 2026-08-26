# Canvas / Harness Upstream Compatibility Policy

## 1. 目标

让 Canvas 能长期跟随官方 DeepSeek Harness 升级，而不是每次上游 Web/Agent 架构变化都重做一次大规模私有 fork 合并。

## 2. 核心原则

> Canvas 是 Harness 的正式扩展能力域，不是 Web Shell 的永久硬编码页面。

优先级：

```text
官方 lifecycle / service / slot contract
    > 私有实现细节
    > 临时兼容 patch
```

产品需求不因上游升级丢失，但实现必须尽可能重新映射到官方 seam。

## 3. Compatibility Overlay 与 Full Upstream Sync 必须分开记账

“Canvas 能按新版 API 工作”与“私有仓库已经机械同步到该官方版本 final tree”是两个不同结论，禁止互相代替。

### Compatibility Overlay

可以在旧 package/version baseline 上 backport 新版 contract，例如：

- 改用新版 slot/store/hook discipline；
- 将 Canvas 移到独立 dynamic client plugin；
- 使用新版 Settings/Projection/Remote seam；
- 移除旧的 public runtime export；
- 让 `ui-layout` 只提供 generic `shell.main`。

这些改动可以被标记为 `compatible` / `partial backport`，但**不能**被写成“已同步上游版本”。

### Full Upstream Sync

只有以下证据同时成立，才能把某个 Harness 版本标记为 `synced`：

1. 官方 target commit/version 已记录并可核验；
2. 私有 pre-sync commit 与 post-sync commit 已记录；
3. target 版本新增/删除/改名的 package graph 已机械对齐，而不是只复制局部 API；
4. root/package version 与目标 release baseline 一致，或有明确、审计过的私有版本策略说明；
5. 应由上游新 owner 持有的 lifecycle 已真正迁移，例如 rc.8 的 React root 必须由动态 `ui-renderer`/`uiRenderer` ownership 持有；
6. Web boot、dynamic roster、bundle/tsconfig/lock/build graph 与目标版本一致或有逐项 overlay 记录；
7. REAL assembled boot 与目标测试有真实执行证据。

缺任意一项，状态只能是 `PARTIAL BACKPORT` / `SYNC INCOMPLETE` / `REVIEW`，不得写 `synced`。

### rc.8 当前特别门禁

对于 `dsh@0.1.0-rc.8`，以下事实属于 sync-completion 的机械门禁：

```text
packages/client/web boot kernel
      ──不拥有 React root──>
dynamic @deepseek-ai/dsh-client-ui-renderer
      ──provides──>
ctx.uiRenderer.mount(container)
```

只要私有 `packages/client/web` 仍直接 `createRoot()`、仍通过 shell-own AppRoot/AppShell assembly 挂载真实应用，或者 `packages/client/ui-renderer` 仍缺失，就不能声称完整 rc.8 final-tree sync，即使 Canvas 自身已经遵守 rc.8 client rules。

## 4. 路径分级

### A. 上游核心保护区

以下区域原则上禁止出现 Canvas 特判：

- `packages/client/web/**`
- `packages/client/ui-renderer/**`（旧文档中的 render-service 概念在 rc.8 final tree 对应此 owner）
- Agent core/session runtime 与模型 transport 核心实现
- 通用 attachment store 核心
- 通用 API carrier/connection 核心

如确需修改，必须有独立 ADR，证明不存在 slot/service/plugin 扩展点，并在下一次上游升级优先移除。

### B. 最小 overlay 区

可存在少量 Canvas integration seam，但必须保持通用职责：

- `packages/client/ui-layout/**`：只允许 layout region/slot/column 行为，不允许 Canvas domain state。
- bundle/client roster：只允许注册 Canvas plugin，不允许实现 Canvas 业务。
- settings composition：只允许注册 Canvas schema/section。

### C. Canvas 自有区

长期业务应集中于：

- `packages/canvas/**`
- `packages/client/ui-canvas/**`
- 后续 `packages/client/canvas-runtime/**` / `canvas-session/**`（若拆包）
- `packages/canvas/tool-canvas/**`
- Canvas provider/executor package

## 5. Upstream Conflict 分类

每次升级把冲突分为：

1. **Mechanical**：版本、import、build graph、rename。
2. **Lifecycle**：plugin activation/dispose/HMR ownership。
3. **Service Contract**：Session/Remote/Attachment/Settings API 变化。
4. **UI Composition**：slot/layout/root ownership 变化。
5. **Semantic**：上游行为与 Canvas 产品不变量真正冲突。

只有第 5 类允许讨论调整产品架构；前 4 类应通过兼容迁移解决。

任何第 1–4 类冲突即使已经通过 private overlay 绕开，也必须继续记录是否与 official final tree 一致；“功能能跑”不等价于“升级完成”。

## 6. UI Composition Policy

Canvas main product surface 使用通用 `shell.main`，由 `ui-canvas` 动态贡献。

- `ui-layout` 只声明/排列 generic shell regions。
- Conversation/Composer 保持 Conversation owner；Canvas 不抢 `conversation.view` ownership，也不创建第二 Composer。
- Web boot / ui-renderer 不知道 Canvas component、Workflow、Mode、Selection 或 Draft。
- Canvas feature package dispose/HMR 后，其 slot contribution、listener、local session state 必须随 plugin lifecycle 清理。

如果上游未来调整 slot 名称或 root ownership，应把 Canvas 重新映射到新的 generic seam，而不是恢复 Web/AppFrame 产品特判。

## 7. 禁止模式

- 在 `AppFrame` 保存 Workflow/Run/selection authority。
- Browser 直接调用 Provider。
- Canvas 自建第二套 attachment store。
- Canvas 自建第二套 settings persistence。
- 为自定义节点维护 built-in type whitelist。
- 复制官方 Client plugin loader 形成私有 loader。
- 将 Session 私有 hack 当正式通信协议。
- 把 compatibility commit 冒充 upstream post-sync commit。
- 只因为历史 `sync/*` branch 是当前祖先就声称 final-tree sync 完成。
- 在 upstream 新增 owner package 缺失时，用旧 owner 中的兼容代码假装 package graph 已同步。

## 8. Upgradeability Gate

N25 发布前必须证明：

- Canvas 主要代码位于 Canvas-owned packages。
- 上游核心保护区不存在未说明 Canvas 特判。
- 下一次 Harness 升级可先机械同步官方 tree，再叠加有限 Canvas overlay。
- 所有 overlay 路径都有 regression test。
- `UPGRADE-MIGRATION-RUNBOOK.md` 可直接执行。
- 最近一次声明为 `synced` 的 Harness baseline 有完整 version/package/root-owner/REAL-boot 证据，而不仅是 API compatibility note。

## 9. 每次升级的最小证据集

升级记录至少必须包含：

```text
upstreamVersion
upstreamCommit
privatePreSyncCommit
privatePostSyncCommit
packageGraphDelta
rootMountOwner
CanvasSchemaVersion
WorkflowSchemaVersion
compatibilityStatus
realCompositionEvidence
```

若 `privatePostSyncCommit`、`rootMountOwner` 或 `realCompositionEvidence` 仍未知/未执行，则升级状态不得为 `COMPLETE`。
