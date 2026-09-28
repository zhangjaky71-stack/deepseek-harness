# N20 — 真实图片 Provider 接入与图片 V1 产品验收

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

在不修改 Canvas 核心架构的前提下接入首个真实图片 Provider，并完成 text-to-image + image-edit 的生产链路。

## 2. 前置依赖

`N14, N15, N16, N17, N18, N19`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- 真实 Provider plugin。
- Model descriptors。
- credentials/settings seam。
- text-to-image。
- image-edit/reference image。
- 尺寸/比例限制。
- provider errors/retry/provenance。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `具体 provider package 由选定服务决定`
- `bundle/config 对应 provider row`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

接 Provider 允许修改：

```text
provider plugin
model descriptor
deployment config
```

若必须大量修改：

```text
Canvas Domain
UI core
Agent Tool core
Workflow schema
```

则视为抽象失败，先停下评审。

## 7. 实施步骤

1. 确认真实 Provider API、credential、模型、限制。
2. 实现 semantic request adapter。
3. 注册 models/capabilities。
4. 接 timeout/retry/idempotency。
5. Provider 输出转 durable Attachment。
6. 映射 content rejection 与 transient/permanent errors。
7. 验证 strict model 与 fallback 规则。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] text-to-image。
- [ ] image-edit。
- [ ] reference image。
- [ ] 多候选（若 Provider 支持；否则 Engine 受控多调用需明确成本）。
- [ ] 429/timeout/rejection。
- [ ] 明确模型不被 silent replacement。

## 10. 验收标准

- [ ] 用户自然语言能生成真实图片。
- [ ] 切 Editor 能看到隐式 Workflow。
- [ ] 人工修改后可重新运行。
- [ ] 图片 V1 验收全部通过。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 真实 API 可能近期变化；实施时必须读取其官方文档并锁版本。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N20`、`检查 N20`、`验收 N20` 或 `修复 N20 验收问题`。
