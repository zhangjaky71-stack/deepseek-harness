# Canvas V2.2 / Harness rc.8 — 节点验收矩阵

| Node | 核心交付 | 关键验收 Gate |
|---|---|---|
| N00 | 工程实施总图与节点契约 | 节点编号、upstream baseline、跨节点不变量唯一可追溯。 |
| N01 | Canvas Domain、类型系统与状态不变量 | `types.ts` 无运行时实现；Domain 不依赖 Browser；node type structural admission 是 open-world，不含 built-in whitelist；八种 Product State 有 Domain tests。 |
| N02 | Schema Migration、Node Version 与 Golden Fixtures | 历史 fixture 可迁移；unknown plugin `type@version/config` 可在插件缺失时 reload；Core-only node version ownership；current schema unknown field fail loud。 |
| N03 | Canvas Event Sourcing、Fold、CanvasService 与原子提交 | CanvasService 要求 exact-live Agent + Session；Service 自己 detached-fold preflight 后才 append；live writer meta v2；WorkflowRef CAS 错误分类稳定；semantic no-op 不增长 revision；RunId Session-wide 唯一；`run-update` 覆盖 queued/running/completed/failed/cancelled/interrupted 且 terminal 单调；active run 不可 clear，clear 使用 WorkflowRef CAS。 |
| N04 | Authorization、Actor Provenance、Audit 与敏感数据边界 | UI 隐藏不是权限控制；current Canvas/Layout durable writer 在挂载 invariant 的生产组合中无 package permit 不能绕过 Host path；Browser 使用 Host-minted principal 且 target Session/resource 与 human identity 分离，Agent Tool 绑定 exact Agent；未知 authorization mode 启动失败，external policy 缺失/异常/畸形或矛盾响应可 fail closed；authorization request 有 typed resource scope；live Browser `canvas`/`canvasLayout` Projection 与 `ctx.canvas.get()` 使用同一 `canvas.read` current resource scope，不能以 session-only read 绕过 Canvas ACL；current durable Canvas 拒绝 Host/Provider credential、binary、raw provider diagnostic 与 URL-shaped asset references；read guard fiber disposal/HMR 与 adversarial security tests 有证据。 |
| N05 | Session Projection、Canvas Layout Projection | Browser current Canvas/Layout 只来自 Session Projection；own-domain malformed projection event fail loud、无关 event same-reference；ACL/HMR 在无 Session event 时可用独立 visibility generation 同 seq revoke/re-allow，Client 丢弃 stale generation 且 baseline 可重新取得 authority；HMR replacement 仅允许同 key + 同显式 stable owner，different-owner collision fail loud，legacy unowned active disposal 必须提升 surviving definition、不得残留 ghost；history tail 在 core 返回后按最终真实 source 重新以 exact SessionId 授权，live↔cold race 或 final log/page cut 不一致时整块省略 projections，generic core baseline 不得作为安全 fallback；cold list/cache/restore 同样传 exact target SessionId，cache 不得成为 ACL 旁路；`undefined` Projection 结合 Session `openState` 区分 pending 与 authoritative unavailable 且不泄露 ACL；layout 使用 `canvasId + workflowId + layoutRevision`，与 `workflowRevision/runRevision` 独立，双 Tab stale CAS 与 clear/recreate 同 workflowId generation 穿透均被拒绝；projection bounded、无 binary/history/provider raw；refresh/reconnect 可恢复 authoritative Workflow/Run/Output/Layout。 |
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
| N21 | Video Asset | Browser 授权 Range playback 稳定；Asset binary route 复用 N04 Browser principal + typed resource authorization。 |
| N22 | Async Video Provider | polling/callback/resume/cancel 达到 V1；callback/reconciler source 不可伪造 Browser/Agent actor。 |
| N23 | Progress / Observability | session→workflowRun→nodeRun→providerRequest 可追踪；progress 不膨胀 Session；Provider raw error 先 redaction/classification 再进入 durable summary。 |
| N24 | GC / Retention / Chaos | orphan、race、部分失败都有恢复/清理路径。 |
| N25 | Full E2E / Release | REAL composition + upstream compatibility gate + P0/P1/V1 全部有证据。 |
