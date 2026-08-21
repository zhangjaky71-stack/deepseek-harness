# @deepseek-ai/dsh-session-projection

[English](README.md) | 中文

Session Projection 的 Service Definition 与驱动注册表。它拥有 `ctx.sessionProjections`，在已提交的 Session 事件上驱动 projection 单元，并向浏览器载体提供完整最终值，例如 api-proxy 的历史基线和 `session/projection` 推送帧。领域拥有纯 projection 数学；框架拥有驱动、checkpoint cache、浏览器读取过滤、可见性排序、HMR/disposal 与变更分发。[session-projection RFC](../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md) 记录了原始设计理由。

## 服务：`SessionProjectionRegistry`（`ctx.sessionProjections`）

### 公开 API

- `register(definition): () => void` 注册一个领域 projection 单元。状态与 fold 语义保持纯同步，并由 `stateVersion` 版本化。Definition 可以声明稳定 `owner`：只有相同显式 owner 的重叠注册才采用 latest-definition-active HMR；不同 owner 不得占用同一个 key。无 owner 的旧注册保留同 `stateVersion` 的 first-live 兼容语义，active 注册卸载时提升下一个仍存活 definition。
- `registerReadGuard(key, guard): () => void` 为某个 projection key 注册浏览器出站可见性守卫。多个守卫按 AND 组合；守卫抛错按 deny 处理；注册/卸载会重新评估已知 Session 的可见性。
- `refreshBrowserVisibility(session, keys?)` 在 ACL/principal 决策变化但没有新 Session event 时，显式重新评估浏览器可见性。
- `onChanged(listener): () => void` 订阅浏览器 projection 变化。普通领域变化携带完整 typed value；仅可见性变化可以在现有 `value` 槽位携带框架 control envelope。
- `snapshot(session): ProjectionSnapshot` 返回一次同步且一致的浏览器读取切面，只包含已注册且允许读取的 key。live 守卫收到精确 Session id。
- `checkpoint(session): ProjectionCheckpoint` 返回用于持久缓存的 detached 内部 projection state。read guard 从不删除或修改 checkpoint state。
- `viewCheckpoint(checkpoint, context?)` 与 `restore(checkpoint, events, baseSeq, context?)` 服务 detached/cold 浏览器读取。可信 carrier 可以提供精确目标 Session id；没有经过验证的 identity 时，不虚构 id，守卫可以 fail closed。

### 关键类型

- `SessionProjectionMap` 是领域 provider、baseline block、client cell 与 UI hook 共享的 merge-extensible 类型表。
- `ProjectionDefinition<K, S>` 是 `{ key, owner?, schema, init(), apply(state,event), view(state), stateVersion }`。
- `ProjectionReadContext` 标记 `browser` surface，并可携带 live Session 或可信 carrier 提供的精确目标 `sessionId`。
- `ProjectionReadGuard` 只判断一个已经计算完成的值能否离开 Host；它不参与 fold 数学，也不参与 durable state。
- `SessionProjectionControlEnvelope` 只是保留的 live visibility-control shape 的 type-only 描述；`/types` outlet 继续保持 runtime-free。

## 约定

- **框架负责驱动，领域负责计算。** 注册表只订阅一次 `session/event`。每个已提交 event 都经过当前 active unit 的同步 `apply`；领域自身不拥有 drive subscription。
- **同引用即无普通领域下游工作。** 对无关 event，`apply` 返回相同 state reference；普通 value emission 由 `Object.is` 把关。
- **全量值事件规则。** 携带状态的 Session event 保存变更后的完整状态，而不是裸 delta，使 projection replay 廉价且自包含。
- **Projection state 是纯 JSON。** 持久 `(sessionId,key,ver,seq,val)` row 只是可重建加速捷径，不是 authority；`stateVersion` 用来失效不兼容 row。
- **读取授权与计算分离。** Guard 只在值已计算并通过 schema 校验后运行。被拒绝的值仍保留在内部 cell/checkpoint，但不会进入 Browser delivery。
- **Read guard fail closed。** Guard 抛错等同 deny。安全敏感的 detached/cold carrier 必须传入自己真实拥有的目标 identity；不得虚构 principal，也不得用其他 resource id 代替目标 Session。
- **可见性变化不伪造 Session event。** ACL、capability 或 HMR 可在相同 durable Session seq 下变化。Registry 使用逐 Session/key 单调 visibility generation 发布 `present -> absent -> present`，不修改 domain history。
- **Visibility generation 不是领域 revision。** 它只排序 Browser 可见性。领域 revision 仍由各领域自行拥有（Canvas 中为 workflow/run/layout revision）。
- **Baseline 始终携带普通 typed values。** Control metadata 只属于 live feed 的 framework metadata，不进入 `SessionProjectionMap`，也不写进 domain state。
- **Effect 拥有生命周期。** Unit、listener、read guard 都随注册 fiber dispose。最后一个 unit registration 消失时，会向已知 live Browser consumer 发布 explicit absence。
- **HMR replacement 受 owner 限定。** 只有同 key 且同显式 `owner` 的 definition 才允许 replacement；最新存活 definition 从 Session history 重建并成为 active。不同 owner 冲突直接拒绝。无 owner 仅作为兼容模式：第一个 live definition 保持 active；如果它先卸载，则提升下一个存活的同版本 definition，绝不能继续保留已卸载的幽灵 definition。
- **本层不拥有物理 wire 协议。** Carrier 仍负责创建具体 block/frame；Registry 拥有计算与通用 Browser visibility semantics，而不是 HTTP/WebSocket 协议。

## 浏览器可见性排序

Durable projection update 继续使用 Session `seq`。但 Browser visibility transition 可能没有新 event，因此 live feed 可以携带一个保留 control envelope，概念上等价于：

```ts
{
  __sessionProjectionControl: {
    generation: number
    present: boolean
    value?: unknown
  }
}
```

Client projection store 先比较 durable seq，再用 visibility generation 排序同 seq control transition。较新的 `present:false` 会立即删除值；之后同 seq 的 `present:true` 可以恢复当前值。旧 generation 会被忽略。重新连接/truncate 后，新的 history/list baseline 可以重新取得 authority。

空 Session cut 使用 `-1`，与 `ProjectionSnapshot.asOfSeq` 和 `session/subscribed.lastSeq` 一致。

## 安全职责

引入 projection read guard 的原因很直接：如果受保护值还能通过 Session Projection 无条件离开 Host，那么 Host read permission 就不是完整权限边界。Canvas 使用该 seam，把 `canvas.read` 一致作用于 `canvas` 与 `canvasLayout`，同时保持它们的 fold 完全 identity-free。

同一策略必须覆盖全部 carrier 路径。当前 Host 组合中：

- live snapshot/change delivery 使用 live `Session.id`；
- history tail 在 core handler 返回后再次做最终 carrier 校验：若存在且尾部切面一致的 live Session，则使用 `Session.id`；否则使用请求目标 SessionId 对持久化日志做 exact-identity restore；
- detached subagent history 对 child SessionId 使用同样的最终 source 规则；
- cold list checkpoint view 使用 `SessionHeader.id`；
- cold restore 使用请求中的 persisted SessionId。

History tail 的最终 source log-end 必须与 core 已返回 page-end 相同。attach/detach 或持久化漂移造成切面不一致时，transcript 仍可服务，但会整块省略 projections；绝不能退回使用缺少精确 identity 评估的 baseline。

Guard 是可见性过滤，不是 durable 删除。Checkpoint 和 cell 保留完整派生状态，因此策略变化不会改写 Session history，也不会破坏 replayability。Projection cache 的输出在 Browser read boundary 会再次过滤；持久 cache row 绝不能成为 ACL 绕过路径。

## 模型体验

无。Projection 只从已经写入日志的 Session state 派生客户端 read model，不影响 prompt、模型消息、tool schema、provider request 或 KV cache。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- Browser read context 携带目标 Session id，但还没有 authenticated multi-user/tenant principal。未来 Host identity layer 必须提供该 principal，不能在 projection fold 内推导。
- 无法证明目标 Session identity 的 detached caller 必须省略它；identity-dependent guard 会相应 fail closed。
- 每个 Browser baseline 在过滤前仍会考虑所有已注册 key；当前没有 client-requested lazy key set。
- Unit table 是进程级，因此未加 guard 的 key presence 不是逐 Session feature signal；consumer 应解释 value/capability，而不是只根据 registration 推断 ownership。
- Eager drive 每个 event 都会触达每个 active unit；当前依靠廉价 same-reference transition 控制成本，未来可增加 event-type prefilter 而不改变领域 contract。
- Registry cell 只活在内存中；`dsh-session-projection-cache` 是可选持久加速层。
- 同步 unit 纪律仍部分依赖 review：schema validation 能抓 async `view`，但 `apply` 内阻塞或读取撕裂的非 Session state 仍属于实现错误。
- 源码变化后，repository-pinned generated documentation 与 i18n metadata 必须在 release acceptance 前重新生成/验证。
