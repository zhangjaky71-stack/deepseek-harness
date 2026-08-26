# Agent Note：Canvas V2.2 部署能力复用 Harness Settings

Status: implemented

[English](2026-08-22-canvas-v2-2-feature-settings.md) | 中文

## 问题

Canvas 已经有一套 Host deployment feature service，覆盖 Canvas、Editor、History、Video、Variants、Partial Run、Region Edit 与 Provider Fallback。Host operation 和 Browser capability discovery 已经正确复用这套服务，但它的配置来源只停留在 Cordis plugin `Config`。N09 工作计划要求接入当前 Harness settings authority：Feature owner 注册 namespace schema，durable user document 覆盖 composition config。

如果简单把 Settings 做成 optional/dynamic integration，还会产生另一个问题。Base bundle 明确规定 row order 不代表 activation order。如果 `CanvasFeatureService` 可以先于 `settings` 激活，再在 provider 晚到时采样 Settings，那么同一次 Host activation 的 current capability 会在运行中发生变化。Browser Canvas 当前会在自身 activation 时 snapshot `canvasFeatures`，而 Host operation 会读取 service 当前值，这样会让 UI exposure 和 Host enforcement 分裂。

## 决策

`CanvasFeatureService` 把 `settings` 声明为 activation dependency。Shipped base profile 已经在所有 profile 中挂载 Settings，因此 Cordis 会等 settings provider 可用后才发布 `canvasFeatures`。

Service 使用现有 Schemastery `Config` 注册 `canvas` namespace，并把 Cordis entry config 作为 composition base：

```text
schema defaults
  -> CanvasFeatureService entry config (base)
  -> settings.yaml user section "canvas"
  -> resolved activation snapshot
```

Registration 使用 `applies: 'restart'`。`CanvasFeatureService` 在 activation 时只采样一次 resolved scope。之后 settings document edit 会被 Settings provider 持久化，但不会修改当前 `capabilities` object。Host restart 或 feature-service remount 后重新注册 namespace，再采样新的 durable user layer。

这不是 live flag system。完整的 live capability transition 还需要 atomic Browser surface removal/republication、Editor node-catalog refresh、prompt-preparation replacement、in-flight admission semantics，以及后续 Agent Tool advertisement 更新。N09 不会在 checkbox 后面偷偷引入半套协议。

## Browser Ownership

`ui-canvas` 拥有 Canvas settings section；`ui-settings` 仍只负责通用 settings shell/transport。Canvas client 通过 `ctx.settingsScope` 绑定 `canvas` namespace，并且 settings contribution 与当前 `canvas.enabled` capability 独立。即使当前 Canvas 已关闭，用户仍然可以在 Settings 中为下一次 Host activation 重新启用它。

Settings component 通过 slot `inject.hooks` compartment 和框架生成的 `useSettings` 获取 snapshot，不直接订阅 service。写入调用 `SettingsScope.set(feature, { enabled })`；Reset 调用 `unset(feature)`，让该字段重新继承 composition/schema layer。页面明确展示“重启生效”，并区分 user override 与 inherited value。

Canvas main product surface 不依赖 Settings UI 是否存在。它仍然只根据当前 Host `canvasFeatures` Remote 决定是否发布。保存 checkbox 永远不会让当前 UI 假装新的 deployment capability 已经生效。

## 考虑过的替代方案

**继续只用 Cordis Config 作为 truth** — 否决。它绕过仓库 durable settings namespace authority，也没有 Browser 的 canonical persistence path。

**把 Settings 做成 optional，出现时立即采样** — 否决。因为 bundle row order 不负责 activation sequencing，这会产生 base-only → settings-backed 的半热切换。

**watch settings scope 并实时更新 `ctx.canvasFeatures`** — N09 否决。当前 Browser/Host consumer 尚未共享 atomic live-reconfiguration protocol。

**把 flag 存进 Canvas Session/Workflow/Projection 或 browser localStorage** — 否决。Deployment policy 不是 Canvas business state，不能制造第二套 durable authority。

## 结果

任何挂载 `CanvasFeatureService` 的 composition 都必须提供 Harness `settings` service。Shipped base composition 已经满足该契约。轻量 custom composition 如果不需要 deployment feature policy，可以不挂 `CanvasFeatureService`；Canvas Domain 本身不会因此变成 settings provider。

Canvas package 现在对 `@deepseek-ai/dsh-settings` 有真实 workspace dependency，`ui-canvas` 则只为 Settings contribution 增加 optional client Settings contract peer/type dependency。Lockfile 和 generated artifacts 必须由 pinned workspace toolchain 生成，不能手工改写。

## 验证

Host test 覆盖 composition base + user layer resolution、`applies: restart`、无 secret descriptor、settings write 不改变 current activation、remount 重新采样，以及 namespace disposal。既有 feature/interaction policy fixture 也补上最小 Settings provider，使测试依赖图和真实 composition 一致。

Client test 覆盖八个开关、restart copy、override/inheritance、read-only/unavailable、`SettingsScope.set/unset`、settings contribution disposal，以及关键场景：current `canvas.enabled=false` 时 `shell.main` 不发布，但 Canvas Settings section 仍然存在。

N09 从 REVIEW 进入 ACCEPTED 前，仍必须通过仓库级 typecheck、lint、build、GUI/browser tests、generated-artifact consistency 与 REAL composition。