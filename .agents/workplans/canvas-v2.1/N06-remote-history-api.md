# N06 — Harness rc.8 Typert Remote、Mutation API 与 Generation-scoped History Query

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.2 + Harness rc.8  
> 状态：`REVIEW`  
> 使用方式：后续可直接引用节点编号进行实施、Code Review、验收或修复。

## 1. 节点目标

建立 Browser → Host 的稳定 Canvas mutation/query 边界，同时保持 N03/N04/N05 已冻结的 authority：

```text
Current Canvas/Layout read -> Session Projection
Browser mutation           -> Typert Remote -> CanvasService -> Session append
Run history query          -> Typert Remote -> Host auth -> Session-derived index
Large binary               -> 不走 Typert
```

N06 不建立第二份 current-state authority，也不提前注册后续节点尚未实现的 `run/cancel/createVariant/restoreWorkflow` endpoint。

## 2. 前置依赖

`N04, N05`

依赖节点未验收时，本节点公开 API 不视为 release-stable。

## 3. 本节点实际范围

当前可调用 Browser Remote namespace 仅包含：

- `editWorkflow`
- `replaceWorkflow`
- `selectOutput`
- `saveLayout`
- `clear`
- `listRuns`
- `getRun`

当前 Canvas/Layout 仍从 Session Projection 读取；禁止新增 `getCurrent` RPC。

History：

- `ListCanvasRunsRequest` 必须携带 `canvasId`。
- `GetCanvasRunRequest` 必须携带 `canvasId + runId`。
- `CanvasRunHistoryEntry` 必须携带其 durable `canvasId`。
- 同一 Session clear/recreate 后，不允许用当前 Canvas 权限读取旧 generation history。
- Cursor 锚定 durable `run-start` Session sequence，而不是数组 offset。
- 默认 page size 20，Host hard cap 100。

## 4. 明确不在本节点处理

- Run admission / executor / Jobs / retry / cancel orchestration：N15/N16。
- Variant create / restore：N19。
- Image/video binary route：N17/N21。
- Provider execution：N12/N14/N20/N22。
- Browser current-state RPC：禁止；继续使用 N05 Projection。

## 5. 代码位置

主要实现：

- `packages/canvas/canvas/src/client.ts`
- `packages/canvas/canvas/src/types.ts`
- `packages/canvas/canvas/src/history.ts`
- `packages/canvas/canvas/src/runtime.ts`
- `packages/api/gateway/src/index.ts`
- `packages/typert/protocol/src/index.ts`
- `packages/api/remotes/`
- `packages/bundle/base/`

测试：

- `packages/canvas/canvas/tests/remote.spec.ts`
- `packages/canvas/canvas/tests/history-index.spec.ts`
- `packages/canvas/canvas/tests/history-authorization.spec.ts`
- `packages/api/gateway/tests/business-failure.spec.ts`
- `packages/typert/protocol/tests/business-failure.spec.ts`
- `packages/api/remotes/tests/built-lib.e2e.ts`
- `packages/bundle/base/tests/base.spec.ts`
- `packages/bundle/base/tests/canvas-real-composition.spec.ts`

## 6. Remote 边界契约

### 6.1 Host authority

Browser Remote 只能调用普通 `CanvasService` 方法；不能直接 append Session event，不能传入自选 actor/source。

Host wrapper 构造 `human:host-browser + browser-remote` access，再由 N04 authorization 对 exact Session/resource 做判断。

### 6.2 SRC fallback

Generated Typert schema 缺失时，SRC descriptor 只能保证 JSON-safe，不足以证明业务 DTO shape。因此 Canvas Host method 必须在授权/业务逻辑前对 weak payload 做 fail-loud runtime validation：

- `WorkflowRef`
- `WorkflowEditOperation[]`
- `SelectCanvasOutputRequest`
- `SaveCanvasLayoutRequest`
- `ListCanvasRunsRequest`
- `GetCanvasRunRequest`
- replacement `MediaWorkflow`

畸形输入不得退化为任意 `TypeError` 后继续进入业务逻辑。

### 6.3 Error wire safety

Typert Gateway 只允许以下错误保留业务 wire 语义：

- 显式 `TypertBusinessFailure`
- adapter-owned `TypertLookupFailure`
- transport cancellation

普通 `Error` 固定折叠为：

```text
code: internal
message: Remote request failed
```

Canvas Remote wrapper 只把 allowlisted `HarnessError.code` 映射成固定、安全、无资源标识/策略细节的 public message，再构造 `TypertBusinessFailure`。Host 内部异常 message 不直接成为 Browser response。

## 7. History authority 与性能

History 是 Session events 的 rebuildable derived index，不是第二个 durable store。

`CanvasRunHistoryIndex`：

- 使用 N03 strict Canvas fold 验证同一 Session prefix。
- `byRun` 保证 Run durable identity。
- `byCanvas` 按 Canvas generation 分桶。
- query 不重复全量扫描 Session log。
- service sync 先 clone Canvas fold + History index，对新 event batch 全部验证成功后一次发布，避免半更新 cache。

## 8. Shipped invariant composition

`dsh-base` 必须同时 mount：

- `@deepseek-ai/dsh-invariants`
- `@deepseek-ai/dsh-canvas`
- `@deepseek-ai/dsh-canvas/invariant`

因此 N03/N04 的 one-shot Canvas write permit 是 shipped precommit invariant，而不是测试专用约定。正常 `CanvasService` 写入可通过；alternate current direct append 必须在 Session precommit 被拒绝。

## 9. 测试 Gate

- [ ] Remote edit → CanvasService → Session event → Projection。
- [ ] Unauthorized Remote 在 append 前被 Host 拒绝。
- [ ] SRC malformed DTO fail loud，并返回稳定安全业务错误或固定 internal envelope。
- [ ] Ordinary internal Error message 不跨 Gateway。
- [ ] History pagination newest-first 且 cursor 稳定。
- [ ] History query 必须 generation-scoped，跨 clear/recreate 无泄漏。
- [ ] History index rebuild + incremental apply 与 N03 lifecycle 一致。
- [ ] dsh-base composition 明确挂载 invariant registry + Canvas invariant。
- [ ] REAL Loader composition 证明 direct append 被拒绝、CanvasService commit 成功。
- [ ] built-LIB HTTP smoke 使用 exact-live SessionStore，并覆盖 generated Canvas Remote contribution。
- [ ] 当前状态无 `getCurrent` 双源。

## 10. Definition of Done

- [ ] repository-pinned typecheck/lint/build 通过。
- [ ] 本节点单元测试通过。
- [ ] integration / REAL composition / built-LIB 证据通过。
- [ ] generated Typert artifacts、workspace lock/module graph 与最终源码一致。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 临时 remediation workflow/script 不进入最终 tree。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 11. 当前验收结论

`REVIEW`。

Source/design/test/docs remediation 可以在本节点完成；在 repository-pinned generated artifacts、typecheck/lint/build/Vitest/REAL composition 证据缺失时，不得升级为 `ACCEPTED`。
