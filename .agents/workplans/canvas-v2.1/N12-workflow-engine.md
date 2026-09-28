# N12 — Media Workflow Validator、Scheduler、Partial Execution 与 Fingerprint

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

建立独立于现有 Harness WorkflowEngine 的媒体 DAG 执行引擎，支持静态验证、拓扑执行和未来局部运行/缓存。

## 2. 前置依赖

`N10`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- static validation。
- cycle detection。
- port/type validation。
- topological sort。
- execution target：all/selected/from-node/downstream。
- NodeExecutionFingerprint。
- deterministic cache seam。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/media-workflow/src/validate.ts`
- `scheduler.ts`
- `fingerprint.ts`
- `cache.ts`
- `index.ts`
- `tests/`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

执行目标：

```ts
type mode = 'all' | 'selected' | 'from-node' | 'downstream'
```

V1 UI 可只开放 `all`，但底层 API 不锁死。

现有 `ctx.workflowEngine` 不改造成媒体 DAG。

## 7. 实施步骤

1. 实现节点/边唯一性、端口存在、类型兼容、cycle validation。
2. 实现 deterministic topological order。
3. 定义 node executor dispatch contract。
4. 定义 immutable run workflow snapshot。
5. 加入 execution target 计算。
6. 定义 fingerprint：node type/version/model/config hash/input asset hashes。
7. 仅 deterministic transform 默认可缓存；生成节点默认不可自动 cache。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] 合法 DAG。
- [ ] cycle。
- [ ] missing node/port。
- [ ] type mismatch。
- [ ] selected/from-node/downstream target 计算。
- [ ] 相同 deterministic input fingerprint 相同。
- [ ] generative node 不默认命中 cache。

## 10. 验收标准

- [ ] Engine 完全不依赖 Browser。
- [ ] 可用 Mock executor 跑完整 DAG。
- [ ] 未来 Partial Run 不需要重写 scheduler API。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 把所有节点 executor 写成单文件巨型 switch；使用 Registry。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N12`、`检查 N12`、`验收 N12` 或 `修复 N12 验收问题`。
