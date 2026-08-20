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

## 3. 路径分级

### A. 上游核心保护区

以下区域原则上禁止出现 Canvas 特判：

- `packages/client/web/**`
- `packages/client/render-service/**`
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

## 4. Upstream Conflict 分类

每次升级把冲突分为：

1. **Mechanical**：版本、import、build graph、rename。
2. **Lifecycle**：plugin activation/dispose/HMR ownership。
3. **Service Contract**：Session/Remote/Attachment/Settings API 变化。
4. **UI Composition**：slot/layout/root ownership 变化。
5. **Semantic**：上游行为与 Canvas 产品不变量真正冲突。

只有第 5 类允许讨论调整产品架构；前 4 类应通过兼容迁移解决。

## 5. 禁止模式

- 在 `AppFrame` 保存 Workflow/Run/selection authority。
- Browser 直接调用 Provider。
- Canvas 自建第二套 attachment store。
- Canvas 自建第二套 settings persistence。
- 为自定义节点维护 built-in type whitelist。
- 复制官方 Client plugin loader 形成私有 loader。
- 将 Session 私有 hack 当正式通信协议。

## 6. Upgradeability Gate

N25 发布前必须证明：

- Canvas 主要代码位于 Canvas-owned packages。
- 上游核心保护区不存在未说明 Canvas 特判。
- 下一次 Harness 升级可先机械同步官方 tree，再叠加有限 Canvas overlay。
- 所有 overlay 路径都有 regression test。
- `UPGRADE-MIGRATION-RUNBOOK.md` 可直接执行。
