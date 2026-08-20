# N07 — Canvas UI Shell、Minimal/Editor 与产品状态机（rc.8 Revision）

> 当前执行基线：Canvas V2.2 / Harness rc.8 Compatibility Revision

## 1. 节点目标

把 Canvas 作为正式 dynamic client plugin 通过 Harness UI composition seam 接入 Web；保持会话 Composer 可用，并让 Minimal/Editor 只控制 Canvas presentation，而不侵入 `render-service` root ownership 或 `ui-layout` business ownership。

## 2. 前置依赖

`N05, N06`

## 3. 本节点范围

- `ui-canvas` client plugin。
- `conversation.view` slot。
- CanvasView / MinimalCanvas / WorkflowEditor shell。
- EMPTY/READY/DIRTY_READY/RUNNING/COMPLETED/FAILED/CANCELLED/INTERRUPTED UI。
- session-scoped CanvasViewState。
- SaveStatus skeleton 与移动端策略。
- plugin activation/dispose/HMR contract。

## 4. 明确不在本节点处理

- 不让 `AppFrame`/`ui-layout` 持有 Workflow/Run/selection state。
- 不修改 `render-service` 私有 React mount 来接 Canvas。
- 不创建第二个 Canvas Chat/Composer。
- 不直接调用 Provider。

## 5. 预计代码位置

- `packages/client/ui-canvas/**`
- 必要的 bundle/client roster registration
- `packages/client/ui-layout/**` 仅限最小 region/layout seam

## 6. 核心接口 / 行为契约

```text
render-service = React root owner
ui-layout      = layout owner
ui-conversation= composer/chat owner
ui-canvas      = Canvas UI owner
```

Minimal/Editor：

```text
UI-local/session-scoped CanvasViewState
≠ Workflow mutation
```

Minimal 与 Editor 必须读取同一 Session Projection/Run/Asset authority。

## 7. 实施步骤

1. 通过 Harness 当前 client plugin graph 注册 `ui-canvas`。
2. 继续使用 `conversation.view` 作为 Canvas composition seam。
3. mode/selection/draft 等 presentation state 放 Canvas store。
4. 根据 Domain derive function 驱动产品状态，不在 UI 拼第二套状态机。
5. 三栏布局保留，但 layout 只决定区域，不决定 Canvas 数据。
6. 为 N11 Draft/Autosave 预留 SaveStatus。
7. 窄屏默认 Minimal，Editor 可全屏/简化进入。
8. dispose 时移除 slot/listener/subscription/timer。

## 8. rc.8 Compatibility

- Web boot 只负责启动；不能假设 shell 持有 React AppRoot。
- `render-service` failure/boot page 必须保持官方行为。
- ui-theme/ui-attachment 等动态插件缺失时 Canvas 应按能力降级，不应破坏基本 Harness boot。

## 9. 测试要求

- [ ] Canvas view 可见。
- [ ] Composer 在 Canvas view 下仍存在。
- [ ] 切模式不产生 Session Event/Workflow revision。
- [ ] RUNNING 不允许重复 Run。
- [ ] DIRTY_READY 保留旧结果并提示未运行修改。
- [ ] ui-canvas activation/dispose/re-activation 无重复 slot/listener。
- [ ] render-service assembled boot 下 Canvas 可挂载。
- [ ] 三栏布局/Conversation details overlay 不退化。

## 10. 验收标准

- [ ] UI 不维护第二份 authoritative Canvas。
- [ ] Minimal/Editor 显示同一 Projection。
- [ ] Canvas 不依赖修改 Web shell/react root owner。
- [ ] 所有产品状态有明确 UI。

## 11. Definition of Done

- [ ] typecheck/lint/build。
- [ ] unit/integration/REAL composition 有真实结果。
- [ ] README/JSDoc 更新。
- [ ] HMR/disposal 有测试证据。

## 12. 风险与禁止项

- UI 自己拼业务状态。
- Canvas mode 写入 Workflow。
- 把 iframe URL 当 Canvas Domain API。

## 13. 验收输出

文件清单、ownership 检查、测试证据、REAL composition、已知限制、结论。

## 14. 实施指令示例

`实施 N07`、`按 rc.8 复查 N07`。
