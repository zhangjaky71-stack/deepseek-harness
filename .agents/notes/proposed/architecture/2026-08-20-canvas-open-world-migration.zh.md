# Agent Note: Canvas open-world node migration

Status: proposed

[English](2026-08-20-canvas-open-world-migration.md) | 中文

## Problem

Canvas durable workflow 的生命周期可能长于创建它的 plugin composition。包含第三方 Node 的 Workflow 在该 Plugin 被关闭、卸载或暂时不可用后仍必须保持可读。如果把“当前已安装 Node Catalog”当成 durable schema，Session Replay 就会依赖运行时 Plugin 是否存在，并可能把过去合法的 Workflow 变成无法读取的历史数据。

现有 Canvas Migration 还使用一张 Core-owned version table，仿佛它描述了所有合法 Node Type。这个假设与 Editor 和 Workflow Engine 所采用的 open-world Node Registry 冲突。

## Proposal

Canvas Migration 将区分 Canvas-owned compatibility 与 plugin-owned compatibility。

Canvas Core 负责 Workflow/Snapshot/Layout schema migration、显式 Core Node version，以及已经冻结的 Core legacy alias。导出的 Core Node version table 只闭合于 Canvas 自己拥有的 Node Kind。

未知 Node Type 作为语义数据原样保留。Migration 在不查询当前 Registry 的情况下保留 Node Type、可选的正整数 Node Version、JSON-safe config 和图关系。因此 Definition 缺失只会阻止当前执行，不会阻止 Session Replay、Projection、Inspector 或 Editor unavailable placeholder 渲染。

N10 `MediaNodeRegistry` 负责当前 `type@version` Definition、config schema、port 和 lifecycle metadata。N12 负责 Graph Validation 与 Executor Availability。Canvas Core 不猜测 Plugin 的 current version 或 migration path。

Current-version durable object 必须拒绝 unsupported field。Writer 新增 durable field 时必须同步提升所属 schema/version 或提供显式 migration；旧 Reader 不得静默丢弃该字段。

Layout 与 Workflow、Canvas Snapshot 统一命名语义：`migrateStoredCanvasLayoutSnapshot()` 负责 structural migration，`decodeCanvasLayoutSnapshot()` 再执行当前 Layout invariant。

`CanvasRunHistoryEntry` 继续作为由 Session 派生的 bounded query/compatibility DTO。未来任何使用该 DTO 的物理 Cache 都必须可以从 Session History 重建，不能成为第二套 durable Canvas authority。

本文档只细化 [Session-native generative media Canvas](../feature/2026-08-19-session-media-canvas.zh.md) 中的 Migration 决策。后者仍保持有效；本文档不替代其中关于 Session Authority、Revision、Authorization、Projection 或 UI 的设计。

## Alternatives considered

**Migration 时拒绝当前 Registry 中不存在的 Node。** 这会让 Durable Replay 依赖部署时的 Plugin Composition，并导致卸载 Plugin 后无法打开历史 Workflow，因此拒绝。

**由 Canvas Core 维护所有 Plugin Node Version。** 这会把第三方兼容性集中到错误的 Package，并要求每个扩展都修改 Core，因此拒绝。

**把所有未知 Node Version 当成 Future Version。** Canvas Core 无法知道 Plugin-defined Version 是 current、historical 还是 future，只有 owning Plugin Registry 能判断，因此 Core 只保留该值。

**静默忽略 Current Schema 的未知字段。** 这会掩盖 Writer 在没有改变 Version 的情况下改变 durable data，并可能在 Replay 时丢失信息，因此 Current-schema decoder 必须拒绝 unsupported field。

## Acceptance criteria

- 包含未安装 Plugin Node 的 Stored Workflow 可以在不加载该 Plugin 的情况下完成 Migration，并通过 Canvas structural/domain validation。
- Plugin Node Type、Node Version、Config、Edge 和 Output Reference 在 Reload 后保持不变。
- Canvas-owned Node 对 unsupported future Core Node Version 继续 fail loud。
- Core Version Map 不把 open-world node type 当作“每个字符串都有 Core-owned version”。
- N02 所拥有的 Current Workflow、Node、Snapshot、Layout、Run、Output 与 Media Reference Decoder 对 unsupported durable field fail loud。
- Layout 暴露独立的 structural migration 与 current invariant decode path。
- Run History 保持可从 Session 重建的派生 DTO，而不是 Durable Authority。

## Risks

保留未知 Plugin Node 意味着 Workflow 可以可读但暂时不可执行。Editor 与 Execution Validator 必须显式展示这个状态，不能暗示执行会成功。

Strict Current-schema Field Checking 会让遗漏 Version Bump 的变更立即失败。这是刻意设计，但未来新增 Durable Field 时必须在同一变更中更新所属 Version 与 Migration Test。
