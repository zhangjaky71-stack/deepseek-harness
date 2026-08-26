# N07 — Canvas UI Shell、Minimal/Editor 与产品状态机（rc.8 Revision）

> 当前执行基线：Canvas V2.2 / Harness rc.8 Compatibility Revision

## 1. 节点目标

把 Canvas 作为正式 dynamic client plugin 通过 Harness UI composition seam 接入 Web；保持会话 Composer 可用，并让 Minimal/Editor 只控制 Canvas presentation，而不侵入 `render-service` root ownership 或 `ui-layout` business ownership。

N07 的 rc.8 ownership 修正是：**Canvas 产品面注册到通用 `shell.main`，Conversation/Composer 继续由 `ui-conversation` 占据 `shell.right`。** `ui-layout` 只声明和排列这些通用 shell region，不拥有 Canvas 业务语义。

## 2. 前置依赖

`N05, N06`

## 3. 本节点范围

- `ui-canvas` client plugin。
- 通用 `shell.main` Canvas product surface。
- `ui-conversation` 保持 `shell.right` Conversation/Composer ownership。
- CanvasView / MinimalCanvas / WorkflowEditor shell。
- EMPTY/READY/DIRTY_READY/RUNNING/COMPLETED/FAILED/CANCELLED/INTERRUPTED UI。
- session-scoped CanvasViewState。
- SaveStatus skeleton 与移动端策略。
- plugin activation/dispose/HMR contract。
- capability / mutation Remote 动态出现或消失时的安全降级。

## 4. 明确不在本节点处理

- 不让 `AppFrame`/`ui-layout` 持有 Workflow/Run/selection state。
- 不修改 `render-service` 私有 React mount 来接 Canvas。
- 不抢占或复用 `conversation.view` 作为 Canvas 产品面；该 seam 继续属于 Conversation 自身内部视图。
- 不创建第二个 Canvas Chat/Composer。
- 不直接调用 Provider。

## 5. 预计代码位置

- `packages/client/ui-canvas/**`
- 必要的 bundle/client roster registration
- `packages/client/ui-layout/**` 仅限最小、通用的 `shell.main` region/layout seam
- `packages/client/ui-conversation/**` 仅用于证明既有 `shell.right` ownership 不退化；N07 不把 Canvas state 下沉到 Conversation

## 6. 核心接口 / 行为契约

```text
render-service = React root owner
ui-layout      = generic shell region/layout owner
ui-conversation= Conversation/Composer owner -> shell.right
ui-canvas      = Canvas UI owner              -> shell.main
```

`ui-layout` 可以声明 `shell.left` / `shell.main` / `shell.right`，但不得识别 Canvas Workflow、Run、Asset、Selection 或 Mode。

Minimal/Editor：

```text
UI-local/session-scoped CanvasViewState
≠ Workflow mutation
```

Minimal 与 Editor 必须读取同一 Session Projection/Run/Asset authority。Mutation Remote 不可用时，Projection 驱动的只读 Canvas 仍可展示；需要 mutation 的 Editor 操作必须明确降级，而不是伪造成功。

## 7. 实施步骤

1. 通过 Harness 当前 client plugin graph 注册 `ui-canvas`。
2. 使用通用 `shell.main` 作为 Canvas composition seam；保留 `ui-conversation -> shell.right`。
3. mode/selection/draft 等 presentation state 放 Canvas-owned local store。
4. 根据 Domain derive function 驱动产品状态，不在 UI 拼第二套 authoritative state。
5. 三栏布局保留，但 layout 只决定区域，不决定 Canvas 数据。
6. capability discovery fail-closed：`canvas.enabled=false` 或 discovery 失败时不发布 Canvas 主产品面；Editor catalog/mutation 不可用时只降级对应能力。
7. 为 N11 Draft/Autosave 预留 SaveStatus。
8. 窄屏默认 Minimal，Editor 可全屏/简化进入。
9. dispose/HMR 时移除 slot/listener/subscription，并清理 plugin-lifetime local state。

## 8. rc.8 Compatibility

- Web boot 只负责启动；不能假设 shell 持有 React AppRoot。
- `render-service` failure/boot page 必须保持官方行为。
- `shell.main` 是通用 composition seam，不是 Canvas-specific root contract。
- ui-theme/ui-attachment 等动态插件缺失时 Canvas 应按能力降级，不应破坏基本 Harness boot。
- `remote.canvas` mutation transport 是渲染的可选依赖；`remote.canvasFeatures` 决定是否发布 Canvas surface。

## 9. 测试要求

- [ ] `canvas.enabled=true` 时 Canvas main surface 可见；disabled/discovery failure 时 fail-closed。
- [ ] Composer/Conversation 在 `shell.right` 仍存在，Canvas 不注册第二份 Composer。
- [ ] 切模式不产生 Session Event/Workflow revision。
- [ ] RUNNING 不允许重复 Run。
- [ ] DIRTY_READY 保留旧结果并提示未运行修改。
- [ ] mutation Remote 缺失时只读 Projection 仍可展示，需要写入的操作明确降级。
- [ ] Editor node catalog 失败时回退 Minimal，不破坏 Canvas 基础展示。
- [ ] ui-canvas activation/dispose/re-activation 无重复 slot/listener/local-state 泄漏。
- [ ] render-service assembled boot 下 `shell.main` Canvas 可挂载。
- [ ] 三栏布局/Conversation details overlay 不退化。

## 10. 验收标准

- [ ] UI 不维护第二份 authoritative Canvas。
- [ ] Minimal/Editor 显示同一 Projection。
- [ ] Canvas 不依赖修改 Web shell/react root owner。
- [ ] `ui-layout` 不持有 Canvas business state，`ui-canvas` 不持有 Composer ownership。
- [ ] 所有产品状态有明确 UI。

## 11. Definition of Done

- [ ] typecheck/lint/build。
- [ ] unit/integration/REAL composition 有真实结果。
- [ ] README/JSDoc/Agent Note 与实际 `shell.main` ownership 同步。
- [ ] HMR/disposal 有测试证据。

## 12. 风险与禁止项

- UI 自己拼 authoritative 业务状态。
- Canvas mode 写入 Workflow。
- 把 `conversation.view` 当成跨产品主区域，造成 Conversation 与 Canvas ownership 竞争。
- 让 `ui-layout` 通过 Canvas-specific prop/store 再次成为业务 owner。
- 把 iframe URL 当 Canvas Domain API。

## 13. 验收输出

文件清单、ownership 检查、测试证据、REAL composition、已知限制、结论。

## 14. 实施指令示例

`实施 N07`、`按 rc.8 复查 N07`。