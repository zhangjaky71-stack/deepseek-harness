# N13 — Media Model Registry 与 Requirement Resolver

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

统一描述模型能力，并把“用户需求 → 可运行模型”的判断从 Agent/UI if-else 中抽离。

## 2. 前置依赖

`N10, N12`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- MediaModelDescriptor。
- ProviderDescriptor。
- MediaModelRequirements。
- strict/fallback resolution。
- 尺寸、比例、duration、mask、reference count、seed/audio 能力。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/media-provider/src/types.ts`
- `packages/canvas/media-provider/src/model-registry.ts`
- `tests/model-resolver.test.ts`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

用户明确模型：

```text
preferredModelId + strict
```

不支持就失败，不能静默切换。

用户未指定：

```text
requirements + deployment policy
→ compatible model
```

## 7. 实施步骤

1. 建立 effect-scoped model registry。
2. 定义 capability constraints。
3. 实现 requirement matcher。
4. 实现 strict 与 fallback routing mode。
5. 返回 resolution warnings 和实际 provider/model。
6. UI/Agent 后续都从 resolver/registry 获取可用能力。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] 9:16、duration、mask、reference count 匹配。
- [ ] strict 模型不兼容明确失败。
- [ ] fallback 只选择真正兼容模型。
- [ ] disabled feature/model 不被选中。

## 10. 验收标准

- [ ] Agent 不需要猜哪个模型支持什么。
- [ ] Inspector 可以基于同一 descriptor 限制参数。
- [ ] Provenance 能记录最终 model/provider。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 在每个 Provider adapter 外重复维护能力表；Registry 是唯一描述源。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N13`、`检查 N13`、`验收 N13` 或 `修复 N13 验收问题`。
