# DeepSeek Harness Canvas V2.2 — rc.8 兼容工程节点索引

> 原始总设计与来源快照仍保留在 `SOURCE-V2.1.md` / `SOURCE-V2.1-PART-*`。  
> 从本次修订起，实际实施与验收以本索引、各节点文档及 rc.8 compatibility documents 为准。  
> 上游目标：`deepseek-ai/deepseek-harness@141eb6fef83422698aef7a981029e843e8161534` (`dsh@0.1.0-rc.8`)。

## 1. 使用规则

可以直接说：

```text
实施 N11.5
继续 N12
按 rc.8 复查 N07
验收 N18
```

每个节点仍是独立验收单元。实现可以拆 commit/PR，但必须达到节点 gate 才标记 `ACCEPTED`。测试基础设施不可用时写 `BLOCKED/UNVERIFIED`，不能写假 PASS。

## 2. rc.8 兼容基础文档

- [RC8 Upstream Baseline](RC8-UPSTREAM-BASELINE.md)
- [Upstream Compatibility Policy](UPSTREAM-COMPATIBILITY-POLICY.md)
- [Harness ↔ Canvas Dynamic Plugin Architecture](HARNESS-CANVAS-PLUGIN-ARCHITECTURE.md)
- [Canvas Event Protocol](CANVAS-EVENT-PROTOCOL.md)
- [Canvas Settings Integration](CANVAS-SETTINGS-INTEGRATION.md)
- [Upgrade Migration Runbook](UPGRADE-MIGRATION-RUNBOOK.md)

这些文件冻结“Canvas 如何长期作为 Harness 扩展域存在”，优先于旧文档中任何 rc.7 Web shell ownership 假设。

## 3. 推荐主路径

```text
N00
 ↓
N01 → N02 → N03 → N04
              │      │
              └→ N05 → N06 → N07 → N08
                       │       │
                       │       └→ N09
                       │
N01/N02/N09 → N10 → N11 → N11.5 → N12 → N13 → N14
                                              │
N04/N09/N13/N14 ───────────────────────────→ N15
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

## 4. 节点目录

| Node | 名称 | 依赖 | rc.8 修订重点 |
|---|---|---|---|
| N00 | 工程实施总图与节点契约 | 无 | 新增 upstream baseline / plugin ownership / N11.5 gate |
| N01 | Canvas Domain、类型系统与状态不变量 | N00 | Domain 继续 Browser-independent |
| N02 | Migration、Node Version、Golden Fixtures | N01 | 未安装 custom node 仍可 load/migrate |
| N03 | Event Sourcing、CanvasService、原子提交 | N01,N02 | `canvas/change` durable authority 继续成立 |
| N04 | Authorization、Actor、Audit | N03 | Host enforce 不变 |
| N05 | Session Projection、Layout Projection | N03 | reconnect/Projection authority 不变 |
| N06 | Remote、Mutation、History API | N04,N05 | 不走私有 Browser→Session hack |
| N07 | UI Shell、Minimal/Editor | N05,N06 | render-service root + dynamic ui-canvas plugin |
| N08 | Interaction Context | N07 | transient send-time context，不持久化 |
| N09 | Feature Flags / Settings | N04,N07 | 接 Harness rc.8 settings/schema authority |
| N10 | Media Node Registry | N01,N02,N09 | open-world node types + Host catalog |
| N11 | Workflow Editor | N06,N07,N10 | Host catalog、port authoring、plugin lifecycle |
| **N11.5** | **Harness rc.8 Compatibility Migration** | **N11** | **完整上游同步、render-service/ui-attachment/settings、REAL composition** |
| N12 | Workflow Engine v2.2 | N10,N11.5 | Executor registry、partial boundaries、snapshot、fingerprint、runtime seam |
| N13 | Model Registry / Resolver | N10,N12 | resolved model identity |
| N14 | Executor / Provider Adapter / Mock | N12,N13 | Provider 不直写 Canvas；并列 runtime executor |
| N15 | Run Admission | N04,N09,N13,N14 | Host admission |
| N16 | Run Lifecycle / Jobs | N12,N14,N15 | durable run/retry/cancel |
| N17 | Image Asset / Attachment | N16 | 复用 Harness attachment authority |
| N18 | Agent Tools / Command Bus | N08,N11.5,N16,N17 | Agent/UI/Slash 同一 command semantics |
| N19 | History / Variant | N06,N17,N18 | provenance / restore |
| N20 | Real Image Provider | N14-N19 | Provider Adapter 接入 |
| N21 | Video Asset | N04,N19 | binary/range 独立 |
| N22 | Async Video Provider | N15,N16,N21 | polling/callback/resume |
| N23 | Progress / Observability | N16,N20,N22 | session→workflowRun→nodeRun→provider trace |
| N24 | GC / Retention / Chaos | N17,N21,N22,N23 | orphan/race recovery |
| N25 | Full E2E / Release | N01-N24 + N11.5 | REAL composition + upstream compatibility gate |

## 5. 里程碑

### Milestone A — Durable Shared Canvas

`N00 → N01 → N02 → N03 → N04 → N05 → N06 → N07`

结果：Browser/Agent 共享同一 Session-authoritative Canvas。

### Milestone B — Human + Agent Collaborative Editing

`N08 → N09 → N10 → N11`

结果：selection context、人工 DAG 编辑、open-world node catalog。

### Milestone B.5 — Harness rc.8 Integration Baseline

`N11.5`

结果：

```text
官方 rc.8 完整 tree
+ dynamic render-service/client plugins
+ 三栏 Canvas 产品布局
+ attachment/settings/session compatibility
+ REAL assembled boot evidence
```

### Milestone C — Executable Media Workflow

`N12 → N13 → N14 → N15 → N16`

结果：Validated DAG、Executor Registry、Model Resolution、Mock Provider、Admission、Jobs/Retry/Cancel。

### Milestone D — Image V1

`N17 → N18 → N19 → N20`

### Milestone E — Video V1

`N21 → N22`

### Milestone F — Production Hardening & Release

`N23 → N24 → N25`

## 6. 节点状态表

| 节点 | 状态 | PR/Branch | 验收结论 | 备注 |
|---|---|---|---|---|
| N00-N10 | 以 implementations/PR 实际记录为准 |  |  | 不因 rc.8 重写历史 |
| N11 | IMPLEMENTING/REVIEW | `agent/canvas-n11-editor-workspace` / PR #27 |  | 仍有 catalog/port/open-world/test blockers |
| N11.5 | PLANNED/BLOCKED |  |  | 等官方 rc.8 完整同步与 REAL verification |
| N12 | PLANNED | `agent/canvas-n12-workflow-engine-v2` 曾有草稿实现 |  | 必须基于 N11.5 最终基线复核 |
| N13-N25 | PLANNED |  |  | 按修订后依赖推进 |

## 7. 全局冻结不变量

1. Session Log 是 Canvas durable authority。
2. Agent Tool 与 Browser Remote 都写 CanvasService/统一 Domain command 层。
3. Minimal/Editor 共用同一 Workflow/Run/Asset。
4. `render-service` 持有 React application root。
5. `ui-layout` 不持有 Canvas semantic authority。
6. `ui-canvas` 是 Canvas Browser capability owner。
7. MediaWorkflow 不依赖 graph renderer 或 Provider SDK。
8. Custom node 是 open-world extension；无 built-in type whitelist。
9. Binary 不进入 Session Event/Projection/Typert JSON。
10. workflowRevision 与 runRevision 分离；Run 固定 immutable Workflow Snapshot。
11. Layout 与 Semantic Workflow 分离；operations 原子提交。
12. 权限/feature/quota/admission 在 Host enforce。
13. Progress 不按百分比写 Session；History 不塞 current Projection。
14. 明确模型请求不得 silent fallback；content rejection 不可自动切 Provider 绕过。
15. Browser 不维护 Host node/provider/settings 第二真源。
16. Provider credential 永不进入 Workflow/Session/Browser。
17. 每次 Harness 升级必须执行可复现 baseline + compatibility runbook。

## 8. 文档维护规则

1. `SOURCE-V2.1-*` 是历史快照，原则上不改。
2. 接口/ownership 变化先改对应节点文档。
3. 跨节点变化同步修改 README、ACCEPTANCE-MATRIX 与 compatibility docs。
4. 已验收节点发生 breaking change 时重新进入 REVIEW。
5. 官方升级完成后必须更新 upstream/private commit 证据。
