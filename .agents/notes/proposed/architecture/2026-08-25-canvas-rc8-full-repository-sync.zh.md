# Agent Note: Canvas rc.8 完整仓库同步

Status: proposed

## Problem

Canvas 已遵循 rc.8 Client Renderer 与 Module Bootstrap API，但兼容部分 API 并不能证明私有仓库已经包含完整的官方 rc.8 Package、Build、Lockfile、Generated Output 与 Runtime Behavior。私有线继续使用 rc.7 Release Metadata，也会让 Package Consumer 与 Release Tooling 描述出不同于代码目标的基线。

## Proposal

从共享 rc.7 基线通过 Git ancestry 合并官方提交 `141eb6fef83422698aef7a981029e843e8161534`。Build Profile、Client Cancellation、Reference Discovery、Branding、Attachment、Browser Handoff、Package Version 与 Release Tooling 以官方 rc.8 Behavior 为准。合并同时保留私有 Canvas Package 及其必要扩展：Canvas Remote Assembly、Request-local Interaction Preparation、Projection Visibility Generation、Canvas Host Composition 与 `ui-canvas` Dynamic Roster Entry。

所有私有 dsh Package（包括仅存在于 Canvas 私有线的 Package）统一使用 `0.1.0-rc.8`。合并后的 Manifest Graph 持有 Lockfile；固定的 pnpm 版本必须能以 Frozen Mode 接受该文件。

## Alternatives considered

**继续选择性 Compatibility Backport。** 这种方式改动较小，但无法证明官方提交已成为 Ancestor，也无法统一 Release-wide Build 与 Package Behavior，因此 N11.5 仍会停留在 `SYNC INCOMPLETE`。

**用官方树替换私有树，随后重新加入 Canvas。** 这种方式能得到干净的上游快照，但会丢弃已经验证的私有 Behavior，并让恢复工作依赖第二次未经验证的迁移。

**不合并 Git ancestry，只复制官方文件。** 部分 Blob 一致不能标识完整 Release Input，后续合并也无法区分 Upstream History 与私有重实现。

## Acceptance criteria

- 官方 rc.8 Target 是同步头的 Ancestor，且每个 dsh Manifest 都报告 `0.1.0-rc.8`。
- Frozen Installation、Host Build、Client Build、Static Check 与 Documentation Check 在同步精确头上通过。
- REAL Web Composition 启动完整 Roster，把 Mount Point 交给 `ui-renderer`，保留 Canvas，并随 Plugin Lifetime Dispose Application Root。
- Generated Catalog 与 Release Artifact 由合并后的仓库 Toolchain 重新生成，不能只接受冲突裁决后的现有文件。

## Risks

此次合并结合两条长期演进的代码线，可能保留各自正确但 Cross-package API 已不一致的代码。因此 Compilation 与 Assembled Lifecycle Evidence 仍是强制条件；文本无冲突不代表验证通过。官方 Product Branding 与私有 Canvas View 使用彼此独立的 Dynamic Slot，Composition 必须同时保留两者，不能只选择一个 Package Family。
