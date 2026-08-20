# N17 — 图片资产、Harness Attachment、多候选结果与 Primary Output（rc.8 Revision）

## 1. 节点目标

利用 Harness durable attachment/asset 能力完成图片输入和生成结果的持久化、多候选、Primary 选择与 Minimal 展示，同时与 rc.8 动态 `ui-attachment` presentation ownership 对齐。

## 2. 前置依赖

`N16`

## 3. 本节点范围

- Harness attachment store/image save seam。
- CanvasImageAssetRef / AttachmentRef normalization。
- CanvasOutput assets[] / primaryAssetIndex。
- count 多候选。
- provenance/metadata。
- authorized image read。
- user message image attachment → Canvas input asset linking seam。

## 4. 明确不在本节点处理

- Session/Workflow 不保存 base64/bytes/object URL/provider temp URL。
- Canvas 不建立第二套 image upload store。
- `ui-canvas` 不复制 `ui-attachment` 组件 ownership。

## 5. 核心契约

Session/Workflow 只保存稳定引用和 provenance：

```text
asset/attachment id
mime/type
safe metadata
run/workflow/node/model/provider provenance
```

Binary 先 durable save，成功后才能 commit Run completed/output linked。

## 6. rc.8 Attachment Ownership

```text
Harness Attachment Store      = binary authority
ui-conversation               = message/composer data owner
ui-attachment                 = attachment presentation owner
Canvas AssetRef               = Workflow/Run semantic reference
ui-canvas MediaStage          = Canvas-specific output composition
```

Canvas 可以显示 asset，但不得把 attachment presentation 重新静态复制进 conversation shell。

## 7. 实施步骤

1. Provider/Executor result bytes 先 durable save。
2. 生成稳定 AssetRef/AttachmentRef。
3. count candidates 全部保存。
4. `selectOutput` 只改 primary，不重新 Provider run。
5. Minimal gallery/primary。
6. authorized image loader。
7. 用户附件作为 image node input 时只传 ref/content fingerprint。
8. 记录 provenance。

## 8. 测试要求

- [ ] 4 candidates 全 durable。
- [ ] primary 切换不生成新图。
- [ ] 刷新恢复。
- [ ] save failure 时 Run 不 commit completed。
- [ ] Session event 无 binary/base64。
- [ ] composer image 可通过 ref 成为 Canvas input。
- [ ] ui-attachment plugin 缺失不会损坏 durable asset。

## 9. 验收标准

- [ ] Mock 文生图 Minimal 可显示。
- [ ] 多候选/primary 语义稳定。
- [ ] Asset 与 Workflow/Run 可追溯。
- [ ] 与 Harness attachment store 共用同一 binary authority。
