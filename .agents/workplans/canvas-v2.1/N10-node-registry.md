# N10 — Media Node Registry、开放节点类型、端口 Schema 与生命周期（rc.8 Revision）

## 1. 节点目标

把节点定义变成 Validator、Editor、Agent 摘要、Executor 的统一 Host 元数据源，并保证自定义/第三方节点是 open-world extension，而不是受 built-in type whitelist 限制。

## 2. 前置依赖

`N01, N02, N09`

## 3. 本节点范围

- MediaNodeDefinition。
- 输入/输出 Port 类型。
- config schema/default。
- execution/UI metadata。
- lifecycle/deprecation。
- Host node catalog service/registry。
- client-safe node catalog projection/Remote seam。

## 4. 明确不在本节点处理

- Browser 不复制 registry 真源。
- Domain/migration 不维护 `NODE_TYPES` built-in admission table。
- React component 实例不进入 Host Registry。

## 5. 预计代码位置

- `packages/canvas/media-workflow/src/registry.ts`
- `packages/canvas/media-workflow/src/types.ts`
- Canvas domain/migration compatibility files
- client-safe catalog Remote（N11 可消费）

## 6. 核心接口 / 行为契约

Built-in V1 节点只是首批注册项，不是全世界：

```text
asset.input
prompt
image.generate
image.edit
video.generate
video.image-to-video
output
+ arbitrary plugin node types
```

每个 Definition 声明：

```text
version
inputs/outputs
configSchema
deterministic
capability
lifecycle
uiMetadata
```

### Open-world rule

Workflow Domain 允许保存任意语法合法的 `node.type`。当前 Host registry 无 Definition 时：

- 仍可 load/migrate/展示 placeholder；
- 不允许 silently 删除 node；
- Validator 给出 unavailable definition；
- 是否可执行由当前 registry/lifecycle/admission 决定。

## 7. 实施步骤

1. effect-scoped registry + unregister/disposal。
2. 注册 V1 semantic nodes。
3. 端口至少 text/image/video/image-list/video-list/mask。
4. lifecycle 支持 deprecated/creatable/executable/replacement。
5. 删除 Canvas pure domain/migration 的 built-in whitelist 假设。
6. Host 暴露 client-safe catalog，不泄漏 Provider credential/Host-only executor。
7. Inspector/Node Library 从 Host catalog 读取 metadata。
8. 自定义 plugin node 的注册/dispose/HMR 可预测。

## 8. 测试要求

- [ ] duplicate registration。
- [ ] unregister 后 Definition 不可解析。
- [ ] deprecated node 不可创建但按策略可读/执行。
- [ ] executable=false 阻止运行。
- [ ] 未安装 custom node 的历史 Workflow 仍可 load/render。
- [ ] 安装 custom node plugin 后无需修改 Domain switch 即可 resolve。
- [ ] Browser catalog 与 Host registry revision 一致。

## 9. 验收标准

- [ ] 新增节点无需修改多个 switch/whitelist。
- [ ] Registry disposal 正确。
- [ ] Browser 没有第二份 registry authority。
- [ ] provider 缺失不会破坏历史 Workflow 可读性。

## 10. Definition of Done

- [ ] unit/migration/catalog tests。
- [ ] README/JSDoc。
- [ ] plugin disposal/HMR test。

## 11. 风险与禁止项

禁止把“当前内置节点集合”编码成 Canvas schema 的永久枚举。
