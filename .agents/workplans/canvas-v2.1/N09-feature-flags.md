# N09 — Canvas Feature Flags / Settings Authority（0.1.1-rc.2 Revision）

Status: `REVIEW / REVALIDATE`

## 1. 目标

建立一个 Host-authoritative、restart-applied 的 Canvas capability contract，并通过 Harness Settings 允许用户配置下一次 activation；Browser永远以 Host current capability 为准。

## 2. 依赖

`N04, N07`

## 3. Host semantics — 保留

当前 N09 核心设计继续成立：

```text
Cordis/composition config = base
Harness durable user settings = overlay
       ↓ feature-service activation samples once
CanvasCapabilities = immutable current runtime fact
```

Settings field 标注 `applies: restart`。改变 checkbox 不应该让当前 Canvas/Editor/Video 半热启用。

## 4. Browser migration — 必改

0.1.1-rc.2 client Settings 已采用 shared `SettingsDescribeMirror`。`ui-canvas` 必须通过官方 `settingsScope.bind({ namespace:'canvas' })` 从共享 mirror 派生，而不是保留 private per-scope `settings.describe()` reader/refresh listener。

## 5. Settings UI availability

即使 current `canvas.enabled=false`，只要当前连接模式允许读取/修改 Settings，Canvas Settings section 仍可存在用于配置下一次启动。

当前 Canvas product surface 仍严格跟随 `remote.canvasFeatures`，不跟随 raw settings snapshot。

## 6. Feature policy

所有 Feature 入口都要 Host fail closed：

- Browser hides/disables只是 presentation；
- Remote workflow mutation、interaction region、Run admission 都重新检查对应 feature；
- Node catalog `definition.feature` 与 current CanvasCapabilities组合决定当前 creatable/executable availability；
- current disabled feature 不删除历史 workflow node。

## 7. Registry/provider distinction

Feature flag 是 deployment policy，不等于 Node/Model/Provider registry existence。Registry可以声明 Video node/model，即使当前 `video.enabled=false`；current authoring/run admission再拒绝。

## 8. 测试

- composition base/user overlay/unset；
- activation sampling/restart semantics；
- shared mirror feeds Canvas namespace；
- disabled Canvas settings recovery；
- Browser current surface only follows Host capabilities；
- historical feature-disabled node stays readable；
- direct Remote/Run bypass fails closed；
- settings scope disposal/HMR lifecycle。

## 9. 验收

PR #37 的 Host feature authority保留。完成 Browser Settings Mirror迁移并在 synchronized official settings/client graph 上执行 focused + REAL settings tests 后重新 ACCEPTED。
