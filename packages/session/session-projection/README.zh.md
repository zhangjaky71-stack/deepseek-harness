# @deepseek-ai/dsh-session-projection

[English](README.md) | 中文

Session Projection 的 Service Definition 与驱动注册表。它拥有 `ctx.sessionProjections`，在已提交的 Session 事件上驱动已注册的投影单元，并向浏览器载体提供完整最终值，例如 api-proxy 的历史基线和 `session/projection` 推送帧。领域只拥有纯投影数学；框架拥有驱动、缓存、浏览器读取过滤和变更分发。[session-projection RFC](../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md) 记录了原始设计理由。

## 服务：`SessionProjectionRegistry`（`ctx.sessionProjections`）

### 公开 API

- `register(definition): () => void` 注册一个领域投影单元。状态与 fold 语义保持纯同步，并由 `stateVersion` 版本化。
- `registerReadGuard(key, guard): () => void` 为某个 projection key 注册浏览器出站可见性守卫。多个守卫按 AND 组合；守卫抛错按 deny 处理；注册绑定调用方 fiber，确保 disposal/HMR 安全。
- `onChanged(listener): () => void` 订阅面向浏览器的 projection 变更。被读取守卫拒绝的值不会发出。
- `snapshot(session): ProjectionSnapshot` 返回一次同步且一致的浏览器读取切面，只包含允许读取的 key。live 守卫会收到精确 Session id。
- `checkpoint(session): ProjectionCheckpoint` 返回用于持久缓存的 detached 内部 projection state。读取守卫不会删除或修改 checkpoint 状态。
- `viewCheckpoint(checkpoint)` 与 `restore(checkpoint, events, baseSeq)` 服务 detached 浏览器读取。detached 守卫不会获得虚构的 Session identity，因此可以 fail closed。

### 关键类型

- `SessionProjectionMap` 是领域 provider、协议块、client cell 与 UI hook 共享的 merge-extensible 类型表。
- `ProjectionDefinition<K, S>` 是 `{ key, schema, init(), apply(state,event), view(state), stateVersion }`。
- `ProjectionReadContext` 当前标记 `browser` surface，并可带精确 live `sessionId`。
- `ProjectionReadGuard` 只判断一个已经计算完成的值能否通过浏览器 projection surface 离开 Host。它不参与 fold 数学，也不参与 durable state。

## 约定

- **框架负责驱动，领域负责计算。** 注册表只订阅一次 `session/event`。每个已提交事件都会通过所有已注册单元的同步 `apply`；领域自身不拥有驱动订阅。
- **同引用即无下游工作。** 对无关事件，`apply` 返回同一个状态引用；变更流由 `Object.is` 把关。
- **全量值事件规则。** 携带状态的 Session event 保存变更后的完整状态，而不是裸 delta，因此 projection transition 足够廉价、replay 也自包含。
- **Projection state 是纯 JSON。** 持久缓存 `(sessionId,key,ver,seq,val)` 只是加速捷径，不是 authority；`stateVersion` 用于失效不兼容缓存。
- **读取授权与计算分离。** Read guard 只在值完成计算并通过 schema 校验之后运行。被拒绝的值仍保留在内部 cell/checkpoint 中，但不会出现在浏览器 snapshot/change frame 中。
- **Read guard fail closed。** 守卫抛错等同 deny。依赖 identity 的守卫还必须处理 detached 读取没有 `sessionId` 的情况；安全敏感领域通常应拒绝。
- **不虚构 principal。** 本注册表不负责认证 user、tenant 或 transport。领域/载体可以把精确 live Session id 作为 Host authorization seam 的输入；未来 identity 层可以扩展 carrier contract，而不污染 projection fold。
- **Effect 拥有生命周期。** Projection unit、listener 和 read guard 都随注册 fiber dispose，HMR/卸载不能留下陈旧 projection 或安全策略。
- **本层没有 wire vocabulary。** Block/frame 由载体定义；注册表仍然只是计算和读取控制 seam。

## 安全职责

引入 projection read guard 的原因很简单：如果某个值还能通过 Session Projection 无条件离开 Host，那么 Host Service 上的 read permission 就不是完整的权限边界。Canvas 使用该 seam，把 `canvas.read` 同时作用于 `canvas` 和 `canvasLayout` 两个浏览器 projection key，同时仍保持两个 fold 完全不含 identity。

读取守卫只是可见性过滤，不是 durable 删除。Checkpoint 和 projection cell 始终保留完整派生状态，因此策略变化不会改写 Session 历史，也不会破坏 replayability。

## 模型体验

无。Projection 只从已经写入日志的 Session state 派生客户端读模型，不影响 prompt、模型消息、tool schema、provider request 或 KV cache。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 浏览器读取上下文当前只携带精确 live Session id，不携带已认证 user/tenant principal。多用户 identity/tenancy 必须由 Host carrier/authorization 层提供，不能在本注册表中猜测。
- Detached checkpoint/history 读取没有 live Session identity。依赖 identity 的守卫因此默认 fail closed，除非领域明确提供安全的 identity-free policy；未来 carrier 可以提供经过验证的 detached-session principal，而无需修改 projection 数学。
- 每个浏览器 baseline 在过滤前仍会考虑所有已注册 key；当前没有客户端请求的 lazy-key 集合。
- 单元表是进程级的，因此未加守卫的 key 是否注册不能当作逐 Session 的能力信号；消费方应解释 value，而不是仅根据 key presence 推断 feature ownership。
- Eager drive 每个事件都会触达每个单元；当前依靠廉价的 same-reference transition 控制成本，未来可加 event-type prefilter 而不改变领域 contract。
- Registry cell 只活在内存中；`dsh-session-projection-cache` 仍然是可选持久加速层。
- 同步纪律仍有一部分依赖 review：schema validation 能抓住 async `view`，但 `apply` 内的阻塞或读取撕裂的非 Session state 仍属于实现错误。
