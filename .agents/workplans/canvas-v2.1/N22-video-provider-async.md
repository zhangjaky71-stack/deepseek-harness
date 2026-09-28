# N22 — 异步视频 Provider、Polling/Callback、Resume 与视频 V1

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

实现 text-to-video/image-to-video 长任务，支持 Provider 异步 task、Polling 或 Callback，并完成视频 V1 产品链。

## 2. 前置依赖

`N15, N16, N21`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- text-to-video。
- image-to-video。
- providerTaskId。
- polling/callback。
- callback signature/replay protection。
- duplicate/out-of-order callback。
- cancel。
- 视频 asset save。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `具体 video provider package`
- `callback route integration`
- `packages/canvas/canvas/src/reconciler.ts`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

Callback：

```text
verify signature
→ providerTaskId ownership
→ idempotency
→ monotonic state transition
→ save video
→ commit terminal Canvas state
```

Content rejection 不允许 fallback 绕过安全策略。

## 7. 实施步骤

1. 实现真实或 Mock async create task。
2. 实现 polling 或 callback（按目标 Provider）。
3. callback 做签名和 replay protection。
4. 重复 callback 幂等。
5. out-of-order terminal→running 拒绝。
6. 完成后先 VideoAssetStore save，再 Canvas completed。
7. cancel 和 late completion race 按 N16 规则处理。
8. 若 Provider 支持 resume，为未来 durable recovery 保存安全 task ref。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] text-to-video。
- [ ] image-to-video。
- [ ] duplicate callback。
- [ ] invalid signature。
- [ ] out-of-order。
- [ ] cancel。
- [ ] Browser close Host continue。
- [ ] Host restart V1 interrupted。

## 10. 验收标准

- [ ] 视频正式达到 V1 要求，不再是可选能力。
- [ ] Minimal/Editor 都能播放结果。
- [ ] History 可重新使用视频/来源图片。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 视频 Provider API/计费差异大；必须逐 Provider 做官方文档核验。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N22`、`检查 N22`、`验收 N22` 或 `修复 N22 验收问题`。
