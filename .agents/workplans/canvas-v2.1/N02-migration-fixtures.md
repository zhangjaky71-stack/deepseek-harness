# N02 — Schema Migration、Node Version 与 Golden Fixtures（V2.2 / rc.8 Revision）

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 当前执行基线：Canvas V2.2 / Harness rc.8 Compatibility Revision  
> 历史来源：Canvas / Media Workflow V2.1 Production Hardening  
> 状态：`REVIEW — NEEDS RE-VERIFICATION`  
> 总原则：N02 负责 durable JSON 能否被当前 Runtime 安全重建；当前环境是否安装/理解/可执行某个 plugin node，属于 N10/N12。

## 1. 节点目标

保证已有 Session 中的 Canvas/Workflow/Layout 在 Schema 演进、Core Node 演进以及第三方插件缺失时仍可安全读取和重建。历史 Workflow 必须可读取、迁移和展示；只有当前 Host 存在对应 `type@version` Definition/Executor 时才要求可执行。

## 2. 前置依赖

`N01`

N01 必须提供 open-world `MediaWorkflowNodeType` structural admission；N02 不得通过 migration 再引入 built-in node whitelist。

## 3. 本节点范围

- `canvas/change` envelope version。
- CanvasSnapshot / MediaWorkflow / CanvasLayout schemaVersion。
- Canvas-owned Core Node 的 nodeVersion migration。
- 已冻结的 Core legacy alias，例如 `image.create@v1 → image.generate@v1`。
- Unknown/plugin node 的 structural preservation。
- `migrateStoredX()` → current structural value；`decodeX()` → migrate + current invariant。
- Golden fixtures：workflow-v1、snapshot-v1、layout-v1、run-history compatibility DTO、deprecated-node-v1、plugin-node-v1。
- Current schema unknown-field fail-loud policy。

## 4. 明确不在本节点处理

- 不维护系统中“全部合法节点类型”的列表。
- 不决定 plugin node 的 current version。
- 不从 Canvas Core 猜测第三方 node migration path。
- 不做 Node Definition/config schema/port/lifecycle/executable validation；这些属于 N10/N12。
- 不建立第二套 Run History durable authority；Run History 仍由 Session history 派生。
- 不重写历史 Session Event 或旧 fixture。

## 5. 代码 ownership

- `packages/canvas/canvas/src/migration.ts`
- `packages/canvas/canvas/src/layout.ts`：Layout current invariant + `decodeCanvasLayoutSnapshot()`。
- `packages/canvas/canvas/src/index.ts`
- `packages/canvas/canvas/tests/migration.spec.ts`
- `packages/canvas/canvas/tests/fixtures/`

## 6. Durable Migration Pipeline

统一语义：

```text
Stored JSON
   ↓
migrateStoredX()
   ↓
Current structural value
   ↓
current invariant
   ↓
decodeX() result
```

Workflow/Snapshot/Layout 必须遵循同一命名规则：

```text
migrateStoredMediaWorkflow()
decodeMediaWorkflow()

migrateStoredCanvasSnapshot()
decodeCanvasSnapshot()

migrateStoredCanvasLayoutSnapshot()
decodeCanvasLayoutSnapshot()
```

Migration 负责 JSON/version/field-level structural compatibility；Domain/Layout invariant 负责当前关系不变量。

## 7. Open-world Node Migration

### 7.1 Core-owned node

Canvas Core 可以维护 Core-only current-version map：

```text
CORE_MEDIA_WORKFLOW_NODE_VERSIONS
```

它只描述 Canvas 自己拥有的内置节点，不能代表“系统中全部合法 node type”。

对 Core-owned node：

- nodeVersion 缺失可按已冻结 V1 规则解释；
- future Core version fail loud；
- 已知 historical Core version 必须有显式 migration path，否则 fail loud；
- deprecated Core alias 可以 migration + notice。

### 7.2 Plugin/unknown node

当前 Canvas Core 不认识的 node type：

```text
preserve type
preserve nodeVersion when present
preserve config
preserve graph edges/output references
```

禁止：

```text
NODE_TYPES.has(type) → reject
Canvas Core 给 plugin 猜 current version
silent delete/replace unavailable plugin node
```

Plugin node 的 `type@version` availability/executability 由 N10 `MediaNodeRegistry` 与 N12 Validator/Executor Registry 决定。

### 7.3 缺失插件的历史工作流

```text
Session contains plugin node
        ↓
plugin currently absent
        ↓
N02 reload/migration PASS
        ↓
N01 structural invariant PASS
        ↓
Editor may render unavailable placeholder
        ↓
N10/N12 execution validation reports unavailable
```

## 8. Schema Version Policy

- Future Canvas/Core schema：`CANVAS_UNSUPPORTED_FUTURE_SCHEMA`。
- Unsupported historical schema：`CANVAS_UNSUPPORTED_SCHEMA_VERSION`。
- Future Canvas-owned node version：`CANVAS_UNSUPPORTED_FUTURE_NODE_VERSION`。
- Unsupported historical Canvas-owned node version：`CANVAS_UNSUPPORTED_NODE_VERSION`。
- Unknown plugin `type@version` 不使用上述 Core future-version 判定。

Current schema 必须 strict-check allowed fields。Writer 若加入 durable field，必须显式 bump 对应 schema/version 或提供 migration；旧 reader 不得静默丢字段。

## 9. Layout Migration Contract

`migrateStoredCanvasLayoutSnapshot()` 只建立 current structural layout；`decodeCanvasLayoutSnapshot()` 再执行 `assertCanvasLayoutSnapshot()`。

因此 API 语义与 Workflow/Snapshot 对齐：

```text
migrate = structural
 decode = structural + invariant
```

Layout 仍独立于 semantic workflowRevision/runRevision。

## 10. Run History Contract

`CanvasRunHistoryEntry` 是由 Session history 派生的 bounded compatibility/query DTO，不是第二套 durable authority。

`decodeCanvasRunHistoryEntry()` 只用于 API/rebuildable-cache compatibility boundary；若未来建立物理 index/cache，它必须可从 Session 重建并独立版本化。

Decoder 至少严格验证：

- allowed fields；
- run/workflow ids；
- positive workflowRevision；
- known run status；
- terminal/finishedAt lifecycle；
- timestamp ordering；
- image/video media reference metadata。

## 11. Golden Fixtures

Golden fixtures 只新增，不覆盖旧历史语义：

```text
workflow-v1.json
snapshot-v1.json
layout-v1.json
run-history-v1.json
deprecated-node-v1.json
plugin-node-v1.json
```

其中 `plugin-node-v1.json` 必须证明：当前 Host 不安装该插件时，N02 仍能保留 custom `type@version + config + graph`。

Fixture hash manifest 属于 recommended hardening；若加入，应作为独立机械保护，不改变 fixture 内容。

## 12. 测试要求

- [ ] workflow-v1 decode。
- [ ] snapshot-v1 decode。
- [ ] plugin-node-v1 在 registry 缺失时仍可 migrate/decode。
- [ ] plugin node 的任意正 nodeVersion 不被 Core 当作 future version。
- [ ] nested CanvasSnapshot reload 保留 plugin node。
- [ ] future Workflow/Snapshot/Change/Core-node version fail loud。
- [ ] unsupported historical schema fail loud。
- [ ] current Workflow/Node/Layout unknown fields fail loud。
- [ ] deprecated Core alias migration + notice。
- [ ] migration idempotency，包含 plugin workflow。
- [ ] structural migration 与 N01 relational invariant 解耦。
- [ ] Layout migrate/decode ownership 分离。
- [ ] Run History DTO media/lifecycle validation。

## 13. 验收标准

- [ ] N02 不存在 built-in `NODE_TYPES` admission whitelist。
- [ ] Core version map 的类型不是 `Record<MediaWorkflowNodeType, number>`。
- [ ] Unknown plugin node reload 不丢失 type/version/config。
- [ ] Migration 不依赖 N10 Registry 即可重建 durable Workflow。
- [ ] Current schema unknown field 不会被静默丢弃。
- [ ] Layout `migrateStoredX/decodeX` 语义与 Workflow/Snapshot 一致。
- [ ] Run History 明确保持派生 DTO，不成为第二 authority。

## 14. Definition of Done

- [ ] focused migration/domain/layout tests 通过。
- [ ] typecheck/lint/build 通过。
- [ ] package README/JSDoc 与当前行为一致。
- [ ] bilingual docs/Agent Note 按仓库规则同步。
- [ ] N01 + N02 stacked validation 在最终 rc.8/N11.5 baseline 重跑。
- [ ] generated lock/module graph 在最终 rc.8 workspace 上统一生成。

## 15. 风险与禁止项

最大风险是把“当前没有安装 Definition”误判成“历史数据非法”。Migration 必须优先保护 durable 可读性；执行能力由当前 Host registry/admission 单独决定。

禁止把 migration 逻辑散落到 UI、Fold、Provider 或 Browser。

## 16. 验收结论格式

后续“验收 N02”至少输出：修改文件、Core/Plugin migration ownership、fixture 证据、focused tests、repository gates、剩余 blocker，以及 `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED`。
