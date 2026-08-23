# Agent Note: Canvas V2.2 node registry revision identity

[English](2026-08-22-canvas-v2-2-node-registry-revision.md) | 中文

Status: implemented

## Problem

N10 原有的高层 ownership 已经正确：`ctx.mediaNodes` 是版本化 Media Node Definition 的 process-local Host authority，registration 归调用 Plugin 的 Effect 生命周期所有，自定义 Node Type 保持 open-world，Browser 只接收 data-safe catalog。缺少的是 Catalog Identity。

旧 `canvasFeatures.listNodes()` 只返回 `CanvasNodeCatalogEntry[]`。Plugin unload 或 HMR replacement 后，Consumer 或测试无法机械识别某份 Browser Catalog 究竟来自 Host Registry 的哪一个 mutation state。仅比较数组内容不足以证明身份，而在 Browser 自造 generation counter 会形成第二套 authority，也会让 stale-catalog 判断变得含糊。

## Decision

`MediaNodeRegistry` 在当前 Registry instance 生命周期内拥有一个 process-local、单调递增的 mutation revision，并通过原子的 `snapshot()` 暴露 `{ revision, definitions }`。

新 Registry 从 revision `0` 开始。每次成功 `(type, version)` registration 精确推进一次 revision，每次成功的精确 unregistration 也精确推进一次。Definition validation 失败与 duplicate registration 失败都不推进 revision。HMR 风格 unload 后再注册 replacement 是两个 mutation，因此对应两个不同 revision。`MediaNodeRegistryChange` 携带 mutation 完成后的 revision，使 observer 可以把 lifecycle notification 对齐到同一条 Registry sequence。

该 revision 不是 durable state。它不会 append 到 Canvas Session History，不是 Workflow Revision，也不能跨 Host 或 Registry restart 比较。Host restart 会重建 Registry，revision sequence 可以重新开始；Consumer 必须把新 Host 生命周期中重新 fetch 到的 snapshot 当作 authority。

Browser-safe catalog 契约是 `CanvasNodeCatalogSnapshot { revision, entries }`。`CanvasFeatureService.remoteExportListNodes()` 读取一次 `ctx.mediaNodes.snapshot()`，把 Definition 投影成 client-safe entries，并原样转发 exact Registry revision。Runtime Zod Schema/Function、Provider Object、Credential 与 Executor State 始终只存在 Host。

`ui-canvas` 把 Host 返回的 revision 作为 `nodeCatalogRevision` 与本次加载的 entries 一起保存。Browser 不 increment、synthesize、persist，也不以其它方式维护独立 Registry Revision。Catalog discovery 失败时，`nodeCatalogRevision` 必须缺失；Editor 可以降级，但 Minimal 与历史 Canvas Rendering 仍保持可读。

Open-world Rule 保持不变。Built-in Node 只是首批 registration，不是永久 enum。包含当前不可用 Custom Node 的历史 Workflow 仍然可以 decode/present；当前 Validation 或 Execution 可以把 Definition 标记为 unavailable。安装匹配 Plugin 后，同一个历史 Node 可以重新 resolve，无需修改 Canvas Core switch。

N10 有意不增加 Browser polling 或 push synchronization protocol。每一次成功 catalog read 都携带精确 Host Registry identity，因此未来 refresh/subscription 可以继续使用 Host 提供的 identity 整体替换 snapshot，而不改变 authority model。

## Alternatives considered

**Browser-local generation counter。** 拒绝，因为它会创建第二套 Catalog authority；该计数可能与 Host Registry mutation 分叉，也无法证明某份 Catalog 对应哪个 Host state。

**Durable 或 cross-restart Registry generation。** 拒绝，因为 Registry membership 是可重建的 process metadata，不是 Canvas 或 Session durable state。持久化该 generation 会混淆 Deployment/Plugin lifecycle 与 Workflow History。

**封闭的 Built-in Node whitelist。** 拒绝，因为 Registry 明确采用 open-world 模型。封闭 Type Universe 会破坏历史 Custom Node 可读性与 Plugin extensibility，却不能改善 Catalog Identity。

**在 N10 内加入 live polling 或 push synchronization。** 本节点不采用，因为当前 activation model 只需要精确 snapshot identity。后续可以在不引入第二 authority 的前提下增加 live freshness。

## Testing

Focused coverage 固定当前已交付契约：duplicate registration 不改变已有 Definition 或 revision；register → unregister → HMR replacement register → unregister 产生四个可区分 revision；change notification 携带 resulting revision；Fresh Registry 注册七个 Built-in 产生七次成功 mutation；Host `listNodes()` 返回 exact current Registry revision，并在下一次调用反映后续 snapshot；Browser 保留 Host revision；Catalog failure 不暴露伪造 revision 且保留 Minimal 可读性；Custom Node 的历史/open-world 行为继续成立。

## Consequences

收益是：每份 client-safe Node Catalog 都拥有可机械验证的 identity，同时不创建 Browser authority，也不把 Registry metadata 误做成 durable state。Host、Browser 与未来 refresh 逻辑都可以明确判断当前 entries 来自哪一个 process-local Registry snapshot。

代价是：revision 只在单个 Registry lifetime 内有意义；同时，因为 N10 不提供 live subscription，Browser activation 中已经加载的 Catalog 在 Plugin 后续变化时可能变旧。需要 refresh 时，Browser 必须重新向 Host 获取 Catalog，并把 `entries` 与 Host 返回的 `revision` 一起整体替换；不得跨 Host restart 比较 revision，也不得自造本地 generation。
