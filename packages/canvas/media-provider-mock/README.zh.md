# `@deepseek-ai/dsh-media-provider-mock`

[English](README.md) | 中文

Canvas Media Generation Runtime 的 opt-in 开发/测试 Provider，用于在不调用收费外部 Provider 的情况下验证 N13/N14/N15/N16 契约。

## 范围

Mock 通过真实 Provider 插件相同的 public media-provider seams 注册 Provider/model descriptor 与 Provider runtime adapter。它支持 deterministic success，以及 Workflow、Admission、Lifecycle 测试需要的故障、取消和异步场景。

它绝不能因为真实 Provider 不可用就变成 production fallback。

## Authority 边界

- Mock 不直接写 Canvas Session event。
- Mock 不拥有 durable image/video storage。
- Image result bytes/fixture 必须与真实 Image Provider 一样经过 N17 Harness Attachment materializer。
- Video result bytes/fixture 必须经过 N21 video materializer。
- Model/provider selection 仍由 N13；governance 仍由 N15；durable lifecycle 仍由 N16。

## 禁止 Silent Production Fallback

真实 Provider 的 content/policy/network failure 不得自动重路由到这个 Mock。Mock 只由明确的 test/development composition 安装。

## `0.1.1-rc.2` Revalidation

N14 的核心 Mock 行为继续保留。重验必须证明 Image output 不再依赖任何 private asset-store 假设，而是先进入同步后的 official Attachment path，再允许 Canvas output completion。

测试还应继续保证：无 credential、deterministic execution identity稳定、cancellation不越界、plugin dispose/HMR registration干净。

参考 N14、N17、N25。