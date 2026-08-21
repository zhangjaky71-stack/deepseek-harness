# Canvas V2.2 / Harness rc.8 — 节点验收矩阵

| Node | 核心交付 | 关键验收 Gate |
|---|---|---|
| N00 | 工程实施总图与节点契约 | 节点编号、upstream baseline、跨节点不变量唯一可追溯。 |
| N01 | Canvas Domain、类型系统与状态不变量 | `types.ts` 无运行时实现；Domain 不依赖 Browser；node type structural admission 是 open-world，不含 built-in whitelist；八种 Product State 有 Domain tests。 |
| N02 | Schema Migration、Node Version 与 Golden Fixtures | 历史 fixture 可迁移；unknown plugin `type@version/config` 可在插件缺失时 reload；Core-only node version ownership；current schema unknown field fail loud。 |
| N03 | Canvas Event Sourcing、Fold、CanvasService 与原子提交 | CanvasService 要求 exact-live Agent + Session；Service 自己 detached-fold preflight 后才 append；live writer meta v2；WorkflowRef CAS 错误分类稳定；semantic no-op 不增长 revision；RunId Session-wide 唯一；`run-update` 覆盖 queued/running/completed/failed/cancelled/interrupted 且 terminal 单调；active run 不可 clear，clear 使用 WorkflowRef CAS。 |
| N04 | Authorization、Actor Provenance、Audit 与敏感数据边界 | UI 隐藏不是权限控制；current Canvas/Layout durable writer 无 package permit 不能绕过 Host path；actor/source 与 exact target Agent/Session provenance 绑定；external policy 可 `required-external` fail closed 且异常不泄漏；authorization request 有 typed resource scope；Browser `canvas`/`canvasLayout` Projection 同样受 `canvas.read` read guard；current durable Canvas 拒绝 Host/Provider credential、binary、raw provider diagnostic；read guard disposal/HMR 与 adversarial security tests 有证据。 |
| N05 | Session Projection、Canvas Layout Projection | Browser 刷新/reconnect 得到 authoritative Workflow/Run/Output；Projection fold 保持纯数学，N04 read guard 只作用于 browser delivery。 |
| N06 | Remote、Mutation、History API | Browser 人工 mutation 不走私有 Session hack。 |
| N07 | Canvas UI Shell、Minimal/Editor | `render-service` 持 root；ui-canvas 经 plugin/slot；UI 无第二份 authority。 |
| N08 | Interaction Context | 当前 selection 与 Agent 指代打通，且 context 不持久化。 |
| N09 | Feature Flags / Settings | Harness settings authority + Host enforcement；secret 不入 Browser。 |
| N10 | Media Node Registry | open-world custom node 不需改巨型 switch/whitelist；Browser 不复制 Host catalog。 |
| N11 | Workflow Editor | 人工 DAG 编辑、port connect/disconnect、Host catalog、Draft/CAS 可用。 |
| N11.5 | Harness rc.8 Compatibility | 官方 rc.8 完整 tree 已同步；dynamic client REAL composition 通过；三栏 Canvas 保留；Typert/lock/module-graph 等 generated artifacts 与最终源码一致。 |
| N12 | Media Workflow Engine v2.2 | Browser-independent；Mock DAG/Partial Run/Fingerprint/Executor Registry 全部通过。 |
| N13 | Model Registry / Resolver | Agent/Executor 不猜模型 capability；resolved model identity 可进入 fingerprint。 |
| N14 | Executor / Provider Adapter | 不接真实云也能完整执行；换 Provider 不改 Canvas Domain/Scheduler。 |
| N15 | Run Admission | 任何收费/长任务 Provider task 前有 Host admission 证据。 |
| N16 | Run Lifecycle / Jobs | Run durable、可取消、可重试、可解释、可恢复判断；复用 N03 `run-start/run-update` 与 N04 safe diagnostic/provenance seam，不另造 lifecycle/authorization authority。 |
| N17 | Image Asset / Attachment | 与 Harness attachment store 共用 binary authority；Minimal 可显示 Mock 输出；Asset read 复用 N04 authorization resource。 |
| N18 | Agent Tools / Command Bus | Agent/UI 共用同一 Domain command semantics；Tool 不直连 Provider；Agent Tool actor 复用 N04 exact-agent provenance。 |
| N19 | History / Variant | 连续生成不丢上一版，可 restore/branch。 |
| N20 | Real Image Provider | 自然语言可完成真实 text-to-image/image-edit。 |
| N21 | Video Asset | Browser 授权 Range playback 稳定；route 不另造 ACL，复用 N04 asset permission/resource。 |
| N22 | Async Video Provider | polling/callback/resume/cancel 达到 V1。 |
| N23 | Progress / Observability | session→workflowRun→nodeRun→providerRequest 可追踪；progress 不膨胀 Session；structured logs/raw provider diagnostics 遵守 N04 credential-redaction boundary。 |
| N24 | GC / Retention / Chaos | orphan、race、部分失败都有恢复/清理路径。 |
| N25 | Full E2E / Release | REAL composition + upstream compatibility gate + P0/P1/V1 全部有证据。 |
