# N09 — Feature Flags、Harness Settings 与部署能力暴露（rc.8 Revision）

## 1. 节点目标

支持灰度开启/关闭 Canvas、Editor、Video、History、Variant、Partial Run 等能力，并在 rc.8 `ctx.settings` / `settingsScope` 架构下保证 Host、Browser 与后续 Agent Tool 的能力判断使用同一 Host deployment policy，而不是各自维护开关。

## 2. 前置依赖

`N04, N07, N08`

## 3. 本节点范围

- `canvas.enabled`
- `editor.enabled`
- `history.enabled`
- `video.enabled`
- `variants.enabled`
- `partialRun.enabled`
- `regionEdit.enabled`
- `providerFallback.enabled`
- Harness settings namespace/schema registration。
- Cordis entry config 作为 composition base；Harness user document 作为覆盖层。
- restart-applied settings 语义。
- Host enforcement / UI exposure / 后续 Agent Tool exposure seam。
- Canvas-owned Settings section。

## 4. 明确不在本节点处理

- 不自建 Browser settings persistence。
- 不把 feature flag 写入 Canvas Workflow / Session / Projection。
- Provider credentials 不进入 Browser settings/Workflow/Session。
- Feature flag 不替代 authorization/quota/admission。
- 不在 N09 引入 live capability 热切换协议；当前 activation 的 effective capability 在启动/服务装载时冻结，设置修改在下一次 Host 启动或 Canvas feature-service remount 生效。

## 5. 代码位置

- `packages/settings/settings/**` 的现有 namespace authority（只消费，不复制）。
- `packages/canvas/canvas/src/feature-service.ts`
- `packages/canvas/canvas/src/features.ts`
- `packages/client/ui-canvas/**`
- `packages/canvas/tool-canvas/**`（后续 Agent Tool 节点消费 capability，不在 N09 实现 Tool）。

不得依赖旧的页面级 `schema-form` ownership 假设。Schema Form 可以继续作为 settings shell 的通用渲染工具，但 durable authority 必须是 `ctx.settings`。

## 6. 核心契约

```text
schema defaults
   ↓
Cordis CanvasFeatureService entry config (composition base)
   ↓
Harness settings user document: namespace "canvas"
   ↓  (sampled once when CanvasFeatureService activates; applies: restart)
ctx.canvasFeatures effective capability
   ├─ canvasFeatures Remote → Browser current-runtime exposure
   ├─ Canvas Host enforcement
   └─ future Agent Tool advertisement + execution recheck
```

`CanvasFeatureService` 正式依赖 `settings` 服务。标准 `dsh-base` 在所有 profile 都挂载 settings；这个依赖确保 Cordis 不会先发布 base-only `canvasFeatures`，再因为 settings 晚到而半热更新。自定义轻量 Host 若不需要 deployment feature service，可以不挂 `CanvasFeatureService`；Canvas Domain 本身不因此获得 settings persistence ownership。

Browser `settingsScope` 编辑的是下一次 activation 的 user layer，不是当前 runtime capability。UI hidden 不是安全控制；Host operation 仍必须检查 `ctx.canvasFeatures`。

## 7. 实施步骤

1. `CanvasFeatureService` 保留现有 Schemastery Config 作为同一 schema/default contract。
2. 声明 `static inject = ['settings']`，只在 settings provider 已可用后激活 feature service；注册 `settingsNamespace('canvas')`。
3. `settings.register(..., { base: compositionConfig, applies: 'restart' })`，服务 activation 时只采样一次 resolved value；document 后续修改只持久化，不改变已发布 runtime capability。
4. feature-service/plugin dispose 时 namespace 随 owner fiber 释放；依赖 remount / Host restart 后重新注册并重新采样 durable user layer。
5. `canvasFeatures.get()` 只暴露 effective capability，不暴露 raw base/user layer。
6. CanvasService/Admission 对危险能力做 Host check；disabled 历史 Workflow 仍可读取，新增/执行被拒绝。
7. `ui-canvas` 可选集成 Settings UI：在 `settings.section` 注册 Canvas-owned 页面，通过 `ctx.settingsScope.bind({ namespace: 'canvas' })` 读写 Host user layer；Canvas 主产品面仍不把 ui-settings 当硬依赖。
8. Settings 页面独立于 `canvas.enabled` 注册：当前 Canvas 被关闭时仍能修改下一次启动配置。
9. Settings 页面明确展示“重启生效”、user override/继承状态、read-only/unavailable 状态。
10. Browser 主产品面继续只认当前 Host `canvasFeatures` Remote；不得因为 settings checkbox 改变而伪造当前能力。
11. 后续 Agent Tool 仅广告当前 Host 允许能力，执行时再次 Host check。
12. settings/plugin dispose/HMR 不重复注册 namespace、section 或 observer。

## 8. 测试要求

- [ ] schema defaults + composition base + user layer 按优先级解析。
- [ ] Canvas settings descriptor 为 `ns=canvas`、`applies=restart`，且无 secret 字段。
- [ ] 当前 activation 中修改 settings 不改变 `ctx.canvasFeatures.capabilities`；remount 后读取新值。
- [ ] feature owner dispose 后 namespace 正确释放，可重新注册。
- [ ] feature service 等待 settings 依赖，不存在 base-only → late-settings 的半热能力窗口。
- [ ] `canvas.enabled=false` 时主 Canvas surface 不发布，但 Canvas Settings section 仍可见。
- [ ] Browser Settings 写入走 `SettingsScope.set/unset`，不建立第二套 persistence。
- [ ] video disabled 时 UI 不显示可创建视频节点。
- [ ] 直接 Host/Remote run video workflow 仍被 Host 拒绝（Run API 落地后继续复用同一 check seam）。
- [ ] 旧 video workflow 可打开但不可执行。
- [ ] Browser 修改 presentation preference 不改变 Host capability。
- [ ] secret 不出现在 Browser/Projection/Tool result。

## 9. 验收标准

- [ ] 绕过 UI 无法使用关闭能力。
- [ ] 灰度关闭不破坏历史 Workflow 可读性。
- [ ] Canvas settings 复用 Harness `ctx.settings` authority。
- [ ] Browser settings 与 current Host capability 有明确 restart 边界，不出现“保存即假装生效”。
- [ ] Canvas disabled 时仍保留恢复开关的 Settings 路径。

## 10. Definition of Done

- [ ] settings namespace/schema integration test。
- [ ] Host enforcement test。
- [ ] Canvas Settings component + client plugin lifecycle test。
- [ ] bilingual README / Agent Note 与实际 restart contract 一致。
- [ ] repository-pinned typecheck/lint/build/GUI tests/REAL composition 有当前分支证据。

## 11. 风险与禁止项

- 禁止把 feature flag、authorization、quota、provider credential 混成一个配置对象。
- 禁止让 Browser checkbox 成为当前 capability authority。
- 禁止让 `CanvasFeatureService` 在 settings 尚未 ready 时先发布临时 capability。
- 禁止 live settings edit 在没有完整 dynamic surface teardown/rebind 协议时半热更新 runtime policy。
- 禁止手工伪造 pnpm lock / generated artifacts。