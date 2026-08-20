# Canvas Settings Integration — Harness rc.8

## 1. 原则

Canvas 不建立独立 Browser settings authority。Canvas 配置进入 Harness 当前 settings/schema 体系，由 Host 持久化和校验，Browser 只消费经过 schema 验证的安全配置投影。

## 2. 建议设置分组

```text
Canvas
├─ General
│  ├─ enabled
│  ├─ defaultMode
│  └─ history/variant preferences
├─ Workflow
│  ├─ partialRunEnabled
│  └─ editorEnabled
├─ Media
│  ├─ imageEnabled
│  └─ videoEnabled
├─ Runtime
│  ├─ concurrency
│  └─ local runtime capability
└─ Advanced
   ├─ diagnostics
   └─ experimental capabilities
```

Provider credential 不属于 Browser-readable Canvas settings；它应由 Host/provider configuration secret boundary 持有。

## 3. Feature Flag 与 Settings 的关系

Feature/capability 不只是 UI preference：

```text
Settings/Deployment Capability
       │
       ├─ UI exposure
       ├─ Agent tool exposure
       └─ Host admission/enforcement
```

UI 隐藏不是安全控制。

## 4. Source of Truth

- Host settings schema：配置真源。
- Canvas Session：当前 Canvas durable state。
- Canvas UI store：仅 presentation preference/draft。
- Provider secret/config：Host-only。

不得把 API key、provider secret、任意 provider URL 保存到 Workflow/Session/Browser localStorage。

## 5. rc.8 Compatibility

rc.8 已调整 client settings/schema ownership，因此新增 Canvas 设置时必须复用当前 `ui-settings`/Host settings 扩展方式；不要依赖已经被上游迁移/删除的旧 `schema-form` package 假设。

## 6. 验收

- [ ] Canvas setting 有 schema validation。
- [ ] Host 与 Browser 对 feature 状态一致。
- [ ] 绕过 UI 直接调用 Remote 仍会被 Host capability/admission 拒绝。
- [ ] secret 不进入 Projection/Tool result/Browser。
- [ ] settings plugin dispose/HMR 不重复注册 section。
