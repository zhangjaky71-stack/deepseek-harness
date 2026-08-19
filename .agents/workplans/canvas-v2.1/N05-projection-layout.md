# N05 — Session Projection、Canvas Layout Projection 与客户端状态读取

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

让浏览器只通过 Session Projection 获取当前 Canvas authoritative state，同时独立保存布局而不污染 Workflow revision。

## 2. 前置依赖

`N03`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- `SessionProjectionMap.canvas`。
- `canvas/layout-change` 与 `canvasLayout` projection。
- projection boundedness。
- drag-end 持久化与 viewport/node positions。
- 刷新后恢复 Workflow + Layout。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/canvas/src/types.ts`
- `packages/canvas/canvas/src/index.ts`
- `packages/canvas/canvas/tests/projection.test.ts`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

主 Projection：

```text
canvas → current CanvasSnapshot | null
```

布局 Projection：

```text
canvasLayout → CanvasLayoutSnapshot | null
```

布局变化不得增加 `workflowRevision`。

## 7. 实施步骤

1. 注册 canvas projection，last-wins full snapshot。
2. 注册独立 canvasLayout projection。
3. 定义 layout event 和 schema。
4. 控制 projection 大小：不放 history、binary、progress history、provider raw response。
5. 建立 projection replay test。
6. 建立 workflow update / layout update 相互不影响 revision 的测试。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] cold projection replay 等于 live。
- [ ] drag-end layout change 不改变 workflowRevision。
- [ ] Canvas change 不丢失 layout。
- [ ] 大 history 不进入 projection。

## 10. 验收标准

- [ ] Browser 刷新后得到当前 Workflow/Run/Output。
- [ ] Editor 布局刷新后恢复。
- [ ] Projection 可作为 UI 唯一 current-state source。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 把节点坐标放回 MediaWorkflow；禁止。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N05`、`检查 N05`、`验收 N05` 或 `修复 N05 验收问题`。
