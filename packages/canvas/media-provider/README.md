# `@deepseek-ai/dsh-media-provider`

English | [中文](README.zh.md)

Canvas V2.2 media-generation model registry, requirement resolver and Provider-neutral runtime contracts. Current upstream integration baseline: Harness `dsh@0.1.1-rc.2`.

## Domain boundary

This package is for **media generation**, not the Harness Chat LLM route catalog.

```text
Harness Chat LLM model routing
  conversation text/tool/vision requests
                 ≠
Canvas Media Model Registry
  text-to-image / image-edit / text-to-video / image-to-video
```

The official DeepSeek vision/Files and Attachment request-image pipeline may supply shared infrastructure patterns, but it does not replace this generation domain.

## Model registry/resolver

`MediaModelRegistry` is the process-local authority for generation Provider/model capability descriptors. Registration is plugin-owned and HMR-safe. Models may remain discoverable while disabled; current selection/admission decides whether they can execute.

Resolution is explicit and deterministic. Strict/auto/fallback policies produce the actual Provider/model plus an opaque exact `executionIdentity` consumed by the workflow fingerprint/provider runtime/run admission. Plugin arrival or lexical order must never silently decide routing.

## Provider runtime

The runtime registry maps resolved Provider identities to Host execution adapters. Adapters own Provider-specific network/request behavior, cancellation and normalized failures. They do not append Canvas Session events and do not expose credentials to the Browser.

## Image boundary under `0.1.1-rc.2`

Provider image results are not durable merely because the Provider returned success. The execution result must pass through the N14/N17 materializer:

```text
Provider raw image result
→ controlled validation/download
→ ctx.attachments.saveImage(...)
→ normalized ImageAttachmentRef
→ Canvas stable image asset
→ N16 durable output commit
```

Likewise, Provider reference-image inputs originate from stable authorized Canvas/Attachment-backed refs. Browser-supplied Provider URLs or paths are not trusted media authority.

Harness `RequestImageAttachment` is a Chat/request projection primitive. A generation Provider adapter may use common image-processing utilities where appropriate, but it must not assume DeepSeek Chat Files/inline encoding is the generation Provider protocol.

## Video boundary

Video Provider outputs remain raw Provider results until N21 durably materializes them to the Canvas video binary authority. This package does not invent an image-like official video Attachment seam.

## Credentials and errors

Credentials remain Host-only service/config state. Model descriptors, Workflow/Run snapshots, Browser DTOs and Session events never contain secrets.

Provider failures are normalized to stable categories/codes. Content/policy rejection must not silently switch Providers unless N13 routing and N15 governance explicitly authorize a fallback and the resulting execution identity is recorded.

## Relationship to workflow and admission

- N12 determines which node executions are scheduled.
- N13 resolves generation models/providers.
- N14 invokes the exact Provider runtime.
- N15 verifies Provider availability, governance and concurrency before start.
- N16 owns durable Run/attempt lifecycle.
- N17/N21 own image/video materialization.

## Upgrade/revalidation

The N13/N14 implementations are retained during the 0.1.1-rc.2 migration. Revalidation focuses on official Attachment materialization, latest package/runtime closure gates and preserving the strict distinction from Chat LLM routing.

See workplans N13, N14, N17 and N20.