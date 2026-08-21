# Agent Note：Canvas Host 安全边界与 Session Projection Read Guard

Status: proposed

[English](2026-08-21-canvas-host-security-and-projection-read-guards.md) | 中文

## 问题

Canvas 虽然只有 Session 一套 durable authority，但 Host 上存在不止一种读写入口。Browser Remote、Agent Tool、system reconciler、Run History、Asset Route 与 Session Projection 不能各自发明一套 Authorization 或 Actor Attribution 规则。

其中两个缺口尤其危险。第一，即使 `Session.append('canvas/change', ...)` 的数据结构完全合法，只要 current writer 没有被机械收口，就仍可能绕过 CanvasService 的权限检查。第二，如果 Browser 当前 Canvas 是通过 Session Projection 获取，那么只保护 `ctx.canvas.get()` 的 `canvas.read` 并不完整。

Provider 执行还带来第三个边界：SDK/HTTP raw error 可能包含 Authorization header、API key、signed URL 或 request payload，这类诊断不能直接复制进 durable `CanvasRunError`。

## 决策

Canvas Security 属于 Host，并拆成四个彼此独立的层：

```text
trusted provenance
  → resource-aware authorization
  → durable-data safety / domain preflight
  → package-owned current-write authority
  → Session precommit + commit
```

### Provenance 不是 caller 自报身份

`CanvasAccessContext` 是规范化的 audit attribution。Host 会把每种 source 绑定到预期 actor shape，并在需要时绑定 exact target Agent/Session。Browser payload 不能自称 `system`；Agent Tool 不能声明另一个 Agent identity；Reconciler 使用显式 system actor。

当前 human identity 只是单用户 Session/Agent surrogate，不是最终多用户 Identity Model。未来 Identity Layer 只替换同一 Host seam 后面的 principal source。

### Authorization 有资源 scope，也可 fail closed

`CanvasAuthorizationRequest` 包含 permission、Session id、actor/source attribution，以及 typed resource identity。内建 actor-kind policy 继续作为当前单用户 fallback。要求外部策略的部署设置 `authorizationMode=required-external`；Policy Service 缺失或抛错都 fail closed，并且不向调用方暴露 backend diagnostic。

### Current writer 必须持有 package permit

CanvasService 先完成 Authorization、Provenance Binding、Validation、Durable-data Safety 与 detached-fold preflight，然后才进入 one-shot process-local write permit。Canvas Session invariant 在 `internal/dispatch` 阶段消费与 Event 完全匹配的 permit，再允许 log publication。没有 permit 的 direct current `canvas/change` / `canvas/layout-change` append 会被拒绝。

这个 permit 用于防止 trusted Host code 的误绕过和架构漂移，不是针对同进程恶意代码的 sandbox。Historical Event replay 不需要 current-writer permit。

### Projection Fold 保持纯数学，Delivery 才授权

Session Projection 的状态计算继续完全不含 identity。`ProjectionDefinition.init/apply/view` 不接收 user、transport 或 ACL。

`SessionProjectionRegistry.registerReadGuard(key, guard)` 在 schema validation 后增加 browser-facing delivery gate。只要任一 guard deny 或抛错，对应 Snapshot value 与 change-feed frame 就不会出站；Internal cell/checkpoint 仍保留完整派生状态。

Live guard 会获得 exact Session id。Detached cache/history view 不虚构 identity；依赖 Identity 的 Domain 可以 fail closed。Canvas 对 `canvas` 与 `canvasLayout` 都注册 `canvas.read` guard，因此 Browser Projection 不再能绕过 Host Read Permission。

Registry 本身不定义通用 ACL。只有拥有真实 Host read policy 的 Domain 才注册 guard。

### Durable Diagnostic 只能是安全摘要

Workflow Config 拒绝结构化 credential/header/binary carrier，以及一部分明确 credential value signature。Current durable Canvas audit 还覆盖 Run error code/message 与安全 Asset Display Metadata。

Provider raw error 必须走：

```text
raw provider/HTTP error
  → Host classification + redaction
  → stable safe code + bounded safe summary
  → durable CanvasRunError
```

更多诊断属于 N23 的 redacted log/trace，而不是 Session JSON。

该边界保护的是 Harness/Provider/Host 自身的结构化 Secret。它不承诺检测用户主动粘贴到自然语言内容里的每一种 secret-looking string。

## 结果

- Browser UI Visibility 永远不是 Authorization Mechanism。
- Agent Tool、Remote、History、Asset、Run 与 Reconciler 复用一套 Host Permission/Provenance Vocabulary。
- Session Projection 仍是通用计算 seam，同时支持 Domain-owned Read Visibility Decision。
- Authorization deny 不删除 Projection State，也不改写 Session History。
- External Policy Failure 可以配置 fail closed，而无需改变 Canvas Domain。
- N16 在持久化 Run Failure 前必须先脱敏 Provider Error。
- N17/N21 Asset Route 必须通过同一 seam 对 typed Asset Resource 授权。
- Multi-user Identity/Tenancy 仍可延期，但未来不需要再重做一套 Canvas Authorization 架构。

## 被否决的替代方案

**只在 Browser Remote Wrapper 做 Authorization** —— Agent Tool、Asset、System 与 Direct Host path 都会绕过，因此否决。

**把 Authorization 放进 Projection `apply/view`** —— Projection Math 会变成 Caller-dependent，Replay/Checkpoint 不再保持纯数学，因此否决。

**认为拥有 Session Projection 就天然等价于 `canvas.read`** —— Canvas 已经有明确的 Host Read Permission；再保留一条无保护的 current-state path 会让这个 permission 失去真实含义，因此否决。

**持久化 Raw Provider Exception，最后只在 UI 脱敏** —— Secret 在 UI 之前就已经进入 Session History，因此否决。

**使用全局 `key.includes("token")` Scanner** —— 会误杀 `maxTokens` 等合法语义参数，同时仍漏掉其它 credential carrier，因此否决。
