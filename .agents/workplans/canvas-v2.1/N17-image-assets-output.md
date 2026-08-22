# N17 — Image Asset / Harness Attachment / Multi-candidate Output（0.1.1-rc.2 Revision）

Status: `PLANNED / MAJOR UPSTREAM ALIGNMENT`

## 1. 目标

完全复用 Harness 0.1.1-rc.2 Image Attachment authority完成生成图片/输入图片的 durable master、Canvas AssetRef、多候选、Primary、authorized read与 Minimal/Editor呈现。Canvas不建立第二 image store或 request-image transform cache。

## 2. 依赖

`N16`，并要求 N11.5 已同步官方 Attachment/attachment-local。

## 3. 官方 image authority

最新 Harness 提供：

- normalized immutable `ImageAttachmentRef`；
- verified media type/bytes/width/height；
- normalization后的 `originalDimensions?`；
- image count/byte/pixel/dimension limits；
- `saveImage/saveImages/readImage`；
- route-owned `ImageRequestPolicy`；
- deterministic `readImageRequest`；
- `RequestImageAttachment` + `variantId` request/cache identity。

Canvas必须把这些当底层 image binary authority。

## 4. Durable output commit sequence

```text
N14 Provider raw image bytes
→ validate/normalize with ctx.attachments.saveImage
→ stable ImageAttachmentRef
→ wrap/link CanvasImageAssetRef + provenance
→ N16 append durable output/candidate event
→ Projection/History
```

只有所有需要commit的 candidate durable save成功后，才可发布对应 completed output集合。部分content-addressed orphan若因后续失败存在，由 Attachment/retention规则处理；Canvas不能把部分refs假装成完成状态。

## 5. CanvasImageAssetRef

应保存 stable semantic信息：

- attachment/master stable id/ref；
- media type + safe dimensions/bytes；
- run/node/model/provider provenance；
- candidate index/creation identity；
-必要 content fingerprint。

不得保存：

- request-image data；
- request `variantId`作为 Canvas version identity；
- compression cache path；
- DeepSeek Files upload id/token；
- object URL/provider temp URL。

## 6. Multi-candidate / Primary

`count > 1` 时全部 candidates先 durable。Canvas Output保存 ordered asset refs；`primaryAssetIndex`/selection切换只改变 semantic primary，不重新调用 Provider。

History/restore能恢复 candidate order与 primary semantics。

## 7. Input images

### Composer/user images

0.1.1-rc.2 command/composer image envelope先由 Harness Attachment admission持久化。Canvas command/Agent tool若要引用它们，只将 stable admitted refs关联到 Canvas input/node/run boundary，不重复 base64 upload。

### Existing Canvas assets

N15/N17 authorization-aware Asset Availability确认 stable ref属于目标 Session/Canvas可见范围，再交 Provider adapter读取。

## 8. Model request image projection

如果 Canvas asset随后被发送给 Harness Chat LLM：

```text
Canvas stable ImageAttachmentRef
→ Attachment.readImageRequest(route policy)
→ RequestImageAttachment
→ inline / DeepSeek Files transport
```

该 request projection不产生 Canvas workflow/run/history revision。

Generation Provider若需要自己的 transform格式，由N14/N20 adapter处理；不要假设Chat LLM request image格式等于generation Provider格式。

## 9. Authorized read / presentation

Browser预览必须通过当前 Harness安全 media/attachment exposure seam读取，不以 `attachmentId` 当 bearer URL。`ui-canvas`可组合 Canvas-specific gallery/stage，但不复制 `ui-attachment` 的 Conversation composer/message presentation ownership。

## 10. Tests

- 4 candidates all durable；
- candidate #3 primary switch no provider rerun；
- refresh/replay restores same refs/order；
- save failure → no completed output link；
- Session event no bytes/base64/request variant；
- composer image → stable Canvas input ref without second upload；
- cross-session attachment id denied；
- request-image derivation no Canvas event；
- Attachment normalization metadata compatibility；
- ui-attachment missing does not damage durable Canvas image state。

## 11. 验收

Mock image generation从 N14→Attachment→N16 durable output→Minimal/Editor完整跑通，且 latest official Attachment focused tests + REAL Canvas image flow执行后 ACCEPTED。
