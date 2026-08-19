# 90. Interaction Context 与 Agent

User Message 附带：

```text
selected node
selected asset
focused output
region
```

Tool instructions 要告诉模型：

```text
“这个 / 这张 / 这里”
优先解析 Interaction Context
```

---

# 91. Tool Result

保持短：

```text
Workflow updated.
workflowRevision: 12
```

```text
Run started.
runId: ...
```

不要返回 binary / huge config。

---

# 92. Browser Remote

Remote 负责 mutation：

```text
editWorkflow
replaceWorkflow
createVariant
restoreWorkflow
selectOutput
run
cancel
clear
saveLayout
```

读 current state 用 Projection。

历史分页用 Remote。

---

# 93. API Remotes

把 Canvas Remote contribution mount 到：

```text
packages/api/remotes/src/client/index.ts
```

Progress event 加 allowlist。

---

# 94. UI Canvas View

注册到：

```text
conversation.view
```

Composer 保留。

用户不需要第二个聊天框。

---

# 95. Minimal 结果操作

Minimal V1 至少：

```text
Regenerate
Continue Editing
Use as Reference
Generate Video
History
Open Editor
```

---

# 96. Editor Node 状态

节点 UI：

```text
○ pending
● running
✓ completed
⚠ failed
↺ cached
```

可显示 duration。

---

# 97. Editor Validation

节点错误：

```text
red outline
warning icon
Validation Panel entry
```

不要等 Run 才发现。

---

# 98. Product State Machine

正式定义：

```text
EMPTY
  │ create workflow
  ▼
READY
  │ edit
  ▼
DIRTY_READY
  │ run
  ▼
RUNNING
  ├──── completed ────► COMPLETED
  ├──── failed ───────► FAILED
  ├──── cancelled ────► CANCELLED
  └──── restart ──────► INTERRUPTED
```

注意：

`DIRTY_READY` 表示：

```text
current output workflowRevision
!=
current workflowRevision
```

---

# 99. State → UI 行为

EMPTY：

```text
Prompt user to generate
```

READY：

```text
Run enabled
```

RUNNING：

```text
Cancel enabled
Run disabled
```

COMPLETED：

```text
show output
```

DIRTY_READY：

```text
show old output
show “workflow changed”
Run enabled
```

FAILED：

```text
Retry / edit
```

INTERRUPTED：

```text
Run again
```

---

# 100. Run Cost / Usage

Run metadata预留：

```ts
export interface CanvasRunUsage {
  readonly estimatedCost?: number
  readonly actualCost?: number
  readonly currency?: string

  readonly providerUsage?: Record<string, JsonValue>
}
```

V1 可以不展示。

但 Provider 层不要丢掉以后计费需要的信息。

---

# 101. Approval

昂贵视频未来可接 approval。

Browser Run 也必须通过 Host admission。

不能只在 Agent Tool 层做审批，否则 Browser 可绕过。

---

# 102. Security

禁止 Arbitrary:

```text
shell
python
javascript
http
eval
```

禁止任意 provider URL。

禁止 credential 下发 Browser。

Binary route 必须授权。

---

# 103. Resource Limits

至少：

```text
maxNodesPerWorkflow
maxEdgesPerWorkflow
maxWorkflowJsonBytes
maxPromptBytes
maxImageWidth
maxImageHeight
maxVideoDurationMs
maxOutputAssets
maxVideoBytes
maxConcurrentRunsPerSession
```

---

# 104. Projection Size

完整 Canvas Snapshot 必须保持 UI-scale。

不要加入：

- full run history；
- logs；
- binary；
- percent progress history；
- Provider raw response。

---

# 105. Workflow Migration

新增：

```text
migration.ts
```

流程：

```text
decode stored workflow
 ↓
schemaVersion
 ↓
migrate v1 → v2 → current
 ↓
validate
```

---

# 106. Migration 原则

历史 Event 不修改。

只在 decode/read 时：

```text
old shape
→ current runtime shape
```

如果无法迁移：

```text
fail loud
```

不要 silent data loss。

---

# 107. Node Migration

Node 可单独：

```text
nodeVersion
```

未来例如：

```text
image.generate v1
→ image.generate v2
```

避免整个 Workflow schema 频繁升级。

---

# 108. Image V1 必须能力

```text
text-to-image
image-edit
multi-result
reference image
history
regenerate
```

---

# 109. Video V1 必须能力

视频不再作为“可选”。

至少：

```text
text-to-video
image-to-video
video output playback
cancel
history
Browser close while Host live
```

高级：

```text
extend
concat
audio
timeline
```

后续做。

---

# 110. Image Region 编辑

V1 可以仅预留 seam。

P1/P2 再实现：

```text
select region
mask
inpaint
outpaint
```

Interaction Context 已能承载。

---

# 111. Mock Provider

正式 Provider 前必须完成。

测试：

```text
success
failure
timeout
retry
cancel
progress
multi-output
```

---

# 112. Real Provider 接入原则

只新增：

```text
provider plugin
model descriptors
```

不应该修改：

```text
Canvas Domain
Workflow Schema
Agent Tool 核心
UI 核心
```

如果接 Provider 必须大量修改以上模块，抽象失败。

---

# 113. Bundle

Host：

```text
canvas
media-workflow
media-provider registry
media-assets-local
jobs
attachment
```

Client：

```text
ui-canvas
```

Agent preset：

```text
tool-canvas
```

---

# 114. REAL Composition Tests

按仓库现有工程规则，产品可见插件必须有真实 composition 测试。

至少包含：

```text
session
session-projection
canvas
api-remotes
ui-canvas
tool-canvas
mock provider
```

---

# 115. Core E2E

## E2E-01

用户：

> 生成一张图片。

结果出现在 Minimal。

---

## E2E-02

切 Editor。

看到自动 Workflow：

```text
Prompt
 ↓
Image Generate
 ↓
Output
```

---

## E2E-03

Agent 改 Workflow。

Editor 更新。

---

## E2E-04

用户改 Workflow。

Agent `canvas_read` 获取最新状态。

---

## E2E-05

用户选某个节点：

> 把这个改成图生视频。

Agent 正确解析 selectedNodeId。

---

## E2E-06

生成 4 张图。

选择第 3 张作为 Primary。

---

## E2E-07

用户：

> 用这张生成视频。

使用当前 focused/selected image。

---

## E2E-08

Agent 与 UI 同时编辑。

旧 CAS 被拒绝，不 silent overwrite。

---

## E2E-09

Run progress 更新。

workflowRevision 不变化。

---

## E2E-10

Run rev12 运行时 Workflow 被改为 rev13。

Editor 正确显示：

```text
running rev12
current rev13
```

---

## E2E-11

Browser refresh。

Workflow、Layout、Output 都恢复。

---

## E2E-12

Browser 断线后重连。

Draft 不 silent loss。

---

## E2E-13

Undo / Redo。

产生新的合法 revisions。

---

## E2E-14

历史查看。

可恢复旧 Workflow，形成新 revision。

---

## E2E-15

再来一版。

创建 Variant，不覆盖之前方案。

---

## E2E-16

视频生成中 Browser 关闭。

Host job 继续。

---

## E2E-17

Host restart。

local run → interrupted。

---

## E2E-18

Cancel。

Provider operation 真正收到 cancel。

---

## E2E-19

Provider 临时 429。

按 retry policy retry，不创建重复收费 Run。

---

## E2E-20

Asset orphan。

超过 grace period 被 GC。

---

# 116. V1 正式验收

P0 架构：

- [ ] CanvasService
- [ ] Session event
- [ ] Projection
- [ ] CAS
- [ ] workflowRevision/runRevision
- [ ] Remote
- [ ] Agent Tool
- [ ] Minimal/Editor
- [ ] Interaction Context

P1 图片：

- [ ] text-to-image
- [ ] image-edit
- [ ] reference image
- [ ] multi-result
- [ ] primary output
- [ ] history
- [ ] variant
- [ ] image durable attachment
- [ ] Agent/UI 双向修改

P1 Editor：

- [ ] Node Library
- [ ] Graph
- [ ] Inspector
- [ ] Validation
- [ ] Node run state
- [ ] Undo/Redo
- [ ] persistent layout
- [ ] save state
- [ ] Asset Library

P1 视频：

- [ ] text-to-video
- [ ] image-to-video
- [ ] video asset store
- [ ] Range playback
- [ ] cancel
- [ ] history
- [ ] Browser close Host continue
- [ ] Host restart interrupted

Engineering：

- [ ] Mock Provider
- [ ] Real image Provider
- [ ] Real video Provider
- [ ] Jobs
- [ ] Retry
- [ ] Idempotency
- [ ] Migration
- [ ] GC
- [ ] Real composition tests

---

# 117. P2 后续增强

P2：

```text
inpaint
outpaint
mask editor
partial run UI
node output cache
smart rebase
durable video resume
provider cost display
workflow import/export UI
workflow templates
multiple Canvas documents
```

---

# 118. 开发阶段

## Phase 0

建立：

```text
feature/media-canvas
```

---

## Phase 1：Domain

创建 `packages/canvas/canvas`。

实现：

```text
types
snapshot
workflow
run
output
variant
errors
migration seam
```

---

## Phase 2：Fold / Invariant

实现：

```text
decode
migration
fold
CAS invariants
revision invariants
```

---

## Phase 3：CanvasService

先：

```text
get
replace
edit
restore
createVariant
selectOutput
clear
```

不跑 Provider。

---

## Phase 4：Projection

实现：

```text
canvas
canvasLayout
```

---

## Phase 5：Remote

实现所有 mutation。

History Remote 可同时加入。

---

## Phase 6：UI Skeleton

先 JSON Debug。

证明完整闭环。

---

## Phase 7：Minimal / Editor

实现双模式。

---

## Phase 8：Interaction Context

把 selected node / asset / output 注入下一次 Agent turn。

这是进入 Agent 工具前必须完成的关键链路。

---

## Phase 9：Editor Graph

加入 XYFlow / React Flow adapter。

实现：

```text
add
delete
connect
disconnect
layout
inspector
validation
undo/redo
copy/paste
```

---

## Phase 10：Media Workflow Engine

实现：

```text
registry
static validate
runtime validate seam
scheduler
partial target API
fingerprint seam
```

---

## Phase 11：Provider Registry + Model Registry

创建统一 capability/model 描述。

---

## Phase 12：Mock Provider

先完整覆盖图片。

---

## Phase 13：Run + Node State

CanvasService：

```text
run
cancel
node lifecycle
```

---

## Phase 14：Attachment

图片 durable save。

---

## Phase 15：Agent Tool

实现：

```text
read
inspect
generate
write
edit
run
cancel
```

---

## Phase 16：Image E2E

完成图片 V1。

---

## Phase 17：History / Variant

加入：

```text
listRuns
restore
variant
multi-output
```

---

## Phase 18：Jobs / Retry / Admission

正式后台运行。

---

## Phase 19：Real Image Provider

替换 Mock。

---

## Phase 20：Video Asset Store

HTTP Range。

---

## Phase 21：Mock Video

先走完整视频链路。

---

## Phase 22：Real Video Provider

完成 V1 视频验收。

---

## Phase 23：Reconciler / GC

处理 interrupted / orphan。

---

## Phase 24：Progress

最后加入 ephemeral progress event。

---

# 119. 推荐 PR 拆分

```text
PR01 canvas domain + migration + fold
PR02 canvas service + projection
PR03 canvas remote + history remote
PR04 ui-canvas skeleton
PR05 interaction context
PR06 editor + layout + validation
PR07 media-workflow engine
PR08 provider/model registries + mock
PR09 run/node lifecycle + attachment
PR10 agent tools + preset
PR11 image E2E + real provider
PR12 history + variant + multi-output
PR13 jobs + retry + idempotency + admission
PR14 video assets
PR15 video provider
PR16 reconciler + GC + progress
```

---

