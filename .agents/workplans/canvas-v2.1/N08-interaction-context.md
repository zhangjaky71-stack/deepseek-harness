# N08 — Canvas Interaction Context 与自然语言指代（rc.8 Revision）

## 1. 节点目标

让 Agent 在发送当前用户 turn 时获得准确、一次性、可审计的 Canvas selection/focus 快照，从而理解“这个 / 这张 / 这里 / 这一段”，并与 rc.8 Session/Client plugin 生命周期、普通 Conversation prompt admission、Host 错误边界兼容。

## 2. 前置依赖

`N07`

## 3. 本节点范围

- CanvasInteractionContext。
- selectedNodeIds / selectedEdgeIds / selectedAssets。
- focusedOutput。
- CanvasRegionSelection seam。
- workflowRevision。
- session-scoped presentation store + context builder。
- 用户发起 Agent turn 时的一次性采样。
- exact prompt RPC id → admitted user-message id correlation。
- Host-side strict request envelope / context decode。
- model-visible identifier budget 与字符集边界。
- prompt reject/discard/session/plugin disposal cleanup。

## 4. 明确不在本节点处理

- Interaction Context 不写入 Workflow。
- 不把 selection 作为 durable Canvas Session event。
- 不解析 Agent 输出文本来猜 Canvas selection。
- 不绕过普通 Conversation Composer / prompt transport 建立第二条 Canvas chat path。
- 不把未验证 Browser 文本直接拼进 model-visible plugin context。

## 5. 代码位置

- `packages/client/ui-canvas/**`
- `packages/canvas/canvas/src/interaction*.ts`
- `packages/canvas/canvas/tests/interaction*.spec.ts`
- Harness 当前 `conversation.registerPromptPreparation` / Agent inbox / `agent/pre-step` logged-message seam

## 6. 核心契约

```text
Interaction Context
= 当前 turn 的 transient UI snapshot
≠ durable Workflow state
≠ Session Projection
```

Browser presentation selection 只在对应 Session 的 client lifetime 内存在。发送普通 Conversation prompt 时，Client 在已经获得该 prompt 的 RPC id 后冻结 selection/mode/current Projection，先通过 `canvasInteraction.stage` 把快照绑定到该 RPC id；普通 prompt admission 成功后 Host 再把它绑定到精确 user-message id。只有该消息真正进入 `agent/pre-step` 的最终 message 集合，Canvas plugin-context 才会紧邻该 user message 插入，并随正常 Agent log 路径记录。

必须携带 `workflowRevision`。同一 Canvas/workflow 仅 revision 漂移时允许把旧选择作为 stale context 交给 Agent，但必须明确要求先 `canvas_read`；Canvas/workflow identity 被替换时不得 silent rebind。

rc.8 下现有 `canvas/change` 仍是 durable Canvas Session event；Interaction Context 与它是两个不同层级，不得合并。

### Remote / model-visible input boundary

`canvasInteraction.stage` / `discard` 属于 Browser Remote 输入，不能信任 TypeScript/SRC 类型已经在运行时存在：

- 顶层 request 必须是 plain object-like record，并严格限制允许字段；不得在 decode 前直接访问 `request.context.region` 等属性。
- rpcId 必须有长度与安全字符集限制。
- context 必须 strict decode；selection 数量必须有上限；region bounds 必须处于 normalized `[0,1]`。
- 会进入 model-visible context 的 Canvas/workflow/node/edge/run/asset identifier 必须有固定最大长度并使用单行 opaque identifier 字符集，拒绝换行、控制文本和超长值。
- selected durable asset 必须已经存在于目标 Session 的 Canvas durable output history。
- 普通内部异常不得成为 Browser 可见原始错误文本。

## 7. 实施步骤

1. 定义 request-local DTO 与 Host strict decoder。
2. Editor/Minimal 把 selection/focused output 写入同一 session-scoped browser-local presentation store。
3. Selection anchor 包含 Canvas generation/workflow identity 与 sampled workflowRevision；clear/re-create / workflow replacement 不重绑。
4. 发送 user message 时通过官方 `conversation.registerPromptPreparation` seam 采样；无 concrete selection 时不 stage context。
5. Host 先 strict decode stage envelope/context，再执行 feature policy、Canvas identity/revision 与 asset ownership 校验。
6. 用 exact ordinary prompt RPC id 暂存，Host admission 后绑定精确 user-message id；prompt admission 失败执行 best-effort discard。
7. `agent/pre-step` 只对最终保留的 exact user message 注入 logged plugin-context；reject/filter/error 清理 bound row。
8. queued prompt 真正执行前重新读取 Host Canvas revision，revision drift 标记 stale；Canvas 不可用则标记 STALE/UNAVAILABLE，不把旧 target 当 current。
9. session catalog prune、agent dispose、plugin/HMR dispose、TTL 清理 presentation/correlation context。
10. Agent instructions 明确代词优先解释 concrete selection；没有 selection 字段时不得虚构 target。

## 8. 测试要求

- [ ] node A + “修改这个”指向 A。
- [ ] 第 3 张 output + “用这张做视频”指向正确 durable AssetRef，并保留 zero-based candidate focus。
- [ ] 无 selection 时不注入 Canvas context、不虚构 target。
- [ ] session 切换/Session catalog prune 不泄漏上一 Session selection。
- [ ] plugin dispose/reload 不复用 stale presentation context。
- [ ] exact RPC id 只绑定对应 admitted user message，其他 prompt 不消费它。
- [ ] prompt discard/reject/filter/error 后 staged/bound context 不泄漏到后续消息。
- [ ] queued prompt 执行前 revision drift 重新判定为 STALE；Canvas 消失为 STALE/UNAVAILABLE。
- [ ] malformed/null/array/extra-field stage/discard envelope 在业务读取前稳定失败，不抛 raw TypeError。
- [ ] model-visible identifier 的换行/控制文本/超长值在 admission 时被拒绝。
- [ ] regionEdit disabled 时直接 Remote region staging 也 fail closed。
- [ ] context 不产生 `canvas/change` 或 Workflow revision。

## 9. 验收标准

- [ ] 自然语言指代与 Canvas 当前选择打通。
- [ ] 不污染 Canvas Session Domain；只有模型实际消费的 plugin-context 走正常 logged message channel。
- [ ] 跨 Session / Canvas generation / workflow identity / revision 安全。
- [ ] Browser Remote 输入先严格 decode，再进入 capability / business logic。
- [ ] model-visible context 有明确数量、identifier 与生命周期预算。
- [ ] 不依赖 rc.7 Web shell 私有 send path。

## 10. Definition of Done

- [ ] typecheck/lint/build。
- [ ] request-context integration test。
- [ ] session isolation/disposal test。
- [ ] malformed Remote envelope / model-visible identifier hardening test。
- [ ] Agent Note 与双语 package/documentation contract 同步。
- [ ] repository-pinned CI/REAL composition 有当前分支证据。

## 11. 风险与禁止项

- 禁止把 UI selection 持久化到 Workflow/Canvas Session event 以图省事。
- 禁止根据“最近一个 staged selection”之类隐式全局状态猜 prompt target。
- 禁止把 Browser 任意字符串未经 bounded decode 拼进 model-visible context。
- 禁止 context 在 reject/discard/dispose 后继续存活并被后续 turn 消费。