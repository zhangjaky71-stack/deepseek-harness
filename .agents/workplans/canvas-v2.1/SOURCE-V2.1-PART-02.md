# 30. Run 与 Variant 不等价

一个 Variant 可以运行多次：

```text
Variant B
 ├── Run 1
 ├── Run 2
 └── Run 3
```

Run 是执行记录。

Variant 是用户心智里的“方案”。

---

# 31. 多候选结果

图片节点支持：

```ts
interface ImageGenerationConfig {
  count?: number
}
```

例如 count=4。

输出：

```text
image 1
image 2
image 3
image 4
```

CanvasOutput：

```ts
export interface CanvasOutput {
  readonly runId: CanvasRunId
  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number

  readonly assets: readonly CanvasAssetRef[]
  readonly primaryAssetIndex: number
}
```

---

# 32. Primary Output

用户可以：

```text
选第 3 张
 ↓
Set Primary
```

此动作不重新运行 Provider。

只更新：

```text
primaryAssetIndex
```

并产生合法 Canvas change。

---

# 33. Output Provenance

每个输出必须能追溯：

```ts
export interface MediaAssetProvenance {
  readonly canvasId: CanvasId
  readonly runId: CanvasRunId
  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number
  readonly nodeId: WorkflowNodeId

  readonly providerId?: string
  readonly modelId?: string

  readonly createdAt: number
}
```

---

# 34. Artifact Metadata

统一保留：

```ts
export interface MediaArtifactMetadata {
  readonly mediaType: string
  readonly size: number

  readonly width?: number
  readonly height?: number
  readonly durationMs?: number

  readonly createdAt: number

  readonly provenance?: MediaAssetProvenance
}
```

---

# 35. 图片资产

继续复用：

```text
ctx.attachments
```

图片 bytes 不进入 Session。

---

# 36. 视频资产

独立：

```text
ctx.mediaAssets
```

```ts
export abstract class MediaAssetStore extends Service {
  abstract saveVideo(
    input: SaveVideoAsset
  ): Promise<VideoAssetRef>

  abstract readVideo(
    ref: VideoAssetRef,
    range?: ByteRange,
    signal?: AbortSignal,
  ): Promise<StoredVideoAsset>
}
```

---

# 37. CanvasAssetRef

```ts
export type CanvasAssetRef =
  | {
      readonly kind: 'image'
      readonly image: ImageAttachmentRef
    }
  | {
      readonly kind: 'video'
      readonly video: VideoAssetRef
    }
```

---

# 38. Asset Library

Editor 增加 Asset Library。

来源：

```text
Uploads
Generated outputs
Current Session history
```

用户可：

```text
拖 Asset 到 Graph
 ↓
自动创建 asset.input
```

---

# 39. Asset 生命周期

必须区分：

```text
Referenced
Historical reference
Orphan
Deleted logically
GC eligible
```

---

# 40. Asset 删除语义

UI “删除”默认：

```text
解除当前引用 / 逻辑删除
```

不直接删除 binary。

真正 binary 删除由 GC。

否则 Session History 可能引用已经被删的内容。

---

# 41. Asset GC

增加策略：

```text
Referenced by current Canvas → keep
Referenced by history within retention → keep
Orphan older than grace period → delete
Explicitly retained → keep
```

配置：

```text
orphanGracePeriod
historyRetention
maxStorageBytes
```

---

# 42. Provider 成功但 Commit 失败

流程：

```text
Provider success
 ↓
Asset durable save
 ↓
Session commit
```

如果 Session commit 失败：

- 不再次生成；
- Asset 暂时 orphan；
- GC 后续回收。

---

# 43. Canvas Run

```ts
export type CanvasRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
```

---

# 44. Node-level Run State

```ts
export type CanvasNodeRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cached'
```

```ts
export interface CanvasNodeRunSnapshot {
  readonly nodeId: WorkflowNodeId
  readonly status: CanvasNodeRunStatus

  readonly startedAt?: number
  readonly finishedAt?: number

  readonly outputs?: readonly CanvasAssetRef[]

  readonly error?: CanvasRunError
}
```

---

# 45. CanvasRunSnapshot

```ts
export interface CanvasRunSnapshot {
  readonly id: CanvasRunId
  readonly jobId?: JobId

  readonly status: CanvasRunStatus

  readonly workflowId: MediaWorkflowId
  readonly workflowRevision: number

  readonly activeNodeId?: WorkflowNodeId

  readonly nodes: Readonly<
    Record<WorkflowNodeId, CanvasNodeRunSnapshot>
  >

  readonly startedAt: number
  readonly finishedAt?: number

  readonly error?: CanvasRunError
}
```

---

# 46. Run 冻结 Workflow

运行时必须复制：

```text
Workflow Revision N
```

形成 immutable run input。

用户编辑到 N+1 不影响当前运行。

UI 必须明确显示：

```text
Running Revision 12
Current Workflow Revision 13
```

---

# 47. Partial Execution

Engine API 从一开始预留：

```ts
export interface MediaWorkflowExecutionTarget {
  readonly mode:
    | 'all'
    | 'selected'
    | 'from-node'
    | 'downstream'

  readonly nodeIds?: readonly WorkflowNodeId[]
}
```

V1 UI 可以只开放：

```text
Run All
```

但底层不能写死“永远全跑”。

---

# 48. Fingerprint

为缓存 / 局部运行预留：

```ts
export interface NodeExecutionFingerprint {
  readonly nodeType: string
  readonly nodeVersion: number

  readonly modelId?: string

  readonly normalizedConfigHash: string

  readonly inputAssetHashes: readonly string[]
}
```

---

# 49. Cache Policy

节点定义必须声明：

```text
deterministic
```

例如：

```text
resize → deterministic → 可安全缓存
```

```text
text-to-image → non-deterministic → 默认不自动复用
```

即使参数相同，也不能默认缓存所有生成节点。

---

# 50. Retry 与 Regenerate

必须区分：

```text
Retry
=
同一个 Run 因临时错误继续尝试

Regenerate
=
用户主动创建新 Run
```

两者历史、随机性、计费不同。

---

# 51. Retry Policy

错误分类：

```text
429
network timeout
provider 5xx
polling temporary failure
```

可 Retry。

以下通常不 Retry：

```text
invalid prompt
unsupported model
content rejection
invalid dimensions
permission
```

建议：

```text
maxRetries
exponentialBackoff
jitter
```

---

# 52. Idempotency

Provider 支持 Idempotency Key 时：

```text
CanvasRunId + NodeId + attempt identity
```

避免网络 Retry 产生多个收费任务。

---

# 53. Run Admission

`CanvasService.run()` 不直接执行。

完整流程：

```text
Workflow static validation
 ↓
Workflow runtime validation
 ↓
Capability validation
 ↓
Asset availability
 ↓
Permission
 ↓
Concurrency
 ↓
Quota
 ↓
Cost / approval
 ↓
Provider availability
 ↓
Job start
```

---

# 54. Static Validation

检查：

- DAG；
- node id；
- edge id；
- port；
- cycle；
- config shape；
- output node；
- type compatibility。

---

# 55. Runtime Validation

检查：

- model 是否存在；
- Provider 是否可用；
- Asset 是否仍可访问；
- 当前 deployment 是否支持该 capability；
- 尺寸是否允许；
- 视频时长是否允许；
- quota；
- permission。

---

# 56. Validation UI

Editor 必须实时显示：

```text
fatal errors
warnings
```

例如：

```text
Image Generate 缺少 Prompt
Video node 使用当前 Provider 不支持的时长
Output 未连接
```

Fatal error 时 Run Button 禁用。

---

# 57. Provider 与 Model 分层

Provider：

```ts
export interface MediaProviderDescriptor {
  readonly id: string
  readonly displayName: string
}
```

Model：

```ts
export interface MediaModelDescriptor {
  readonly id: string
  readonly providerId: string
  readonly displayName: string

  readonly capabilities: readonly MediaCapability[]

  readonly inputs?: {
    readonly maxReferenceImages?: number
    readonly supportsMask?: boolean
  }

  readonly image?: {
    readonly sizes?: readonly string[]
    readonly aspectRatios?: readonly string[]
  }

  readonly video?: {
    readonly durationsMs?: readonly number[]
    readonly aspectRatios?: readonly string[]
    readonly supportsAudio?: boolean
  }

  readonly features?: {
    readonly seed?: boolean
    readonly negativePrompt?: boolean
  }
}
```

---

# 58. Model Registry

建议：

```text
ctx.mediaModels
```

API：

```ts
register(model: MediaModelDescriptor): () => void
get(modelId: string): MediaModelDescriptor | undefined
list(capability?: MediaCapability): readonly MediaModelDescriptor[]
```

Editor Inspector、Agent Tool、Validator 都读同一 Registry。

---

# 59. Provider Resolution

用户明确指定：

```text
model X
```

必须 strict。

不能悄悄换模型。

用户只说：

```text
生成一张图
```

可以按部署默认 routing。

---

