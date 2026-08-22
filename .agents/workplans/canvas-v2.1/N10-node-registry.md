# N10 — Media Node Registry（0.1.1-rc.2 Revision）

Status: `REVIEW / LOW-IMPACT REVALIDATION`

## 1. 目标

提供唯一 Host process-local Media Node Definition authority，支持 exact `(type, version)`、open-world plugin lifecycle、typed ports/config/lifecycle/feature metadata，并向 Browser暴露 client-safe catalog snapshot。

## 2. 依赖

`N01, N02, N09`

## 3. Authority

```text
ctx.mediaNodes
  register/unregister by plugin fiber
  exact definitionFor(type,version)
  revisioned immutable snapshot
        ↓ Host client-safe mapping
{ revision, entries }
        ↓
ui-canvas Node Library / Inspector / ports
```

Browser不得维护第二 Registry，不从当前 Workflow contents 反推 node schema。

## 4. Registry revision

process-local revision：

- fresh = 0；
- successful register/unregister 各 +1；
- duplicate/validation failure 不推进；
- HMR unload/re-register 是不同 revision；
- 不是 Session durable generation，重启可从0开始。

## 5. Open-world contract

Core 不限制 built-in node type whitelist。历史 custom node 可加载；若 exact definition 当前缺失，Editor显示 read-only/unavailable placeholder，当前执行显式失败。

## 6. Feature/lifecycle

Definition intrinsic lifecycle与 deployment feature分开：

- `creatable/deprecated/executable` = definition intrinsic；
- `feature` = N09 current capability requirement；
- disabled feature 不删除 catalog/history，只影响 author/run availability。

## 7. 0.1.1-rc.2 影响

Registry/domain设计本身基本不变。需要重验：

- client-safe catalog在最新 Client module/domain graph 下仍合法；
- Browser exact version resolution与 latest ui-renderer/slots lifecycle兼容；
- package/build/generated client catalog按新 repository gates同步。

## 8. 测试

- exact v1/v2 resolution；
- open-world custom definition；
- duplicate rejection；
- HMR disposal/re-register revision；
- client-safe mapping无 runtime schema/function/credential泄漏；
- feature-disabled/lifecycle policy；
- Browser catalog failure只降级 Editor，Minimal保持可读。

## 9. 验收

PR #38 设计可继承。完成新 Client graph/build gates 与 N09 shared-settings migration 后执行 focused Registry/Host/Browser tests 即可重新评估 ACCEPTED。
