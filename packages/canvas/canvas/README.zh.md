# @deepseek-ai/dsh-canvas

[English](README.md) | 中文

`dsh-canvas` 负责 Session 范围内的媒体 Canvas Domain 与 Host control plane：语义 Workflow、彼此独立的 workflow/run revision、durable media reference、migration/replay、Host authorization/audit、部署 Feature Policy、Session Projection 集成、独立 Editor Layout State、bounded History、request-local Interaction Context，以及 `ctx.canvas`。Session Event 仍然是唯一 durable Canvas authority。Provider 执行、Agent Tool、物理媒体存储和 UI 都是独立 consumer。

## Domain 与 Migration

`CanvasSnapshot` 包含稳定 `CanvasId`、`MediaWorkflow | null`、彼此独立的 `workflowRevision` 与 `runRevision`、可选当前 variant identity、当前/最近 Run，以及当前 Output。语义编辑只推进 `workflowRevision`；Run lifecycle 只推进 `runRevision`；选择已有输出候选不推进任一 revision。

`MediaWorkflow` 与 UI、Provider 无关，只保存语义 Node/Edge/Output id 和 JSON-safe config。Editor 坐标、Provider credential/raw request object、binary media、bearer URL、Browser selection 与 Deployment Feature Flag 都不属于 Workflow State。`CanvasLayoutSnapshot` 在独立 `canvas/layout-change` stream 中保存 Editor position/viewport，并且永不推进任一 Canvas revision。

Durable value 统一走 `stored JSON → migrateStoredX() → current structural value → current invariant`。不支持的 Canvas-owned schema/node version 必须 fail loud。Durable node model 是 open-world：即使 plugin 当前不可用，也会保留其 `type`、可选正整数 `nodeVersion`、config 和图关系；N10/N12 决定当前部署能否校验 ports/config 或执行该 Node。历史 Session Event 永不重写。

## Durable Authority 与 Run Vocabulary

每个被接受的语义 mutation 都以一个完整 post-change `CanvasSnapshot` 写入 `canvas/change`；`clear` 携带 `canvas: null`。当前 Run writer 使用 `run-start` 与 `run-update`。`run-update` 表达 queued/running milestone，以及 `completed`、`failed`、`cancelled`、`interrupted`；legacy `run-complete` 只保留为历史 replay vocabulary。

严格 Fold 会在整个 Session 范围追踪 Canvas 与 Run identity。Run id 在 terminal 后或 Canvas clear/recreate 后都不能复用。Workflow edit 使用 `WorkflowRef { canvasId, workflowId, workflowRevision }`；Run progress 故意不会让这个 semantic CAS fence 失效。Clear 使用相同 Workflow CAS，并拒绝 tombstone 仍有 non-terminal current Run 的 Canvas。

`CanvasService` 先在 detached Fold 上 preflight candidate，再调用 `Session.append()`。Session `internal/dispatch` 是同步 precommit veto 点；log push 是 logical commit；`session/event` 是 postcommit observe。Canvas cache 只有 append 成功后才推进。

## Current-write Authority

当前 `canvas/change` 与 `canvas/layout-change` 是 package-owned writer。`CanvasService` 只在一个 process-local、one-shot write permit 内执行 append；Canvas invariant 在 Session precommit 消费与 Event 完全匹配的 permit。其它 Host 路径即使构造出结构合法的 current event，也会在发布前被拒绝。

这个 fence 用来阻止 trusted Host code 的误绕过与架构漂移，不是针对已经在同进程执行的恶意代码的 sandbox。Invariant 挂载前载入的历史 Event 仍可 replay，不要求 current-write permit。Shipped `dsh-base` 现在会同时挂载 `@deepseek-ai/dsh-invariants` 与 `@deepseek-ai/dsh-canvas/invariant`，因此普通产品 profile 会机械执行这条 permit fence；自定义轻量组合若省略 companion，则仍以 CanvasService 作为 current writer 的正确性边界。

## Host Authorization

`CanvasPermission` 是 CanvasService 与后续 Remote、Agent Tool、History、Asset、Restore、Variant、Layout、Run、Media Route 共享的 Host action vocabulary，包括 read/edit/run/cancel、history read、asset read/export/delete、workflow restore、variant create 和 layout write。

Authorization request 包含规范 actor/source metadata、Session id，以及 typed `CanvasAuthorizationResource` scope（`session`、`canvas`、`workflow`、`run`、`asset`、`variant` 或 `layout`）。内建 `CanvasAuthorizationPolicy` 是当前单用户 actor-kind policy；外部 `ctx.canvasAuthorization` 可在同一个 request contract 后实现更强的 ownership/tenant/ACL 规则。

`CanvasServiceConfig.authorizationMode` 决定外部策略缺失时的行为：

- `single-user-fallback`（默认）：`ctx.canvasAuthorization` 缺失时使用内建 policy。
- `required-external`：外部 service 缺失时 fail closed，返回 `CANVAS_AUTHORIZATION_FAILED`。

外部 Authorization Service 抛错会被归一化为 policy-unavailable，不向调用方传播 identity/ACL backend 的原始诊断。普通 deny 统一成为 `CANVAS_PERMISSION_DENIED`；详细 policy 原因不会变成 Browser authorization oracle。

## Actor / Source Provenance

`CanvasAccessContext` 是 durable audit attribution，不是 caller 可以自由声明的 identity。Browser 与 Asset 路径使用 Host 铸造的单用户 Browser principal（`human:host-browser`）；target Session 始终作为独立 Authorization 输入（`sessionId` 与 resource scope），不会被拿来冒充 human identity。Agent/System 路径继续有自己的更强 provenance 规则：

- `browser-remote` → Host 铸造的 `human:host-browser` principal。
- `agent-tool` → `agent`，id 必须精确等于 target Agent。
- `system-reconciler` → `system`。
- `asset-route` → 在正式 authenticated human identity layer 出现前使用同一个 Host-minted Browser principal。
- `host` → exact target Agent identity，或显式 system actor。

Package 导出 Host-owned constructor：`canvasHostAgentAccess`、`canvasBrowserAccess`、`canvasAgentToolAccess`、`canvasSystemAccess`，Transport/Tool 不需要自行拼 provenance。`canvasBrowserAccess()` 要求 Host caller 已经解析出 target Session，但不会把 Session id 变成 user id。Actor id 有长度上限；durable request/correlation id 最长 128 字符，拒绝 control character、首尾空白，并限制为 log-safe 字符集。

当前 Browser principal 明确只是单用户 Host surrogate。未来 authenticated human/tenant identity 只需要替换同一 Host authorization seam 后面的 principal source，不需要重做 Session/resource model 或 permission vocabulary。

## Sensitive Durable-data Boundary

Canvas 通过结构性规则保护 durable state，而不是依赖 UI 约定。Workflow config 递归拒绝已知 credential/header/binary carrier key，包括 normalize/suffix 后的 API key、access/auth/session/id token、client/callback secret、private/secret key、authorization/cookie/header、base64/data-URL/blob，以及 raw media bytes。还会拒绝显式 data-URL base64、PEM private-key block、明显的 Bearer credential string，以及常见长 `sk-`/`rk-` credential signature。

`assertCanvasDurableAuditSafe()` 把 current-writer 安全边界扩展到 Workflow 之外。Durable Run diagnostic 在 commit 前有长度限制并扫描，因此 Provider SDK Error 中包含 Authorization Header/API credential 时不能被原样复制到 `CanvasRunError.message`。Host/Provider code 必须把 raw failure 分类并脱敏为稳定 safe code + safe summary；N23 如需更多诊断，只能写入经过脱敏的 structured log/trace，而不能进入 Session JSON。Durable image/video object id 与 image display name 同样会被限制和扫描；Binary 与 Provider raw response 始终在 Canvas state 之外。

这些规则承诺的是 Harness/Provider/Host 自身的结构化 credential carrier 与 raw provider diagnostic 不会被有意写入 Canvas durable state。它们**不**承诺能完美识别用户主动粘贴到语义文本中的任意 secret-like string；启发式扫描不能替代完整 DLP 系统。

## Session Projection Read Authorization

当 `ctx.sessionProjections` 存在时，Canvas 注册 `canvas → CanvasSnapshot | null` 和 `canvasLayout → CanvasLayoutSnapshot | null`。Projection Fold 保持纯数学、完全不含 identity。Canvas 另外通过 Session Projection Registry 注册 browser read guard，使同一 Host `canvas.read` policy 同时控制 snapshot/history baseline/change-frame 是否可以把这两个 key 发送出 Host。

这修复了此前 `ctx.canvas.get()` 被 deny、但 Browser Projection 仍然可能暴露 Canvas 的漏洞。Live Projection Read 携带 exact target Session id，并使用与 Canvas Remote、Interaction 相同的 Host-minted Browser principal。Detached cache/history view 当前不会虚构 Session identity：当部署使用 external/required identity-dependent policy 时，Canvas fail closed 并省略 guarded key，直到获得 live authorized Session view。Internal projection cell/checkpoint 仍保留完整派生状态；read deny 不会改写 Session History。

## Editor Layout

Layout State 继续使用独立 durable stream。`CanvasService.saveLayout()` 要求 `canvas.layout.write`、当前 Workflow identity、已存在的 current node id，以及合法 viewport/position；然后在同一 current-write authority fence 下 append 一个完整 `CanvasLayoutSnapshot`。Semantic edit 会保留 Layout；Canvas create/clear 只把当前 Layout Projection 重置为 `null`，不会删除历史 Layout Event。

## Browser Remote 与 Interaction

Browser mutation wrapper 在 Host 上创建可信 `human:host-browser + browser-remote` access；Browser payload 不提供自己的 actor/source。已解析 Session id 始终只是 Authorization target，不会升级为 user principal。Mutation 返回小 receipt；当前 Canvas/Layout 通过 Session Projection 到达 Browser，因此没有第二条 `getCurrent` RPC。

当前 Remote namespace 只暴露已经实现的能力：Workflow edit/replace、Output selection、Layout save、clear，以及 bounded `listRuns`/`getRun`。后续 Run/Cancel/Variant/Restore 在各自 owning node 实现之前不会提前注册。弱 SRC reflection 下，Host 会在 authorization/dispatch 前校验业务 DTO shape，不依赖 generated schema 一定存在。

Run History 仍然只由 `canvas/change` 派生，不是第二套 durable database。每条 History entry 都带 durable `canvasId`；`listRuns()` 必须带该 `canvasId`，`getRun()` 必须带 `canvasId + runId`。Authorization 针对请求中的 generation/resource 执行，因此新建 Canvas 的权限不能读取同一 Session 中已 clear 的旧 generation。Rebuildable index 先复用 N03 strict Fold，再增量应用新 Session Event；Canvas Fold 与 History Index 对同一 batch 会先 staged，全部成功后一起发布。

Remote failure 是显式边界。Typert Gateway 只保留声明过的 `TypertBusinessFailure`、lookup-policy failure 与 cancellation；普通异常统一折叠成固定 `internal / Remote request failed`。Canvas Remote wrapper 只把 allowlist 中的 `HarnessError` code 映射成固定 public message，因此 Host resource id、policy diagnostic、raw internal/provider error text 不会成为 Browser error message。

`CanvasInteractionContext` 是 request-local state，不是 Canvas durable state。`CanvasInteractionService` 将 Browser selection 绑定到精确 ordinary prompt RPC id；`CanvasInteractionBridge` 使用相同 Host-minted Browser principal，校验 Canvas identity/revision/asset，并绑定到实际 admitted user message，然后通过正常、可记录的 Agent message path 注入模型上下文。Selection/focus 本身保持 ephemeral。

## Deployment Feature Policy

Authorization 与 deployment capability 相互独立。Authorization 回答 actor 是否有权执行；Feature Policy 回答当前部署是否提供该能力。`CanvasFeatureService` 拥有 Canvas/Editor/History/Video/Variants/Partial Run/Region Edit/Provider Fallback effective flag。历史值在 feature disabled 时仍保持可读；Flag 不改写 durable history。

`CanvasFeatureService` 对 `ctx.settings` 有正式 activation dependency。激活时，它使用同一套 Feature Config schema 注册 durable `canvas` Settings namespace：Cordis/plugin entry config 作为 composition `base`，durable user Settings document 覆盖该 base，schema default 位于两者之下。该 namespace 声明 `applies: 'restart'`；Service 在本次 activation 中只调用一次 `scope.get()`，把结果冻结为 immutable effective capability snapshot。之后的 Settings 编辑会持久化，但不会 hot-mutate 当前 Host capability；Host restart 或 Feature Service remount 后会重新注册 namespace 并采样更新后的 durable layer。

只读 `canvasFeatures` Remote 只暴露这份 effective capability snapshot。Raw composition/user Settings layer 与 secret metadata 都不会通过该 Remote 离开 Host。这样可以避免 Browser Settings 状态变成第二套 live capability authority，并保证一次 activation 内所有 Host consumer 读取同一个确定的 capability value。

## Validation Responsibilities

Pure Domain Invariant 校验 value relationship；N02 Migration 校验 durable structural compatibility；N03/N04 Service + Session Invariant 负责 transition、commit、provenance、authorization boundary、current-write authority 和 durable-data safety；N10/N12 负责已安装 Node Definition 与 executability；N15/N16 负责 admission/Jobs/Retry/Cancel/Reconciler；N17/N21 负责物理 Image/Video asset persistence 与 authorized binary read；N23 负责 progress、logs、metrics、traces 和额外 diagnostic redaction。

## 模型体验

Canvas Domain/Authorization/Projection 本身不直接面向模型。N18 Agent Tool 后续只会把选定 Host capability 暴露成 model-facing schema，同时仍调用相同的 `ctx.canvas` authorization 与 durable authority path。

#### KV Cache 影响

本 package 的 persistence、authorization、projection 机制不产生 KV Cache 影响。

## 已知限制与暂缓事项

- 内建 Policy 仍然只是面向当前单用户部署的 actor-kind policy。Workspace ownership、tenant ACL 与 authenticated human identity 属于未来 Host policy，并继续位于 `ctx.canvasAuthorization` 后面。
- 当前 Browser principal 由 Host 铸造，但还不是真正逐用户 authenticated identity。Live Authorization 会另外携带 exact target Session；identity-dependent detached read 因 generic detached projection read context 当前没有 Session target 而 fail closed。
- Package-local write permit 只有在 Canvas invariant companion 挂载时才机械阻止 alternate current writer；它不是恶意 same-process code sandbox。Shipped base profile 已挂该 companion；要求机械 fence 的自定义 composition 也必须挂载。
- Sensitive-value signature 是 defense in depth，不是面向任意用户文本的通用 DLP engine。
- Provider Execution、Retry/Cancel Reconciliation、物理 Asset Store 与 Authorized Binary Route 仍由后续 Workplan Node 实现。
- 发布验收前，仍需在最终 rc.8-compatible workspace 重新生成并验证 repository-pinned lockfile/module-graph/Typert generated artifact。
