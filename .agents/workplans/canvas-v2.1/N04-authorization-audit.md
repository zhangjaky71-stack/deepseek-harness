# N04 — Authorization、Actor Provenance、Audit 与敏感数据边界（V2.2 / Harness rc.8）

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.2 + Harness rc.8  
> 前置：N01/N02/N03 当前 remediation stack  
> 状态：`REVIEW`，源码/文档 remediation 已完成，仓库固定工具链验证仍待执行。  
> 原则：N04 负责 Host 安全 seam 与 durable 安全边界，不提前实现多租户身份、Provider、Job、Asset Store 或治理系统。

## 1. 节点目标

建立一个所有 Canvas Consumer 都必须复用的 Host security boundary：

```text
可信 Host provenance
→ resource-aware authorization
→ feature/domain/preflight validation
→ durable-data safety
→ package-owned current-write authority
→ Session precommit invariant
→ Session commit
```

Remote、Agent Tool、History、Projection、Asset Route、Run/Reconciler 后续都复用同一权限 vocabulary 与 attribution 规则；UI 隐藏按钮永远不是权限控制。

## 2. 前置依赖与职责边界

依赖 `N03`：Session Log 是唯一 durable authority；CanvasService 是 business mutation owner；append 是 commit point；cold replay 必须等价于 live state。

N04 不拥有：

- N15 的 quota/cost/admission policy。
- N16 的 Job、Retry、Cancel、Reconciler 实现。
- N17/N21 的图片/视频物理存储与 binary route。
- N23 的完整 structured log/trace/metrics 实现。
- 多用户 Identity/Tenancy/Workspace ACL 的最终策略实现。

但这些节点必须能复用 N04 冻结的 authorization/provenance/safe-diagnostic contract。

## 3. Permission Vocabulary

当前 `CanvasPermission`：

```text
canvas.read
canvas.edit
canvas.run
canvas.cancel
canvas.history.read
canvas.asset.read
canvas.asset.export
canvas.asset.delete
canvas.workflow.restore
canvas.variant.create
canvas.layout.write
```

新增能力必须在其 owning node 有真实 Host operation 后再扩展，不发布只有名字没有执行面的权限。

## 4. Authorization Request

Host authorization request 必须显式包含：

```text
permission
sessionId
actor
source
requestId? / correlationId?
resource
```

`CanvasAuthorizationResource` 是 typed scope：

```text
session
canvas
workflow
run
asset
variant
layout
```

Actor identity 与 target Session/resource 是两个不同概念。尤其 Browser principal 不能用 SessionId 充当用户身份；SessionId 单独进入 `sessionId`/`resource`，供 ownership/tenant policy 判断目标资源。

resource scope 的目的不是让 Domain 持有 ACL，而是给外部 Host policy 足够资源 identity，避免 N17/N19/N21 再破坏 N04 API。

同一个 logical read/write action 经不同 transport 到达 Host 时，必须使用相同的 current resource scope。Transport 不能把 `canvas`、`workflow`、`asset` 等具体资源降级成更宽的 `session` scope 来获得更弱的授权判断。

## 5. Authorization Mode 与 Fail-closed

`CanvasServiceConfig.authorizationMode`：

- `single-user-fallback`：当前默认。外部 `ctx.canvasAuthorization` 缺失时使用内建 actor-kind policy。
- `required-external`：外部 authorization service 缺失时 fail closed，mutation/read 返回 `CANVAS_AUTHORIZATION_FAILED`。
- 任何未知 runtime mode 值都必须在插件构造/启动阶段拒绝，不能静默解释为 `single-user-fallback`。

外部 authorization service 的返回值同样属于不可信边界：

- allow 只接受 exact `{ allowed: true }`。
- deny 只接受声明过的 `allowed:false + reason + policyCode?` 字段。
- `reason` 只能是 `denied | policy-unavailable`。
- `policyCode` 若存在，必须 bounded、无 control character、无首尾空白并使用 log-safe 字符集。
- 矛盾、额外字段、畸形值或 service exception 一律 fail closed 为 `policy-unavailable`。

```text
raw policy/identity backend error or invalid response
→ Host internal diagnostic only
→ public decision = policy-unavailable
→ CanvasService = CANVAS_AUTHORIZATION_FAILED
```

普通 deny 统一映射为 `CANVAS_PERMISSION_DENIED`；不能把详细 ACL 原因直接暴露成 Browser authorization oracle。

## 6. Actor / Source Provenance

`CanvasAccessContext` 是 audit attribution，不是无条件可信的 caller identity。

当前单用户阶段冻结以下 binding：

| source | actor contract |
|---|---|
| `browser-remote` | Host 铸造的固定单用户 Browser principal：`human:host-browser`；target Session 单独进入 authorization request |
| `agent-tool` | `agent`，id = exact target Agent id |
| `system-reconciler` | `system` |
| `asset-route` | 与 Browser Remote 相同的 Host-minted Browser principal；正式 identity layer 后替换 principal source |
| `host` | exact target Agent，或显式 system actor |

Host-owned constructors：

```text
canvasHostAgentAccess()
canvasBrowserAccess()
canvasAgentToolAccess()
canvasSystemAccess()
```

`canvasBrowserAccess()` 的 Session 参数只证明 Host 已解析目标 Session，并用于后续 Authorization target；它不会把 SessionId 转换成 human id。Browser payload、Tool argument、Provider callback payload 都不能自由声明 stronger actor/source。

未来接入 authenticated human identity 时，只替换 Browser principal source；`CanvasPermission`、`sessionId` 与 typed resource contract 不需要重做。

## 7. Audit Identifier Protocol

Durable actor/request/correlation metadata 必须 bounded：

- actor id：最多 256 字符。
- requestId / correlationId：最多 128 字符。
- request/correlation id 使用 log-safe 字符集。
- control character、首尾空白拒绝。
- audit materialization 仅 allow-list `schemaVersion/actor/source/requestId/correlationId`。

任何 caller extra properties、headers、credential、binary 都不能进入 `canvas/change.meta`。

## 8. Sensitive Durable-data Boundary

### 8.1 Workflow Config

递归检查 open-world node config，不依赖内建 node whitelist。必须拒绝明确 credential/header/binary carrier，包括 normalized/suffix 形式：

```text
authorization / headers / cookie
api key
access/auth/session/id/refresh token
client/callback secret
private/secret key
credential/password
base64/data-url/blob
raw file/image/video/audio bytes
```

并拒绝明显危险 string signature：

```text
data:*;base64,...
PEM private key block
Bearer credential-shaped value
常见长 sk-/rk- credential signature
```

不能使用粗暴 `key.includes('token')`，正常 `maxTokens/tokenLimit` 必须可用。

### 8.2 Run / Provider Diagnostics 与 Asset References

`CanvasRunError` 是 durable wire-safe summary，不允许直接复制 Provider SDK/raw HTTP exception。

```text
raw provider failure
→ classify + redact
→ stable safe code
→ bounded safe message
→ CanvasRunError durable
```

`assertCanvasDurableAuditSafe()` 至少检查当前 Workflow、Run error code/message、image/video durable object id、video mediaType 与安全 display metadata。Image `attachmentId` / video `assetId` 必须是 opaque storage reference；`scheme://...` URL-shaped reference 必须拒绝，避免 provider signed/bearer URL 进入 Session authority。

URL 拦截不能粗暴写成“禁止任意 `scheme:`”：现有本地 Attachment Store 的合法 content-addressed id 是 `sha256:<64hex>`，必须继续允许。

N23 structured logging 可以拥有更多诊断，但仍必须 redacted，且 raw provider payload/credential 不进入 Session。

### 8.3 Threat-model Boundary

N04 保证 Harness/Provider/Host 自身的结构化 credential carrier、binary 和 raw provider diagnostic 不被有意写入 Canvas durable state。

N04 **不**承诺识别用户主动粘贴到自然语言 Prompt 中的所有 secret-like text。启发式扫描不是完整 DLP 系统。

## 9. Current-write Authority

只有 Canvas package 当前 writer 可以提交新的：

```text
canvas/change
canvas/layout-change
```

机制：

```text
CanvasService
→ authorize / provenance / validate
→ detached fold preflight
→ issue process-local one-shot write permit
→ Session.append
→ Canvas invariant precommit consumes exact permit
→ strict transition validation
→ commit
```

没有 permit 的 direct current append 即使结构完全合法，也必须在**挂载 Canvas invariant companion 的组合中** fail before log publication。

历史 replay 不要求 current permit，保证旧 Session 可读。该 permit 防 accidental alternate Host writer，不是 same-process malicious-code sandbox；轻量组合若不挂 invariant，仍依赖 CanvasService 作为 current writer 的正确性边界。

## 10. Browser Projection Read Security

Browser current Canvas 通过 Session Projection，而不是 `getCurrent` Remote。因此 `canvas.read` 不能只保护 `ctx.canvas.get()`。

正确 ownership：

```text
Projection fold/math               identity-free
SessionProjectionRegistry carrier  browser read guard
Canvas Host policy                 canvas.read
```

Canvas 为 `canvas` 与 `canvasLayout` 注册 read guard：

- live snapshot/change frame 带 exact target Session id，并使用同一个 Host-minted `human:host-browser` principal 做 Host read decision；
- live guard 必须解析 exact live Session，折叠/同步与 `ctx.canvas` 相同的 current Canvas state，并使用与 `ctx.canvas.get()` 相同的 `canvas.read` current resource scope：无当前 Canvas 时为 `session`，已有当前 Canvas 时为具体 `{ kind:'canvas', canvasId }`；
- **禁止**因为 Projection 是 Session carrier 就永久使用 `resource:{kind:'session'}`。外部 ACL 若允许 Session-level read 但拒绝当前 Canvas read，Projection 必须同样隐藏 `canvas` / `canvasLayout`；
- live Session 无法解析时 fail closed；
- deny/guard throw fail closed，key 不出站；
- internal cell/checkpoint 不删除，read deny 不改写历史；
- detached cache/history 当前没有可验证 target Session context 时，不虚构 Session/resource；external/required identity-dependent policy 下 fail closed。

Session Projection 的 read guard 本身是通用 seam，但不定义通用 ACL；只有拥有真实 Host read policy 的 domain 才应注册。

## 11. 实施代码位置

Canvas：

- `packages/canvas/canvas/src/types.ts`
- `packages/canvas/canvas/src/authorization.ts`
- `packages/canvas/canvas/src/audit.ts`
- `packages/canvas/canvas/src/write-authority.ts`
- `packages/canvas/canvas/src/runtime.ts`
- `packages/canvas/canvas/src/invariant.ts`
- `packages/canvas/canvas/src/projection.ts`
- `packages/canvas/canvas/src/interaction-bridge.ts`
- `packages/canvas/canvas/tests/authorization.spec.ts`
- `packages/canvas/canvas/tests/authorization-hardening.spec.ts`
- `packages/canvas/canvas/tests/audit.spec.ts`
- `packages/canvas/canvas/tests/invariant.spec.ts`
- `packages/canvas/canvas/tests/interaction-bridge.spec.ts`

Session Projection cross-package seam：

- `packages/session/session-projection/src/index.ts`
- `packages/session/session-projection/tests/read-guards.spec.ts`

## 12. 测试 Gate

必须覆盖：

- [ ] read allow / edit deny，Host commit 前拒绝。
- [ ] agent run allow / human run deny。
- [ ] initial variant 额外要求 `canvas.variant.create`，并使用 concrete candidate variant resource。
- [ ] browser/system、伪造 browser human、agent-tool/human、agent-tool/other-agent、reconciler/human provenance spoof 拒绝。
- [ ] Remote / Projection / Interaction Browser 路径使用同一 Host-minted Browser principal。
- [ ] Agent 与 Session id 不相等时，Browser/Agent provenance 仍按各自 contract 工作。
- [ ] current CanvasService + invariant write permit 正常提交。
- [ ] direct current `canvas/change` 无 permit 拒绝。
- [ ] direct current `canvas/layout-change` 无 permit 拒绝。
- [ ] historical meta v1 / historical log 仍可 late-load replay。
- [ ] unknown authorizationMode 启动失败而不是回退。
- [ ] required-external 缺失 fail closed，Session seq 不变。
- [ ] external policy throw、畸形 response、矛盾 allow/deny response 均 fail closed。
- [ ] projection `canvas.read` deny 时 `canvas` / `canvasLayout` 不出现在 browser snapshot。
- [ ] resource-aware ACL：允许 `session` read、拒绝当前 `canvas` read 时，`ctx.canvas.get()` 与 live Projection 都必须 deny/隐藏。
- [ ] projection guard throw fail closed。
- [ ] detached view 不虚构 Session identity/resource。
- [ ] projection read guard dispose 后解除影响，证明 HMR-safe。
- [ ] `X-API-Key`、data URL base64、Bearer credential、PEM private key 拒绝。
- [ ] URL-shaped image/video asset id 拒绝且错误消息不回显 URL；合法 opaque/content-addressed id 不误杀。
- [ ] `maxTokens/tokenLimit` 不误杀。
- [ ] unsafe Provider diagnostic 不能作为 durable Run error。
- [ ] oversized request/correlation metadata 拒绝。
- [ ] rejected secret value 不出现在异常消息或 Session JSON。

## 13. Acceptance Gate

N04 只有同时满足以下条件才可 `ACCEPTED`：

1. UI visibility 不是唯一权限控制。
2. current durable writer 不能机械绕过 Host authorization path（最终生产组合必须挂载 invariant companion）。
3. actor/source provenance 可验证，不能由 Browser/Tool 自报 stronger identity；Session resource 与 human principal 不混用。
4. Browser Projection、Remote、Interaction 与 Host current read 使用一致的 Browser principal / `canvas.read` security semantics；live Projection 与 `ctx.canvas.get()` 对同一 current Canvas 必须使用相同 resource scope，不能用 session-only authorization 绕过具体 Canvas ACL。
5. 所有 current Canvas durable payload 都不允许 Host/Provider credential、binary、raw provider diagnostic 或 signed/bearer URL-shaped asset reference。
6. external authorization 可配置 fail-closed，未知 mode / backend exception / invalid decision 不得放宽访问且不泄漏 backend diagnostic。
7. Run/Asset/Tool/History 后续可复用 resource-aware seam，不需要另起授权体系。
8. 测试、typecheck、lint、build、REAL composition/相关 repository gates 有真实证据。

## 14. 暂缓项

以下是明确 follow-up，不属于 N04 验收阻塞：

- 正式 authenticated human identity、workspace ownership、tenant ACL。
- detached projection read 携带明确 Session target 的通用 carrier API（当前 identity-dependent policy fail closed）。
- N15 quota/cost approval。
- N16/N22 新 background/callback source 的最终 vocabulary。
- N23 完整 logging/telemetry redaction pipeline。
- 任意用户自然语言文本的通用 DLP。

## 15. 验收结论格式

验收时输出：实际修改文件、security contract 对照、测试命令/结果、REAL composition 证据、剩余限制，以及 `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED`。
