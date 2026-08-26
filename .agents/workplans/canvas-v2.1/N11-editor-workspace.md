# N11 — Workflow Editor、Draft、Auto-save、Undo/Redo、Copy/Paste 与 Layout（rc.8 Revision）

Status: `REVIEW`

Remediation branch: `fix/canvas-n11-v2.2-editor-workspace`

Historical branch `agent/canvas-n11-editor-workspace` is not a continuation base: relative to the N10 remediation head it is 206 commits behind and 0 ahead.

## 1. 节点目标

完成真正可用的人工 Workflow 编辑器，并保证所有 semantic edits 最终以 atomic operations 进入 CanvasService；Editor 同时必须消费 Host authoritative Node Catalog，支持 open-world plugin nodes。

N11 的 Browser authority 边界固定为：Session Projection 是 Workflow 真源；Browser Store 只保存 narrow Draft、命令历史、Clipboard 与瞬态 Layout presentation state，不保留长期 Workflow 副本。

## 2. 前置依赖

`N06, N07, N10`

## 3. 本节点范围

- renderer-neutral graph adapter / XYFlow seam。
- NodeLibrary、Inspector、ValidationPanel、MediaStage seam。
- Local Draft、450ms debounce + blur、SaveStatus。
- workflowRevision CAS + atomic operations[] transaction。
- Undo/Redo command stack。
- Copy/Paste/Select All/Delete。
- node drag layout persistence。
- port-level connect/disconnect authoring。
- Host Node Catalog client projection。
- exact `(node.type, node.nodeVersion ?? 1)` catalog resolution。
- unavailable historical custom node 的 read-only degradation。

## 4. 明确不在本节点处理

- 不把 graph-library JSON 保存进 Domain。
- 不在 Browser 维护长期 Workflow authority。
- 不由 current workflow 猜“可创建节点全集”。
- 不静态复制 Host MediaNodeRegistry。
- `lifecycle.executable=false` 属于 N10/N12 run admission，不被 N11 错当成 Editor read-only policy。
- 当前 V1 `rename-node` 无法精确表达 optional `name` 从有值恢复为字段缺失；该 exact clear/restore Host-wire 扩展作为明确 follow-up，不用 Browser 私有状态伪造。

## 5. 代码位置

- `packages/client/ui-canvas/src/client/WorkflowEditor.tsx`
- `packages/client/ui-canvas/src/client/{draft,store,adapters,catalog}.ts`
- `packages/client/ui-canvas/src/client/{NodeLibrary,NodeInspector,ConnectionPanel,ValidationPanel}.tsx`
- `packages/client/ui-canvas/tests/**`
- client-safe node catalog service/Remote 由 N10 提供，N11 只消费。

## 6. 核心接口 / 行为契约

```text
Host Session Projection (Workflow authority)
          ↓
renderer-neutral graph adapter
          ↓
Graph Renderer Node/Edge + narrow local Draft
          ↓ semantic operations[] + exact workflowRevision CAS
CanvasService
```

Undo/Redo 是新的合法 mutation，不改历史 Event，也不在 Browser 保存 Workflow snapshot。

Node Library / Inspector / Connection authoring：

```text
Host MediaNodeRegistry
  → client-safe { revision, entries }
  → exact type+version lookup
  → NodeLibrary / Inspector / ConnectionPanel
```

缺失精确 Definition 或依赖 Feature 关闭的历史 Node 仍显示，但 Inspector 为只读、其 Port 不参与新连线。`executable=false` 本身只影响运行，不自动禁止编辑。

Layout 与 semantic Workflow revision 分离：pointer move 只修改 local position，pointer-up 才以 `layoutRevision` CAS 保存 `canvas/layout-change`，不推进 `workflowRevision`。

## 7. 实施步骤 / 当前状态

1. [x] workflowToGraph renderer-neutral projection；保留 node identity/type/version，不保存 renderer JSON。
2. [x] Inspector local Draft + exact workflowRevision CAS。
3. [x] operations[] 单 Remote transaction。
4. [x] Saved/Saving/Conflict/Offline/Save failed。
5. [x] Undo/Redo/Delete/Copy/Paste/Select All。
6. [x] Paste 生成新 NodeId/EdgeId。
7. [x] drag local，drag-end `saveLayout`，不改 workflowRevision。
8. [x] port-level connect/disconnect 映射 semantic edge operations；selected edge Delete 使用 `disconnect`。
9. [x] Node Library 改为 Host catalog 驱动，不从 Workflow 反推全集。
10. [x] unavailable custom node 显示 placeholder/read-only Inspector diagnostics。
11. [x] Catalog metadata 按 `(type, nodeVersion ?? 1)` 精确解析，禁止 v1 silently 使用同 type v2 ports。
12. [x] 450ms debounce 与 blur 共用同一 save path，并按 Draft identity 去重 in-flight commit。
13. [x] Remote failure 保留 dirty Draft，并发布 offline/save-failed，不假装 Saved。
14. [ ] Optional node-name exact clear/Undo：需要 Host wire 能表达字段缺失；当前 V1 contract 暂不具备。

## 8. rc.8 Compatibility

- store/slot/listener 必须是 client plugin lifecycle safe。
- Browser metadata 不从 Host-only registry package 运行时代码静态 import。
- `render-service`/`ui-layout` 不持有 editor draft。
- business component 不自建外部订阅；生产组件只使用 framework 提供的 `useStore`。jsdom 测试可直接把真实 store observable 绑定到 React 以驱动组件。
- generation/workflow replacement 会清理 generation-bound Draft/Undo/Redo/local positions；Clipboard 作为显式 Copy payload 可跨 generation 保留。

## 9. 测试要求

Focused test code 已覆盖下列行为；由于当前 GitHub Actions runner 在 step allocation 前失败/排队，下面的 `[x]` 表示“测试已编写并进入分支”，不是“CI 已执行通过”。

- [x] 每字符输入不产生 Session revision：连续输入 449ms 不调用 Host，450ms 后仅一次 commit。
- [x] blur/debounce 一次合法 edit：blur 立即 commit，pending debounce 对同 Draft 不重复提交。
- [x] copy/paste/delete atomic。
- [x] Undo/Redo revision-fenced command stack；每次接受后使用新 revision。
- [x] layout projection/merge 与 semantic Workflow 分离。
- [x] port authoring 使用 exact type+version Definition；selected edge Delete 产生 disconnect。
- [x] network/offline failure 不假装 Saved，Draft 保持 dirty。
- [x] custom plugin catalog entry 可进入 Node Library，Feature-disabled/deprecated/non-creatable entry 不进入。
- [x] exact historical Definition 缺失时 Node 保持可见且 Inspector read-only。
- [x] 同 type v1/v2 catalog 不串 Definition/Port。
- [ ] exact node-name field-absence Undo，需要 Host wire follow-up 后补 Host+Browser roundtrip test。

## 10. 验收标准

- [x] 基本 DAG semantic editing path 已实现：add/config/name/paste/delete/connect/disconnect/selection/layout。
- [x] semantic state 只来自 Session Projection，layout 单独持久化并有独立 revision。
- [x] UI semantic edit 全部映射 Domain operations，不直接改 Projection。
- [x] Node Library 不维护第二份 Host registry。
- [x] historical unavailable plugin node 不会因缺 Definition 被删除或错误绑定到别的版本。
- [ ] optional node-name exact clear/Undo 仍需 Host contract 扩展。

## 11. Definition of Done

- [x] focused unit/component tests 已编写。
- [x] README 双语 authority/autosave/catalog 契约已同步。
- [ ] typecheck/lint/build：等待 repository runner 实际执行，不宣称通过。
- [ ] REAL composition/editor smoke test：等待 repository runner 实际执行，不宣称通过。
- [x] 当前已知 N11 draft blocker 已明确：optional node-name exact clear/restore Host-wire follow-up。
- [ ] exact-head CI 可执行并验证后才能从 `REVIEW` 升级为 accepted。

## 12. 风险与禁止项

禁止在 UI store 保留长期 Workflow 副本；只允许 Draft/presentation state。

禁止按 `type` 单键选择任意已安装 Definition；历史 Node 必须按 `(type, nodeVersion ?? 1)` 精确解析。

禁止在 exact Definition 缺失时静默升级、删除、重写历史 Node，也禁止从当前 Workflow 猜 Node Library 全集。

禁止把 renderer JSON、Viewport library state 或 local command stack 写成 Canvas semantic Workflow state。

禁止把空字符串冒充 optional `name` 字段缺失的精确 Undo 语义；在 Host wire 支持之前该 case 必须明确保留为 follow-up。
