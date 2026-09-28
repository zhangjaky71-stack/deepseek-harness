# DeepSeek Harness Canvas / Media Workflow V2.1 开发设计文档

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 文档版本：V2.1 Production Hardening  
> 用途：后续 Canvas / 图片生成 / 视频生成 / 可编辑媒体工作流能力的唯一开发基线  
> 状态：开发前生产化冻结设计稿  
> 原则：沿用 Harness 既有 Cordis Plugin、Session Event、Session Projection、Typert Remote、Agent Tool、Jobs、Attachment、Conversation View、Agent Preset 等机制，不另造第二套状态系统。

---

# 0. V2 相比 V1 的核心升级

V2 在 V1 基础上正式补入以下能力，并将其纳入主架构，而不是可选备注：

1. Canvas Interaction Context：Agent 能理解“这个节点 / 这张图 / 这里 / 这一段”。
2. Generation / Run / Output History：支持历史结果查看、恢复、继续编辑。
3. Workflow Variant：支持“再来一版”而不是简单覆盖当前 Workflow。
4. 多候选结果：一次生成多张图，可指定 primary，并基于某张继续。
5. Node-level Run State：Editor 中能看到每个节点的执行状态。
6. Persistent Layout：节点布局持久化，但与 Workflow Semantic State 分离。
7. Image Region / Mask Reference：为局部编辑、inpaint/outpaint 预留。
8. Partial Execution：为 Run Selected / Run From Node / Run Downstream 预留。
9. Node Output Cache / Fingerprint：避免无意义重复执行昂贵节点。
10. Provider / Model Registry 分层。
11. Workflow Schema Migration。
12. Run Admission：运行前做能力、配额、成本、并发、资产、Provider 检查。
13. Retry / Idempotency。
14. Asset 生命周期、引用与 GC。
15. Atomic Workflow Operations。
16. Browser 断线 / Draft / Auto-save / 冲突恢复策略。
17. Canvas Product State Machine。
18. Workflow / Run / Output provenance。
19. Workflow restore。
20. 视频正式进入 V1 产品验收，而不是“可选项”。

---

# 1. 产品最终目标

Canvas 是 Harness Session 中的媒体创作工作台。

它同时服务两种人：

- 只想输入一句话拿结果的用户；
- 需要精确编辑工作流的专业用户。

系统最终表现：

```text
自然语言
   ↓
Harness Agent
   ↓
Canvas Tools
   ↓
CanvasService
   ↓
Media Workflow
   ↓
图片 / 视频 Provider
   ↓
结果进入 Canvas

同时：

人工编辑 Canvas
   ↓
Canvas Remote
   ↓
同一个 CanvasService
```

也就是说：

> Agent 和人不是操作两份状态，而是协作编辑同一个 Canvas。

---

# 2. 产品主模型

V1：

```text
1 Session
   │
   └── 1 Current Canvas
           │
           ├── Current Workflow
           ├── Current Layout
           ├── Current Run
           ├── Current Output
           ├── Run History
           └── Variant / Lineage metadata
```

未来 V2+ 才考虑：

```text
Session
├── Canvas A
├── Canvas B
└── Canvas C
```

当前不引入多 Canvas Document。

---

# 3. 两种 UI 模式

## 3.1 Minimal

Minimal 只关心：

- 当前输出；
- 正在运行；
- 失败；
- 取消；
- 重新生成；
- 继续修改；
- 作为参考；
- 生成视频；
- 查看历史；
- 切换到 Editor。

```text
┌──────────────────────────────────────┐
│ Canvas             极简 | 编辑      │
├──────────────────────────────────────┤
│                                      │
│              最终媒体                │
│                                      │
├──────────────────────────────────────┤
│ 重新生成  修改  生成视频  历史       │
├──────────────────────────────────────┤
│ Harness Composer                     │
└──────────────────────────────────────┘
```

Minimal 不暴露：

- DAG；
- Node；
- Edge；
- Provider technical detail；
- JobId；
- internal revision；
- debug log。

---

## 3.2 Editor

Editor 是完整工作台，而不仅是 DAG。

```text
┌─────────────────────────────────────────────────────────────┐
│ Canvas            Minimal | Editor        Saved     ▶ Run  │
├────────────┬──────────────────────────────────┬─────────────┤
│ Nodes      │                                  │ Inspector   │
│ Assets     │        Workflow Graph            │             │
│ History    │                                  │             │
│            │                                  │             │
├────────────┼──────────────────────────────────┼─────────────┤
│            │           Media Stage            │             │
├────────────┴──────────────────────────────────┴─────────────┤
│ Run / Validation / History                                 │
└─────────────────────────────────────────────────────────────┘
```

Editor 包含：

- Node Library；
- Asset Library；
- Workflow Graph；
- Inspector；
- Validation；
- Media Stage；
- Run 状态；
- History；
- Undo / Redo；
- Save 状态。

---

# 4. 架构不变量

后续任何 PR 都不能破坏。

## A. Durable Authority

```text
Session Log
=
Canvas durable authority
```

Browser store 不是 authority。

---

## B. Single Write Service

```text
Agent Tool ───┐
              ▼
         CanvasService
              ▲
Browser RPC ──┘
```

---

## C. Shared Workflow

Agent 与人工编辑同一个 Workflow。

---

## D. Minimal / Editor

只改变 presentation，不改变 Domain。

---

## E. Workflow 不依赖 UI Library

```text
MediaWorkflow
≠
React Flow JSON
```

---

## F. Workflow 不依赖具体 Provider SDK

---

## G. Binary 不进入 Session Event

---

## H. Run Revision 与 Workflow Revision 分离

---

## I. Run 执行固定 Workflow Snapshot

---

## J. Security enforcement 在 Host

---

## K. Workflow Operations 原子提交

一组操作要么全部成功，要么完全不提交。

---

## L. Node Layout 与 Semantic Workflow 分离

---

# 5. Package 规划

```text
packages/
├── canvas/
│   ├── canvas/
│   ├── media-workflow/
│   ├── media-provider/
│   ├── media-provider-mock/
│   ├── media-assets/
│   ├── media-assets-local/
│   └── tool-canvas/
│
└── client/
    └── ui-canvas/
```

推荐最终结构：

```text
packages/canvas/canvas/
├── package.json
├── README.md
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── domain.ts
│   ├── runtime.ts
│   ├── fold.ts
│   ├── migration.ts
│   ├── history.ts
│   ├── admission.ts
│   ├── reconciler.ts
│   ├── client.ts
│   └── invariant.ts
└── tests/
```

```text
packages/canvas/media-workflow/
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── registry.ts
│   ├── validate.ts
│   ├── scheduler.ts
│   ├── fingerprint.ts
│   ├── cache.ts
│   └── invariant.ts
└── tests/
```

```text
packages/client/ui-canvas/src/client/
├── index.ts
├── CanvasView.tsx
├── MinimalCanvas.tsx
├── WorkflowEditor.tsx
├── WorkflowNode.tsx
├── WorkflowToolbar.tsx
├── NodeLibrary.tsx
├── AssetLibrary.tsx
├── NodeInspector.tsx
├── ValidationPanel.tsx
├── HistoryPanel.tsx
├── MediaStage.tsx
├── RunStatus.tsx
├── SaveStatus.tsx
├── store.ts
├── draft.ts
├── adapters.ts
└── locales.ts
```

---

# 6. Domain 基础 ID

```ts
export type CanvasId = Branded<'CanvasId'>
export type MediaWorkflowId = Branded<'MediaWorkflowId'>
export type WorkflowNodeId = Branded<'WorkflowNodeId'>
export type WorkflowEdgeId = Branded<'WorkflowEdgeId'>
export type CanvasRunId = Branded<'CanvasRunId'>
export type CanvasVariantId = Branded<'CanvasVariantId'>
export type VideoAssetId = Branded<'VideoAssetId'>
```

---

# 7. MediaWorkflow

```ts
export interface MediaWorkflow {
  readonly id: MediaWorkflowId
  readonly schemaVersion: number
  readonly name: string

  readonly nodes: readonly MediaWorkflowNode[]
  readonly edges: readonly MediaWorkflowEdge[]

  readonly outputNodeIds: readonly WorkflowNodeId[]
}
```

---

# 8. V1 Node 类型

```ts
export type MediaWorkflowNodeType =
  | 'asset.input'
  | 'prompt'
  | 'image.generate'
  | 'image.edit'
  | 'video.generate'
  | 'video.image-to-video'
  | 'output'
```

V1+ 可快速增加：

```text
image.upscale
image.crop
image.resize
image.remove-background
image.inpaint
image.outpaint
image.compose
video.extend
video.concat
```

---

# 9. MediaWorkflowNode

```ts
export interface MediaWorkflowNode {
  readonly id: WorkflowNodeId
  readonly type: MediaWorkflowNodeType
  readonly nodeVersion?: number
  readonly name?: string
  readonly config: Record<string, JsonValue>
}
```

---

# 10. Edge

```ts
export interface MediaWorkflowEdge {
  readonly id: WorkflowEdgeId

  readonly sourceNodeId: WorkflowNodeId
  readonly sourcePort: string

  readonly targetNodeId: WorkflowNodeId
  readonly targetPort: string
}
```

---

# 11. Port 类型

```ts
export type MediaPortType =
  | 'text'
  | 'image'
  | 'video'
  | 'image-list'
  | 'video-list'
  | 'mask'
```

---

# 12. Node Definition Registry

这是 V2 必须正式实现的抽象。

```ts
export interface MediaNodeDefinition {
  readonly type: MediaWorkflowNodeType
  readonly version: number

  readonly displayName: string

  readonly inputs: readonly MediaNodePortDefinition[]
  readonly outputs: readonly MediaNodePortDefinition[]

  readonly configSchema: unknown

  readonly execution: {
    capability?: MediaCapability
    deterministic: boolean
    supportsPartialRun: boolean
  }

  readonly ui?: {
    category?: string
    icon?: string
    inspectorKind?: string
  }
}
```

Node Definition 是以下模块的统一来源：

```text
Workflow Validator
Editor Node Library
Inspector
Agent semantic summary
MediaWorkflowEngine
Provider capability check
```

避免每个模块写自己的 `switch(type)`。

---

# 13. CanvasSnapshot

```ts
export interface CanvasSnapshot {
  readonly schemaVersion: number
  readonly id: CanvasId

  readonly workflowRevision: number
  readonly runRevision: number

  readonly workflow: MediaWorkflow | null

  readonly currentVariantId?: CanvasVariantId

  readonly run: CanvasRunSnapshot | null
  readonly output: CanvasOutput | null

  readonly createdAt: number
  readonly updatedAt: number
}
```

---

# 14. Workflow Revision 与 Run Revision

```text
workflowRevision
=
Semantic Workflow 修改

runRevision
=
运行状态改变
```

运行进度不能让 Inspector 编辑产生 stale。

---

# 15. Workflow CAS

```ts
export interface WorkflowRef {
  readonly canvasId: CanvasId
  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number
}
```

编辑请求：

```ts
export interface EditWorkflowRequest {
  readonly baseWorkflowRevision: number
  readonly operations: readonly WorkflowEditOperation[]
}
```

---

# 16. Workflow Operations

```ts
export type WorkflowEditOperation =
  | { op: 'add-node'; node: MediaWorkflowNode }
  | { op: 'remove-node'; nodeId: WorkflowNodeId }
  | {
      op: 'replace-node-config'
      nodeId: WorkflowNodeId
      config: Record<string, JsonValue>
    }
  | { op: 'rename-node'; nodeId: WorkflowNodeId; name: string }
  | { op: 'connect'; edge: MediaWorkflowEdge }
  | { op: 'disconnect'; edgeId: WorkflowEdgeId }
  | { op: 'set-output-nodes'; nodeIds: readonly WorkflowNodeId[] }
  | { op: 'rename-workflow'; name: string }
```

---

# 17. Atomic Operations

一批 `operations[]` 必须：

```text
Clone current Workflow
 ↓
Apply all operations in memory
 ↓
Validate entire Workflow
 ↓
全部成功
 ↓
一次 append canvas/change
```

中途失败：

```text
No durable mutation
```

例如复制三个节点和两条边，不能只复制一半。

---

# 18. Workflow Draft

Editor 必须区分：

```text
Authoritative Workflow
=
Session Projection

Local Draft
=
浏览器尚未提交的输入
```

例如 Node Inspector：

```text
onChange
 ↓
Local Draft

debounce / blur / Enter
 ↓
Remote editWorkflow
```

Draft 永远不能成为长期 Authority。

---

# 19. Persistent Layout

V1 调整原方案：

布局需要持久化，但与 Workflow Semantic State 分离。

```ts
export interface CanvasLayoutSnapshot {
  readonly schemaVersion: 1
  readonly workflowId: MediaWorkflowId

  readonly nodePositions: Readonly<Record<
    WorkflowNodeId,
    { x: number; y: number }
  >>

  readonly viewport?: {
    x: number
    y: number
    zoom: number
  }

  readonly updatedAt: number
}
```

写入策略：

```text
drag
→ local only

drag-end
→ persist
```

不在每个 mousemove 写 Session。

可使用独立：

```text
canvas/layout-change
```

以及独立 Projection：

```text
canvasLayout
```

避免影响 `workflowRevision`。

---

# 20. Canvas Interaction Context

这是 Agent 与 Canvas 真正协作的关键。

用户可能说：

```text
“把这个改成视频”
“用这张继续生成”
“这里改成红色”
“把这三个节点复制一份”
```

Agent 必须知道“这个”是什么。

定义：

```ts
export interface CanvasInteractionContext {
  readonly canvasId?: CanvasId

  readonly workflowId?: MediaWorkflowId
  readonly workflowRevision?: number

  readonly mode?: 'minimal' | 'editor'

  readonly selectedNodeIds?: readonly WorkflowNodeId[]
  readonly selectedEdgeIds?: readonly WorkflowEdgeId[]

  readonly selectedAssets?: readonly CanvasAssetRef[]

  readonly focusedOutput?: {
    readonly runId: CanvasRunId
    readonly assetIndex: number
  }

  readonly region?: CanvasRegionSelection
}
```

---

# 21. Interaction Context 生命周期

它不是 Durable Canvas Domain。

它是：

```text
Browser UI
  ↓
用户发送下一条 message
  ↓
附带 Interaction Context
  ↓
Agent Turn
```

下一次发送时重新采样。

这样：

- 不污染 Session Workflow；
- Agent 仍理解当前 UI 选择；
- “这个 / 这张 / 这里”有明确语义。

---

# 22. Region Selection

为局部编辑预留：

```ts
export interface CanvasRegionSelection {
  readonly asset: CanvasAssetRef

  readonly normalizedBounds?: {
    x: number
    y: number
    width: number
    height: number
  }

  readonly maskAsset?: CanvasAssetRef
}
```

V1 可以不做画笔 Mask UI，但 Domain seam 要提前存在。

---

# 23. Canvas Session Event

主状态事件：

```ts
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'canvas/change': CanvasChange
    'canvas/layout-change': CanvasLayoutChange
  }
}
```

---

# 24. CanvasChange

```ts
export type CanvasOperation =
  | 'create'
  | 'workflow-create'
  | 'workflow-edit'
  | 'workflow-replace'
  | 'workflow-restore'
  | 'variant-create'
  | 'run-start'
  | 'run-state'
  | 'run-complete'
  | 'run-fail'
  | 'run-cancel'
  | 'run-interrupted'
  | 'output-select'
  | 'clear'

export interface CanvasChange {
  readonly kind: 'canvas/change'
  readonly version: number
  readonly operation: CanvasOperation
  readonly canvas: CanvasSnapshot | null
}
```

每次 state-carrying event 仍采用：

> 完整 post-change snapshot。

---

# 25. Session Projection

```ts
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    canvas: CanvasSnapshot | null
    canvasLayout: CanvasLayoutSnapshot | null
  }
}
```

Projection 保持 bounded。

不把完整历史塞入 Projection。

---

# 26. History

Current Projection：

```text
当前 Workflow
当前 Run
当前 Output
```

History 通过 paged query / Remote 暴露。

建议：

```ts
export interface CanvasRunHistoryEntry {
  readonly runId: CanvasRunId
  readonly variantId?: CanvasVariantId

  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number

  readonly status: CanvasRunStatus

  readonly outputs: readonly CanvasAssetRef[]

  readonly startedAt: number
  readonly finishedAt?: number

  readonly promptSummary?: string
}
```

---

# 27. Canvas History Remote

```ts
listRuns(
  sessionId,
  request: {
    cursor?: string
    limit?: number
  }
)
```

```ts
getRun(
  sessionId,
  runId
)
```

```ts
restoreWorkflow(
  sessionId,
  runId
)
```

History 是 derived from Session history / indexed cache，不是第二套 Authority。

---

# 28. Restore Workflow

假设：

```text
current revision = 15
```

用户选择恢复 Revision 7。

不能回滚 Session Log。

应该：

```text
snapshot rev7
 ↓
创建新的当前 workflow
 ↓
workflowRevision = 16
```

历史仍 append-only。

---

# 29. Variant

用户：

> 再来一版。

这通常不是“覆盖当前工作流”。

建议轻量 Variant：

```ts
export interface CanvasVariantMeta {
  readonly id: CanvasVariantId
  readonly parentVariantId?: CanvasVariantId
  readonly baseRunId?: CanvasRunId
  readonly label?: string
  readonly createdAt: number
}
```

V1 不做完整 Git-like branch/merge。

Variant 只表达：

```text
方案 A
  ├── 方案 B
  └── 方案 C
```

---

