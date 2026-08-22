# N05 — Session Projection 与 Layout Projection（0.1.1-rc.2 Revision）

Status: `REVALIDATION REQUIRED / P0`

## 1. 节点目标

把 Canvas Session events deterministic fold 成 Host current state，并通过官方最新 Projection wire-view contract 暴露 Browser-safe current Canvas；同时保持 semantic workflow 与 durable/editor layout revision 分离。

## 2. 依赖

`N03, N04`

## 3. 新官方 Projection 模型

N05 必须对齐当前 Harness 的两层 Projection：

```text
SessionProjectionStateMap
       │
       ▼
ProjectionDefinition
  stateSchema / stateVersion
  init / apply
       │ optional client wire
       ▼
wire.viewSchema / wire.view(...)
       │
       ▼
SessionProjectionMap (client-visible)
```

核心不变量：

```text
Host fold state ≠ Browser wire view
```

Canvas Host state 可以包含 Browser 不需要/不应看到的内部信息；wire view 只输出 Minimal/Editor 所需的 client-safe DTO。

## 4. Canvas Host state

至少可重建：

- current Canvas identity/generation；
- current Workflow + `workflowRevision`；
- current layout identity/revision/positions（若 layout durable authority 仍归 Session projection）；
- current/linked Run summary；
- stable output/asset refs；
-必要 current status/diagnostics。

Large history 不塞 current state，由 N06/N19 history API/index 管理。

## 5. Browser wire view

Browser wire view 只包含：

- stable semantic ids/revisions；
- workflow nodes/edges/config safe values；
- layout values；
- run/output summary；
- stable client-safe asset refs/metadata。

禁止：

- provider credentials；
- raw authorization/audit internals；
- image/video bytes；
- request-image bytes/variant cache internals；
- provider temporary URLs/Files bearer identity；
- Host service objects/functions。

## 6. Read authorization

N04 负责在当前官方 Session/Remote exposure boundary enforce Canvas read permission。N05 不再把历史 private `owner/registerReadGuard` 作为长期 Projection API contract。

Host fold 应继续运行，即使某 Browser actor 无权读取 wire view。

## 7. Replay/checkpoint

- projection state version 显式；
- checkpoint restore 与 full replay 结果一致；
- new projection code 能读 N02 支持的历史 events；
- reconnect 使用官方 Session projection lifecycle，不建立 Canvas 私有 replay channel。

## 8. Layout separation

Semantic workflow layout-sensitive data与 execution semantics 分开：

- node x/y/viewport 等 presentation layout 写入 `layoutRevision` authority；
- node type/config/edges 进入 `workflowRevision`；
- layout save 不改变 N12 fingerprint；
- workflow semantic CAS 不因纯位置变化冲突。

如果最新 official Session Projection 对 layout persistence 提供新的 common seam，可使用，但 ownership 分离不变。

## 9. Minimal/Editor consumer contract

N07/N11 必须从同一个 Browser Session projection snapshot 读取 current Canvas。Minimal 不应依赖 Editor Registry/Remote 才能显示已持久化结果。

## 10. 测试要求

- full replay == checkpoint restore；
- Host state -> wire view deterministic；
- Browser DTO 不泄漏 Host-only data；
- unauthorized Browser cannot obtain wire view through current official exposure path；
- reconnect/session switch isolation；
- workflow/layout revision independence；
- custom node absent still visible in wire view as semantic node；
- stable attachment-backed asset ref survives replay；
- request-image cache creation does not change projection。

## 11. 验收

N05 是本次 upstream migration 的 P0 gate。完成官方 Projection code sync、Canvas definition迁移、N04 read authorization mapping、focused replay/checkpoint/wire-view tests 后才能恢复 ACCEPTED；N06/N07 的当前实现随后才能重新验证。
