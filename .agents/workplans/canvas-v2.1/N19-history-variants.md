# N19 — History / Variants / Restore（0.1.1-rc.2 Revision）

Status: `PLANNED`

## 1. 目标

在不膨胀 current Session Projection 的前提下，提供可分页的 Workflow/Run/Output/Variant history、provenance 与 restore/select semantics。

## 2. 依赖

`N06, N17, N18`

## 3. History authority

History基于 Session durable events/索引重建，不维护 Browser私有历史数据库。按 Canvas generation/identity隔离，旧 generation不能被 current Canvas silent rebind。

## 4. Variant semantics

Variant代表 semantic generation/output candidate/version，例如不同 Provider run、reroll、edit result或明确 restore branch。Variant不等同于 Harness Attachment `RequestImageAttachment.variantId`。

```text
Canvas output variant = product semantic history
Attachment request variant = request transform/cache identity
```

后者不得进入 Canvas history作为用户可恢复版本。

## 5. Persisted provenance

History可保存：

- workflow/run/node ids + revisions；
- exact generation model/provider identity；
- stable image/video AssetRefs；
- prompts/config safe values；
- candidate order/primary selection；
- actor/source/correlation safe provenance；
- retry/parent variant关系。

禁止保存：request image bytes/cache path/Files upload id/provider temp URL/credential。

## 6. Restore

Restore必须定义目标：

- restore workflow → normal Host workflow mutation/new revision or explicit historical replacement command；
- select historical output as primary → semantic selection event；
- rerun historical workflow → 新 N15 admission + 新 Run，不复用旧 provider operation；
- old missing plugin node可以被恢复/查看，但当前 execute由 N10/N13/N15明确失败或迁移。

## 7. Tests

- generation-isolated pagination；
- candidate/primary preservation；
- restore produces current revision without mutating history；
- request `variantId` never appears as Canvas history variant；
- stable AttachmentRef survives refresh/restore；
- missing historical custom node remains readable；
- authorization/history access。

## 8. 验收

History API、Minimal/Editor history UI 与 Agent restore intent都对同一 durable records工作，并证明 current Projection不会随历史无限增长。
