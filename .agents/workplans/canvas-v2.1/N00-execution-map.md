# N00 — Canvas V2.2 工程实施总图与节点契约（0.1.1-rc.2 Revision）

## 1. 节点目标

冻结下一阶段全部实现的执行顺序、依赖关系、状态词义和上游兼容规则。所有后续节点以 `deepseek-ai/deepseek-harness@b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` (`dsh@0.1.1-rc.2`) 为当前官方基线。

## 2. 核心原则

1. Harness infrastructure 优先跟官方；Canvas 只保留产品级扩展。
2. `shell.main` + Conversation 并存是 intentional product divergence，必须保留并最小化重放。
3. Session Log 是 Canvas durable authority；Projection 使用最新官方 Host-state / wire-view 模型。
4. Image binary authority 归官方 Attachment；Video binary 后续由 N21 单独治理。
5. Browser/Agent 共用 Host Canvas command/service；不直连 Provider。
6. 历史 implementation 不删除，但 upstream seam 变化时状态回到 `REVALIDATION REQUIRED`。

## 3. 执行图

```text
N00
 ↓
N01 → N02 → N03 → N04 → N05 → N06 → N07 → N08 → N09 → N10 → N11
                                                           ↓
                                                         N11.5
                                                           ↓
                                      N12 → N13 → N14 → N15 → N16
                                                       ┌─────┴─────┐
                                                       ↓           ↓
                                                      N17         N21
                                                       ↓           ↓
                                                      N18         N22
                                                       ↓           │
                                                      N19          │
                                                       ↓           │
                                                      N20 ─────────┘
                                                        \          /
                                                         N23 → N24 → N25
```

## 4. 当前状态约定

- `PLANNED`: 未开始或不能继承历史实现。
- `IMPLEMENTING`: 当前正在实现。
- `IMPLEMENTED / REVALIDATE`: 源码存在，但上游依赖变化，需要迁移/重验。
- `REVIEW`: 当前源码修订存在，等待完整证据。
- `BLOCKED`: 前置、工具链、CI 或 REAL gate 阻塞。
- `ACCEPTED`: 当前 baseline + exact private head 均有可执行证据。

## 5. 当前节点状态

- N01–N05：历史实现保留，`REVALIDATION REQUIRED`。
- N06–N11：现有 stacked PR 保留，均需按新 upstream seam 重验。
- N11.5：rc.8 兼容工作被新 baseline supersede，重新打开。
- N12–N14：已有实现，`IMPLEMENTED / REVALIDATE`。
- N15：当前实现中，需按实际 `packages/canvas/run-admission` 契约重验。
- N16–N25：按本轮修订文档实施。

## 6. 每个节点必须回答的问题

每个节点文档/实现记录至少明确：

1. 该节点拥有哪一类 authority？
2. 哪些输入来自官方 Harness seam？
3. 哪些数据是 durable，哪些只是 request/presentation/process-local？
4. Browser、Agent、Provider 各自能否绕过 Host authority？
5. 上游升级后哪些实现可继承，哪些必须重放？
6. 节点的 focused test、REAL integration 和 repository gate 分别是什么？

## 7. Definition of Done 通则

- 代码与节点契约一致；
- 不手改工具拥有的 generated/lock 输出；
- focused unit/integration tests 实际执行；
- 受影响的 typecheck/lint/build/coverage/docs/client-domain/runtime-closure gate 实际执行；
- 产品可见集成有 REAL assembled evidence；
- 双语 package/Agent Note pairing 更新；
- implementation record 写清 exact-head 证据和剩余限制。

## 8. 禁止项

- 禁止为了减少 merge 成本而删除 Canvas 产品能力。
- 禁止继续依赖已被官方替换的 private infrastructure seam 而不重验。
- 禁止把 runner 前置失败写成测试通过。
- 禁止把 request image/video bytes、credential 或 provider temp URL 放进 Session durable event。
