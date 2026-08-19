# N10 — Media Node Registry、端口 Schema 与节点生命周期

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

把节点定义变成 Workflow Validator、Editor、Agent 摘要、Executor 的统一元数据源，并支持 deprecated/creatable/executable。

## 2. 前置依赖

`N01, N02, N09`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- MediaNodeDefinition。
- 输入/输出 Port 类型。
- config schema/default。
- execution metadata。
- UI metadata。
- Node lifecycle/deprecation。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/media-workflow/src/registry.ts`
- `packages/canvas/media-workflow/src/types.ts`
- `packages/canvas/media-workflow/tests/registry.test.ts`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

V1 节点：

```text
asset.input
prompt
image.generate
image.edit
video.generate
video.image-to-video
output
```

Node Definition 必须声明：

```text
version
inputs/outputs
configSchema
deterministic
capability
lifecycle
```

## 7. 实施步骤

1. 建立 effect-scoped registry，支持 unregister/disposal。
2. 注册 V1 semantic nodes。
3. 端口类型至少 text/image/video/image-list/video-list/mask。
4. 生命周期支持 deprecated/creatable/executable/replacement。
5. 旧节点 unavailable 时必须仍可渲染。
6. 为 Inspector 暴露稳定 UI metadata，但不耦合具体 React 组件。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] 重复注册冲突。
- [ ] unregister 后节点不可再解析。
- [ ] deprecated node 不可创建但可按策略执行。
- [ ] executable=false 在 validation 中阻止运行。

## 10. 验收标准

- [ ] 新增节点不需要修改多个巨型 switch。
- [ ] Registry disposal 正确。
- [ ] 生命周期策略有测试。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 把 React component 实例注册进 Host Domain；UI metadata 只能是可共享描述。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N10`、`检查 N10`、`验收 N10` 或 `修复 N10 验收问题`。
