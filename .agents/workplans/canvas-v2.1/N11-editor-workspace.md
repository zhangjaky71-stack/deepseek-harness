# N11 — Workflow Editor Workspace（0.1.1-rc.2 Revision）

Status: `REVIEW / REVALIDATE`

## 1. 目标

在 `ui-canvas` 内提供人工可编辑 Workflow DAG：Node Library、画布、连接、Inspector、Draft/CAS、Undo/Redo、Copy/Paste/Delete、layout persistence 和 validation diagnostics，同时保持 Host Session Projection/CanvasService 为 semantic authority。

## 2. 依赖

`N06, N07, N10`

## 3. Durable vs presentation

Durable/authoritative：

- Workflow nodes/edges/config；
- workflowRevision；
- durable layout/layoutRevision；
- stable asset refs。

Browser presentation-only：

- selected nodes/edges；
- dirty Draft；
- save status；
- undo/redo command history；
- clipboard；
- transient drag positions before layout save；
- viewport/zoom unless explicitly persisted later。

## 4. Node Definition authority

Editor只能从 Host catalog exact `(type,nodeVersion ?? 1)` 解析 ports/config/lifecycle/feature。不能 type-only 命中最新版本。

历史 node：

- exact definition missing → visible, read-only diagnostic；
- required feature disabled → visible, read-only/currently unavailable；
- Definition present + creatable/current feature enabled → Node Library可创建。

## 5. Draft save

Node Inspector修改先进入 narrow Draft；450ms debounce 或 blur走同一 save path，必须去重并使用 expected `workflowRevision` CAS。

成功后由新 Session Projection确认 authoritative state；失败时保留 dirty Draft并显示 `conflict/offline/save-failed`，不能假装已保存。

## 6. Undo/Redo

Undo/Redo提交正常 Host operations并产生正常 workflowRevision，不在 Browser恢复整份旧 Workflow snapshot。

历史 `name?: string` 的“原本无 name”问题仍需精确 Host mutation semantics 才能完全恢复字段缺失。实现不得发送已知会被 Host source validation拒绝的空字符串来伪造 absence。若当前 wire 未提供 clear-name，应在 UI/command history中显式限制并记录 follow-up。

## 7. Copy/Paste/Delete

- Paste生成全新 node/edge ids；
- unavailable/unknown definition 不得通过 Paste绕过 Node Library authoring policy；
- Delete可删除历史 unavailable node；
- multi-operation paste/delete应原子提交。

## 8. Connections

Connection authoring使用 exact version port metadata和 semantic type compatibility。缺失 definition/feature-disabled node的新增连接被禁用，但已有历史 edge仍显示并可诊断/删除。

## 9. 0.1.1-rc.2 新集成要求

- latest `ui-renderer` owns React bindings；Editor不得依赖 legacy `web-react` ownership；
- Canvas current workflow来自最新 Projection wire view；
- image fields/output preview持 stable attachment-backed refs，不读取 request-image cache identity；
- Settings/feature使用N09 latest shared-mirror/current capability contract；
- latest Client package/domain gates必须通过。

## 10. 测试

- exact type+version catalog；
- missing/feature-disabled read-only；
- blur+debounce one commit；
- offline/conflict Draft preservation；
- Undo/Redo revision fences；
- Copy/Paste fresh ids + unavailable paste block；
- Delete atomic；
- Connection exact ports；
- drag-end layout revision without workflowRevision；
- session switch/HMR cleanup；
- REAL Editor under latest renderer/layout/Projection。

## 11. 验收

PR #39 的 semantic Editor设计保留。完成 N05/N07/N09/N11.5 新 seam迁移并执行 focused/REAL tests 后再 ACCEPTED。
