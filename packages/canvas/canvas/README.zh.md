# `@deepseek-ai/dsh-canvas`

[English](README.md) | 中文

Canvas V2.2 的 Host Canvas Domain/Service 包。当前上游集成目标：`deepseek-ai/deepseek-harness@b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`（`dsh@0.1.1-rc.2`）。

## 本包拥有的职责

- Durable Canvas/Workflow/Run/Asset semantic types 与不变量。
- Session event command 和 `CanvasService` mutation authority。
- Canvas current/history Host API 与 Typert Remote 声明。
- 精确 Agent turn 的 Canvas interaction-context Host staging/binding。
- restart-applied Canvas feature capability service。
- 从 Media Node Registry 映射 client-safe node catalog DTO。
- Canvas authorization vocabulary/policy 集成。

本包不拥有 React、graph renderer、Provider SDK、image binary storage、model routing 或 Provider credential。

## Durable authority

```text
Browser Remote / Agent Tool / Command
              ↓
        CanvasService
              ↓
      Session durable events
              ↓
   official Session Projection
   Host state → client wire view
```

Session Log 是 authority。Process cache 与 Browser store 只能是可重建或 presentation-only 状态。

## Projection 迁移契约

当前官方 Harness Projection framework 已把 Host fold state 与 client-visible wire projection 分层。0.1.1-rc.2 同步时 Canvas 必须迁移到这个契约。

历史 private projection 的 `owner/registerReadGuard` 机制不再视为长期公共 Harness seam。安全要求保持不变：N04 必须在同步后的 Host Session/Remote exposure boundary 上 enforce `canvas.read`，Browser actor 获得 Canvas wire view 前必须通过授权。

Browser wire view 可以包含 stable Canvas/workflow/run id、revision、safe node config/layout 和 stable asset metadata；不得包含 Host-only audit state、credential、binary data、request-image cache data 或 Provider temporary URL。

## Image Asset 边界

完成上游同步后，Harness Attachment 是唯一 Image binary authority：

```text
image bytes
→ ctx.attachments.saveImage(...)
→ normalized ImageAttachmentRef
→ CanvasImageAssetRef / provenance
→ Canvas Session event
```

Canvas durable state 不得包含图片 base64/bytes、Browser object URL、request-image bytes、compression/cache path、`RequestImageAttachment` transport data 或 remote Files bearer identity。

`originalDimensions` 等 optional stable attachment metadata 必须与历史 Canvas value forward-compatible。

在 Harness 提供等价官方 Video attachment seam 前，Video durability 继续由后续 N21 负责。

## Workflow 与 Revision 边界

- Node type 是 open-world semantic identifier；durable legality 不由内置 runtime whitelist 定义。
- `workflowRevision` 只因 semantic workflow mutation 变化。
- `layoutRevision` 与 semantic execution state 分离。
- Registry revision 是 process-local，绝不是 Canvas durable revision。
- Run 固定到 N15 admitted 的 exact workflow identity/revision；后续编辑不会改变该 Run snapshot。

## Authorization

所有 read/edit/run/history/asset 操作都在 Host enforce。Browser gating 不是安全边界。Stable asset id 是引用，不是 bearer authorization。

预期 policy family 包括 `canvas.read`、`canvas.edit`、`canvas.run`、history read、asset read；精确映射以同步后的 Harness authorization/session exposure API 为准。

## Feature Settings

Canvas 注册 durable `canvas` settings namespace。Composition/plugin configuration 是 base，durable user settings 是 overlay，`CanvasFeatureService` activation 时只采样一次 effective settings。

因此当前 `CanvasCapabilities` 描述的是“本次 Host activation 实际可用能力”。Settings checkbox 描述下一次兼容 activation，不会让 Canvas/Editor/Video 半热启用。

## Interaction Context

Browser selection/focus/region 不是 workflow state。Client 将 bounded snapshot 绑定到 exact ordinary prompt RPC id；Host 再绑定 exact admitted user-message id，只在该消息真正进入 Agent turn 时注入。

Region selection 是 Canvas semantic edit intent。上游已经删除 generic `read_image_region`，本包不得把它重新引入为架构依赖。

## Remote 行为

生成的 Typert Remote 使用官方 discriminated `RemoteResult<T>`。已知业务冲突返回稳定 business error code；未预期内部异常要 redacted，不能把任意 `Error.message` 直接发给 Browser。

Mutation/catalog Remote 暂时不可用时，只要 Session Projection 可读，Minimal 仍应能显示 durable current result。

## 与 N15 Run Admission 的关系

本包向 `@deepseek-ai/dsh-canvas-run-admission` 提供 authorization/feature/domain 输入。本包自身不创建收费 Provider operation。未来所有 Browser/Agent Run 都必须经过 N15，再由 N16 创建 durable Run。

## Upgrade 状态

当前源码包含大量 pre-0.1.1-rc.2 实现，正在 revalidation。重新 ACCEPTED 前必须：

1. 同步最新官方 Session Projection infrastructure；
2. 把 Canvas state/wire projection 迁到该 seam；
3. 把 read authorization 映射到当前 Host exposure boundary；
4. 同步 Attachment 与 Settings dependency；
5. 使用 pinned toolchain 重生成 Typert/仓库 generated outputs；
6. 实际执行 focused Canvas replay/authorization/Remote tests 与 REAL assembled Web evidence。

参考 `.agents/workplans/canvas-v2.1/N01-canvas-domain.md` 至 `N09-feature-flags.md`，以及 `N11.5-rc8-compatibility.md`（文件名为保持旧链接不变，当前内容已指向 0.1.1-rc.2）。