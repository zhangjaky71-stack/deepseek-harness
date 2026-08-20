# Canvas Upstream Baseline — Harness rc.8

## 1. 目的

本文件是 Canvas 工程与官方 DeepSeek Harness 之间的版本锚点。所有后续 Canvas 节点、兼容修复、回归测试和升级判断都必须先读取本文件，避免把“代码兼容审计”“局部 backport”“完整上游同步”混为一谈。

## 2. 当前目标

| 项目 | 值 |
|---|---|
| 官方仓库 | `deepseek-ai/deepseek-harness` |
| 官方目标版本 | `dsh@0.1.0-rc.8` |
| 官方目标提交 | `141eb6fef83422698aef7a981029e843e8161534` |
| 官方发布日期 | 2026-08-19 |
| 私有仓库 | `zhangjaky71-stack/deepseek-harness` |
| Canvas 计划版本 | V2.2 rc.8 compatibility revision |
| 完整同步状态 | **PENDING，必须由 N11.5 完成并用 tree/commit 证据更新** |

## 3. 已确认的 rc.8 架构变化

1. Web React application mount ownership 从旧 shell 迁移到动态 `render-service` plugin。
2. `ui-attachment` 成为动态 client plugin；conversation 提供数据/slot，attachment plugin 持有呈现。
3. ui-theme 全局样式进入 plugin-owned dynamic client bundle。
4. settings/schema ownership 调整，Canvas 配置应接 Harness settings 体系而不是自建 Browser 真源。
5. Web boot 变为 framework-free boot page → dynamic roster → render-service handoff。
6. 新增 `code-runtime-python` fd-3 protocol package，可作为后续 Python execution adapter 的官方运行时 seam。
7. Agent Teams 在 rc.8 被标记为 experimental；Canvas 主链不得依赖其稳定性。
8. DeepSeek reasoning-content 回传链路有修复；Canvas 不应复制/覆盖官方 Agent reasoning transport。

## 4. Canvas 产品不变量

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

## 5. 私有定制分类

### 必须保留

- `apps/infinite-canvas` 及其独立进程边界，直到产品明确迁移/替换。
- 三栏布局产品体验。
- Canvas v2.x domain/session/remote/ui/workflow workplan 和已实现代码。

### 应逐步迁移出官方核心文件

- `packages/client/ui-layout` 内 Canvas 专用状态和业务逻辑。
- Web shell/AppFrame 里的 Canvas 特判。
- Browser 静态复制 Host node/provider catalog 的逻辑。

## 6. 更新规则

每次官方升级都必须更新：

```text
upstreamVersion
upstreamCommit
privatePreSyncCommit
privatePostSyncCommit
CanvasSchemaVersion
WorkflowSchemaVersion
compatibilityStatus
```

在这些字段没有被真实证据更新前，不允许写“已同步到最新版”。
