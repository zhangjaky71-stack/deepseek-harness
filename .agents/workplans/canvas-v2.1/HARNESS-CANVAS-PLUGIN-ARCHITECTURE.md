# Harness ↔ Canvas Dynamic Plugin Architecture

## 1. 架构目标

在 Harness rc.8 的 dynamic client graph 上，把 Canvas 建成独立、可装载、可卸载、可 HMR、可关闭的产品能力，而不是把 Canvas 写死在 Web shell。

## 2. Ownership 图

```text
Host
├─ Session / CanvasService          durable authority
├─ Canvas Remote                    Browser mutations/queries
├─ MediaNodeRegistry                semantic node catalog
├─ Workflow Engine                  N12+
├─ Jobs / Providers                 N14+
└─ Attachment Store                binary authority

Browser
├─ Web Boot Kernel                  framework-free startup only
├─ render-service                   React root owner
├─ ui-layout                        shell/layout owner
├─ ui-conversation                  chat/composer owner
├─ ui-attachment                    attachment presentation owner
└─ ui-canvas                        Canvas product owner
    ├─ CanvasView
    ├─ MinimalCanvas
    ├─ WorkflowEditor
    ├─ session-scoped presentation store
    ├─ interaction context builder
    └─ Node catalog client projection
```

## 3. Slot / Service 规则

Canvas V2 默认继续使用 Harness 已存在的 UI composition seam：

```text
conversation.view
```

但这个 slot 只决定“在哪里显示 Canvas”，不决定谁持有 React root。rc.8 中 React root 由 `render-service` 持有。

`ui-layout` 只应该知道可渲染区域/column/overlay，不应该知道：

- Workflow schema
- Node executor
- Provider
- Canvas revision
- Run lifecycle
- Asset provenance

## 4. Minimal / Editor Ownership

```text
CanvasViewState
├─ mode: minimal | editor
├─ selection
├─ inspector draft
├─ local graph layout interaction
└─ transient save/progress presentation
```

以上全部属于 Canvas client plugin 的 presentation state。`mode` 不进入 Workflow semantic state；durable layout 走独立 layout projection/API。

## 5. Dynamic Plugin Lifecycle

`ui-canvas` 必须满足：

1. activation 时注册 slot/service/listener。
2. dispose 时撤销全部注册、subscription、timer、event listener。
3. HMR replacement 不产生重复 slot occupant 或双 listener。
4. session 切换时 presentation state 正确隔离。
5. Canvas plugin 失败不能破坏 Harness boot failure page / conversation 基础能力。

## 6. Node Catalog

Browser 不打包一份 Host node registry 副本。

```text
Host MediaNodeRegistry
       │
       ▼
client-safe catalog Remote/Projection
       │
       ▼
NodeLibrary / Inspector / Agent-facing summary
```

自定义 plugin node 在 Provider 缺失时仍能被存储和渲染；执行能力由当前 Host registry/admission 决定。

## 7. 三栏布局

现有产品要求继续保留：

```text
Workspace / Navigation | Canvas | Conversation
```

Tool details 可以 overlay Conversation，而不是形成永久第四栏。布局实现可以位于 `ui-layout`，但 Canvas 内容必须通过正式 slot/plugin 注入。

## 8. 与独立 Infinite Canvas 服务的关系

`apps/infinite-canvas` 当前仍是独立 FastAPI/静态应用进程。它可以作为过渡或外部 Canvas renderer，但最终 Harness integration contract 应由 `ui-canvas`/Canvas Remote/Session 定义，而不是由 iframe URL 定义。

因此：

- iframe 可以暂时存在；
- iframe 不是 Canvas Domain API；
- Agent/Session 不得通过 DOM/iframe hack 控制业务状态；
- 后续替换 renderer 时不应影响 Workflow/Session/Agent contract。
