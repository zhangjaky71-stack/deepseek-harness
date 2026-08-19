# N14 — Media Provider 抽象、路由与 Mock Provider

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

建立与 Canvas Domain 解耦的 Provider 执行层，并用可故障注入的 Mock Provider 打通图片/视频执行测试。

## 2. 前置依赖

`N13`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- MediaProvider interface。
- semantic request → provider adapter。
- inline/polling/callback/resume/cancel operation shape。
- Provider registry/routing。
- Mock image/video。
- 故障注入：delay/429/5xx/rejection/timeout/cancel/duplicate completion。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/media-provider/**`
- `packages/canvas/media-provider-mock/**`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

Provider credential 不进入：

```text
Workflow
Session
Projection
Tool result
Browser
```

Provider URL 由部署配置控制，Workflow 不允许任意 URL。

## 7. 实施步骤

1. 定义 MediaCapability 与 semantic execution request。
2. 定义 operation handle，预留 providerTaskId/mode。
3. 建立 provider registry。
4. Mock Provider 支持 text-to-image/image-edit/text-to-video/image-to-video。
5. Mock 输出固定测试 PNG/MP4。
6. 加入 failure injection 配置。
7. Mock progress 只能在明确模拟时提供真实可预测状态。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] success。
- [ ] cancel。
- [ ] timeout。
- [ ] 429。
- [ ] 5xx。
- [ ] content rejection。
- [ ] duplicate completion。
- [ ] provider unregister/disposal。

## 10. 验收标准

- [ ] 不接任何真实云服务也能跑完整执行链。
- [ ] 接真实 Provider 不应要求修改 Canvas Domain。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 把真实 Provider payload 当 MediaWorkflow config；必须经 Adapter。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N14`、`检查 N14`、`验收 N14` 或 `修复 N14 验收问题`。
