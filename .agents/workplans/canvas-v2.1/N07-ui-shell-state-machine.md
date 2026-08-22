# N07 — UI Shell、Minimal/Editor 与产品状态机（0.1.1-rc.2 Revision）

Status: `REVIEW / INTENTIONAL DIVERGENCE`

## 1. 目标

在最新 Harness Client/Renderer/Layout 上提供 Canvas 产品主工作区，同时让 Conversation/Composer 独立并存；Minimal/Editor 只是同一 Session Canvas Projection 的两种呈现。

## 2. 依赖

`N05, N06`

## 3. 官方 vs Canvas Layout

官方 0.1.1-rc.2：

```text
sidebar | conversation | details
```

Canvas 产品要求：

```text
sidebar | shell.main(Canvas) | conversation | details
```

这是**必须保留的 intentional product divergence**。同步官方 `ui-layout` 时必须从最新官方实现出发，仅重放 `shell.main` slot/geometry/render-placement patch。

## 4. Ownership

- `ui-renderer`: React root + React bindings；
- `ui-layout`: generic geometry/slots/panel viewing state；
- `ui-conversation`: ConversationRoot + Composer；
- `ui-canvas`: Canvas Minimal/Editor surface；
- Session Projection: semantic current state；
- Browser local store: mode/selection/editor draft presentation only。

`ui-layout` 禁止 import Canvas domain/runtime values。

## 5. Minimal

Minimal 必须在 Editor catalog、mutation Remote 或 Provider runtime 不可用时仍能显示已持久化 current output/history summary，只要 Canvas current Projection 可读。

Minimal 不展示可编辑 DAG，仅展示：

- current/primary media；
- candidate/result navigation；
- relevant run state；
-必要 retry/error affordance（真正语义由后续 Run API 决定）。

## 6. Editor

Editor 只有在 current capability `editor.enabled` 且 exact node catalog 可用时开放可编辑 DAG。Editor failure 不应破坏 Minimal。

## 7. Mode

Mode 是 session-scoped Browser presentation state：

```text
minimal | editor
```

切换不 append Canvas event、不改变 workflowRevision、不复制 Workflow/Run。

## 8. Latest renderer/lifecycle requirements

- Web 不拥有 React root；
- `ui-canvas` 通过 dynamic slot registration 进入 `shell.main`；
- plugin unload/HMR 后 slot occupant 撤回；
- Session prune 时 mode/selection presentation state 清理；
- latest Session binding/hook APIs 取代旧 private shell send/read path。

## 9. Responsive/fallback

在空间不足或 Canvas capability disabled 时，layout 可以降级/隐藏 Canvas product column，但不能把 Canvas semantic authority转移到 Conversation 或 Browser local state。具体 responsive 策略在实现时基于最新 upstream layout geometry决定并测试。

## 10. 测试

- official latest layout + minimal `shell.main` patch snapshot/behavior；
- ui-layout no Canvas runtime dependency gate；
- Conversation owns Composer；
- Canvas plugin enable/disable/dispose slot lifecycle；
- Minimal survives node catalog/mutation Remote failure；
- Editor feature/catalog gating；
- mode session isolation/prune；
- REAL assembled Canvas + Conversation coexistence。

## 11. 验收

PR #35 的产品 ownership 结论保留，但必须把 private layout patch replay 到 0.1.1-rc.2 最新 `ui-layout` 后重新验证。不得通过直接恢复官方“Conversation 独占中心”来消除差异。
