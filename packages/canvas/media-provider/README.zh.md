# `@deepseek-ai/dsh-media-provider`

[English](README.md) | 中文

Canvas V2.2 的 Media Generation Model Registry、Requirement Resolver 与 Provider-neutral Runtime contract。当前上游集成基线：Harness `dsh@0.1.1-rc.2`。

## 领域边界

本包服务于**媒体生成**，不是 Harness Chat LLM route catalog。

```text
Harness Chat LLM model routing
  conversation text/tool/vision requests
                 ≠
Canvas Media Model Registry
  text-to-image / image-edit / text-to-video / image-to-video
```

官方 DeepSeek Vision/Files 与 Attachment request-image pipeline 可以提供共享 infrastructure pattern，但不会替代本 generation domain。

## Model Registry / Resolver

`MediaModelRegistry` 是 generation Provider/model capability descriptor 的 process-local authority。Registration由plugin拥有并HMR-safe。Model可以保持discoverable但disabled；当前selection/admission再决定能否执行。

Resolution必须显式且deterministic。Strict/auto/fallback policy输出实际Provider/model与opaque exact `executionIdentity`，供 Workflow fingerprint、Provider runtime 与 Run Admission 消费。Plugin arrival顺序或lexical顺序不得silent决定routing。

## Provider Runtime

Runtime Registry把resolved Provider identity映射到Host execution adapter。Adapter拥有Provider-specific network/request、cancellation与normalized failure；不append Canvas Session event，也不把credential暴露Browser。

## `0.1.1-rc.2` Image 边界

Provider返回成功不等于图片已经durable。Result必须经过N14/N17 materializer：

```text
Provider raw image result
→ controlled validation/download
→ ctx.attachments.saveImage(...)
→ normalized ImageAttachmentRef
→ Canvas stable image asset
→ N16 durable output commit
```

同样，Provider reference-image input来自stable、authorized Canvas/Attachment-backed ref。Browser提交的Provider URL/path不是可信media authority。

Harness `RequestImageAttachment` 是 Chat/request projection primitive。Generation Provider adapter可以在适当场景复用公共图像处理基础设施，但不能假定DeepSeek Chat Files/inline encoding就是generation Provider协议。

## Video 边界

Video Provider output在N21完成durable materialization前仍只是Provider raw result。本包不伪造一个当前上游不存在的“与Image Attachment等价”的Video seam。

## Credential 与 Error

Credential只存在Host service/config。Model descriptor、Workflow/Run snapshot、Browser DTO、Session event都不能包含secret。

Provider failure统一normalized为稳定类别/code。Content/policy rejection不得silent换Provider，除非N13 routing与N15 governance明确允许fallback，并记录新的execution identity。

## 与 Workflow / Admission 的关系

- N12 决定scheduled node executions。
- N13 resolve generation model/provider。
- N14调用exact Provider runtime。
- N15在start前检查Provider availability、governance与concurrency。
- N16拥有durable Run/attempt lifecycle。
- N17/N21拥有image/video materialization。

## Upgrade/Revalidation

N13/N14实现继续保留。0.1.1-rc.2迁移重点重验official Attachment materialization、latest package/runtime closure gates，以及Chat LLM routing与Media Generation routing的严格分层。

参考 N13、N14、N17、N20。