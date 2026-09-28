# N24 — Asset GC、Data Retention、故障注入与恢复硬化

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

处理 orphan、历史资产保留、Provider/Session/Asset 边界故障，并证明系统不会因 race 或部分失败产生错误 durable state。

## 2. 前置依赖

`N17, N21, N22, N23`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- Referenced/Historical/Orphan/GC eligible。
- orphan grace period。
- history retention。
- late result。
- failure injection。
- Chaos matrix。
- terminal races。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `media-assets GC implementation`
- `attachment GC 适配（若现有 seam 支持）`
- `packages/canvas/**/tests/chaos*.test.ts`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

默认：

```text
current reference → keep
history reference within retention → keep
orphan during grace → keep
orphan after grace → delete
```

UI Delete 默认解除引用/逻辑删除，不直接破坏历史可重放性。

## 7. 实施步骤

1. 建立引用扫描/索引策略。
2. 标记 provider success + commit failure 的 orphan。
3. 实现 grace-period GC。
4. 明确历史 retention 配置。
5. Mock Provider 注入网络、429、5xx、rejection、duplicate completion、late completion。
6. 测试 Asset save fail、Session append fail、Projection disconnect。
7. 测试 cancel/completion race。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] current ref retained。
- [ ] history ref retained。
- [ ] orphan grace 后删除。
- [ ] late result after cancelled 成 orphan。
- [ ] Provider success + Asset fail 不 commit completed。
- [ ] Asset success + Session fail 不重复调用 Provider。
- [ ] duplicate terminal 不重复保存。

## 10. 验收标准

- [ ] 不存在明显永久 orphan 无清理路径。
- [ ] 部分失败不会产生引用不存在 asset 的 completed state。
- [ ] 关键 race 有固定测试。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 误删历史引用资产；GC 必须基于 authoritative references，不靠文件时间猜。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N24`、`检查 N24`、`验收 N24` 或 `修复 N24 验收问题`。
