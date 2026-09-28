# Canvas V2.1 — 节点验收矩阵

| Node | 核心交付 | 关键验收 Gate |
|---|---|---|
| N00 | 工程实施总图与节点契约 | 可以只通过节点编号唯一定位开发范围。 |
| N01 | Canvas Domain、类型系统与状态不变量 | `types.ts` 不包含运行时实现。 |
| N02 | Schema Migration、Node Version 与 Golden Fixtures | 历史 fixture 已进入测试目录。 |
| N03 | Canvas Event Sourcing、Fold、CanvasService 与原子提交 | Agent/Browser 未来都只能通过 CanvasService 写业务状态。 |
| N04 | Authorization、Actor、Audit 与敏感数据边界 | UI 隐藏按钮不是唯一权限控制。 |
| N05 | Session Projection、Canvas Layout Projection 与客户端状态读取 | Browser 刷新后得到当前 Workflow/Run/Output。 |
| N06 | Typert Remote、Mutation API 与 History Query API | 浏览器可完成所有人工 mutation。 |
| N07 | Canvas UI Shell、Minimal/Editor 与产品状态机 | UI 不维护第二份 authoritative Canvas。 |
| N08 | Canvas Interaction Context 与自然语言指代 | 自然语言指代和 Canvas 当前选择打通。 |
| N09 | Feature Flags 与部署能力暴露 | 任何 flag 都无法仅靠绕过 UI 使用被关闭能力。 |
| N10 | Media Node Registry、端口 Schema 与节点生命周期 | 新增节点不需要修改多个巨型 switch。 |
| N11 | Workflow Editor、Draft、Auto-save、Undo/Redo、Copy/Paste 与 Layout | 人工可完成基本 DAG 编辑。 |
| N12 | Media Workflow Validator、Scheduler、Partial Execution 与 Fingerprint | Engine 完全不依赖 Browser。 |
| N13 | Media Model Registry 与 Requirement Resolver | Agent 不需要猜哪个模型支持什么。 |
| N14 | Media Provider 抽象、路由与 Mock Provider | 不接任何真实云服务也能跑完整执行链。 |
| N15 | Run Admission、Quota/Cost、Feature、权限与并发治理 | 任何 Provider task 都有明确 admission 证据。 |
| N16 | Run Lifecycle、Jobs、Retry、Idempotency、Cancel 与 Reconciler | Run 生命周期 durable、可解释、可取消。 |
| N17 | 图片资产、Attachment、多候选结果与 Primary Output | 文生图 Mock E2E 可在 Minimal 显示。 |
| N18 | Agent Canvas Tools、Intent Semantics 与 Canvas Read/Inspect | Agent 和 Browser 真正共享同一 Domain。 |
| N19 | Run History、Variant、Restore、Provenance 与 Asset Library | 用户不会因连续生成丢掉上一版。 |
| N20 | 真实图片 Provider 接入与图片 V1 产品验收 | 用户自然语言能生成真实图片。 |
| N21 | Video Asset Store、授权 Binary Route 与 Range Playback | 浏览器可稳定播放/拖动视频。 |
| N22 | 异步视频 Provider、Polling/Callback、Resume 与视频 V1 | 视频正式达到 V1 要求，不再是可选能力。 |
| N23 | 实时 Progress、Observability、Metrics 与诊断链路 | 用户可理解当前运行阶段。 |
| N24 | Asset GC、Data Retention、故障注入与恢复硬化 | 不存在明显永久 orphan 无清理路径。 |
| N25 | 完整 E2E、REAL Composition、发布验收与回归门禁 | 所有 P0/P1/V1 checklist 有明确证据。 |
