# Agent Note：Canvas Host 安全边界与 Session Projection Read Guard

Status: proposed

[English](2026-08-21-canvas-host-security-and-projection-read-guards.md) | 中文

## 问题

Canvas 虽然只有 Session 一套 durable authority，但 Host 上存在多个读写入口。Browser Remote、Agent Tool、system reconciler、Run History、Asset Route 与 Session Projection 不能分别发明自己的 Authorization 或 Actor Attribution 规则。

这里有三个安全缺口。第一，结构完全合法的 direct `Session.append('canvas/change', ...)` 如果 current writer 没有被机械收口，仍能绕过 CanvasService。第二，只保护 `ctx.canvas.get()` 不够，因为 Browser 会通过 Session Projection 接收同一份当前状态。第三，Provider SDK/HTTP raw error 可能携带 credential 或 raw request data，不能直接写进 durable Run state。

## 决策

Canvas Security 归 Host，并按以下层次执行：

```text
trusted Host provenance
  → resource-aware authorization
  → durable-data safety / domain preflight
  → package-owned current-write authority
  → Session precommit + commit
```

### Principal 与 Resource 必须分离

`CanvasAccessContext` 是规范 audit attribution，不是 caller 自报身份。Browser 与 Asset 路径使用 Host 铸造的单用户 principal：`human:host-browser`。Target Session 则单独进入 `CanvasAuthorizationRequest.sessionId` 与 typed resource scope；SessionId 永远不会被拿来充当 human identity。

Agent Tool attribution 继续绑定 exact target Agent id；Reconciler 使用显式 system actor；Direct Host call 使用 exact Agent 或 system actor。因此 Browser payload 与 Tool argument 都无法自报更强的 actor/source 组合。

这个 Browser principal 明确只是过渡方案。未来 authenticated human/tenant identity layer 只替换同一个 Host seam 后面的 principal source，不需要改变 Canvas permission 或 resource identity。

### Authorization 有资源 scope，也可以 fail closed

`CanvasAuthorizationRequest` 包含 permission、Session target、actor/source attribution 和 typed resource identity。内建 actor-kind policy 继续作为单用户 fallback。需要外部策略的部署设置 `authorizationMode=required-external`；Policy Service 缺失或抛错都 fail closed，并且不会向调用方暴露 backend diagnostic。

### Current writer 必须持有 package permit

CanvasService 在进入 one-shot process-local write permit 之前完成 Authorization、Provenance Binding、Validation、Durable-data Safety 和 detached-fold preflight。Canvas invariant companion 挂载时，会在 Session `internal/dispatch` 阶段消费与 Event 完全匹配的 permit，然后才允许 log publication。没有 permit 的 direct current `canvas/change` / `canvas/layout-change` append 会被拒绝。

Permit 用来阻止 trusted Host code 的误绕过和架构漂移，不是针对同进程恶意代码的 sandbox。Historical Event replay 不要求 current-writer permit。轻量组合若没有挂 invariant companion，仍然依赖 CanvasService 本身的正确性；因此生产环境要机械阻止 direct append，必须把 invariant 组合进去。

### Projection Fold 保持纯数学，Browser Delivery 才授权

Session Projection 状态计算继续完全不含 identity。`ProjectionDefinition.init/apply/view` 不接收 user、transport 或 ACL。

`SessionProjectionRegistry.registerReadGuard(key, guard)` 在 schema validation 后增加 Browser-facing delivery gate。只要任一 guard deny 或抛错，对应 Snapshot value 与 change-feed frame 就不出站；Internal cell/checkpoint 仍保留完整派生状态。

Live guard 获得 exact target Session id。Canvas 把这个 target 与 Remote、Interaction 使用的同一个 Host-minted Browser principal 组合，再对 `canvas` 与 `canvasLayout` 执行 `canvas.read`。Detached cache/history view 当前不会虚构 Session target，因此依赖 identity 的 external policy 会 fail closed。Projection cache 的耐久性不受影响，因为 cache persistence 使用的是不经过 read filter 的内部 `checkpoint()` surface。

Registry 本身不定义通用 ACL。只有真正拥有 Host read policy 的 Domain 才注册 read guard。

### Durable Diagnostic 只能是安全摘要

Workflow Config 拒绝结构化 credential/header/binary carrier 与一部分明确 credential signature。Current durable Canvas safety 还覆盖 Run error code/message、image/video durable object id 和安全 image display metadata。

Provider raw error 必须走：

```text
raw provider/HTTP error
  → Host classification + redaction
  → stable safe code + bounded safe summary
  → durable CanvasRunError
```

更多诊断属于 N23 的 redacted log/trace，而不是 Session JSON。该边界保护 Harness/Provider/Host 自身的结构化 Secret；它不承诺检测用户主动粘贴到语义内容里的每一种 secret-looking string。

## 结果

- Browser UI Visibility 永远不是 Authorization Mechanism。
- Browser Remote、Projection、Interaction 共用一个 Host-minted principal，并把 Session 保持为独立 target resource。
- Agent Tool、History、Asset、Run 与 Reconciler 复用同一套 Host Permission/Resource Vocabulary。
- Session Projection 仍是通用计算 seam，同时支持 Domain-owned Read Visibility Decision。
- Authorization deny 不删除 Projection State，也不改写 Session History。
- External Policy Failure 可以配置 fail closed，而无需改变 Canvas Domain。
- N16 在持久化 Run Failure 前必须先脱敏 Provider Error。
- N17/N21 Asset Route 必须通过同一 seam 对 typed Asset Resource 授权。
- Multi-user Identity/Tenancy 可以延期，而不需要未来再造第二套 Canvas Authorization 架构。

## 被否决的替代方案

**把 SessionId 当作 Browser human id** —— Resource identity 不是 user identity，而且会让安全语义依赖 Agent/Session id 偶然相等，因此否决。

**只在 Browser Remote Wrapper 做 Authorization** —— Agent Tool、Asset、System 与 Direct Host path 都会绕过，因此否决。

**把 Authorization 放进 Projection `apply/view`** —— Projection Math 会变成 Caller-dependent，Replay/Checkpoint 不再保持纯数学，因此否决。

**认为拥有 Session Projection 就天然等价于 `canvas.read`** —— Canvas 已经有明确 Host Read Permission；保留无保护 current-state path 会让 permission 失去真实含义，因此否决。

**持久化 Raw Provider Exception，最后只在 UI 脱敏** —— Secret 在 UI 之前就已经进入 Session History，因此否决。

**使用全局 `key.includes("token")` Scanner** —— 会误杀 `maxTokens` 等合法语义参数，同时仍漏掉其它 credential carrier，因此否决。
