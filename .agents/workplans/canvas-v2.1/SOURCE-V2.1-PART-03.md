# 60. Provider Fallback

支持策略：

```ts
type ProviderRoutingMode =
  | 'strict'
  | 'fallback'
```

Strict：

```text
失败 → fail
```

Fallback：

```text
默认 Provider unavailable
→ 尝试部署允许的 fallback
```

Fallback 行为必须记录 provenance。

---

# 61. Provider Credential

Credential 永远不进入：

- Workflow；
- Session；
- Projection；
- Tool result；
- Browser。

---

# 62. Prompt 语义层与 Provider Payload 分离

Workflow：

```text
semantic prompt
```

Provider Adapter：

```text
semantic request
 ↓
provider request
```

不要把 Provider-specific API shape 放进 Domain。

---

# 63. Media Provider API

```ts
export interface MediaProvider {
  readonly id: string

  execute(
    request: MediaExecutionRequest,
    signal: AbortSignal,
  ): MediaOperation
}
```

---

# 64. Media Capability

```ts
export type MediaCapability =
  | 'text-to-image'
  | 'image-to-image'
  | 'image-edit'
  | 'text-to-video'
  | 'image-to-video'
  | 'upscale'
```

---

# 65. Media Workflow Engine

```ts
export abstract class MediaWorkflowEngine extends Service {
  abstract validate(
    workflow: MediaWorkflow,
  ): MediaWorkflowValidationResult

  abstract start(
    request: MediaWorkflowStartRequest,
  ): MediaWorkflowRun
}
```

---

# 66. Scheduler

执行：

```text
Validate
 ↓
Freeze Workflow
 ↓
Resolve target
 ↓
Topological sort
 ↓
Check reusable/cached upstream
 ↓
Execute ready nodes
 ↓
Persist node outputs
 ↓
Update node state
 ↓
Collect output
```

V1 可以顺序执行。

以后可以 controlled concurrency。

---

# 67. Jobs

扩展：

```ts
declare module '@deepseek-ai/dsh-jobs/types' {
  interface JobKindMap {
    media: 'media'
  }
}
```

RunId 与 JobId 分离。

---

# 68. Browser 关闭

Browser 关闭不 cancel Host Run。

---

# 69. Agent Dispose

是否 cancel 要遵守 Jobs owner 语义。

但必须显式测试：

```text
Agent dispose
Host Canvas run
```

不能靠偶然行为。

---

# 70. Host Restart

V1：

```text
replay running Run
 ↓
对应 local Job 不存在
 ↓
RunReconciler
 ↓
run-interrupted
```

---

# 71. Run Reconciler

新增：

```text
CanvasRunReconciler
```

职责：

```text
Host boot
 ↓
scan non-terminal Canvas Runs
 ↓
check job/provider state
 ↓
resume or mark interrupted
```

不要把恢复逻辑散在 CanvasService constructor。

---

# 72. Durable Video V2

Provider 返回 `providerTaskId` 时：

```text
Run metadata
 ↓
persist provider task reference
```

Host restart：

```text
Reconciler
 ↓
Provider query
 ↓
resume tracking
```

---

# 73. Progress

Session 只存 durable milestone。

实时百分比：

```text
canvas/run-progress
```

走 forwarded event。

如果无真实 progress，只显示 spinner/phase。

---

# 74. CanvasService

CanvasService 是 Domain façade：

```ts
get(...)
createWorkflow(...)
replaceWorkflow(...)
editWorkflow(...)
createVariant(...)
restoreWorkflow(...)
selectOutput(...)
run(...)
cancel(...)
clear(...)
```

---

# 75. CanvasService 内部

```text
cache
sync
prepareMutation
expectCurrent
expectWorkflowRef
applyOperations
validate
commit
commitLayout
history
admission
startRun
reconcile
```

---

# 76. Canvas Error Categories

```ts
export type CanvasErrorCategory =
  | 'validation'
  | 'conflict'
  | 'permission'
  | 'provider'
  | 'infrastructure'
  | 'interrupted'
  | 'quota'
```

稳定 code：

```text
CANVAS_STALE_WORKFLOW_REVISION
CANVAS_INVALID_WORKFLOW
CANVAS_PROVIDER_FAILED
CANVAS_PERMISSION_DENIED
CANVAS_QUOTA_EXCEEDED
...
```

UI 根据 category 给恢复动作。

---

# 77. Browser Auto-save

Editor 显示：

```text
Saved
Saving…
Conflict
Offline
Save failed
```

用户必须知道修改是否已经 durable。

---

# 78. Browser 断线

本地 Draft 不能直接丢。

流程：

```text
Network disconnected
 ↓
keep local Draft
 ↓
disable committed-state assumptions
 ↓
reconnect
 ↓
get latest Projection
 ↓
compare base revision
 ↓
replay or conflict
```

V1 可以保守：

```text
reconnect + stale
→ require retry
```

但不能悄悄覆盖。

---

# 79. Conflict

基础策略：

```text
baseRevision != current
→ stale
```

未来可 operation-level rebase：

```text
Agent 修改 Node B
User 修改 Node A
→ auto merge
```

真正同节点冲突才拒绝。

V1 不强制自动 merge，但 Operation 设计必须允许未来实现。

---

# 80. Undo / Redo

V1 Editor 至少提供本地 command stack。

Undo 仍产生新 Domain mutation：

```text
rev 5 add node
rev 6 undo = remove node
```

不改历史 Event。

---

# 81. Keyboard

Editor V1 建议：

```text
Ctrl/Cmd + Z
Ctrl/Cmd + Shift + Z
Delete
Backspace
Ctrl/Cmd + C
Ctrl/Cmd + V
Ctrl/Cmd + A
Ctrl/Cmd + Enter → Run
```

---

# 82. Copy / Paste

批量操作通过一个 atomic transaction 提交。

粘贴时必须：

```text
new node IDs
new edge IDs
```

不能复用原 ID。

---

# 83. Workflow Import / Export

V1 UI 可以不做，但数据模型必须：

```text
JSON serializable
self-contained semantic graph
provider credential-free
React Flow-free
```

为以后模板 / 分享 / 导入保留。

---

# 84. Agent Tool 集

推荐：

```text
canvas_read
canvas_inspect
canvas_generate
canvas_write_workflow
canvas_edit_workflow
canvas_run
canvas_cancel
```

---

# 85. canvas_read

默认返回 summary，避免大型 Workflow 占上下文。

```ts
{
  mode: 'summary'
}
```

返回：

- current workflow summary；
- revision；
- current output；
- current run；
- selected interaction context（如果有）。

---

# 86. canvas_inspect

用于读取特定节点：

```ts
{
  nodeIds: [...]
}
```

或：

```text
full workflow
```

避免 `canvas_read` 以后无限膨胀。

---

# 87. canvas_generate

Simple path：

```text
User intent
 ↓
build standard workflow template
 ↓
write Workflow
 ↓
run
```

---

# 88. canvas_generate 多结果

支持：

```ts
count?: number
```

例如：

> 给我四版。

直接生成 4 个候选。

---

# 89. Agent 修改规则

Tool 文档必须明确：

如果当前 Canvas 存在：

```text
优先 canvas_read
→ edit current workflow
```

用户明确：

```text
“重新做一个”
“再来一个方案”
“另做一版”
```

则：

```text
createVariant / new workflow variant
```

避免模型每次都覆盖或每次都新建。

---

