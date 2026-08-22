# N14 — Provider Runtime / Adapter / Mock（0.1.1-rc.2 Revision）

Status: `IMPLEMENTED / REVALIDATE`

## 1. 目标

提供 generation Provider-neutral runtime adapter seam、runtime registry、operation handles/cancel、error normalization与可故障注入 Mock Provider。Provider执行结果必须经过独立 materializer 才能进入 Canvas durable state。

## 2. 依赖

`N12, N13`

## 3. 已有实现可保留

PR #44：

- process-local Provider runtime registry；
- exact Provider execution adapter；
- semantic V1 media operation bridge；
- normalized Provider errors；
- async/resumable operation handle；
- contained cancellation；
- opt-in Mock Provider；
- Provider 不直接写 Canvas/Session。

## 4. 0.1.1-rc.2 Image materializer contract

Image Provider output必须改成明确链路：

```text
Provider raw image result
→ validate Provider result metadata/content
→ MediaProviderOutputMaterializer
→ ctx.attachments.saveImage(...)
→ normalized ImageAttachmentRef
→ CanvasImageAssetRef
→ N16/N17 durable output commit
```

Provider runtime本身不拥有 Attachment store，不把 raw bytes写 Session。

## 5. Provider input image

参考图输入来自 stable Canvas attachment-backed asset ref。Adapter在授权/Run context已经确定后通过受控 Asset/Attachment seam读取所需 bytes，按 Provider要求编码。不得让 Browser传 provider URL/path绕过 durable asset authority。

如果某 Provider需要独立 request transform，这属于该 Provider adapter/request transport；不要污染 Canvas Domain，也不要把 Harness Chat LLM `RequestImageAttachment` 无条件复用为所有 generation provider格式。

## 6. Video materializer

N14不定义 durable video bytes。Video Provider raw output交给 N21 video materializer/authority；只有 materialization成功后才可形成 stable CanvasVideoAssetRef。

## 7. Credentials

Credentials只存在 Host Provider adapter/config/credential service中。Registry descriptor、Workflow、Run snapshot、Browser DTO、Session event都不能包含 secret。

## 8. Error/cancel

- Provider network/content/policy errors统一 normalized；
- content rejection不可自动 silent fallback到另一个 Provider，除非N13/N15明确 routing policy允许并记录；
- cancellation只取消属于当前 operation/run的工作；
- late callback/duplicate completion由 N16/N22 idempotency/reconciliation处理。

## 9. 测试

保留 PR #44 tests，并新增/重验：

- image result materializer调用 official Attachment；
- save failure不产生 durable Canvas completed output；
- stable attachment ref returned；
- video仍走N21 seam；
- secret不出现在 descriptor/error/browser DTO；
- latest package/runtime closure gates。

## 10. 验收

Provider Runtime源码可继承；在 synchronized Attachment contract + N17 materializer integration 实际执行前保持 `IMPLEMENTED / REVALIDATE`。
