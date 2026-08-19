# N25 — 完整 E2E、REAL Composition、发布验收与回归门禁

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

以真实 Harness composition 验证 Agent、人、Session、Remote、UI、Jobs、图片、视频、历史、权限和故障链路，并给出可发布结论。

## 2. 前置依赖

`N01-N24`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- REAL composition tests。
- 完整产品 E2E。
- 性能/体积上限。
- 回归测试。
- Feature Flag rollout。
- 发布/回滚清单。
- 验收报告。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `相关 package tests/`
- `bundle composition`
- `docs/canvas/acceptance/`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

不能只用手工：

```text
ctx.plugin(...)
```

替代产品级 REAL composition。

必须通过真实 Loader/app/process 组合验证产品可见能力。

## 7. 实施步骤

1. 建立 Mock 全链 composition。
2. 建立至少一个 Real Image Provider staging chain。
3. 建立至少一个 Video Provider staging chain。
4. 执行 20+ 核心 E2E 场景。
5. 验证 max nodes/edges/workflow JSON bytes/queue limits。
6. 验证 feature off 可安全回退。
7. 输出验收报告：通过项、失败项、已知限制、上线建议。
8. 发布前冻结 Session schema/API，并保留 rollback 开关。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] 生成图片→4候选→选第3张→编辑→Variant→视频。
- [ ] Agent 修改 ↔ Browser 修改双向可见。
- [ ] selection context 指代。
- [ ] stale CAS。
- [ ] Run rev12 + current rev13。
- [ ] refresh/offline/reconnect。
- [ ] history restore。
- [ ] browser close long run。
- [ ] host restart interrupted。
- [ ] authorization/quota/queue/retry/callback/GC。
- [ ] schema golden fixtures。

## 10. 验收标准

- [ ] 所有 P0/P1/V1 checklist 有明确证据。
- [ ] REAL composition 通过。
- [ ] 无 P0/P1 阻塞缺陷。
- [ ] 可通过 Feature Flag 快速关闭高风险能力。
- [ ] 验收报告可作为发布 gate。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 只验证 happy path 就上线异步视频；N24 chaos 必须先过。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N25`、`检查 N25`、`验收 N25` 或 `修复 N25 验收问题`。
