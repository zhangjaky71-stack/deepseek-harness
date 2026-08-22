# N01 — Canvas Domain、类型系统与状态不变量（0.1.1-rc.2 Revision）

Status: `REVALIDATION REQUIRED`

## 1. 节点目标

定义 Browser/Provider 无关的 Canvas durable semantic domain：Canvas、Workflow、Node/Edge、Run、AssetRef、revision 与纯值不变量。Domain 必须能在 Provider、Browser 或自定义 Node 插件暂时不存在时安全解码历史数据。

## 2. 前置依赖

`N00`

## 3. 当前上游影响

官方 0.1.1-rc.2 Image Attachment 增加 normalized master、`originalDimensions`、request image policy/variant 等能力。N01 只吸收**稳定 durable reference 所需的字段/兼容性**，不得把 request-time `RequestImageAttachment`、variant bytes/cache/Files transport id 引入 Canvas durable schema。

## 4. Durable Domain 边界

```text
Canvas
├─ canvasId / generation
├─ workflow + workflowRevision
├─ layout identity/revision reference
├─ current/linked run summary
└─ stable asset references
```

Image asset 可以引用 Harness `ImageAttachmentRef` 或 Canvas 包装的稳定子集；Video asset 由 N21 的 durable video ref 解决。

## 5. Open-world Node contract

- durable `node.type` 是开放字符串标识，不是内置七类 whitelist；
- `nodeVersion` 是正整数；
- core 只对已知内置版本做已知迁移；
- 未安装 plugin/custom node 必须仍可加载和保留；
- 当前可创建/可执行/ports/config schema 由 N10 Registry 决定，不由 N01 durable decoder 决定。

## 6. Revision 不变量

- `workflowRevision` 只因 semantic workflow mutation 变化；
- `layoutRevision` 独立；
- Run 使用 immutable admitted workflow identity/revision；
- process-local registry revision 不是 durable Canvas revision。

## 7. Asset 不变量

Canvas durable AssetRef 可以保存：

- stable attachment/video id；
- verified media type；
- safe width/height/duration/size metadata；
- provenance 所需 run/node/model/provider ids；
- candidate/primary 语义。

禁止保存：bytes/base64/blob URL/provider temp URL/request-image bytes/remote Files bearer identity。

## 8. Pure validation

N01 可以验证：

- record/value shape；
- stable identifier 非空/长度约束；
- node/edge identity relationships；
- revision integer/range；
- workflow graph 结构的基础引用完整性。

N01 不应验证：

- 当前 Provider 是否安装；
- 当前 Model 是否 enabled；
- 当前 Feature 是否启用；
- credential 是否存在；
-当前 Node definition 是否已注册。

这些属于 N09/N10/N13/N14/N15。

## 9. 0.1.1-rc.2 迁移要求

- [ ] 新增 Attachment optional metadata 时旧 Canvas durable value 仍可读；
- [ ] request-image 结构不会被序列化进 Canvas Domain；
- [ ] image master reference 与 Canvas semantic asset reference 的 ownership 在 types/JSDoc 中明确；
- [ ] historical custom node 在 plugin 缺失时仍可 decode。

## 10. 测试

- built-in + custom node decode；
- unknown plugin node round-trip；
- malformed/empty node type reject；
- revision invariants；
- old/new image AssetRef compatibility；
- accidental bytes/base64/request-image durable payload rejection where boundary schema owns such fields。

## 11. 验收标准

N01 只有在最新 upstream types 下完成 focused domain tests、N02 migration compatibility 与 repository type/build gates 后才可重新 ACCEPTED。历史 implementation 记录继续保留，但旧 rc.8 验证不代表当前接受。
