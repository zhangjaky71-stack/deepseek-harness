# N09 — Feature Flags 与部署能力暴露

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

支持灰度开启/关闭 Canvas、Editor、Video、History、Variant、Partial Run 等能力，并确保 Host 和 UI 一致。

## 2. 前置依赖

`N04, N07`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- canvas.enabled/editor.enabled/history.enabled/video.enabled/variants.enabled/partialRun.enabled/regionEdit.enabled/providerFallback.enabled。
- Host enforcement。
- UI capability exposure。
- Agent Tool capability exposure。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `Canvas config/feature package 按仓库现有配置方式落位`
- `packages/client/ui-canvas/**`
- `packages/canvas/tool-canvas/**（后续接入）`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

Feature Flag 不只是 UI flag：

```text
UI hidden
+
Tool not advertised / rejects
+
CanvasService/Admission Host rejects
```

## 7. 实施步骤

1. 定义 feature config schema。
2. CanvasService 对危险能力做 Host check。
3. UI Node Library/按钮根据 capability 过滤。
4. Agent Tool schema 或 tool execution 根据功能状态调整。
5. 旧 Workflow 包含 disabled node 时仍可打开，但 Validation 显示 unavailable。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] video disabled 时 UI 不显示视频节点。
- [ ] 直接 Remote run video workflow 仍被 Host 拒绝。
- [ ] 旧 video workflow 能打开但不能执行。

## 10. 验收标准

- [ ] 任何 flag 都无法仅靠绕过 UI 使用被关闭能力。
- [ ] 灰度关闭不会破坏历史 Workflow 可读性。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 把 feature flag 与 authorization 混为一谈；两者是独立检查。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N09`、`检查 N09`、`验收 N09` 或 `修复 N09 验收问题`。
