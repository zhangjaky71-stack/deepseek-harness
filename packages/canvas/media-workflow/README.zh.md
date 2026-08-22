# `@deepseek-ai/dsh-media-workflow`

[English](README.md) | 中文

Canvas V2.2 的 Browser-independent Media Workflow Definition 与 Execution Engine。当前集成基线：Harness `dsh@0.1.1-rc.2`。

## 职责

本包拥有两个相关但分离的 process-level capability：

- **Media Node Registry** —— exact `(type, version)` definition、ports、config schema、lifecycle metadata、feature requirement 与 executor metadata。
- **Workflow Engine** —— deterministic validation、partial-run planning、immutable run snapshot、execution fingerprint、optional cache seam、executor dispatch 与 cancellation check。

本包不拥有 Session persistence、Browser graph rendering、Provider model selection、Provider SDK、credential、image/video binary storage、quota、cost 或 approval。

## Open-world Registry

Node type 是 open-world extension identifier。Core registration 不用内置 node-type whitelist 限制扩展。历史 custom node 在插件缺失时仍是合法 durable Workflow 数据；当前 authoring/execution 则明确报告 exact definition unavailable。

Registry snapshot 是 immutable，并带 process-local monotonic revision。成功 register/unregister 各推进一次；进程重启可以重新从0开始。这个 revision 只描述 discovery/HMR，不是 Session durable generation。

Browser 只接收 client-safe catalog projection；runtime validator/function/credential 不跨边界。

## Exact Version 规则

所有 definition/executor lookup 使用 `(node.type, node.nodeVersion ?? 1)`。历史 `foo@1` 绝不能借用当前安装 `foo@2` 的 ports/config/execution metadata。

## Workflow Engine

Engine 校验 graph structure 与 exact definitions，再为 full/partial execution生成 deterministic plan。Scheduling语义支持 full run 以及显式 selected/from-node/downstream scope和 boundary inputs。

Run snapshot immutable；后续 Browser edit 或 Registry HMR 不会改变已经 admitted 的 Run。

## `0.1.1-rc.2` Asset 边界

Workflow semantic value 可以携带 stable Canvas image/video AssetRef。Engine 不拥有 Harness Attachment image normalization，也不负责 `RequestImageAttachment` derivation。

Request-image bytes、transform-cache path、Provider temporary URL、remote Files upload identity 都不能进入 Workflow snapshot 或 semantic fingerprint。Fingerprint 基于 stable semantic input/content identity 与 N13 resolve 的 exact media execution identity。

## Model/Provider 边界

本包描述 Node execution requirement，不选择 generation model/provider。N13 resolve media-generation requirement，N14 调用 Provider adapter，N15 做 governance，N16 拥有 durable Run lifecycle。

Harness Chat LLM model routing 是不同领域。

## Browser/Editor 关系

`ui-canvas` 通过 Host client-safe node catalog 获取 exact version metadata，用于 Node Library、ports 和 Inspector。Definition缺失时历史 Node只读/unavailable；Browser不建立第二 Registry。

## Validation 与 Cache

Fresh executor output与 cache hit必须经过同一 semantic output validation。Layout坐标、Browser selection和request transport state都不影响semantic fingerprint。

## Upgrade/Revalidation

N10 Registry与N12 Engine实现大体保留。0.1.1-rc.2迁移重点重验：

- catalog projection 在最新 Client package/domain graph 下的合法性；
- stable Attachment-backed asset value且无request-image泄漏；
- upstream同步后的built package/runtime-closure gates。

参考 N10、N12 与 `UPSTREAM-0.1.1-RC2-BASELINE.md`。