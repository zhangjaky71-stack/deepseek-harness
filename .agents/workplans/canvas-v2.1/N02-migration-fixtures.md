# N02 — Migration、Node Version 与 Golden Fixtures（0.1.1-rc.2 Revision）

Status: `REVALIDATION REQUIRED`

## 1. 目标

保证 Canvas durable history 在版本演进、插件缺失和 Attachment metadata 扩展下可重建，不把当前部署可用性误当成历史数据合法性。

## 2. 依赖

`N01`

## 3. 迁移原则

- migration 是确定性的 pure transformation；
- 已知 built-in node version 可按 core 规则迁移；
- unknown/custom node type/version 必须原样保留，不猜迁移；
- future known built-in version 可以 fail loud，避免 core 错误解释；
- migration 不访问 Browser、Provider、credential、Settings 或 runtime Registry。

## 4. Attachment forward compatibility

0.1.1-rc.2 的 `ImageAttachmentRef` 可能包含 `originalDimensions` 等新增 optional metadata。Canvas migration/fixtures 必须证明：

- 旧 asset ref 能被新代码读取；
- 新 optional metadata 不要求旧日志存在；
- request-image/variant/Files transport 字段不会被 migration 写进 durable Canvas schema；
- stable attachment id/media metadata 仍可参与 provenance/restore。

## 5. Golden fixture 范围

至少包含：

1. 最早支持版本的基础 Canvas；
2. built-in workflow；
3. custom `plugin.demo@3` 在插件缺失时仍可 migrate/load；
4. known built-in future version 拒绝；
5. image AssetRef old shape；
6. image AssetRef new optional metadata shape；
7. workflow/layout/run revision 边界；
8. historical terminal/interrupted states。

## 6. 禁止项

- 禁止用 N10 当前 Registry lookup 决定历史 fixture 是否可加载；
- 禁止 migration 为未知 plugin node 填默认 config/ports；
- 禁止把当前 Feature disabled 当作 migration error；
- 禁止将 request-time image variant 转成 durable asset 版本。

## 7. 测试/验收

- 所有 golden fixture 可重复迁移并 stable serialize；
- migration 幂等或显式 version-step deterministic；
- custom node absent/present 两种环境读取结果一致；
- Attachment optional metadata forward/backward compatibility；
- 与 N01 current decoder、N03 replay 联合测试通过。
