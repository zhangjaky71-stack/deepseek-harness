# 150. Fallback 模式

用户只说：

> 生成 10 秒竖屏视频。

系统可以：

```text
requirements
 ↓
Model Registry
 ↓
部署 routing policy
 ↓
选择兼容 model
```

最终实际 provider/model 要写进 provenance。

---

# 151. Feature Flag

为了灰度开发与快速关闭高风险能力，应提供 Feature Flags。

建议至少：

```text
canvas.enabled
canvas.editor.enabled
canvas.history.enabled
canvas.video.enabled
canvas.variants.enabled
canvas.partialRun.enabled
canvas.regionEdit.enabled
canvas.providerFallback.enabled
```

---

# 152. Feature Flag Enforcement

Feature Flag 也必须 Host enforce。

例如：

```text
canvas.video.enabled = false
```

则：

- UI 不显示视频节点；
- Agent Tool 不应建议视频能力；
- CanvasService run 也拒绝 video node。

不能只隐藏前端按钮。

---

# 153. Node Deprecation

节点会发生生命周期变化。

Node Definition 增加：

```ts
export interface MediaNodeLifecycle {
  readonly deprecated?: boolean

  readonly creatable?: boolean
  readonly executable?: boolean

  readonly replacementType?: MediaWorkflowNodeType
  readonly deprecationMessage?: string
}
```

---

# 154. Deprecated Node 场景

例如：

```text
image.generate.legacy
```

旧 Workflow 仍然存在。

策略可能是：

```text
creatable = false
executable = true
deprecated = true
replacement = image.generate
```

这样：

- 新 Workflow 不能创建；
- 旧 Workflow 仍能跑；
- Editor 提示迁移；
- Migration 可以未来自动转换。

---

# 155. Removed Node

如果节点由于安全或 Provider 永久下线：

```text
executable = false
```

旧 Workflow 打开时：

```text
Editor 显示 Unsupported / Deprecated
Run Validation 阻止执行
```

但不能直接导致整个 Session 无法打开。

---

# 156. Prompt / 数据保留

必须明确不同数据的 retention：

```text
User prompt
Semantic Workflow config
Provider request summary
Provider raw response
Generated assets
Run history
Audit metadata
Logs
```

---

# 157. Data Retention Principle

默认：

```text
Session 中保存完成业务重放所需的数据
```

不默认保存：

```text
Provider 原始 request body
Provider 原始 response body
API credentials
完整敏感 HTTP headers
```

---

# 158. Logging Redaction

日志必须禁止：

```text
API key
Authorization header
signed callback secret
credential
raw binary
```

Prompt 是否记录到日志，应服从 Harness 全局隐私日志策略。

不要在 Canvas 自己另开“完整 prompt debug log”。

---

# 159. Content Safety / Provider Rejection

Provider failure 需要细分。

建议：

```ts
export type MediaRunFailureKind =
  | 'validation'
  | 'rejected'
  | 'unsupported'
  | 'quota'
  | 'provider-temporary'
  | 'provider-permanent'
  | 'network'
  | 'permission'
  | 'infrastructure'
```

---

# 160. Rejected != Provider Error

例如内容策略拒绝：

```text
rejected
```

不应该：

```text
自动换 Provider
自动无限 Retry
```

尤其不能将 fallback 设计成绕过内容安全限制。

---

# 161. Retry Safety

Retry Policy 必须接受错误分类。

例如：

```text
429 → retry
timeout before provider accepted → retry
temporary polling failure → retry

content rejected → no retry
invalid input → no retry
permission → no retry
unsupported → no retry
```

---

# 162. 全局并发与 Backpressure

除了：

```text
1 active run / Session
```

还需要 Host / Provider 级限制。

建议：

```text
maxConcurrentImageRuns
maxConcurrentVideoRuns
maxConcurrentRunsPerProvider
maxQueuedRuns
queueTimeoutMs
```

---

# 163. Provider Concurrency

不同 Provider 可有不同：

```text
Provider A images = 20 concurrent
Provider B videos = 3 concurrent
```

不要用一个全局 semaphore 解决所有能力。

---

# 164. Queue State

CanvasRunStatus 已有：

```text
queued
running
```

Queued 可以真实表达：

```text
Waiting for global capacity
Waiting for provider capacity
Waiting for quota approval
```

如果 approval 是人工等待，是否进入同一 `queued` 或单独状态，实际接审批机制时再定。

---

# 165. Queue Timeout

如果排队超过限制：

```text
fail with infrastructure/quota-like error
```

不能永久 queued。

---

# 166. Backpressure 原则

当全局容量不足：

```text
排队 / 明确拒绝
```

不能：

```text
无限创建 Promise
无限创建 Provider task
```

---

# 167. Observability

生产级 Canvas 必须有统一关联 ID。

至少：

```text
sessionId
canvasId
workflowId
workflowRevision
variantId
runId
jobId
nodeId
providerId
modelId
requestId
correlationId
```

---

# 168. Metrics

建议至少：

```text
canvas_run_started_total
canvas_run_completed_total
canvas_run_failed_total
canvas_run_cancelled_total
canvas_run_interrupted_total

canvas_run_duration_ms
canvas_queue_duration_ms
canvas_provider_duration_ms
canvas_asset_save_duration_ms

canvas_retry_total
canvas_provider_failure_total

canvas_active_runs
canvas_queued_runs

canvas_workflow_node_count
canvas_workflow_json_bytes
```

具体 telemetry API 以仓库现有能力为准。

---

# 169. Provider Metrics

按：

```text
providerId
modelId
capability
```

分维度观察：

```text
latency
429
5xx
rejection
timeout
cancel
```

但注意避免高基数 label（例如 runId 不作为 metric label）。

---

# 170. Tracing / Structured Logs

Run 生命周期：

```text
Admission
Job start
Node start
Provider request
Provider complete
Asset save
Canvas commit
Projection publish
```

最好可通过同一个 correlationId 串起来。

---

# 171. UI Error Trace

UI 可显示一个安全的：

```text
error reference / request id
```

供排查。

不要把内部 stack trace 直接暴露给用户。

---

# 172. Chaos / Failure Injection 测试

异步媒体链路必须主动测试失败，不只测试 happy path。

建议 Mock Provider / test fixtures 支持注入：

```text
delay
timeout
429
5xx
rejection
cancel race
duplicate completion
out-of-order status
callback replay
```

---

# 173. 必测 Failure Case

至少：

```text
Provider 已成功，但 Asset 保存失败
Provider + Asset 成功，但 Session append 失败
Session append 成功，但 Projection client 暂时掉线
Job cancel 与 Provider complete 同时发生
Host restart during running
Host restart after provider accepted task
duplicate webhook
polling temporary failure
stale Browser edit
Agent/UI concurrent mutation
queue timeout
quota rejection
```

---

# 174. Terminal State Race

例如：

```text
User Cancel
同时
Provider Completed
```

必须制定 winner / reconciliation 规则。

建议：

- durable terminal state 单调；
- Provider 已完成且结果 durable 保存成功时，可由业务规则决定 completed 是否优先；
- 如果 cancel 已 durable commit 后才收到 completion，默认不应把 cancelled 改回 completed；
- late result 可成为 orphan 并由 GC 处理。

具体策略必须通过测试固定，不能靠 race timing。

---

# 175. Golden Migration Fixtures

仓库应保存真实固定样本：

```text
tests/fixtures/
├── workflow-v1.json
├── canvas-snapshot-v1.json
├── canvas-layout-v1.json
├── run-history-v1.json
└── deprecated-node-v1.json
```

未来 schema 升级：

```text
old fixture
 ↓
migration
 ↓
current schema
 ↓
invariant
```

---

# 176. Golden Fixture 原则

Fixture 不随着 migration 直接被覆盖。

它们代表真实历史数据。

新版本新增：

```text
workflow-v2.json
```

而不是把 `workflow-v1.json` 改成 V2 shape。

---

# 177. Agent Intent Semantics

需要在 Tool 文档中正式约定用户语言到业务动作的倾向。

## “修改一下 / 调整 / 改成”

默认：

```text
edit current workflow
```

---

## “重新生成 / 再生成一次”

默认：

```text
same workflow
new run
```

不是新 Variant。

---

## “再来一版 / 另做一个方案 / 换一种方向”

默认：

```text
create Variant
```

---

## “从头做 / 新建一个”

默认：

```text
new workflow / new variant root
```

具体是否彻底清 current workflow 需要结合产品入口，但不应默默覆盖历史。

---

# 178. Agent Intent 不应完全靠 Prompt 猜

Canvas Tool Schema 应提供显式动作：

```text
edit
regenerate
createVariant
replaceWorkflow
```

让 Agent 可以表达不同语义。

---

# 179. Asset Scope

V1 Asset Library 默认：

```text
Current Session only
```

可以使用：

- 当前上传；
- 当前 Session 历史输出；
- 当前 Session 当前 Canvas 引用。

---

