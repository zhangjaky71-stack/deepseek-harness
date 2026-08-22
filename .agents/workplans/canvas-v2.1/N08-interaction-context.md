# N08 — Canvas Interaction Context 与自然语言指代（0.1.1-rc.2 Revision）

Status: `REVIEW / REVALIDATE`

## 1. 节点目标

让 Agent 在**精确当前用户 turn**获得一次性 Canvas selection/focus/region 快照，理解“这个 / 这张 / 这里 / 这一段”，同时不把 UI selection 持久化进 Workflow/Canvas Session semantic event。

## 2. 依赖

`N07`

## 3. Context 内容

可包含：

- current canvas/workflow identity；
- sampled `workflowRevision`；
- selectedNodeIds / selectedEdgeIds；
- selected stable asset refs；
- focused candidate/output；
- normalized region selection；
- current presentation mode。

所有 model-visible identifier 必须 bounded、single-line、strict decode。

## 4. 精确 turn 绑定

继续使用普通 Conversation prompt path：

```text
Composer submit
→ official prompt RPC id
→ Canvas stage exact snapshot for that rpcId
→ prompt admitted
→ bind exact user-message id
→ only if message survives into agent/pre-step: inject logged plugin-context
```

reject/discard/filter/session/plugin dispose 后必须清理，不得让后续 turn 消费旧 context。

## 5. 0.1.1-rc.2 Region 变化

官方已删除 generic `read_image_region`。因此：

```text
CanvasRegionSelection
= semantic editing intent
≠ call read_image_region
```

Region 仍用 normalized `[0,1]` 坐标并受 `regionEdit` capability 控制。后续实际执行由 image-edit/crop workflow node / Provider adapter 解释；如果需要产生 durable crop，则读取 attachment master、执行 Canvas-owned transform/provider operation，再通过 Harness Attachment 保存派生图。

## 6. Image attachment identity

selected image 必须是当前 Session/Canvas/history 可授权的 stable attachment-backed asset ref。Browser 不能只提交任意 attachment id 并令 Host相信其归属。

Request-image variant/Files upload id 不进入 interaction context；Agent需要的是 semantic stable asset target。

## 7. Staleness

- workflowRevision drift：context 可标记 `STALE`，提示 Agent 先 `canvas_read`；
- Canvas/workflow identity replacement：不得 silent rebind；
- asset removed/unavailable：显式 unavailable/stale；
- queued prompt 真正执行前重新核对 authoritative current identity/revision。

## 8. Remote boundary

`stage/discard` 输入视为不可信：

- plain-object/allowed-key strict decode；
- rpcId bounded charset/length；
- selection count limits；
- normalized region bounds；
- stable id length/control-character restrictions；
- business validation在 nested property 读取前完成；
-内部异常不向 Browser泄漏 raw message。

## 9. 测试

- node A + “修改这个”绑定 A；
- candidate #3 + “用这张做视频”绑定 stable asset；
- no selection → no fabricated target；
- region context 不调用/依赖 removed `read_image_region`；
- cross-session asset id reject；
- exact RPC/message correlation；
- stale revision/identity replacement；
- malformed envelope；
- session prune/HMR/dispose cleanup；
- no `canvas/change` from selection-only changes。

## 10. 验收

PR #36 的 exact-turn设计保留；在最新 Conversation/Attachment/Projection APIs 上重接线并覆盖 region semantic intent 后重新验收。
