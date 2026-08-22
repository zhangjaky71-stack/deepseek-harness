# Agent Note：Canvas V2.2 精确 Turn Interaction Context

Status: implemented

[English](2026-08-22-canvas-v2-2-interaction-context.md) | 中文

## 问题

Canvas 需要让用户通过普通 Conversation Composer 说“修改这个”“用这张图片”“改这里”，同时准确保留发送当下所指的 Canvas Selection。Selection 本身是 transient UI state，但模型看到的解释必须绑定到精确的已接收 user turn，在排队后仍然安全，并且通过正常 Agent message channel 被记录。

现有 N08 路径已经解决了大部分 correlation 与 lifecycle，但有两个 Browser 输入边界过于信任调用方。`canvasInteraction` Remote 接收 TypeScript-shaped request，`CanvasInteractionService` 还会在 runtime decode 前直接读取 `request.context.region`。在 weak SRC/reflection 或直接 Remote 调用场景中，畸形 payload 因此可能先抛出原始 JavaScript 错误，绕开预期的 Canvas error boundary。除此之外，Browser Interaction Context 中会被复制到 model-visible plugin message 的 identifier 原先只要求非空字符串，因此换行、控制式文本或超长 identifier 可能改变上下文结构或无界膨胀 Token。

## 决策

保持三层严格分离：

1. **Browser-local selection** — 按 Session 隔离，只属于 presentation，永远不是 Canvas durable state。
2. **Host request correlation** — 一次性 process-local staging，以精确 Agent + 普通 Prompt RPC id 为 key，随后绑定到 Host 真正接收的精确 user-message id。
3. **Model-visible context** — 只有精确消息最终进入 `agent/pre-step` 时才生成，紧邻该 user message 插入，并由正常 logged Agent path 记录。

`CanvasInteractionBridge.stage()` 与 `discard()` 现在把 payload 当作不可信 runtime value。它们要求 object envelope、拒绝额外顶层字段、校验有界 transport RPC id，并在任何 Host Canvas read 或 correlation-state mutation 之前 strict decode nested interaction context。Region feature policy 也改为针对已 decode 的 context 执行，不再提前读取 Browser 提供的嵌套属性。

所有可能进入 model-visible interaction message 的 identifier 使用比通用 durable Canvas id 更严格的 N08 admission budget：最长 256 字符，并限制为单行 opaque identifier 字符集。它覆盖 Interaction Request 中的 Canvas/workflow/node/edge/run/image-attachment/video-asset identifier。这里不是重定义历史 Canvas schema，而是为 Browser→model context channel 建立更小、更明确的安全边界。

仅 workflow revision 漂移仍然有意允许。Host 会把它标为 `STALE`，并在 model-facing 文本中明确要求执行 `canvas_read` 后才能对 selected workflow target 动作。Canvas/workflow identity 替换不会被 Browser builder 自动重绑。被选择的 durable asset 必须已经存在于该精确 Session 的 Canvas output history。

## 考虑过的替代方案

**把 Selection 持久化成 Canvas Session Event** — 否决。Selection/focus 是 presentation context，不是 Workflow/Domain state；把每次点击写入 replay 会污染 Revision 与 Session 语义。

**新增第二条 Canvas 专属 Chat RPC** — 否决。它会分叉普通 Prompt admission、logging、cancellation 与 Composer 行为。

**在 runtime 信任 generated TypeScript/SRC shape** — 否决。Weak reflection 与直接 Remote caller 仍然要求 Host 在属性访问和业务逻辑之前完成 runtime validation。

**允许任意字符串，只在 render 时 escape** — 不作为唯一防线。Escape 可以改善格式，但不能提供 Token/size budget，也无法阻止 Browser-provided control-like identifier 成为模型上下文数据。

## 结果

Interaction channel 现在明确区分 authority 与 lifetime。Selection 不会通过“最近一次 selection”这种隐式全局状态泄漏：它必须匹配精确 Prompt correlation identity。Prompt admission failure、下游 reject/filter、Agent dispose、Plugin dispose 或 TTL expiry 都会清理 staged/bound state。排队期间 Canvas 发生变化时，会在真正 claim 前重新判断 staleness。

更严格的 identifier 规则可能使某些非常规 durable Canvas id 无法用于 Interaction Context，即使通用 Canvas schema 仍接受更宽泛的非空 id。这是有意的：model-facing transport 需要更小的安全预算。未来如果仓库统一了全局 opaque-id grammar，N08 应复用该 validator，而不是长期维持平行规则。

## 验证

Focused bridge test 覆盖 exact RPC binding、wrong-RPC 不消费、discard、下游 reject、执行前 revision drift、Canvas unavailable、malformed stage/discard envelope，以及 policy-before-Host-read 顺序。Interaction decoder test 覆盖 strict shape、selection 数量上限、normalized region、duplicate id、current revision membership、stale signaling、identity replacement、focused-output validity，以及 control-text/超长 model-visible identifier 拒绝。

N08 从 REVIEW 进入 ACCEPTED 前，仍必须通过仓库级 typecheck、lint、build、hygiene、documentation/translation gates、generated Typert consistency 与 REAL composition。