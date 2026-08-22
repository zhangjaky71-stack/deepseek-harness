# Canvas V2.2 Node Registry Revision Identity

## 问题

N10 原有的大方向已经正确：`ctx.mediaNodes` 是版本化 Media Node Definition 的 process-local Host authority，Registration 归调用 Plugin 的 Effect 生命周期所有，自定义 Node Type 保持 open-world，Browser 只接收 data-safe catalog。缺少的是 Catalog Identity。

旧 `canvasFeatures.listNodes()` 只返回 `CanvasNodeCatalogEntry[]`。Plugin unload/HMR replacement 后，Consumer 或测试无法机械证明某份 Browser Catalog 究竟来自 Host Registry 的哪一个 mutation state。Browser 只能比较数组内容或自造 generation counter；后者会形成第二套 authority，也让 stale-catalog 判断变得含糊。

## 长期维护契约

`MediaNodeRegistry` 在当前 Registry instance 生命周期内拥有一个 **process-local**、单调递增的 mutation revision。

- 新 Registry 从 revision `0` 开始。
- 每次成功 `(type, version)` registration 精确推进一次 revision。
- 每次成功的精确 unregistration 精确推进一次 revision。
- Definition validation 失败与 duplicate registration 失败都不推进 revision。
- HMR 风格 unload 后再注册 replacement 是两个 mutation，因此对应两个不同 revision。
- `snapshot()` 同步返回 `{ revision, definitions }`，保证 revision 与稳定排序后的 Definition Set 描述同一个 Registry state。
- `MediaNodeRegistryChange` 携带 mutation 完成后的 revision，供 observer 对齐同一条 Registry sequence。

该 revision **不是 durable state**。它不会 append 到 Canvas Session History，不是 Workflow Revision，也不能跨 Host/Registry restart 比较。Host restart 会重建 Registry，revision sequence 可以重新开始；Consumer 必须把新 Host 生命周期中重新 fetch 到的 snapshot 当作 authority。

## Host / Browser 边界

Browser-safe catalog 形状是 `CanvasNodeCatalogSnapshot { revision, entries }`。

`CanvasFeatureService.remoteExportListNodes()` 只调用一次 `ctx.mediaNodes.snapshot()`，把 Definition 投影成 client-safe entries，同时原样转发该 Registry 的 exact revision。Runtime Zod Schema/Function、Provider Object、Credential 与 Executor State 始终只存在 Host。

`ui-canvas` 把 Host 返回的 revision 作为 `nodeCatalogRevision` 与本次加载的 entries 一起保存。Browser 不得 increment、synthesize、persist 或以其它方式维护独立 Registry Revision。Catalog discovery 失败时，`nodeCatalogRevision` 必须缺失；Editor 可以降级，但 Minimal 与历史 Canvas Rendering 仍保持可读。

N10 有意不增加 Browser polling 或 push synchronization protocol。本节点真正需要保证的是：每一次成功 catalog read 都有精确的 Host Registry identity。未来若增加 refresh/subscription，可以继续使用 Host 提供的 identity 比较/替换 snapshot，而不改变 authority model。

## Open-world Rule 不变

不能为了实现 revision contract 而把 Node Type 世界重新封闭起来。

Built-in Node 只是首批 registration，不是永久 enum。包含当前不可用 Custom Node 的历史 Workflow 仍然可以 decode/present；当前 Validation/Execution 可以把 Definition 标记为 unavailable。安装匹配 Plugin 后，同一个历史 Node 可以 resolve，无需修改 Canvas Core switch。

不要为了让 Catalog Synchronization 更简单而增加 Browser Node Registry、Built-in Admission Whitelist，或通过 Durable Migration 删除未知 Plugin Node。

## 必须持续固定的 Validation

Focused Test 应继续证明：

1. duplicate registration 失败，不改变现有 Definition，也不推进 revision；
2. register → unregister → HMR replacement register → unregister 产生四个可区分 revision；
3. change notification 携带精确 resulting revision；
4. Fresh Registry 注册七个 Built-in 会产生七次成功 mutation；
5. Host `listNodes()` 返回 exact Registry revision，并在下一次调用时反映后续 snapshot；
6. Browser 与加载的 Catalog 一起保留 Host revision；
7. Browser Catalog failure 不暴露伪造 revision，也不抹掉 Minimal Read Surface；
8. Custom Node 的历史/open-world 行为继续成立。

## 剩余边界

某次 Browser activation 中加载的 Catalog 在之后 Plugin 发生变化时可能变旧，因为 N10 不提供 live catalog subscription。这是后续节点的 Presentation Freshness 问题，不是创建第二套 authority 的理由。需要 refresh 时，应重新向 Host 获取 Catalog，并把 `entries` 与 Host 返回的 `revision` 作为一个整体一起替换。
