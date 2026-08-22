# N12 — Media Workflow Engine V2.2（0.1.1-rc.2 Revision）

Status: `IMPLEMENTED / REVALIDATE`

## 1. 目标

提供 Browser-independent、Provider-neutral 的 Workflow validation/planning/execution core：确定性 DAG、partial runs、immutable run snapshot、executor registry、fingerprint/cache seam、runtime events 和 cancellation checks。

## 2. 依赖

`N10, N11.5`

## 3. 已有实现可保留

PR #42 的核心 contract继续成立：

- exact `(node.type,nodeVersion)` executor；
- deterministic topology；
- `all/selected/from-node/downstream` scheduling；
- explicit boundary inputs；
- immutable normalized run snapshot；
- shared fresh/cache-hit output validation；
- SHA-256 execution fingerprint；
- optional deterministic cache；
- AbortSignal checks；
- N12 不选 Model/Provider，不写 Session durable state。

## 4. 0.1.1-rc.2 Asset boundary

N12 只消费/产出 semantic media values/stable refs，不拥有官方 Attachment 的 request-image transform/cache。

```text
stable Canvas image asset ref
→ executor/provider bridge
→ provider output value
→ N14 materializer
→ official Attachment durable master
→ stable Canvas image asset ref
```

`RequestImageAttachment` 仅在真正需要 LLM/Provider request projection 的 adapter层出现；不能进入 Workflow snapshot/fingerprint，除非未来明确将某个 deterministic transform policy定义成 semantic execution input。

## 5. Fingerprint

Fingerprint必须基于 semantic execution inputs：

- normalized node config；
- relevant upstream stable values/asset content identity；
- graph relationship；
- exact execution identity from N13；
- explicit runtime semantic parameters。

禁止基于 Browser layout、request cache path、temporary provider URL、Files upload id。

## 6. 测试

保留 PR #42 tests，并新增/重验：

- stable attachment-backed image ref participates by durable/content identity；
- request variant/cache change不改变 semantic fingerprint；
- latest N10 Registry/client-independent build graph；
- N14 materializer seam under synchronized Attachment contracts。

## 7. 验收

源码可继承，不重写 Engine。N11.5完成 infrastructure sync 后运行 existing focused/built-lib tests + new asset boundary tests，再决定是否恢复 ACCEPTED。
