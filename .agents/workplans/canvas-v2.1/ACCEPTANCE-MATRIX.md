# Canvas V2.2 / Harness rc.8 — 节点验收矩阵

| Node | 核心交付 | 关键验收 Gate |
|---|---|---|
| N00 | 工程实施总图与节点契约 | 节点编号、upstream baseline、跨节点不变量唯一可追溯。 |
| N01 | Canvas Domain、类型系统与状态不变量 | `types.ts` 无运行时实现；Domain 不依赖 Browser；node type structural admission 是 open-world，不含 built-in whitelist；八种 Product State 有 Domain tests。 |
| N02 | Schema Migration、Node Version 与 Golden Fixtures | 历史 fixture 可迁移；未知 plugin node 不因 built-in whitelist 丢失。 |
| N03 | Canvas Event Sourcing、Fold、CanvasService 与原子提交 | Agent/Browser 业务写入都经 CanvasService；相邻 workflow/run revision transition 严格按 operation 推进。 |
| N04 | Authorization、Actor、Audit 与敏感数据边界 | UI 隐藏不是唯一权限控制。 |
| N05 | Session Projection、Canvas Layout Projection | Browser 刷新/reconnect 得到 authoritative Workflow/Run/Output。 |
| N06 | Remote、Mutation、History API | Browser 人工 mutation 不走私有 Session hack。 |
| N07 | Canvas UI Shell、Minimal/Editor | `render-service` 持 root；ui-canvas 经 plugin/slot；UI 无第二份 authority。 |
| N08 | Interaction Context | 当前 selection 与 Agent 指代打通，且 context 不持久化。 |
| N09 | Feature Flags / Settings | Harness settings authority + Host enforcement；secret 不入 Browser。 |
| N10 | Media Node Registry | open-world custom node 不需改巨型 switch/whitelist；Browser 不复制 Host catalog。 |
| N11 | Workflow Editor | 人工 DAG 编辑、port connect/disconnect、Host catalog、Draft/CAS 可用。 |
| N11.5 | Harness rc.8 Compatibility | 官方 rc.8 完整 tree 已同步；dynamic client REAL composition 通过；三栏 Canvas 保留。 |
| N12 | Media Workflow Engine v2.2 | Browser-independent；Mock DAG/Partial Run/Fingerprint/Executor Registry 全部通过。 |
| N13 | Model Registry / Resolver | Agent/Executor 不猜模型 capability；resolved model identity 可进入 fingerprint。 |
| N14 | Executor / Provider Adapter | 不接真实云也能完整执行；换 Provider 不改 Canvas Domain/Scheduler。 |
| N15 | Run Admission | 任何收费/长任务 Provider task 前有 Host admission 证据。 |
| N16 | Run Lifecycle / Jobs | Run durable、可取消、可重试、可解释、可恢复判断。 |
| N17 | Image Asset / Attachment | 与 Harness attachment store 共用 binary authority；Minimal 可显示 Mock 输出。 |
| N18 | Agent Tools / Command Bus | Agent/UI 共用同一 Domain command semantics；Tool 不直连 Provider。 |
| N19 | History / Variant | 连续生成不丢上一版，可 restore/branch。 |
| N20 | Real Image Provider | 自然语言可完成真实 text-to-image/image-edit。 |
| N21 | Video Asset | Browser 授权 Range playback 稳定。 |
| N22 | Async Video Provider | polling/callback/resume/cancel 达到 V1。 |
| N23 | Progress / Observability | session→workflowRun→nodeRun→providerRequest 可追踪；progress 不膨胀 Session。 |
| N24 | GC / Retention / Chaos | orphan、race、部分失败都有恢复/清理路径。 |
| N25 | Full E2E / Release | REAL composition + upstream compatibility gate + P0/P1/V1 全部有证据。 |