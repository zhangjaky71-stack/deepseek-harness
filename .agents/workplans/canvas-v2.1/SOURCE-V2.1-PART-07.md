# 180. 暂不跨 Session 搜 Asset

V1 不默认：

```text
用户所有历史 Session 图片
```

全部暴露给 Canvas。

原因：

- 权限复杂；
- 隐私范围扩大；
- 搜索/索引复杂；
- Agent context 更难控制。

未来如果要跨 Session，建议引入显式：

```text
Asset Collection / Library
```

而不是偷偷扩大 current Canvas Asset scope。

---

# 181. Asset Export

V1 产品闭环应支持：

```text
Open original image
Export/download original image
Play/export original video
```

导出读取必须经过 authorization。

---

# 182. Workflow Export

Workflow JSON 导出可以 P2。

但 V1 Domain 必须确保：

```text
JSON serializable
credential-free
UI-library-free
schema-versioned
```

---

# 183. Feature / Capability UI

Node Library 应根据：

```text
Feature Flags
+
Model Registry
+
Authorization
+
Deployment Capability
```

决定节点是否显示/可用。

例如：

```text
video feature disabled
→ 不显示 video nodes
```

但旧 Workflow 中已有 video node 仍需安全打开，并显示 unavailable 状态。

---

# 184. Browser / Mobile Strategy

V1 建议：

```text
Desktop
→ Minimal + full Editor

Narrow/mobile
→ Minimal first
→ Editor 可进入简化/全屏模式
```

不能因为 DAG 在手机难操作，就让 Canvas 整体不可用。

---

# 185. Lifecycle / Disposal

必须明确：

```text
Browser View unload
≠
cancel Run
```

```text
Browser refresh
≠
cancel Run
```

Plugin unload：

- listener dispose；
- Registry unregister；
- subscriptions dispose。

Host shutdown：

- 按 Jobs / Provider 语义执行 cancel 或 interruption；
- 不遗留 pending event listener。

---

# 186. Production Configuration

建议最终将配置分层：

```text
CanvasConfig
MediaWorkflowConfig
MediaProviderConfig
MediaAssetConfig
CanvasFeatureConfig
CanvasQuotaConfig
```

避免一个巨大的 `canvas.config`。

---

# 187. Feature Flag 默认原则

危险 / 高成本功能默认：

```text
explicit enable
```

例如：

```text
video
provider fallback
region edit
```

具体默认值取决于产品发布策略。

---

# 188. V2.1 新增验收标准

Production Hardening 完成需满足：

- [ ] Remote / Tool / Asset Route 共用 Host authorization。
- [ ] Canvas mutation 有 Actor / Source audit metadata。
- [ ] Run Admission 包含权限、能力、并发、Quota seam。
- [ ] Provider operation 支持 async task abstraction。
- [ ] callback 可校验签名并幂等。
- [ ] duplicate callback 不产生重复结果。
- [ ] terminal state 不允许乱序回退。
- [ ] Model Requirement Resolver 可根据 capability/尺寸/时长筛选模型。
- [ ] strict model request 不会 silent fallback。
- [ ] Feature Flag 在 Host enforce。
- [ ] Deprecated Node 可打开、提示、限制创建或运行。
- [ ] Content rejection 不自动 fallback 绕过。
- [ ] Retry 只针对可重试错误。
- [ ] 全局/Provider 并发有上限。
- [ ] Queue 有容量和 timeout。
- [ ] 关键 Run 指标可观测。
- [ ] correlationId 可串联一次 Run。
- [ ] Mock Provider 支持故障注入。
- [ ] Golden migration fixtures 固定。
- [ ] Asset Library V1 限定当前 Session。
- [ ] 原始媒体导出受 authorization 控制。

---

# 189. V2.1 新增测试矩阵

## Authorization

```text
human read allowed
human edit denied
agent run allowed
asset read unauthorized
history unauthorized
```

---

## Quota

```text
under quota
over quota
cost threshold
approval-required seam
```

---

## Model Resolver

```text
text-to-image supported
9:16 supported
duration unsupported
mask unsupported
strict preferred model mismatch
fallback selects valid model
```

---

## Provider Callback

```text
valid signature
invalid signature
duplicate callback
late callback after cancel
out-of-order state
unknown providerTaskId
```

---

## Backpressure

```text
provider concurrency full
global queue full
queue timeout
capacity released starts queued run
```

---

## Retry

```text
429 retries
5xx retries
invalid input no retry
rejected no retry
idempotent retry no duplicate provider task
```

---

## GC

```text
current reference retained
history reference retained
orphan retained during grace
orphan deleted after grace
late result after cancelled run becomes orphan
```

---

## Migration

```text
workflow-v1
snapshot-v1
deprecated node
unknown future schema
```

---

# 190. V2.1 开发优先级

这些补充不意味着必须在第一天全部实现。

建议：

## 开发前必须锁定接口

```text
Authorization seam
Actor/Audit metadata
Model Requirement Resolver seam
Feature Flag seam
Node Lifecycle metadata
Provider async operation shape
Quota/Admission seam
```

即使第一阶段实现是简单默认实现，也先把边界定好。

---

## 图片 V1 上线前必须实现

```text
Authorization
Feature Flag
Model Resolution
Retry/Idempotency
Basic global concurrency
Audit metadata
Migration fixtures
Failure injection tests
```

---

## 视频 V1 上线前必须实现

额外：

```text
Quota/Cost seam
Provider async task
Polling/callback support as required by chosen Provider
Provider concurrency
Queue timeout
Reconciler
Video authorization
Observability
```

---

## P2 可继续增强

```text
full multi-tenant sharing
advanced approval UI
cross-session Asset Collection
durable provider recovery
advanced auto-rebase
workflow marketplace
```

---

# 191. 更新后的完整开发顺序

在原 V2 Phase 基础上，正式实现顺序调整为：

```text
01  Canvas Domain
02  Migration / Golden Fixtures
03  CanvasService
04  Authorization seam + Actor metadata
05  Session Projection
06  Remote
07  UI Canvas Skeleton
08  Interaction Context
09  Feature Flags
10  Node Registry + Lifecycle metadata
11  Editor
12  Media Workflow Engine
13  Model Registry + Requirement Resolver
14  Provider Registry + Mock
15  Run Admission
16  Run / Node Lifecycle
17  Image Attachment
18  Agent Tools
19  Retry / Idempotency
20  Image E2E
21  History / Variant / Multi-output
22  Global concurrency / Backpressure
23  Real Image Provider
24  Video Asset Store
25  Async Provider task seam
26  Mock Video
27  Real Video Provider
28  Reconciler
29  Quota / Cost integration
30  GC
31  Progress / Observability
32  Chaos / Failure Injection hardening
```

---

# 192. 更新后的 PR 拆分

推荐：

```text
PR01  canvas domain + migration + golden fixtures
PR02  canvas service + authorization seam + audit metadata
PR03  projection + remote
PR04  ui-canvas shell + save state
PR05  interaction context + feature flags
PR06  editor + layout + validation
PR07  node registry + lifecycle/deprecation
PR08  media-workflow engine
PR09  model/provider registries + requirement resolver
PR10  mock provider + run admission
PR11  run/node lifecycle + attachments
PR12  agent tools + preset
PR13  retry/idempotency + image E2E
PR14  history + variant + multi-output
PR15  global concurrency/backpressure
PR16  real image provider
PR17  video asset store + authorization
PR18  async provider operation + mock video
PR19  real video provider
PR20  reconciler + quota/cost
PR21  asset GC
PR22  observability + chaos tests
```

---

# 193. 最终架构冻结结论

V2.1 后，Canvas 的核心可以视为冻结为以下八层：

```text
1. Canvas Domain
2. Session Event / Projection
3. Authorization / Admission / Governance
4. Agent Tool + Interaction Context
5. Browser Remote + Workspace UI
6. Media Workflow Engine
7. Model / Provider Execution
8. Asset / Jobs / History / Operations
```

整体关系：

```text
                Human
                  │
             Browser UI
                  │
           Canvas Remote
                  │
                  ▼
Agent Tools → CanvasService
                  │
        Authorization / Admission
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
   Session     Workflow     History
       │        Engine
       │          │
 Projection   Model Resolver
       │          │
       │       Provider
       │          │
       │         Jobs
       │          │
       └────── Assets
```

---

# 194. 后续不再扩大基础架构范围

完成 V2.1 后，原则上不再因为“也许以后会需要”而增加新的基础层。

后续需求应优先被归类为：

```text
新 Node
新 Provider
新 Model
新 UI Action
新 Validation Rule
新 History Query
新 Asset Capability
```

而不是继续新增核心状态系统。

只有出现以下情况才重新做架构评审：

```text
多人实时协作
一个 Session 多 Canvas Documents
跨 Session / 跨 Workspace Asset Library
分布式 Durable Execution
外部 Workflow Marketplace
真正的 Timeline / NLE 视频编辑
```

这些属于下一代产品边界，而不是当前 Canvas V1/V2.1 的必要前提。

---

# 195. V2.1 最终开发原则

正式开发时始终优先保证：

```text
Correctness
  >
Durability
  >
Security
  >
Recoverability
  >
Observability
  >
Convenience
```

尤其媒体生成涉及：

```text
外部收费 API
长耗时任务
大文件
异步回调
用户历史作品
```

因此：

> 宁可明确失败，也不要 silent overwrite；宁可显示 interrupted，也不要永久 loading；宁可拒绝不支持的模型，也不要暗中替换用户明确指定的模型；宁可留下可 GC 的 orphan，也不要因为 commit retry 重复调用收费 Provider。

---

# 196. 文档基线声明

从本版开始：

```text
deepseek-harness Canvas / Media Workflow V2.1
```

作为后续开发唯一设计基线。

V1、V2 可保留作为历史设计记录，但正式实现、Code Review、测试和验收均以 V2.1 为准。

后续进入实际开发时，第一步直接按照本文：

```text
Canvas Domain
→ Migration
→ CanvasService
→ Authorization
→ Projection
→ Remote
→ UI Skeleton
```

推进，不再重新讨论总体架构。

