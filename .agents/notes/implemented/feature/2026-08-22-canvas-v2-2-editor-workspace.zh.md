# Canvas V2.2 — Editor Workspace Authority 与精确 Catalog Identity

[English](2026-08-22-canvas-v2-2-editor-workspace.md) | 中文

## 为什么需要这份说明

N11 把 Canvas Editor 从 Selection/State-machine Shell 推进为真正的 Semantic Workflow Editor。这里最危险的回退通常不是视觉问题，而是 Authority 问题：让 Browser Draft 变成第二份 Workflow、只按 type 不按 version 解析 Plugin Node、debounce 与 blur 对同一 Draft 重复提交，或者把 Graph Renderer 状态持久化成 Semantic Domain Data。

这份说明固定后续维护 Editor 时必须守住的边界。

## 1. Session Projection 始终是 Workflow Authority

Browser 不拥有 durable `MediaWorkflow` 副本。当前 Workflow 永远来自 session-native `canvas` Projection。

Editor 的 session-scoped Store 只能保存 presentation state，例如：

- 一个 narrow selected-node Draft；
- Save Status；
- 带 Revision Fence 的 Undo/Redo Command；
- 显式 Clipboard Payload；
- 瞬态 local drag position。

它不能长期保存 Workflow Snapshot，再从该 Snapshot 覆盖 Host。Canvas generation 或 Workflow identity 被替换时，必须先清理 generation-bound Draft/History/Position，再允许编辑新文档。

因此每次 Semantic Edit 都应基于当前 projected Workflow 推导，并以一个 atomic `WorkflowEditOperation[]` batch 携带精确 `workflowRevision` CAS 写入 Host。

## 2. Catalog Identity 是 `(type, version)`，不是只有 `type`

`MediaNodeRegistry` 是 open-world，并且可以同时包含同一个 Plugin Node Type 的多个版本。因此 durable historical node 的 UI/Port Metadata 只能按以下 Identity 精确解析：

```text
(node.type, node.nodeVersion ?? 1)
```

绝不能为 Workflow Node resolution 构建 `Map<type, definition>`。否则历史 v1 Node 可能错误使用 v2 Port 或 Metadata。

Renderer-neutral Graph Adapter 也必须保留 `nodeVersion`；如果在 presentation lookup 之前丢掉 version，即使 Domain Value 没改，Identity 仍然已经被破坏。

Browser 不创建 local Registry。Node Library、Inspector Diagnostics 与 Port Authoring 都只消费 client-safe Host Catalog Snapshot。Host 提供的 Catalog Revision 仍是该 Snapshot 的 Identity；N11 不增加 Polling，也不制造第二份 Revision Source。

## 3. 历史 unavailable node 可读，但不能静默升级

Open-world durability 意味着当前 Host 可能已经没有创建某个历史 Node 的精确 Definition。

精确 Definition 缺失时：

- Node 仍保持可见；
- durable type/version/config 仍保持可读；
- Inspector 显示 read-only diagnostics；
- 新 Connection Authoring 不得使用虚构 Port；
- 不得绑定到另一个已安装版本；
- 不得因为 Plugin 当前缺失就删除或迁移历史 Node。

当精确 Definition 存在，但它声明的部署 Feature 当前关闭时，也使用相同的 read-only presentation。

不要把 `lifecycle.executable=false` 当成 Editor Permission。N10 拥有 lifecycle/run admission：一个 Definition 可以已安装、仍可编辑，但当前不允许执行。`creatable/deprecated` 用于过滤 Node Library 创建入口；`executable` 是 Run Engine Policy。

## 4. Draft 输入是 Local；保存是一次 Atomic Host Write

每次按键只修改 narrow Browser Draft，不应逐字符追加 Session Revision。

N11 有两个保存触发器：

- 停止输入 450ms；
- Inspector Field blur 时立即保存。

两个触发器必须调用同一条 Draft Save Path。通过由 Draft Identity 派生的 in-flight key，可以防止 blur 已经发起写入后，仍在等待的 debounce timer 又把同一个 Draft 提交一次。

Save Path 必须保留以下结果：

- base revision 已 stale → `Conflict`，不覆盖；
- Local JSON 非法 → `Save failed`，不写 Host；
- 没有 Semantic Difference → 直接 mark clean，不产生 Revision；
- operations 合法 → 一个 Atomic Host Transaction；
- Transport Failure → `Offline` / `Save failed`，Draft 继续 dirty；
- 绝不能因为 Browser “尝试过保存”就显示 `Saved`。

## 5. Undo/Redo 是 Command，不是 History Rewrite

Undo/Redo Entry 保存 forward/inverse operation batch 与期望的 Revision Fence，不保存 Workflow Snapshot。

一次成功 Undo 或 Redo 是新的合法 Canvas Mutation，因此会生成新的 Workflow Revision。Session History 永远不被改写。

当前有一个明确的 V1 限制：`rename-node` 还不能精确恢复原本不存在的 optional `name` 字段。空字符串和“字段缺失”不是同一个 Semantic Value，而且当前 Host Edit Boundary 也拒绝空字符串 Rename。不要用 Browser-only State 掩盖这个问题。只有未来 Host Wire Operation 能端到端表达 exact clear/restore semantics 后，该 case 才算真正解决。

## 6. Layout 与 Semantic Workflow State 独立

Pointer move 只更新瞬态 Browser Position。Pointer-up 通过独立 `layoutRevision` CAS 持久化 `canvas/layout-change`。

拖动 Node 不能推进 `workflowRevision`。

Graph Adapter 有意保持 renderer-neutral。它可以暴露 Semantic Node/Edge Identity 与 Position，但 Renderer Library JSON、内部 Handle、Viewport Object Graph 或 React Component Instance 都不能进入 Canvas Domain。未来即使从当前 positioned-card renderer 切换到 XYFlow/React Flow，也不应修改 durable Workflow Format。

## 7. Port Authoring 必须服从精确 Host Metadata

Connection Authoring 必须从每个 durable Node 的精确已安装 Definition 获取 Inputs/Outputs。只有两个 Endpoint 都可用、并且 Media Port Type 匹配时，才可以提供 Connection。

Disconnect 同样是 Semantic Operation。删除 selected Edge 或 Node 时，应推导一个 Atomic Operation Batch：先 disconnect 受影响 Edge，再删除 Node；需要时在同一个 Transaction 内修复 Output-node Selection。

## 8. 防止这些边界回退的测试

N11 已提供 focused test source，覆盖：

- 同 type v1/v2 的精确 Catalog Resolution；
- 历史版本缺失时不 silent fall-forward；
- Definition 缺失时 Inspector read-only；
- Feature-disabled Definition 不参与 Authoring；
- Port Projection 使用精确版本；
- Renderer Adapter 保留 `nodeVersion`；
- 输入不会逐字符写 Host；
- 450ms debounce Commit；
- blur immediate Commit，并对 pending debounce 去重；
- Offline Write 后 Draft 继续 dirty、状态保持 unsaved；
- Copy/Paste/Delete Atomic Helper；
- Revision-fenced Undo/Redo Store；
- Layout 不进入 Semantic Workflow State。

测试文件存在于分支并不等于 CI 已验收。写这份说明时，Repository Actions 仍在正常 Test Step 执行前失败或排队。因此 N11 继续保持 `REVIEW`，直到 exact-head repository-pinned checks 真正运行。

## 维护检查表

修改 Editor 时至少确认：

1. 当前 Workflow 是否仍然来自 Session Projection，而不是 Browser-owned Copy？
2. 每个 Semantic Write 是否携带合法的最新 CAS Revision，而不是盲目 Replace？
3. Plugin Node 是否按精确 Type + Durable Version 解析？
4. Missing/Disabled Historical Node 是否还能显示，并且不会得到虚构 Metadata？
5. Debounce 与 Blur 是否可以并发而不产生 Duplicate Commit？
6. Failed Write 是否仍明确保持 Unsaved？
7. Undo/Redo 是否产生新的 Mutation，而不是改写历史？
8. Layout 是否继续使用独立 Event/Revision Channel？
9. Node Library 是否仍只由 Host Catalog Metadata 驱动？
10. 是否有任何 Renderer-specific State 泄漏进 Domain 或 Session Semantic Event？

只要其中任何一项答案为“否”，即使 UI 表面看起来正常，该改动也已经越过了 N11 的 Authority Boundary。
