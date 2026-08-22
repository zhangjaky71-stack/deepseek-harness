# Canvas V2.2 包组

[English](README.md) | 中文

当前上游基线：`deepseek-ai/deepseek-harness@b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`（`dsh@0.1.1-rc.2`）。

本目录包含让 Canvas 成为 Harness 一等扩展域所需的 Host 侧与 Browser 无关领域，用于 Agent 驱动的图片/视频生成和可编辑媒体工作流。当前实现契约以 `.agents/workplans/canvas-v2.1/` 为准。

## 包职责

- `canvas/` —— Canvas durable Domain、Session event/service 集成、current/history Remote、interaction context 与 restart-applied feature capability。
- `media-workflow/` —— open-world Media Node Definition，以及 Browser 无关的 DAG 校验/计划/执行引擎。
- `media-provider/` —— Media Generation Model Registry/Resolver 和 Provider-neutral runtime adapter；它与 Harness Chat LLM model routing 明确分层。
- `media-provider-mock/` —— 仅用于测试/开发组合的 opt-in、确定性/可故障注入 Provider runtime。
- `run-admission/` —— N15 Host Run preflight/governance：授权、Feature、Workflow plan、Asset availability、Model/Provider resolution、Cost/Quota/Approval/Idempotency 与 Concurrency reservation。

后续节点继续加入基于 Harness Attachment 的 durable image output、Canvas Run/Jobs/History、Video storage/provider，以及生产级观测与 retention。

## 当前 ownership 规则

1. Session Log 是 Canvas durable semantic authority；current Projection 必须可重建。
2. Canvas Projection 必须迁到当前官方 Host-state/client-wire-view Session Projection 契约。
3. Harness Attachment 是唯一 Image binary authority。Canvas 只保存稳定图片引用和 provenance，不保存图片 bytes、request-image bytes、cache path 或 remote Files bearer identity。
4. 当前 Image Attachment API 不等于已经解决 Video binary durability；在上游提供官方能力前由 N21 设计。
5. Media Node/Model/Provider 都是 open-world process extension；durable Workflow 不依赖内置 Node whitelist。
6. Browser 与 Agent 操作最终收敛到 Host CanvasService/run-admission，不存在 Browser→Provider 旁路。
7. Provider credential 永远只在 Host。

## 上游重对齐

`0.1.1-rc.2` 迁移要求 Canvas 栈采用最新官方 Session Projection、Attachment request-image pipeline、shared Settings mirror、ui-renderer React ownership、Web bundle transport 与 command image-envelope 语义。主要的产品级 intentional divergence 在 Client Layout：Canvas 增加 generic `shell.main` 产品位，与 Conversation 并存。

参考：

- `.agents/workplans/canvas-v2.1/UPSTREAM-0.1.1-RC2-BASELINE.md`
- `.agents/workplans/canvas-v2.1/HARNESS-CANVAS-PLUGIN-ARCHITECTURE.md`
- `.agents/workplans/canvas-v2.1/ACCEPTANCE-MATRIX.md`

同步这些包时，不得手工修改 `pnpm-lock.yaml`、Typert generated output 或仓库生成型 catalogs。