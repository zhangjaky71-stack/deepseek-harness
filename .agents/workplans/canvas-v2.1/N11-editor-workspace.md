# N11 — Workflow Editor、Draft、Auto-save、Undo/Redo、Copy/Paste 与 Layout（rc.8 Revision）

## 1. 节点目标

完成真正可用的人工 Workflow 编辑器，并保证所有 semantic edits 最终以 atomic operations 进入 CanvasService；Editor 同时必须消费 Host authoritative Node Catalog，支持 open-world plugin nodes。

## 2. 前置依赖

`N06, N07, N10`

## 3. 本节点范围

- renderer-neutral graph adapter / XYFlow seam。
- NodeLibrary、Inspector、ValidationPanel、MediaStage。
- Local Draft、debounce/blur、SaveStatus。
- Undo/Redo command stack。
- Copy/Paste/Select All/Delete。
- node drag layout persistence。
- port-level connect/disconnect authoring。
- Host Node Catalog client projection。

## 4. 明确不在本节点处理

- 不把 graph-library JSON 保存进 Domain。
- 不在 Browser 维护长期 Workflow authority。
- 不由 current workflow 猜“可创建节点全集”。
- 不静态复制 Host MediaNodeRegistry。

## 5. 预计代码位置

- `packages/client/ui-canvas/**`
- client-safe node catalog service/remote

## 6. 核心接口 / 行为契约

```text
Graph Renderer Node/Edge
       ↕ adapter
MediaWorkflow Node/Edge
       ↕ operations
CanvasService
```

Undo/Redo 是新的合法 mutation，不改历史 Event。

Node Library：

```text
Host MediaNodeRegistry
  → client-safe catalog
  → NodeLibrary/Inspector
```

## 7. 实施步骤

1. workflowToGraph / graphEventToOperations。
2. Inspector local Draft + latest workflowRevision CAS。
3. operations[] 单 Remote transaction。
4. Saved/Saving/Conflict/Offline/Save failed。
5. Undo/Redo/Delete/Copy/Paste/Select All。
6. Paste 生成新 NodeId/EdgeId。
7. drag local，drag-end `saveLayout`，不改 workflowRevision。
8. port-level connect/disconnect 转 semantic edge operations。
9. Node Library 改为 Host catalog 驱动。
10. unavailable custom node 仍显示 placeholder/Inspector read-only diagnostics。

## 8. rc.8 Compatibility

- store/slot/listener 必须是 client plugin lifecycle safe。
- Browser metadata 不从 Host-only registry package 运行时代码静态 import。
- `render-service`/`ui-layout` 不持有 editor draft。

## 9. 测试要求

- [ ] 每字符输入不产生 Session revision。
- [ ] blur/debounce 一次合法 edit。
- [ ] copy/paste/delete atomic。
- [ ] Undo 后产生新 revision。
- [ ] layout 不改 workflowRevision。
- [ ] port connect/disconnect 可保存并刷新恢复。
- [ ] network failure 不假装 Saved。
- [ ] custom plugin node 出现在 Node Library。
- [ ] provider/definition unavailable 的历史 node 仍可显示。

## 10. 验收标准

- [ ] 人工可完成基本 DAG 编辑。
- [ ] semantic state + layout 刷新恢复。
- [ ] UI edit 全部映射 Domain operations。
- [ ] Node Library 不维护第二份 Host registry。

## 11. Definition of Done

- [ ] focused unit tests。
- [ ] typecheck/lint/build。
- [ ] REAL composition/editor smoke test。
- [ ] 当前已知 N11 draft blockers 清零或明确 follow-up。

## 12. 风险与禁止项

禁止在 UI store 保留长期 Workflow 副本；只允许 Draft/presentation state。
