# N09 — Feature Flags、Harness Settings 与部署能力暴露（rc.8 Revision）

## 1. 节点目标

支持灰度开启/关闭 Canvas、Editor、Video、History、Variant、Partial Run 等能力，并在 rc.8 settings/schema 架构下保证 Host、Browser 与 Agent Tool 的能力判断一致。

## 2. 前置依赖

`N04, N07`

## 3. 本节点范围

- `canvas.enabled`
- `editor.enabled`
- `history.enabled`
- `video.enabled`
- `variants.enabled`
- `partialRun.enabled`
- `regionEdit.enabled`
- `providerFallback.enabled`
- Harness settings/schema registration。
- Host enforcement / UI exposure / Agent Tool exposure。

## 4. 明确不在本节点处理

- 不自建 Browser settings persistence。
- Provider credentials 不进入 Browser settings/Workflow/Session。
- Feature flag 不替代 authorization/quota/admission。

## 5. 预计代码位置

- Harness 当前 Host settings/schema extension seam
- `packages/client/ui-canvas/**`
- `packages/canvas/tool-canvas/**`（后续）

不得依赖 rc.8 已迁移/删除的旧 `schema-form` ownership 假设。

## 6. 核心契约

```text
Host Setting / Deployment Capability
    ├─ UI exposure
    ├─ Agent tool exposure
    └─ Host enforcement
```

UI hidden 不是安全控制。

## 7. 实施步骤

1. 按当前 Harness settings 体系注册 Canvas schema/section。
2. CanvasService/Admission 对危险能力做 Host check。
3. Node Library/按钮根据安全 capability projection 过滤。
4. Agent Tool 仅广告允许能力，执行时仍再次 Host check。
5. 历史 Workflow 包含 disabled/unavailable node 时仍可读，但 Validation 阻止执行。
6. settings plugin dispose/HMR 不重复注册。

## 8. 测试要求

- [ ] video disabled 时 UI 不显示可创建视频节点。
- [ ] 直接 Remote run video workflow 仍被 Host 拒绝。
- [ ] 旧 video workflow 可打开但不可执行。
- [ ] Browser 修改 presentation preference 不改变 Host capability。
- [ ] secret 不出现在 Browser/Projection/Tool result。

## 9. 验收标准

- [ ] 绕过 UI 无法使用关闭能力。
- [ ] 灰度关闭不破坏历史 Workflow 可读性。
- [ ] Canvas settings 复用 Harness settings authority。

## 10. Definition of Done

- [ ] settings schema test。
- [ ] Host enforcement test。
- [ ] client plugin lifecycle test。

## 11. 风险与禁止项

禁止把 feature flag、authorization、quota、provider credential 混成一个配置对象。
