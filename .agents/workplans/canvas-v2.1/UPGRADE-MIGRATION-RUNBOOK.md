# Harness Upgrade Migration Runbook for Canvas

## 1. 适用场景

官方 DeepSeek Harness 发布 rc.9、正式版或任何可能影响 Client/Session/Attachment/Settings/Agent Runtime 的更新时，按本 Runbook 执行。

## 2. Phase A — 锁定基线

记录：

```text
upstreamOldVersion
upstreamOldCommit
upstreamNewVersion
upstreamNewCommit
privatePreSyncCommit
CanvasSchemaVersion
WorkflowSchemaVersion
```

禁止使用“最新版”作为不可复现基线。

## 3. Phase B — 生成差异并分类

差异必须覆盖完整 upstream final tree。按以下类别标记：

- mechanical/build/package rename
- client plugin lifecycle
- render/layout/slot
- session/event/projection
- attachment/media
- settings/schema
- agent/tool/model transport
- job/runtime/provider

单独生成 Canvas overlay 路径清单。

## 4. Phase C — 检查保护 seam

重点检查：

```text
render-service root ownership
ui-layout slots/regions
conversation.view
Session event forwarding/replay
api-remotes
attachment store / image intake
ui-settings schema
client plugin manifest/roster
code runtime
```

若 seam 变化，先更新文档契约，再改代码。

## 5. Phase D — 完整同步

1. 创建 upstream-sync 分支。
2. 先得到官方新版本完整 tree。
3. 再叠加私有 Canvas overlay。
4. 冲突按 `UPSTREAM-COMPATIBILITY-POLICY.md` 处理。
5. 禁止只应用“看起来相关”的前 300 个 compare 文件。

## 6. Phase E — 兼容修复

优先顺序：

1. build/package graph
2. Host/Session/Remote
3. dynamic client graph
4. Canvas plugin/layout
5. attachments/settings
6. Workflow runtime/provider

不允许为了快速通过 build 把 Canvas 业务重新塞进上游核心文件。

## 7. Phase F — 验证

最低验证矩阵：

- typecheck/lint/build
- Canvas domain/migration golden fixtures
- CanvasService replay/CAS
- Remote mutation/query
- dynamic plugin activation/dispose/HMR
- assembled Web boot + render-service
- Minimal/Editor same projection
- Interaction Context send path
- attachment image intake/result display
- Mock workflow DAG
- reconnect/reload/session switch

如果 GitHub runner 不可用，状态必须写 `UNVERIFIED/BLOCKED`，不能把静态审计标成 PASS。

## 8. Phase G — 更新基线

同步完成后更新 `RC8-UPSTREAM-BASELINE.md`（或新的版本 baseline）：

```text
privatePostSyncCommit
compatibilityStatus=VERIFIED
knownOverlays
knownLimitations
verificationEvidence
```

## 9. Release Gate

只有同时满足以下条件才允许继续发布节点：

- 完整 upstream tree 已同步。
- Canvas 产品不变量全部通过。
- 上游核心保护区无未说明 Canvas 特判。
- REAL composition 有证据。
- rollback/feature flag 可用。
