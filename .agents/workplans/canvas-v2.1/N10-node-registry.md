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
- process-local Registry mutation revision 与 atomic snapshot。
- client-safe node catalog projection/Remote seam，并携带 exact Host registry revision。

## 4. 明确不在本节点处理

- Browser 不复制 registry 真源，也不自造 catalog revision。
- Domain/migration 不维护 `NODE_TYPES` built-in admission table。
- React component 实例不进入 Host Registry。
- Registry revision 不是 durable Session generation，也不要求跨 Host restart 单调。
- N10 不增加 Browser catalog polling/push synchronization；consumer 只需能识别每次 Host snapshot 的精确 Registry revision。

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

### Registry revision rule

`MediaNodeRegistry.snapshot()` 在一次同步读取中返回：

```text
{ revision, definitions }
```

其中：

- `revision` 从当前 Registry instance 的 0 开始；
- 每次成功 register 精确推进一次；
- 每次成功 unregister 精确推进一次；
- duplicate/definition validation 失败不推进；
- HMR unload + re-register 是两个独立 mutation，因此有两个不同 revision；
- snapshot 中 definitions 与该 revision 属于同一次读取，不允许先读 list 再单独读 revision；
- Registry remount/restart 后 revision 可重置，因为它不是 durable state。

Host client-safe catalog 必须把该 exact revision 与投影后的 entries 一起返回。Browser 只能保留 Host revision；catalog discovery 失败时不得宣称一个本地 revision。

## 7. 实施步骤

1. effect-scoped registry + unregister/disposal。
2. 注册 V1 semantic nodes。
3. 端口至少 text/image/video/image-list/video-list/mask。
4. lifecycle 支持 deprecated/creatable/executable/replacement。
5. 删除 Canvas pure domain/migration 的 built-in whitelist 假设。
6. Host 暴露 client-safe catalog，不泄漏 Provider credential/Host-only executor。
7. Inspector/Node Library 从 Host catalog 读取 metadata。
8. 自定义 plugin node 的注册/dispose/HMR 可预测。
9. 为 Registry mutation 增加 process-local monotonic revision 与 atomic snapshot。
10. Host `listNodes()` 返回 `{ revision, entries }`；Browser 保存该 exact revision，禁止维护第二份 authority。

## 8. 测试要求

- [ ] duplicate registration。
- [ ] unregister 后 Definition 不可解析。
- [ ] deprecated node 不可创建但按策略可读/执行。
- [ ] executable=false 阻止运行。
- [ ] 未安装 custom node 的历史 Workflow 仍可 load/render。
- [ ] 安装 custom node plugin 后无需修改 Domain switch 即可 resolve。
- [ ] successful register/unregister revision 精确推进，失败 mutation 不推进。
- [ ] HMR unload/re-register 产生可区分 revision。
- [ ] Browser catalog 与 Host registry revision 一致。
- [ ] catalog discovery 失败时 Browser 不伪造 revision，Minimal/read path 可独立降级。

## 9. 验收标准

- [ ] 新增节点无需修改多个 switch/whitelist。
- [ ] Registry disposal 正确。
- [ ] Browser 没有第二份 registry authority。
- [ ] Browser 能证明当前 catalog 对应哪一个 Host Registry snapshot。
- [ ] provider 缺失不会破坏历史 Workflow 可读性。

## 10. Definition of Done

- [ ] unit/migration/catalog tests。
- [ ] README/JSDoc。
- [ ] plugin disposal/HMR test。
- [ ] implementation record 与双语长期维护说明记录 revision / restart 边界。

## 11. 风险与禁止项

禁止把“当前内置节点集合”编码成 Canvas schema 的永久枚举。

禁止把 process-local Registry revision 持久化成 Canvas/Session state，或把它解释成跨 Host restart 的全局 generation。
