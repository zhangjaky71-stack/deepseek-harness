# N25 — Full E2E / Release Gate（0.1.1-rc.2 Revision）

Status: `PLANNED`

## 1. 目标

证明 Canvas V2.2 在同步后的 Harness 0.1.1-rc.2 上作为真实 shipped composition工作：Agent/Browser/Slash共享同一Canvas，Minimal/Editor、图片/视频、Workflow、Run、History、Settings、权限、恢复与插件生命周期全部闭环。

## 2. 依赖

`N01–N24`，并要求 N11.5 accepted。

## 3. Exact baseline gate

Release evidence必须记录：

```text
official baseline commit: b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
private post-sync commit: <exact sha>
package/lock/generated state: tool-generated and clean
```

若官方在N25前再次发布新版本，先更新baseline/revalidation，不得假装0.1.1-rc.2仍是“latest”。

## 4. Required product E2E

### Canvas shell

- Conversation + Canvas `shell.main` 并存；
- ui-canvas unload/disable无残留slot；
- Minimal/Editor切换不改变semantic state；
- refresh/reconnect恢复current Canvas。

### Agent / commands

- natural-language selection-aware edit；
- Agent生成Workflow；
- Agent文生图；
- Agent使用Composer/selected reference image编辑；
- Slash/command image envelope不丢附件；
- Browser与Agent运行都经过同一N15。

### Image

- Provider→official Attachment normalized master→Canvas output；
- multi-candidate/primary；
- history/restore；
- request-image projection不污染Canvas history。

### Video

- text/image-to-video async run；
- durable video save/range/playback；
- cancel/restart/resume；
- duplicate callback idempotency。

### Governance

- permission deny；
- feature disabled；
- quota/cost/approval；
- idempotency；
- global/session/provider concurrency/backpressure；
- no Provider operation before admission。

## 5. Current repository gates

不要把旧rc.8命令表硬编码成永恒事实。以同步后root `package.json`/`scripts/run-gates.ts`为准，并至少执行当前0.1.1-rc.2对应的：

- typecheck；
- lint；
- build / official build相关gate；
- unit/focused tests；
- partitioned coverage / required coverage gates；
- Web/GUI/snapshot E2E relevant lanes；
- `verify-client-packages`；
- `verify-client-domain-graph`；
- `verify-runtime-closure`；
- optional dependency/node-next/package invariants；
- docs/translation/pairing/generated catalogs；
- consumers/artifacts/static checks；
-平台要求的Windows/Linux lanes。

记录实际执行命令和结果。

## 6. REAL assembled boot

必须真实验证：

```text
Host profile boot
→ boot manifest
→ ModuleLoader / optional __DSH_TRANSPORT__.loadBundle
→ client graph all ACTIVE
→ ui-renderer mount
→ latest ui-layout + shell.main extension
→ Conversation + Canvas
→ Session projection/settings/remotes
→ Agent command/run flows
```

不能只靠isolated React/component tests宣称产品集成成功。

## 7. Security/privacy release checks

- Browser bundle/DTO无Provider credential；
- attachment/video ids不作为未经授权bearer access；
- provider temp/signed URL不进Session/history；
- raw internal error不泄漏；
- cross-session Canvas/asset access denied；
- feature/permission无法通过direct Remote绕过。

## 8. Upgrade/maintenance gate

文档必须留下下一次官方升级如何diff/replay `shell.main` intentional fork、如何迁移Projection/Attachment/Settings/Renderer而不扩大私有fork的说明。

## 9. Acceptance

只有以下全部成立才发布：

1. N01–N24当前baseline accepted；
2. generated/lockfile由pinned toolchain产生；
3. repository gates实际执行；
4. REAL assembled product E2E执行；
5. 无未说明P0/P1 architecture/security blocker；
6. private post-sync/release commit和evidence可追溯。

Runner前置失败不能算PASS；若critical lane无法运行，N25保持 `BLOCKED`。
