# Canvas Upstream Baseline — Harness rc.8

## 1. 目的

本文件是 Canvas 工程与官方 DeepSeek Harness 之间的版本锚点。所有后续 Canvas 节点、兼容修复、回归测试和升级判断都必须先读取本文件，避免把“代码兼容审计”“局部 backport”“完整上游同步”混为一谈。

## 2. 当前目标与已核验证据

| 项目 | 值 |
|---|---|
| 官方仓库 | `deepseek-ai/deepseek-harness` |
| 官方目标版本 | `dsh@0.1.0-rc.8` |
| 官方目标提交 | `141eb6fef83422698aef7a981029e843e8161534` |
| 官方目标提交说明 | `release: dsh@0.1.0-rc.8` merge |
| 官方发布日期 | 2026-08-19 |
| 私有仓库 | `zhangjaky71-stack/deepseek-harness` |
| Canvas 计划版本 | V2.2 rc.8 compatibility revision |
| 私有 rc.8 compatibility commit | `83dad93af0450a5b49d3db76fe36eba47820e176` (`refactor(ui-canvas): align client surface with rc.8`) |
| 历史 sync branch anchor | `sync/upstream-rc8*` 当前共同 head/ancestor `ac5a30aadf71571f38e9e2c4c476aa3bca55a59a`；当前 Canvas stack 位于其后 447+ commits、0 behind |
| 当前私有根版本 | `0.1.0-rc.7` |
| 官方 rc.8 renderer package | `packages/client/ui-renderer` / `@deepseek-ai/dsh-client-ui-renderer@0.1.0-rc.8` |
| 当前私有 renderer package | **缺失 `packages/client/ui-renderer`；仍使用 rc.7-era web/AppRoot ownership** |
| compatibilityStatus | **PARTIAL BACKPORT / REVIEW — Canvas 已按 rc.8 slot/store/export discipline 迁移，但官方 rc.8 final tree 尚未机械完整同步** |
| 完整同步状态 | **NOT COMPLETE** |

### 2.1 为什么不能写“已同步 rc.8”

当前私有树虽然包含 `sync/upstream-rc8*` 历史分支、并且 Canvas client 已按 rc.8 client discipline 重构，但至少存在两个可机械核验的 final-tree 差异：

1. 根 `package.json` 仍声明 `0.1.0-rc.7`，而官方目标提交为 `0.1.0-rc.8`。
2. 官方 rc.8 新的 `@deepseek-ai/dsh-client-ui-renderer` package 不存在于当前私有树。

因此 `sync/upstream-rc8*` 成为当前历史祖先只能证明“发生过同步/兼容工作”，不能单独证明官方 rc.8 final tree 已完整落地。

## 3. 当前已确认的 boot ownership 差异

### 官方 rc.8

官方 `packages/client/web/src/boot.ts`：

```text
framework-free BootPage
  → dynamic client roster activates
  → ctx.uiRenderer appears
  → uiRenderer.mount(container)
```

React `createRoot` / `hydrateRoot` 位于动态 `packages/client/ui-renderer` package。Web boot kernel 不拥有 React application root。

### 当前私有树

当前 `packages/client/web/src/boot.tsx`：

```text
AppWebEntry
  → createRoot(container)
  → AppRoot loading/settled gate
  → shell-own APP_SHELL_ID assembly entry
  → appShell.renderApp()
```

即：当前私有 Web boot 仍直接拥有 React root 和 app-shell assembly。它与官方 rc.8 的 renderer-service ownership 不同。

N11.5 不允许把“Canvas 已适配动态 slot/store API”写成“Web boot 已等同官方 rc.8 final tree”。

## 4. 已确认吸收的 rc.8-compatible Canvas 规则

尽管 final-tree sync 未完成，当前 Canvas overlay 已经采用以下 rc.8-compatible 设计：

1. `ui-canvas/client` 只导出 Cordis loading value 与 type contract；组件、store、pure helper 保持 package internal。
2. Canvas 产品面由动态 Client Plugin 注册到 `shell.main`，Web boot/AppFrame 不直接 import 或 render Canvas component。
3. `ui-layout` 只拥有三栏 Grid、drag handle 与 generic slot render；center column 为 `shell.main` generic slot，不保存 Canvas Domain/Draft/Mode/Selection。
4. Conversation/Composer 仍由 `ui-conversation` / `shell.right` ownership 提供，Canvas 不创建第二 Composer。
5. Prompt-time mode/selection 使用稳定 observable source，经 reserved `hooks` compartment 进入 render，并同时供 prompt-preparation bridge 读取；不镜像成第二 store。
6. N11 Draft/Undo/Redo/Clipboard/local positions 使用 slot-declared store；组件通过 framework `useStore`/`actions` 访问。
7. Canvas semantic/durable state 仍来自 Session event + Projection；Browser 不 fold Canvas durable state。
8. Node Catalog 由 Host authority 提供；Browser 不静态复制 Registry。
9. Canvas settings 使用 Harness Settings namespace；不自建 Browser persistence。
10. `canvas/change` 仍是 required durable Canvas event，不应降级为 ignorable presentation metadata。

这些规则属于 compatibility overlay 已完成部分，但不能替代官方 boot/package graph 的机械同步。

## 5. 已确认的 rc.8 架构变化

1. Web React application mount ownership 从旧 shell 迁移到动态 `ui-renderer` plugin/service。
2. `ui-attachment` 成为动态 client plugin；conversation 提供数据/slot，attachment plugin 持有呈现。
3. ui-theme 全局样式进入 plugin-owned dynamic client bundle。
4. settings/schema ownership 调整，Canvas 配置应接 Harness settings 体系而不是自建 Browser 真源。
5. Web boot 变为 framework-free boot page → dynamic roster → `uiRenderer` handoff。
6. 新增 `code-runtime-python` fd-3 protocol package，可作为后续 Python execution adapter 的官方运行时 seam。
7. Agent Teams 在 rc.8 被标记为 experimental；Canvas 主链不得依赖其稳定性。
8. DeepSeek reasoning-content 回传链路有修复；Canvas 不应复制/覆盖官方 Agent reasoning transport。

## 6. Canvas 产品不变量

上游升级不得改变以下需求：

- Agent/Session 实时控制同一个 Canvas。
- Minimal 模式只展示最终图片/视频和必要运行状态。
- Editor 模式展示并允许人工编辑 workflow。
- Minimal/Editor 共用同一 Workflow、Run 与资产语义。
- 会话 Composer 在 Canvas 视图仍可用。
- 图片/视频 Provider 通过 Workflow/Executor/Provider Adapter，不由 Browser 直接调用。
- Canvas durable state 由 Session/CanvasService authority 持有。
- 图片/视频 binary 不进入 Session JSON。
- 支持未来自定义节点、Provider、脚本节点和外部 workflow adapter。

## 7. 私有定制分类

### 必须保留

- `apps/infinite-canvas` 及其独立进程边界，直到产品明确迁移/替换。
- 三栏布局产品体验。
- Canvas v2.x domain/session/remote/ui/workflow workplan 和已实现代码。

### 应迁移到官方 rc.8 seam

- 当前私有 `packages/client/web` 的 React/AppRoot/app-shell ownership → 官方 `ui-renderer` handoff。
- 当前 rc.7 package/version graph → 官方 rc.8 final package graph。
- 任何遗留的 shell static assembly → dynamic roster/plugin ownership。

### 已从旧实现中迁出的 Canvas 责任

- `ui-layout` 内不再持有 Canvas 专用 Domain/Mode/Draft/Selection state。
- Canvas main surface 由 `ui-canvas` 动态贡献，不由 Web shell 特判。
- Browser 不维护 Host node/provider catalog 静态真源。

## 8. 更新规则

每次官方升级都必须更新以下字段，并为值提供 commit/tree/package 证据：

```text
upstreamVersion
upstreamCommit
privatePreSyncCommit
privatePostSyncCommit
CanvasSchemaVersion
WorkflowSchemaVersion
compatibilityStatus
```

当前 N11.5 还不能填写一个“final-tree privatePostSyncCommit”，因为完整 rc.8 mechanical sync 未完成。`83dad93...` 只能作为 Canvas compatibility overlay commit，不可冒充完整上游同步提交。

在这些字段没有被真实证据更新前，不允许写“已同步到 rc.8 final tree”或“可直接以 rc.8 completed baseline 进入 N12”。
