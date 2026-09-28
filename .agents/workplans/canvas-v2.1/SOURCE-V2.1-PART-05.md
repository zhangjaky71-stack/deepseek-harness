# 120. Code Review Checklist

每个 PR 必查：

- [ ] 有没有绕过 CanvasService？
- [ ] 有没有第二份 Authority？
- [ ] 有没有 Provider SDK 泄漏到 Domain？
- [ ] 有没有 React Flow 类型进入 Workflow？
- [ ] 有没有 binary 进入 Session？
- [ ] 是否 atomic commit？
- [ ] workflowRevision/runRevision 是否正确？
- [ ] Layout 是否误改 Workflow revision？
- [ ] 是否有 migration？
- [ ] 是否考虑 stale？
- [ ] 是否支持 disposal？
- [ ] 是否 bounded？
- [ ] 是否支持 retry/idempotency？
- [ ] 是否权限检查在 Host？
- [ ] 是否有 README？
- [ ] 是否有 invariant？
- [ ] 是否有 REAL composition test？

---

# 121. 第一里程碑

不接真实 Provider。

必须做到：

```text
Browser edit
 ↓
Canvas Remote
 ↓
CanvasService
 ↓
Session
 ↓
Projection
 ↓
Browser

Agent read
 ↓
看到同一 Workflow
```

并且：

```text
刷新后 Workflow + Layout 仍在
```

---

# 122. 第二里程碑

Mock Image：

```text
Agent generate
 ↓
implicit workflow
 ↓
Mock Provider
 ↓
Attachment
 ↓
Minimal output
```

Editor 能看到 Workflow。

---

# 123. 第三里程碑

完整图片产品：

```text
多结果
History
Variant
Reference Image
Agent Selection Context
Undo/Redo
Layout
Real Provider
```

---

# 124. 第四里程碑

完整 V1 视频：

```text
text-to-video
image-to-video
video asset
Range playback
Jobs
Cancel
History
Host restart interrupted
```

---

# 125. 最终产品能力定义

最终用户应该能完成：

```text
“生成四张咖啡海报”
        ↓
看到四张结果
        ↓
选择第 2 张
        ↓
“把这张背景变成黑色”
        ↓
Agent 知道“这张”是什么
        ↓
生成修改版本
        ↓
“再来一版”
        ↓
创建 Variant
        ↓
切换 Editor
        ↓
看到完整 Workflow
        ↓
手动修改节点
        ↓
Agent 继续读取这些修改
        ↓
“用这张生成 10 秒竖屏视频”
        ↓
Image-to-Video Workflow
        ↓
后台运行
        ↓
Canvas 显示视频结果
```

这一条链就是本项目的真正产品验收目标。

---

# 126. 最终结论

V2 的重点不是增加更多节点，而是把 Canvas 从：

```text
“一个可执行 DAG 编辑器”
```

升级为：

```text
“Agent 与用户共同操作的生成式媒体工作台”
```

真正需要稳定的不是某个 Provider，而是这五个核心：

```text
1. One Durable Canvas State
2. Agent + Human Shared Editing
3. Minimal + Editor Shared Workflow
4. Media History / Variant / Provenance
5. Extensible Execution + Provider Architecture
```

只要这五层正确，后续增加新的图片、视频、音频或媒体模型，都只是能力扩展，而不是重做系统。

---

# 127. 后续实现时的唯一基线

从 V2 开始，后续开发默认不再重新讨论以下事项：

```text
Canvas 与 Session 绑定
Agent 与 Browser 共用 CanvasService
所有生成 workflow-backed
Minimal / Editor 共享同一个 Domain
Interaction Context 支持指代
History 不塞 Projection
Layout 独立持久化
Workflow mutation 原子化
图片走 Attachment
视频走独立 Media Asset
Provider / Model 分层
Run admission / retry / idempotency
Host restart V1 → interrupted
视频属于 V1 正式验收
```

除非产品目标发生明显变化，否则后续直接进入实现。

---

# 128. V2.1 Production Hardening 目标

V2.1 不改变 V2 已确定的核心产品模型，也不继续扩大 Canvas 的功能边界。

它解决的是：

```text
V2
=
功能和架构正确

V2.1
=
能够更安全、更可控、更容易运维地进入长期开发与生产环境
```

V2.1 重点补足以下领域：

```text
Authorization / Multi-tenant
Quota / Cost
Provider Async Callback
Model Requirement Resolution
Feature Flags
Node Deprecation
Audit
Data Retention
Content Safety
Global Concurrency / Backpressure
Observability
Failure Injection / Chaos
Golden Migration Fixtures
Agent Intent Semantics
Asset Scope
```

这部分完成后，后续原则上应停止继续扩大总体架构设计，转入实际实现。

---

# 129. Canvas Authorization / 多租户权限模型

当前 Canvas 绑定 Session，但生产环境不能只依赖“拿到 SessionId 就允许操作”。

应新增统一 Host 侧授权层：

```text
CanvasAuthorizationService
```

推荐职责：

```ts
export abstract class CanvasAuthorizationService extends Service {
  abstract authorize(
    request: CanvasAuthorizationRequest,
  ): Promise<CanvasAuthorizationDecision>
}
```

---

# 130. Canvas 权限动作

至少定义：

```ts
export type CanvasPermission =
  | 'canvas.read'
  | 'canvas.edit'
  | 'canvas.run'
  | 'canvas.cancel'
  | 'canvas.history.read'
  | 'canvas.asset.read'
  | 'canvas.asset.export'
  | 'canvas.asset.delete'
  | 'canvas.workflow.restore'
  | 'canvas.variant.create'
  | 'canvas.layout.write'
```

后续如果出现共享 Session，可再增加：

```text
canvas.share
canvas.manage
```

---

# 131. Authorization Request

```ts
export interface CanvasAuthorizationRequest {
  readonly actor: CanvasActor

  readonly sessionId: SessionId
  readonly canvasId?: CanvasId

  readonly permission: CanvasPermission

  readonly resource?: {
    readonly runId?: CanvasRunId
    readonly asset?: CanvasAssetRef
    readonly workflowId?: MediaWorkflowId
  }
}
```

授权必须发生在 Host。

---

# 132. Authorization Enforcement Points

以下入口必须统一调用 Authorization：

```text
Canvas Remote
Canvas Agent Tool
Canvas History Query
Run Admission
Video Binary Route
Image Asset Read
Asset Export
Asset Delete
Workflow Restore
Variant Create
```

禁止：

```text
UI 隐藏按钮
=
权限控制
```

UI 只负责表现权限结果。

---

# 133. Actor 模型

为了 Audit 和 Authorization，统一定义：

```ts
export type CanvasActor =
  | {
      readonly kind: 'human'
      readonly userId?: string
    }
  | {
      readonly kind: 'agent'
      readonly agentId?: string
    }
  | {
      readonly kind: 'system'
      readonly component: string
    }
```

例如：

```text
human
agent
system:reconciler
system:gc
```

---

# 134. CanvasChange Audit Metadata

建议所有 durable mutation 都带：

```ts
export interface CanvasChangeMeta {
  readonly actor: CanvasActor

  readonly source:
    | 'agent-tool'
    | 'browser-remote'
    | 'system-reconciler'
    | 'system-gc'
    | 'migration'

  readonly requestId?: string
  readonly correlationId?: string

  readonly reason?: string
}
```

`CanvasChange`：

```ts
export interface CanvasChange {
  readonly kind: 'canvas/change'
  readonly version: number

  readonly operation: CanvasOperation
  readonly canvas: CanvasSnapshot | null

  readonly meta: CanvasChangeMeta
}
```

---

# 135. Audit 的产品价值

有了 Actor / Source，History 可以表现：

```text
18:21 你修改了 Image Generate 的尺寸
18:22 Agent 修改了 Prompt
18:23 系统启动 Run
18:25 系统完成 Run
18:27 系统因 Host 重启将 Run 标记为 interrupted
```

同时便于：

- Debug；
- 企业审计；
- 冲突分析；
- 安全追踪；
- 用户解释。

---

# 136. Quota / Cost Budget

视频生成属于高成本能力。

Run Admission 必须预留：

```text
User quota
Workspace/Tenant quota
Session quota
Provider quota
Daily spend
Per-run budget
Approval threshold
```

---

# 137. Quota Service Seam

建议抽象：

```ts
export interface CanvasQuotaRequest {
  readonly actor: CanvasActor
  readonly sessionId: SessionId
  readonly capability: MediaCapability
  readonly modelId: string
  readonly estimatedUsage: MediaEstimatedUsage
}
```

```ts
export abstract class CanvasQuotaService extends Service {
  abstract check(
    request: CanvasQuotaRequest,
  ): Promise<CanvasQuotaDecision>
}
```

如果当前 Harness 已有统一额度/审批服务，实际实现应优先适配现有 seam，而不是重复造服务。

---

# 138. Media Estimated Usage

```ts
export interface MediaEstimatedUsage {
  readonly imageCount?: number
  readonly imagePixels?: number

  readonly videoDurationMs?: number
  readonly videoPixelsPerFrame?: number

  readonly estimatedCost?: number
  readonly currency?: string
}
```

允许 Provider 无法准确报价：

```text
estimatedCost = undefined
```

不能伪造成本。

---

# 139. Budget Rules

建议配置：

```yaml
canvas:
  maxConcurrentRunsPerSession: 1
  maxEstimatedCostPerRun: ...
  dailyBudgetPerUser: ...
  approvalThreshold: ...
```

具体值由部署环境确定。

Domain 不写死金额。

---

# 140. Cost / Usage Durable Metadata

`CanvasRunSnapshot` 或关联 history metadata 应预留：

```ts
export interface CanvasRunUsage {
  readonly estimatedCost?: number
  readonly actualCost?: number
  readonly currency?: string

  readonly providerUsage?: Readonly<Record<string, JsonValue>>
}
```

Provider 原始敏感响应不得直接写入这里。

只保留安全、必要、可序列化的 usage summary。

---

# 141. Run Admission 最终顺序

V2.1 固化为：

```text
1. Authorization
2. Static Workflow Validation
3. Runtime Workflow Validation
4. Asset Availability
5. Model Requirement Resolution
6. Provider Availability
7. Concurrency / Backpressure
8. Quota
9. Cost Estimate
10. Approval（如需要）
11. Idempotency Check
12. Job Start
```

任何一步失败：

```text
不得启动 Provider task
```

---

# 142. Provider 异步执行模式

图片 Provider 可能同步返回。

视频 Provider 经常是：

```text
create task
→ providerTaskId
→ polling
→ completed
```

也可能：

```text
create task
→ webhook callback
```

Media Provider 抽象不能只假定一种模式。

---

# 143. Provider Execution Handle

建议：

```ts
export interface MediaProviderOperation {
  readonly providerTaskId?: string

  readonly mode:
    | 'inline'
    | 'polling'
    | 'callback'

  cancel(reason?: string): Promise<void> | void

  readonly result: Promise<MediaExecutionResult>

  poll?(
    signal: AbortSignal
  ): Promise<MediaProviderPollResult>

  resume?(
    providerTaskId: string,
    signal: AbortSignal
  ): Promise<MediaExecutionResult>
}
```

具体签名以实现时现有代码习惯为准。

重要的是 Provider 抽象必须允许：

```text
inline
poll
callback
resume
cancel
```

---

# 144. Provider Callback / Webhook

如果某 Provider 使用 callback：

```text
Provider
 ↓
Host callback endpoint
 ↓
verify signature
 ↓
lookup providerTaskId
 ↓
lookup CanvasRunId / NodeId
 ↓
idempotent state transition
```

必须验证：

- Provider signature；
- timestamp / replay protection；
- providerTaskId ownership；
- terminal state 是否已经处理。

---

# 145. Duplicate Callback

Webhook 可能重复。

因此：

```text
completed callback
completed callback
```

必须幂等。

不能：

```text
重复保存两次结果
重复增加 Run revision
重复收费记录
```

---

# 146. Out-of-order Provider Status

可能收到：

```text
completed
↓
running
```

或 polling 产生旧状态。

状态机必须拒绝 terminal → non-terminal 回退。

例如：

```text
completed
cancelled
failed
```

都是 terminal。

---

# 147. Model Requirement Resolver

Agent 和 UI 不应该自己写：

```text
if 9:16 + 10s → model X
```

建议新增统一需求解析：

```ts
export interface MediaModelRequirements {
  readonly capability: MediaCapability

  readonly aspectRatio?: string
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number

  readonly referenceImageCount?: number

  readonly requiresMask?: boolean
  readonly requiresSeed?: boolean
  readonly requiresAudio?: boolean
}
```

---

# 148. resolveMediaModel()

```ts
resolveMediaModel(
  requirements: MediaModelRequirements,
  options?: {
    preferredModelId?: string
    routingMode?: 'strict' | 'fallback'
  },
): MediaModelResolution
```

返回：

```ts
export interface MediaModelResolution {
  readonly model: MediaModelDescriptor
  readonly provider: MediaProviderDescriptor

  readonly warnings?: readonly string[]
}
```

---

# 149. Strict 模式

用户明确：

> 使用 Model X。

如果 X 不支持：

```text
10 秒视频
```

应明确失败。

不能静默切 Model Y。

---

