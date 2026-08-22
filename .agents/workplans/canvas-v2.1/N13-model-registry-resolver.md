# N13 — Media Model Registry / Requirement Resolver（0.1.1-rc.2 Revision）

Status: `IMPLEMENTED / REVALIDATE`

## 1. 目标

维护 Media Generation Model/Provider capability catalog并把 workflow node requirements解析成 exact generation execution identity。该领域与 Harness Chat LLM routing明确分层。

## 2. 依赖

`N10, N12`

## 3. 核心分层

```text
Harness Chat LLM Model Catalog
  text/tool/vision conversation routing
            ≠
Canvas Media Model Registry
  text-to-image / image-edit / text-to-video / image-to-video generation
```

官方 0.1.1-rc.2 DeepSeek Vision/Files/attachment request pipeline增强，不代表它接管 Media Generation model registry。

## 4. 已有实现可保留

PR #43：

- process-local `ctx.mediaModels`；
- Provider + owned Models atomic registration；
- exact capability descriptors；
- strict/auto/fallback policy with explicit candidateOrder；
- disabled models discoverable but not selectable；
- exact `executionIdentity.key` output；
- HMR-safe unregister/revision snapshot；
- no hidden lexical/plugin-load-order routing。

## 5. 0.1.1-rc.2 Integration

可以共享 upstream infrastructure patterns：

- credential discipline；
- cancellation/error hygiene；
- Attachment stable image refs；
- configuration/settings framework。

不能混用：

- Chat LLM route id当 generation model id；
- Chat request image policy当 generation provider capability；
- DeepSeek Files remote id当 Canvas durable asset id。

## 6. Resolution input/output

Input: semantic generation requirements + explicit routing policy/current registry snapshot。

Output: actual Provider/model identity + exact opaque execution identity for N12/N14/N15。

N13 不执行 network call、不做 quota/cost/approval、不写 Canvas Session。

## 7. 测试

保留 PR #43 exact capability/routing/lifecycle tests，并在新 baseline重验 package/build graph；新增明确测试/文档证明 Chat LLM model entry不能被误解析成 Media generation model。

## 8. 验收

源码主体保留。N11.5 synchronized package graph和 N12/N14 integration tests通过后重新评估 ACCEPTED。
