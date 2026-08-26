# N05 — Session Projection、Canvas Layout Projection 与客户端 authoritative read model

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.2 + Harness rc.8  
> 文档性质：工程实施 / Review / 验收节点  
> 当前状态：`REVIEW`；源码修复不等于验收通过，必须有仓库 pinned toolchain 证据。  
> 总原则：Session log 是 durable authority；Projection 是可重建 current read model；Browser 不维护第二份 Canvas truth。

## 1. 节点目标

N05 负责把 N03 的 Session-native Canvas authority 安全、可恢复地投影到 Browser，并把 Editor presentation state 从语义 Workflow 中彻底分离。

最终需要同时成立：

```text
Session log
  ├─ canvas/change        -> canvas Projection
  └─ canvas/layout-change -> canvasLayout Projection

Browser
  └─ Session Projection only for current Canvas/Layout reads
```

其中：

- `canvas` = 当前 `CanvasSnapshot | null`；
- `canvasLayout` = 当前 Canvas generation 下的 `CurrentCanvasLayoutSnapshot | null`；
- Projection cell/checkpoint/cache 都只是 Session log 的 fold shortcut，不是第二 authority；
- Browser delivery 必须经过 N04 Host read authorization；live、cold、detached 的授权资源语义必须一致。

## 2. 前置依赖

- `N03`：durable Canvas event/fold/CanvasService authority。
- `N04`：actor provenance、Browser principal、`canvas.read` 与 durable writer security boundary。

N03/N04 未验收时，N05 不得单独标记 `ACCEPTED`。

## 3. 本节点范围

1. `SessionProjectionMap.canvas` / `SessionProjectionMap.canvasLayout`。
2. Session Projection Registry 的 browser read guard、checkpoint、cold restore、change feed 与 HMR/disposal 语义。
3. Browser projection visibility revoke/re-allow，不写伪 Session event。
4. `canvas/layout-change` durable stream、strict replay 与 current layout projection。
5. `canvasId + workflowId + layoutRevision` presentation identity/CAS。
6. `CanvasService.saveLayout()` Host enforcement 与 Browser Remote receipt。
7. Editor layout identity fence、stale-tab conflict、refresh/reconnect 恢复。
8. ApiProxy live/detached/subagent/cold-list carrier 的 exact Session identity read context，以及 live↔cold race 下的 final-source recheck。
9. Projection boundedness：禁止 history、binary、provider raw response、progress timeline 进入 current projection。

## 4. 明确不在本节点处理

- N06 的完整 Remote/history product API。
- N11 的完整 DAG editor product capability。
- N12+ execution/provider semantics。
- 多用户 principal/tenant 身份系统；N05 只要求 carrier 不虚构身份，并把可验证 target SessionId 交给 N04 authorization seam。
- 将 projection cache 升格为 durability source；禁止。

## 5. 代码责任边界

主要位置：

- `packages/session/session-projection/src/{types,index}.ts`
- `packages/session/session-projection-cache/src/index.ts`
- `packages/client/runtime/src/client/sessions/projection-store.ts`
- `packages/host/apiproxy/src/projection-aware-api-proxy.ts`
- `packages/host/apiproxy/src/api/events.schema.ts`
- `packages/canvas/canvas/src/{types,client,layout,projection,runtime,invariant,index}.ts`
- `packages/client/ui-canvas/src/{types,client/**}`
- 对应 package-level `tests/*.spec.ts`

`packages/client/render-service` 仍是 React root owner；N05 不在 `ui-layout` 写入 Canvas semantic authority。

## 6. Projection authority contract

### 6.1 Pure fold

Projection definition 仍为同步纯数学：

```text
init()
apply(state, committed SessionEvent)
view(state)
stateVersion
```

要求：

- 无关 event 返回相同 state reference；
- 自己 domain 的 malformed durable event 必须 fail loud，不能静默保留旧 current value；
- `stateVersion` 只用于 projection checkpoint compatibility，不是 domain revision。

### 6.2 Browser read guard

Read guard 只控制“已计算值能否离开 Host”，不改变 fold/checkpoint：

```text
Projection state
  -> schema validation
  -> browser read guard
  -> snapshot / history baseline / push frame
```

所有 carrier 必须提供自己真实拥有的身份：

- live snapshot：live `Session.id`；
- history tail：core response 返回后重新确认最终 source；若 current live Session 的 log-end 与 page-end 相同，使用该 live `Session.id` snapshot；否则以请求目标 `SessionId` 做 persisted inspection/restore；
- detached subagent history：对 child `SessionId` 使用同一 final-source 规则；
- cold list checkpoint：对应 `SessionHeader.id`；
- cold restore：调用者请求的 persisted `SessionId`。

History final source 的 log-end 必须等于已返回 page-end。attach/detach/persistence drift 导致切面不一致时，必须整块省略 `projections`，不得退回缺少 exact identity 的 core baseline。

不得使用 synthetic session id、CanvasId、AgentId 猜测 target Session。

### 6.3 Visibility generation

ACL/HMR/capability 变化可能发生在**没有新 Session event**时，因此 durable seq 不足以表达：

```text
present -> absent -> present
```

live `session/projection` value slot允许框架级 control envelope，携带单调 `visibilityGeneration`：

- `present: false`：Browser 删除该 key；
- `present: true`：Browser 在同 seq 下恢复当前 whole value；
- stale generation 丢弃。

`visibilityGeneration` 不是第四种 Canvas revision：

```text
workflowRevision = semantic workflow
runRevision      = run lifecycle
layoutRevision   = editor presentation
visibilityGeneration = transport/read-visibility ordering only
```

Baseline 仍是普通 typed `values`，不把 control metadata 混入 `SessionProjectionMap`。

## 7. Projection HMR / disposal contract

HMR replacement 必须有显式 stable owner，不能把“同 key”本身当作同一插件身份：

1. 同 key + 同显式 `owner` 的 overlap 允许 replacement，最新 live definition 立即成为 active；
2. replacement cell 从 Session history 重建；
3. 必要时在当前 seq 发新的 visibility generation；
4. 旧 fiber 随后卸载不能移除或回滚新 definition；
5. 不同显式 owner 抢占同 key 必须 fail loud；
6. 无 owner 的旧注册只保留同 `stateVersion` first-live 兼容模式，不视为 HMR replacement；
7. legacy active unowned registration 先卸载时，必须提升下一个仍存活 definition 并重建 cell，禁止保留 disposed ghost；
8. 最后一个 registration 卸载时，Browser 收到 explicit absence。

Canvas 的 `canvas` / `canvasLayout` Projection 必须声明各自稳定 owner。

`/types` subpath 必须保持 runtime-free；不得为了 control envelope 把运行时常量依赖注入 client type graph。

## 8. Layout durable contract

### 8.1 三种 revision 分离

```text
Canvas generation:       canvasId
Semantic generation:     workflowId + workflowRevision
Presentation generation: canvasId + workflowId + layoutRevision
Run generation:          runRevision
```

Layout save **不得**增加 `workflowRevision` 或 `runRevision`。

### 8.2 Current layout

Current writer / current Projection 使用：

```ts
interface CurrentCanvasLayoutSnapshot {
  schemaVersion: 1
  canvasId: CanvasId
  workflowId: MediaWorkflowId
  layoutRevision: number
  nodePositions: Record<string, { x: number; y: number }>
  viewport?: { x: number; y: number; zoom: number }
  updatedAt: number
}
```

历史 pre-N05 layout snapshot 可以缺少 `canvasId/layoutRevision`，但只允许在 strict replay 中根据其所在 Canvas generation 顺序归一化；新 writer 必须显式写 current fields。

### 8.3 CAS

Browser save request 必须带：

```text
canvasId
workflowId
expectedLayoutRevision
```

Host 顺序校验：

1. exact-live Agent + Session；
2. `canvas.layout.write` authorization；
3. Editor feature；
4. exact `canvasId`；
5. exact `workflowId`；
6. exact `expectedLayoutRevision`；
7. nodePosition keys 属于 current workflow；
8. detached fold preflight / invariant；
9. Session append。

成功 receipt 返回新 `layoutRevision`。

### 8.4 Generation reset

`create/clear` 必须让 current layout 归零。即使新 Canvas 重用了同一个 `workflowId`，旧 Canvas 的 layout 也不可复活。

## 9. Client contract

- Browser current Canvas/Layout 只来自 Session Projection。
- `ProjectionValueStore` 不 fold Canvas events。
- Editor 只在 `layout.canvasId === canvas.id && layout.workflowId === canvas.workflow.id` 时应用布局。
- successful layout Remote receipt 可立即推进 local CAS token；Projection frame 最终重新基线。
- stale layout / stale Canvas generation 映射为 `conflict`，不得当作普通 save failure 后覆盖远端。
- `useProjection('canvas') === undefined` 不能永久等同“loading”：Canvas view 结合 authoritative Session `openState` 区分 baseline 尚未完成与 baseline 已完成但 key 不可见/不可用，且不可见态不得泄露 ACL 原因。

## 10. Boundedness

`canvas` / `canvasLayout` projection 禁止携带：

- run history pages；
- provider request/response；
- raw diagnostics；
- binary/base64/data URL；
- progress history；
- Browser-only selection/draft/undo stack。

媒体只保留 Host-owned asset reference。

## 11. 必须测试的行为

### Projection

- [ ] live 与 cold replay current value 一致。
- [ ] malformed own-domain event fail loud；无关 event same-reference。
- [ ] allow → deny 同 seq 发 explicit absence。
- [ ] deny → allow 同 seq 发 explicit presence。
- [ ] stale visibility generation 被 Client 丢弃。
- [ ] reconnect baseline 可以重新取得 authority。
- [ ] empty Session `asOfSeq/seq = -1` 可通过 wire。
- [ ] read guard install/dispose/HMR 不遗留 stale visibility。
- [ ] same-owner HMR replacement 使用新 definition，旧 fiber 后卸载不回滚。
- [ ] different-owner same-key collision fail loud；legacy active-unowned disposal 能提升 surviving definition。
- [ ] detached history/cold cache/cold restore read guard 收到 exact target SessionId。
- [ ] detached→live 竞态最终重新通过 exact live SessionId 授权；final log/page cut 不一致时整块省略 projections。
- [ ] Projection undefined + Session openState 能区分 loading 与 authoritative unavailable。

### Layout

- [ ] layout write 不改变 workflowRevision/runRevision。
- [ ] layoutRevision 独立增长。
- [ ] 双 Tab stale `expectedLayoutRevision` 被拒绝。
- [ ] wrong canvasId / wrong workflowId 被拒绝且 Session seq 不变。
- [ ] clear/recreate + same workflowId 不继承旧 Canvas layout。
- [ ] Projection 与 `foldCanvasLayout()` 对 current generation 定义一致。
- [ ] Browser renderer 不应用 identity-mismatched layout。

## 12. Definition of Done

只有全部满足才可由 `REVIEW` 转为验收结论：

- [ ] N03/N04 已满足其 acceptance gate。
- [ ] repo-pinned focused Vitest 通过。
- [ ] repository typecheck/lint/build 通过。
- [ ] coverage/hygiene/docs gate 通过。
- [ ] REAL composition 证明 Host registry → ApiProxy → Client projection → ui-canvas 链路。
- [ ] generated Cordis catalog / README i18n metadata 与最终源码一致。
- [ ] 临时 workflow / debug 文件清零。
- [ ] 最终 branch diff 只包含 N05 必需变更。

## 13. 风险与禁止项

- 禁止把节点坐标写回 `MediaWorkflow`。
- 禁止 Browser 自己 replay Canvas durable events 形成第二 truth。
- 禁止 projection cache 绕过 read guard 直接出站。
- 禁止用 Session seq 单独排序 ACL/HMR visibility transition。
- 禁止 malformed Canvas durable event 静默保持旧 projection。
- 禁止用 workflowId 单独作为 layout generation identity。
- 禁止把同 key 当作 HMR owner 身份证明。
- 禁止在 history carrier race 下回退到未经 exact target identity 评估的 projection baseline。
- 禁止宣称没有仓库证据的测试/构建已经通过。

## 14. 验收输出

验收至少报告：

1. base/head 与实际 changed files；
2. Projection authority/read-guard/HMR 证据；
3. Layout generation/CAS 证据；
4. live/cold/detached carrier identity 与 race 证据；
5. focused tests + typecheck/lint/build/coverage/REAL composition 实际结果；
6. 未解决问题与严重度；
7. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED`。
