# N20 — Real Image Provider Adapter（0.1.1-rc.2 Revision）

Status: `PLANNED`

## 1. 目标

把至少一个真实 Image Generation Provider 接入 N13/N14/N15/N16/N17，而不让 Provider SDK、credential、temporary URL或binary storage渗入 Canvas Domain/Browser。

## 2. 依赖

`N14, N15, N16, N17, N18, N19`

## 3. Text-to-image flow

```text
Canvas workflow
→ N15 admission exact model/provider
→ N16 run
→ N12 executor
→ N14 Provider adapter
→ provider raw result
→ N17 official Attachment save/normalize
→ Canvas stable image output
→ Session/Projection/History
```

## 4. Image-edit/reference flow

Input必须来自 stable authorized Canvas/Harness attachment-backed asset ref：

```text
stable ref
→ N15 availability/authorization evidence
→ controlled attachment/asset read
→ Provider-specific request encoding
→ provider
```

Browser不能直接提供 filesystem path/provider URL作为可信 image input。

## 5. Region edit

N08 normalized region由 workflow/image-edit node配置解释。Provider支持 mask/region时adapter映射；不支持时按 model capability/resolution fail或由明确工作流transform处理。不得依赖已删除 `read_image_region`。

## 6. Request image distinction

Harness Chat LLM `readImageRequest` pipeline用于Chat/LLM route projection；真实 generation Provider adapter可以复用stable master读取/通用图像处理基础设施，但不能假设其协议等同 DeepSeek Files/inline request image格式。

## 7. Provider result

- validate declared/content media；
- remote URL若是 provider temporary result必须在可信 Host adapter中受限下载/stream，不持久化URL为最终Canvas Asset；
- bytes durable save成功后再完成Run output；
-多候选按N17全部保存。

## 8. Cost/approval/quota

所有 chargeable operation必须已有 N15 permit。Provider adapter不能自己默认为“免费/已批准”。真实 Provider返回 usage/cost可作为 post-run telemetry/audit，但不能推翻 pre-start admission语义。

## 9. Tests

- credential never client-visible；
- text-to-image real/mock-network contract；
- reference image stable ref；
- region capability；
- provider content rejection/error normalization；
- temp URL download bounded + materialized to Attachment；
- attachment save failure prevents completed output；
- multi-candidate；
- cancellation/idempotency；
- full Agent→Canvas→real Provider→Minimal/Editor E2E。

## 10. 验收

至少一个真实 Provider在受控 credential环境完成文生图和参考图编辑端到端，并通过 durable Attachment/History/refresh验证。
