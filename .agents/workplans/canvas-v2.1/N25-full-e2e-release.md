# N25 — 完整 E2E、REAL Composition、Upstream Compatibility 与发布门禁（rc.8 Revision）

## 1. 节点目标

以真实 Harness composition 验证 Agent、人、Session、Remote、dynamic client plugins、Workflow Engine、Jobs、图片、视频、历史、权限、恢复与上游升级兼容性，并给出可发布结论。

## 2. 前置依赖

`N01-N24`，其中包含 `N11.5`。

## 3. 本节点范围

- REAL composition tests。
- 完整产品 E2E。
- rc.8 dynamic Web Client assembled boot。
- 性能/体积/queue limits。
- Feature Flag rollout/rollback。
- upstream compatibility gate。
- 发布验收报告。

## 4. 明确不在本节点处理

- 不用手工 `ctx.plugin(...)` 假装产品 REAL composition。
- 不把 static audit 当测试 PASS。
- 不允许存在未记录的 Canvas core patch 后直接发布。

## 5. REAL Composition 必须覆盖

```text
Web boot kernel
→ dynamic client roster
→ render-service
→ ui-layout
→ ui-conversation
→ ui-attachment
→ ui-canvas
→ Session/Remote
→ CanvasService
→ Workflow Engine
→ Jobs/Provider
```

## 6. 核心 E2E 场景

- 生成图片→4候选→选第3张→编辑→Variant→视频。
- Agent 修改 ↔ Browser 修改双向可见。
- selection context 指代。
- stale CAS。
- Run snapshot rev12 + current workflow rev13。
- refresh/offline/reconnect/session switch。
- history restore。
- browser close long run。
- host restart interrupted。
- authorization/quota/queue/retry/callback/GC。
- schema golden fixtures。
- ui-canvas activation/dispose/HMR。
- Minimal/Editor same projection。
- user attachment → Canvas asset input。

## 7. Upstream Compatibility Gate

发布前必须证明：

1. `RC8-UPSTREAM-BASELINE.md` 与实际 private commit/tree 一致。
2. 完整 upstream rc.8 已同步，不是局部兼容 backport。
3. `render-service` 是 React root owner。
4. `packages/client/web` 无 Canvas 产品特判。
5. `ui-layout` 只有最小 layout seam。
6. Canvas 主要代码位于 Canvas-owned packages。
7. 上游核心保护区任何修改都有 ADR/理由。
8. `UPGRADE-MIGRATION-RUNBOOK.md` 可用于下一版本。

## 8. 实施步骤

1. Mock 全链 composition。
2. Real Image Provider staging。
3. Video Provider staging。
4. 执行核心 E2E。
5. 验证 max nodes/edges/workflow bytes/queue limits。
6. feature off/rollback。
7. upgradeability review。
8. 输出验收报告：通过、失败、已知限制、上线建议、upstream overlay 清单。

## 9. 验收标准

- [ ] 所有 P0/P1/V1 checklist 有证据。
- [ ] REAL composition 通过。
- [ ] 无 P0/P1 blocker。
- [ ] 高风险能力可 Feature Flag 关闭。
- [ ] 上游兼容 gate 通过。
- [ ] 验收报告可直接作为发布 gate。

## 10. Definition of Done

- [ ] typecheck/lint/build/target test 有真实执行记录。
- [ ] REAL composition 与 Browser E2E 有证据。
- [ ] baseline/compatibility docs 更新到发布 commit。
- [ ] rollback 方案验证。

## 11. 风险与禁止项

- 只测 happy path。
- runner 不可用仍写 PASS。
- 发布后才发现 Canvas 依赖旧 shell ownership。
