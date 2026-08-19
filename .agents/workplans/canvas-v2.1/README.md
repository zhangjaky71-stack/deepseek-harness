# DeepSeek Harness Canvas V2.1 — 工程节点文档索引

> 这是后续实施与验收的入口文档。  
> 原始总设计保留为 `SOURCE-V2.1.md`，但实际开发应按节点文档推进。

## 1. 使用规则

后续可以直接使用节点编号指令，例如：

```text
实施 N03
验收 N11
检查 N16 是否满足文档
修复 N22 的 callback 幂等问题
继续 N20
```

每个节点都是一个独立的工程验收单元。节点内部可以拆多个 commit/PR，但只有达到该节点验收标准后才标记 `ACCEPTED`。

## 2. 推荐主路径

```text
N00
 ↓
N01 → N02 → N03 → N04
              │      │
              └→ N05 → N06 → N07 → N08
                       │       │
                       │       └→ N09
                       │
N01/N02/N09 → N10 → N12 → N13 → N14
                                  │
N04/N09/N13/N14 ───────────────→ N15
                                  ↓
                                 N16
                              ┌───┴────┐
                              ↓        ↓
                             N17      N21
                              ↓        ↓
                             N18      N22
                              ↓        │
                             N19       │
                              ↓        │
                             N20 ──────┘
                               \      /
                                N23
                                 ↓
                                N24
                                 ↓
                                N25
```

## 3. 节点目录

- [N00 — 工程实施总图与节点契约](N00-execution-map.md)  
  依赖：`无`  
  目标：把整套 Canvas 项目变成可逐节点实施、逐节点验收、可中断后继续的工程计划，并冻结节点编号、依赖关系和交付约定。
- [N01 — Canvas Domain、类型系统与状态不变量](N01-canvas-domain.md)  
  依赖：`N00`  
  目标：建立 Canvas 的纯业务模型，使 Session、Remote、Agent Tool、UI、Workflow Engine 都依赖同一套稳定语义。
- [N02 — Schema Migration、Node Version 与 Golden Fixtures](N02-migration-fixtures.md)  
  依赖：`N01`  
  目标：保证未来 Schema/节点升级后，已有 Session 里的 Canvas/Workflow 仍能打开、验证和运行，避免上线后被历史数据锁死。
- [N03 — Canvas Event Sourcing、Fold、CanvasService 与原子提交](N03-event-sourcing-service.md)  
  依赖：`N01, N02`  
  目标：建立 Canvas 唯一 Host 写入口和 Session durable authority，完成 CAS、原子 operation、cache/replay 一致性。
- [N04 — Authorization、Actor、Audit 与敏感数据边界](N04-authorization-audit.md)  
  依赖：`N03`  
  目标：让 Remote、Agent Tool、History、Asset Route 使用统一 Host 权限模型，并能追踪每次 mutation 的操作者与来源。
- [N05 — Session Projection、Canvas Layout Projection 与客户端状态读取](N05-projection-layout.md)  
  依赖：`N03`  
  目标：让浏览器只通过 Session Projection 获取当前 Canvas authoritative state，同时独立保存布局而不污染 Workflow revision。
- [N06 — Typert Remote、Mutation API 与 History Query API](N06-remote-history-api.md)  
  依赖：`N04, N05`  
  目标：建立 Browser → Host 的稳定 mutation/query 接口，并接入现有 api-remotes mount。
- [N07 — Canvas UI Shell、Minimal/Editor 与产品状态机](N07-ui-shell-state-machine.md)  
  依赖：`N05, N06`  
  目标：把 Canvas 作为 `conversation.view` 接入 Web，会话 Composer 保持可用，并用统一产品状态机驱动 Minimal/Editor 行为。
- [N08 — Canvas Interaction Context 与自然语言指代](N08-interaction-context.md)  
  依赖：`N07`  
  目标：让 Agent 能正确理解用户在 Canvas 上选中的节点、边、资产、输出或区域，从而支持“这个 / 这张 / 这里 / 这一段”。
- [N09 — Feature Flags 与部署能力暴露](N09-feature-flags.md)  
  依赖：`N04, N07`  
  目标：支持灰度开启/关闭 Canvas、Editor、Video、History、Variant、Partial Run 等能力，并确保 Host 和 UI 一致。
- [N10 — Media Node Registry、端口 Schema 与节点生命周期](N10-node-registry.md)  
  依赖：`N01, N02, N09`  
  目标：把节点定义变成 Workflow Validator、Editor、Agent 摘要、Executor 的统一元数据源，并支持 deprecated/creatable/executable。
- [N11 — Workflow Editor、Draft、Auto-save、Undo/Redo、Copy/Paste 与 Layout](N11-editor-workspace.md)  
  依赖：`N06, N07, N10`  
  目标：完成真正可用的人工 Workflow 编辑器，并保证编辑动作最终以 atomic semantic operations 进入 CanvasService。
- [N12 — Media Workflow Validator、Scheduler、Partial Execution 与 Fingerprint](N12-workflow-engine.md)  
  依赖：`N10`  
  目标：建立独立于现有 Harness WorkflowEngine 的媒体 DAG 执行引擎，支持静态验证、拓扑执行和未来局部运行/缓存。
- [N13 — Media Model Registry 与 Requirement Resolver](N13-model-registry-resolver.md)  
  依赖：`N10, N12`  
  目标：统一描述模型能力，并把“用户需求 → 可运行模型”的判断从 Agent/UI if-else 中抽离。
- [N14 — Media Provider 抽象、路由与 Mock Provider](N14-provider-mock.md)  
  依赖：`N13`  
  目标：建立与 Canvas Domain 解耦的 Provider 执行层，并用可故障注入的 Mock Provider 打通图片/视频执行测试。
- [N15 — Run Admission、Quota/Cost、Feature、权限与并发治理](N15-run-admission-governance.md)  
  依赖：`N04, N09, N13, N14`  
  目标：在创建任何收费/长耗时 Provider task 前完成完整准入检查，防止非法、超额或不支持的执行进入后台。
- [N16 — Run Lifecycle、Jobs、Retry、Idempotency、Cancel 与 Reconciler](N16-run-jobs-retry.md)  
  依赖：`N12, N14, N15`  
  目标：把 Workflow Execution 变成长任务安全运行链路，支持 node-level state、后台 Jobs、取消、重试、Host 重启中断恢复判断。
- [N17 — 图片资产、Attachment、多候选结果与 Primary Output](N17-image-assets-output.md)  
  依赖：`N16`  
  目标：完成图片生成结果的 durable 存储、多个候选、Primary 选择和 Minimal 展示基础。
- [N18 — Agent Canvas Tools、Intent Semantics 与 Canvas Read/Inspect](N18-agent-tools-intent.md)  
  依赖：`N08, N16, N17`  
  目标：让 Harness Agent 通过稳定、低上下文开销的工具控制同一个 Canvas，并正确区分修改、重生成、变体和新方案。
- [N19 — Run History、Variant、Restore、Provenance 与 Asset Library](N19-history-variants.md)  
  依赖：`N06, N17, N18`  
  目标：让用户可以查看过去结果、恢复旧 Workflow、创建方案分支，并把历史资产重新作为输入。
- [N20 — 真实图片 Provider 接入与图片 V1 产品验收](N20-real-image-provider.md)  
  依赖：`N14, N15, N16, N17, N18, N19`  
  目标：在不修改 Canvas 核心架构的前提下接入首个真实图片 Provider，并完成 text-to-image + image-edit 的生产链路。
- [N21 — Video Asset Store、授权 Binary Route 与 Range Playback](N21-video-assets.md)  
  依赖：`N04, N19`  
  目标：为视频建立独立 durable asset 生命周期和受授权的 HTTP Range 读取能力，不把大视频塞进 Typert/Session。
- [N22 — 异步视频 Provider、Polling/Callback、Resume 与视频 V1](N22-video-provider-async.md)  
  依赖：`N15, N16, N21`  
  目标：实现 text-to-video/image-to-video 长任务，支持 Provider 异步 task、Polling 或 Callback，并完成视频 V1 产品链。
- [N23 — 实时 Progress、Observability、Metrics 与诊断链路](N23-progress-observability.md)  
  依赖：`N16, N20, N22`  
  目标：让用户看到真实运行进度/阶段，让开发者能从 sessionId→runId→nodeId→provider 定位性能与故障。
- [N24 — Asset GC、Data Retention、故障注入与恢复硬化](N24-gc-retention-chaos.md)  
  依赖：`N17, N21, N22, N23`  
  目标：处理 orphan、历史资产保留、Provider/Session/Asset 边界故障，并证明系统不会因 race 或部分失败产生错误 durable state。
- [N25 — 完整 E2E、REAL Composition、发布验收与回归门禁](N25-full-e2e-release.md)  
  依赖：`N01-N24`  
  目标：以真实 Harness composition 验证 Agent、人、Session、Remote、UI、Jobs、图片、视频、历史、权限和故障链路，并给出可发布结论。

## 4. 建议开发里程碑

### Milestone A — Durable Shared Canvas

`N00 → N01 → N02 → N03 → N04 → N05 → N06 → N07`

完成后应具备：

```text
Browser → Remote → CanvasService → Session → Projection → Browser
Agent/Browser 共享同一 Durable Canvas
```

### Milestone B — Human + Agent Collaborative Editing

`N08 → N09 → N10 → N11 → N18`

完成后应具备：

```text
Selection Context
Manual DAG Editing
Agent Read/Edit
Minimal/Editor 同一 Workflow
```

### Milestone C — Executable Media Workflow

`N12 → N13 → N14 → N15 → N16`

完成后应具备：

```text
Validated DAG
Model Resolution
Mock Provider
Run Admission
Jobs/Retry/Cancel
```

### Milestone D — Image V1

`N17 → N18 → N19 → N20`

完成后应具备：

```text
真实生图
图片编辑
多候选
历史
Variant
继续创作
```

### Milestone E — Video V1

`N21 → N22`

完成后应具备：

```text
text-to-video
image-to-video
Range playback
异步 Provider
Cancel
History
```

### Milestone F — Production Hardening & Release

`N23 → N24 → N25`

完成后应具备：

```text
Progress
Observability
GC
Chaos
REAL Composition
Release Gate
```

## 5. 节点状态表模板

| 节点 | 状态 | PR/Branch | 验收结论 | 备注 |
|---|---|---|---|---|
| N00 | PLANNED |  |  | 工程实施总图与节点契约 |
| N01 | PLANNED |  |  | Canvas Domain、类型系统与状态不变量 |
| N02 | PLANNED |  |  | Schema Migration、Node Version 与 Golden Fixtures |
| N03 | PLANNED |  |  | Canvas Event Sourcing、Fold、CanvasService 与原子提交 |
| N04 | PLANNED |  |  | Authorization、Actor、Audit 与敏感数据边界 |
| N05 | PLANNED |  |  | Session Projection、Canvas Layout Projection 与客户端状态读取 |
| N06 | PLANNED |  |  | Typert Remote、Mutation API 与 History Query API |
| N07 | PLANNED |  |  | Canvas UI Shell、Minimal/Editor 与产品状态机 |
| N08 | PLANNED |  |  | Canvas Interaction Context 与自然语言指代 |
| N09 | PLANNED |  |  | Feature Flags 与部署能力暴露 |
| N10 | PLANNED |  |  | Media Node Registry、端口 Schema 与节点生命周期 |
| N11 | PLANNED |  |  | Workflow Editor、Draft、Auto-save、Undo/Redo、Copy/Paste 与 Layout |
| N12 | PLANNED |  |  | Media Workflow Validator、Scheduler、Partial Execution 与 Fingerprint |
| N13 | PLANNED |  |  | Media Model Registry 与 Requirement Resolver |
| N14 | PLANNED |  |  | Media Provider 抽象、路由与 Mock Provider |
| N15 | PLANNED |  |  | Run Admission、Quota/Cost、Feature、权限与并发治理 |
| N16 | PLANNED |  |  | Run Lifecycle、Jobs、Retry、Idempotency、Cancel 与 Reconciler |
| N17 | PLANNED |  |  | 图片资产、Attachment、多候选结果与 Primary Output |
| N18 | PLANNED |  |  | Agent Canvas Tools、Intent Semantics 与 Canvas Read/Inspect |
| N19 | PLANNED |  |  | Run History、Variant、Restore、Provenance 与 Asset Library |
| N20 | PLANNED |  |  | 真实图片 Provider 接入与图片 V1 产品验收 |
| N21 | PLANNED |  |  | Video Asset Store、授权 Binary Route 与 Range Playback |
| N22 | PLANNED |  |  | 异步视频 Provider、Polling/Callback、Resume 与视频 V1 |
| N23 | PLANNED |  |  | 实时 Progress、Observability、Metrics 与诊断链路 |
| N24 | PLANNED |  |  | Asset GC、Data Retention、故障注入与恢复硬化 |
| N25 | PLANNED |  |  | 完整 E2E、REAL Composition、发布验收与回归门禁 |

## 6. 全局冻结不变量

1. Session Log 是 Canvas durable authority。
2. Agent Tool 与 Browser Remote 都写 CanvasService。
3. Minimal/Editor 共用同一 Workflow。
4. MediaWorkflow 不依赖 React Flow。
5. MediaWorkflow 不依赖具体 Provider SDK。
6. Binary 不进入 Session Event/Projection/Typert JSON。
7. workflowRevision 与 runRevision 分离。
8. Run 执行固定 Workflow Snapshot。
9. Layout 与 Semantic Workflow 分离。
10. Workflow operations 原子提交。
11. 安全/权限/配额在 Host enforce。
12. Progress 百分比不写 Session。
13. History 不塞 current Projection。
14. Provider 明确模型请求不得 silent fallback。
15. Content rejection 不可通过自动切 Provider 绕过。

## 7. 文档维护规则

节点实施导致接口变化时：

1. 先更新对应节点文档；
2. 如影响跨节点不变量，再更新本索引与 `SOURCE-V2.1.md` 的后续修订记录；
3. 不允许代码实现与节点验收契约长期分叉；
4. 已验收节点的 breaking change 必须重新进入 REVIEW/ACCEPTED。
