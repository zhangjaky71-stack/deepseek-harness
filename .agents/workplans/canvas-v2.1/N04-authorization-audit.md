# N04 — Authorization、Actor 与 Audit（0.1.1-rc.2 Revision）

Status: `REVALIDATION REQUIRED`

## 1. 节点目标

保证 Canvas read/edit/run/history/asset 操作都在 Host 端基于 authenticated actor/session scope 强制授权，Browser UI gating 仅是体验层，不能成为安全边界。

## 2. 依赖

`N03`

## 3. 0.1.1-rc.2 关键变化

历史私有实现使用 Projection Registry `owner/registerReadGuard` 保护 Canvas Browser Projection。官方最新 Projection contract 已转向 Host fold state + explicit wire view，私有 `readGuard` 不再作为当前 upstream 公共 seam。

**安全需求不变，enforcement seam 必须迁移。**

目标结构：

```text
Session/actor identity
      ↓
Canvas permission policy
      ↓
Host Canvas service / Remote / projection exposure boundary
      ↓
client-safe wire view or mutation result
```

不得因为官方 Projection API 变化而删除 read authorization。

## 4. 权限面

至少定义/映射：

- `canvas.read` — current projection/read APIs；
- `canvas.edit` — workflow/layout semantic mutation；
- `canvas.run` — run admission/start/cancel/retry；
- `canvas.history.read` — history/variant/provenance；
- `canvas.asset.read` — authorized stable asset access；
- 后续 provider/admin settings 权限按实际 Host policy 分离。

同一 coarse permission 是否拆更细由当前 Harness authorization framework 决定，但所有入口必须有明确映射。

## 5. Actor / audit

Durable mutation/run events记录可审计 actor/source 信息，但不记录 credential、Bearer token、browser arbitrary text 或 provider secret response。

来源可以区分：

```text
browser
agent-tool
slash-command
system/reconciliation
```

来源只用于审计/策略，不允许通过伪造 source 绕过权限。

## 6. Projection read authorization migration

N05 使用官方 wire-view Projection 后，需要选择当前 Harness 正式的 Session/Remote exposure authorization point，并满足：

- 未授权 actor 不能订阅/读取 Canvas wire view；
- reconnect/history bootstrap 不能绕过权限；
- Server 内部 Host fold state 不因为 Browser 无权读取而停止维护；
- authorization failure 不泄漏 Canvas 是否存在的敏感细节超出 Harness 既有错误策略。

如果官方当前没有直接 Projection-level guard，则应在提供 Projection snapshot/remote/session binding 的 Host exposure 层集中 enforce，而不是重新发明大范围 Projection framework fork。

## 7. Asset authorization

`attachmentId` 不是 bearer secret，也不是“知道 id 就可读”。Canvas asset read 必须证明该稳定 ref 对目标 Session/Canvas/history 可见，并遵守 Harness attachment/file exposure policy。

Region/edit input、history restore、Provider input 都不能仅凭 Browser-supplied attachment id 读取任意对象。

## 8. Run admission

N15 重新检查 permission，即使 Browser 已隐藏按钮、Agent Tool 已做 precheck，也不能省略 Host admission authorization。

## 9. 测试要求

- unauthorized current Canvas read denied；
- unauthorized mutation/run denied before state/provider side effects；
- reconnect/bootstrap cannot bypass read policy；
- cross-session asset id denied；
- Agent vs Browser source 都受同一 policy；
- policy failure 无 partial Session event；
- audit actor/source stable and no secret leakage。

## 10. 验收

必须先与最新官方 Session Projection/Remote/authorization package 完成代码级 mapping，再执行 focused authorization + REAL Browser session tests。旧 `registerReadGuard` 测试只能作为需求证据，不能作为当前实现验收标准。
