# DeepSeek Harness Canvas V2.2 — `dsh@0.1.1-rc.2` 工程节点索引

> 本目录是下一阶段 Canvas 代码同步、开发、Code Review 与验收的**当前契约**。  
> 历史设计来源仍保留在 `SOURCE-V2.1.md` / `SOURCE-V2.1-PART-*`，不得用历史快照覆盖本目录中的现行契约。

## 1. 当前官方基线

```text
deepseek-ai/deepseek-harness
b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
dsh@0.1.1-rc.2
release date: 2026-08-21
```

当前私有 Canvas 开发栈从 `fix/canvas-n15-v2.2-run-admission` 分出。仓库根版本仍可能显示旧 release family；**版本号本身不是兼容证据**。真正的目标是：先机械吸收官方基础设施，再重放并收窄 Canvas 产品扩展。

详见：

- [Upstream 0.1.1-rc.2 Baseline](UPSTREAM-0.1.1-RC2-BASELINE.md)
- [Upstream Compatibility Policy](UPSTREAM-COMPATIBILITY-POLICY.md)
- [Upgrade Migration Runbook](UPGRADE-MIGRATION-RUNBOOK.md)
- [Harness ↔ Canvas Plugin Architecture](HARNESS-CANVAS-PLUGIN-ARCHITECTURE.md)
- [Canvas Event Protocol](CANVAS-EVENT-PROTOCOL.md)
- [Canvas Settings Integration](CANVAS-SETTINGS-INTEGRATION.md)
- [Acceptance Matrix](ACCEPTANCE-MATRIX.md)

`RC8-UPSTREAM-BASELINE.md` 仅保留为历史兼容入口，已被新的 0.1.1-rc.2 baseline 取代。

## 2. 产品目标冻结

Canvas V2.2 继续满足以下产品目标，官方升级不得把它们当成“偏差”直接删除：

1. Agent / Session 可实时读取并操作同一个 Canvas。
2. Agent 可以下达文生图、图生图/编辑、文生视频、图生视频、工作流生成与工作流修改指令。
3. Minimal 模式只呈现最终结果与必要状态；Editor 模式呈现可人工编辑的 Workflow DAG。
4. Minimal 与 Editor 共用同一 Workflow / Run / Asset durable authority，不维护第二套业务状态。
5. Conversation / Composer 与 Canvas 产品面并存；Canvas 不复制第二个聊天输入框。
6. Custom Media Node、Model、Provider 都是 open-world extension，不建立内置类型白名单作为 durable admission。
7. Browser 不直接调用 Provider，不拥有 Credential、Quota、Model Registry、Node Registry 或 Settings 的第二真源。

## 3. 官方能力与 Canvas 扩展的关系

### 3.1 原样继承官方的基础设施

优先吸收官方 `0.1.1-rc.2`：

- Session Projection 的 Host state / client wire-view 分层；
- Attachment normalized master / request image / deterministic variant pipeline；
- shared `SettingsDescribeMirror`；
- `ui-renderer` 统一 React bindings 与 application-root ownership；
- `__DSH_TRANSPORT__.loadBundle` / ModuleLoader 最新 transport seam；
- slash command image submission envelope；
- 最新 build / coverage / client-domain / runtime-closure / docs gates。

Canvas 不在这些领域建立平行实现。

### 3.2 必须保留的 intentional product divergence

官方 Layout 当前是：

```text
sidebar | conversation | details
```

Canvas 产品要求是：

```text
sidebar | shell.main(Canvas) | conversation | details
```

因此 `shell.main` 是明确、受测试保护的 Canvas 产品扩展，不是待删除的兼容问题。同步官方 `ui-layout` 时只能在最新官方实现上重放这一个最小产品面扩展，不能整包覆盖私有 Layout，也不能长期 fork theme/slot/session/details lifecycle。

## 4. 当前执行原则

- **先文档后代码**：本次文档迁移完成后，后续代码调整以本目录为准。
- **先 upstream infrastructure，后 Canvas patch replay**。
- 不手改 `pnpm-lock.yaml`、Typert/generated catalog、module graph、config catalog 等工具拥有产物。
- 任何旧节点若依赖已变化的 upstream seam，状态自动回到 `REVALIDATION REQUIRED`，即使历史实现已完成。
- CI/runner 未执行真实 repository steps 时只能写 `BLOCKED/UNVERIFIED`，不能写 PASS。

## 5. 推荐执行路径

```text
N00
 ↓
N01 → N02 → N03 → N04 → N05 → N06 → N07 → N08 → N09 → N10 → N11
                                                           ↓
                                             N11.5 upstream realignment
                                                           ↓
                               N12 → N13 → N14 → N15 → N16
                                                     ┌─────┴─────┐
                                                     ↓           ↓
                                                    N17         N21
                                                     ↓           ↓
                                                    N18         N22
                                                     ↓           │
                                                    N19          │
                                                     ↓           │
                                                    N20 ─────────┘
                                                      \          /
                                                       N23 → N24 → N25
```

**关键变化：** N11.5 不再是“rc.8 一次性兼容节点”，而是当前 `0.1.1-rc.2` 上游重对齐 gate。N12–N15 已有实现可保留为 prior implementation，但在新 baseline 上必须重新验证依赖 seam；N16 之后不得按旧 rc.8 文档直接继续。

## 6. 节点目录与 0.1.1-rc.2 修订重点

| Node | 名称 | 新基线重点 |
|---|---|---|
| N00 | 执行总图 | 新 baseline、重放策略、revalidation 状态 |
| N01 | Canvas Domain | stable AttachmentRef；request image 不进 durable domain |
| N02 | Migration / Fixtures | attachment metadata forward compatibility；open-world node 保留 |
| N03 | Event Sourcing | binary/request-version 不进 Session event |
| N04 | Authorization / Audit | 不再把私有 Projection `readGuard` 当长期公共 seam |
| N05 | Projection / Layout Projection | 迁到官方 Host-state / wire-view Projection contract |
| N06 | Remote / History | 保留 Typert `RemoteResult`；重验新版 Projection face |
| N07 | Minimal / Editor Shell | 固化 `shell.main` 为 intentional Layout extension |
| N08 | Interaction Context | region 是 Canvas semantic intent，不依赖已删除 `read_image_region` |
| N09 | Feature / Settings | Browser 使用 shared Settings Describe Mirror；Host restart-applied snapshot 保留 |
| N10 | Media Node Registry | 基本保留；重验 client catalog/gates |
| N11 | Workflow Editor | 对齐最新 renderer / projection / asset refs |
| N11.5 | Upstream Realignment | Projection、Settings、Attachment、renderer、transport、build gates 全量重对齐 |
| N12 | Workflow Engine | 不做 image request transform/cache；消费 stable asset refs |
| N13 | Media Model Registry | 与 Harness Chat LLM model catalog 明确分层 |
| N14 | Provider Runtime / Mock | image output 经 Attachment materializer；video 交 N21 |
| N15 | Run Admission | 以当前独立 `run-admission` package 与 exact WorkflowRef 契约重写 |
| N16 | Run / Jobs / Retry | 消费 N15 permit 的 exact WorkflowRef；重验最新版 Jobs/cancel seam |
| N17 | Image Asset | 完整接官方 normalized master / request image pipeline |
| N18 | Agent Tools / Intent | 复用官方 command image envelope，不造第二上传链 |
| N19 | History / Variants | durable ref/provenance only；不持久化 variant/files transport id |
| N20 | Real Image Provider | provider bytes → official Attachment master → Canvas output |
| N21 | Video Asset | 图片用官方 Attachment；视频仍需独立 durable binary authority |
| N22 | Async Video Provider | 重验最新版 jobs/cancellation；Provider async state 不写 Browser |
| N23 | Progress / Observability | trace 关联 attachment/provider op；敏感 transport metadata 不进日志 |
| N24 | GC / Retention / Chaos | Canvas 管引用；Attachment owner 管底层 image object retention |
| N25 | Full E2E / Release | 使用 0.1.1-rc.2 repository gates + REAL assembled lifecycle |

## 7. 当前状态

| 范围 | 状态 | 说明 |
|---|---|---|
| N01–N05 | `REVALIDATION REQUIRED` | 历史实现保留；Projection/authorization seam 必须按 0.1.1-rc.2 重验 |
| N06 | `REVIEW` | PR #34；Remote 主体可保留，Projection 依赖重验 |
| N07 | `REVIEW` | PR #35；`shell.main` 保留为 intentional divergence |
| N08 | `REVIEW` | PR #36；region/attachment interaction contract 需更新 |
| N09 | `REVIEW` | PR #37；Host settings 语义保留，Browser mirror 需迁移 |
| N10 | `REVIEW` | PR #38；Registry 契约基本保留 |
| N11 | `REVIEW` | PR #39；Editor 需重验最新 client seams |
| N11.5 | `BLOCKED / REOPENED` | PR #40/#41 是 rc.8 证据；现已被 0.1.1-rc.2 supersede |
| N12 | `IMPLEMENTED / REVALIDATE` | PR #42；Engine 保留，upstream integration 重验 |
| N13 | `IMPLEMENTED / REVALIDATE` | PR #43；Media Model Registry 保留 |
| N14 | `IMPLEMENTED / REVALIDATE` | PR #44；Provider runtime 保留，Attachment materializer contract 更新 |
| N15 | `IMPLEMENTING / REVALIDATE` | 当前 `fix/canvas-n15-v2.2-run-admission`；文档以实际 package 为准 |
| N16–N25 | `PLANNED` | 只能按本次修订后的文档实施 |

## 8. 全局不变量

1. Session Log 是 Canvas durable semantic authority；Projection 是可重建视图。
2. Browser Remote 与 Agent Tool 都落到同一 Host Canvas command/service 层。
3. Minimal / Editor 共用同一 Workflow / Run / Asset。
4. `ui-renderer` 持有 React application root 与 React bindings；Web boot 保持 framework-free。
5. `ui-layout` 只拥有几何与通用 slot，`shell.main` 是最小 Canvas product extension；Layout 不拥有 Canvas semantic authority。
6. `ui-canvas` 是 Canvas Browser capability/presentation owner。
7. MediaWorkflow 不依赖 graph renderer、Provider SDK 或 Browser。
8. Custom node/model/provider 是 open-world extension；durable domain 不依赖内置 whitelist。
9. Image binary authority 归 Harness Attachment；Canvas 只持 stable reference + provenance。Video binary 在 N21 单独治理。
10. `RequestImageAttachment`、variant cache、Files upload id 属 request/provider transport，不进 Canvas Session durable state。
11. workflowRevision、layoutRevision、runRevision 分离；Run 固定 immutable Workflow Snapshot / exact WorkflowRef。
12. 权限、feature、quota、cost、approval、idempotency、concurrency admission 全在 Host enforce。
13. Progress 不以高频百分比污染 Session durable log；History 不塞入 current Projection。
14. 明确模型/Provider请求不得 silent fallback；content rejection 不得自动换 Provider 绕过策略。
15. Browser 不维护 Host node/model/provider/settings 第二真源。
16. Provider credential、remote Files bearer/temporary id 不进入 Workflow/Session/Browser durable DTO。
17. Region selection 是 Canvas semantic intent；不得依赖官方已删除的 `read_image_region`。
18. 每次 Harness 升级必须先更新 baseline，分类 official adoption / intentional divergence / unresolved gap，再执行 replay 与 REAL verification。

## 9. 文档维护规则

1. `SOURCE-V2.1-*` 是历史快照，原则上不重写。
2. `implementations/N*.md` 是实施历史；上游变化通过 `Upstream revalidation` 章节追加，不伪造历史 PASS。
3. `RC8-UPSTREAM-BASELINE.md` 只做 superseded pointer；当前事实写在 `UPSTREAM-0.1.1-RC2-BASELINE.md`。
4. 接口/ownership 变化先改对应节点，再同步 README、Acceptance Matrix、Compatibility Policy。
5. 双语 package/Agent Note 必须同步更新 pairing；生成型文档使用仓库 owner script 重生成。
6. 任何节点在新 upstream seam 上未经 exact-head repository-pinned checks，不得标记 ACCEPTED。
