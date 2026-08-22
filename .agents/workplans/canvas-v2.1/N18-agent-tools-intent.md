# N18 — Agent Tools / Intent / Command Bus（0.1.1-rc.2 Revision）

Status: `PLANNED`

## 1. 目标

让 Agent、普通 Conversation自然语言意图、Slash/Command和 Browser Editor最终使用同一 Canvas command/run semantics，并完整支持参考图片，不建立第二聊天/上传/Provider通道。

## 2. 依赖

`N08, N11.5, N16, N17`

## 3. 统一 command semantics

建议高层意图覆盖：

- read current Canvas/workflow/run/output；
- generate image/video；
- edit image/region；
- create/replace/update workflow；
- run full/partial workflow；
- select/restore variant；
- cancel/retry run。

不同入口可以有不同 UX，但最终 Host command/request DTO必须收敛到 CanvasService/N15/N16，而不是各自实现业务规则。

## 4. Official command image envelope

0.1.1-rc.2 Slash Command plane已经能显式声明 image acceptance并携带完整 submission envelope。Canvas Slash/command integration必须复用：

```text
Composer text + attached images
→ official command claim/envelope
→ official Attachment admission
→ stable image refs
→ Canvas intent/command
```

不能再设计：

```text
CanvasSlashCommand(imagesBase64: ...)
```

作为平行 upload path。

## 5. Agent Tool

Agent Tool输入是 semantic DTO：目标 Canvas/workflow、operation、generation requirements、stable asset refs/selection anchors。Tool不直接带 Provider credential，不直接调用 generation SDK。

Tool成功语义必须明确区分：

- command accepted/mutation committed；
- run admitted/created；
- asynchronous media generation terminal completed。

不能把“queued”冒充“图片已生成”。

## 6. Natural-language interaction context

N08 exact-turn context给 Agent提供 selected node/asset/region。Agent instructions优先解释 concrete selection；没有 selection就不得虚构“这个”指向最近某对象。

Region意图映射为 Canvas image-edit workflow/command，不调用已删除的 generic `read_image_region`。

## 7. Browser/Agent parity

Browser点击“运行”和 Agent说“运行这个工作流”都必须经过同一 N15。Browser拖节点和 Agent“把模型换成X”都通过同一 semantic mutation/CAS。

## 8. Image reference flow

- Composer images：official envelope/admission → stable attachment-backed refs；
- Canvas selected image：N08 stable Canvas asset ref；
- Provider input：N15 availability/authorization → N14/N20 adapter；
-不在Tool text里塞base64/provider URL。

## 9. Tests

- Agent generate image creates same run semantics as Browser；
- Slash command with reference images consumes whole envelope or visibly refuses，不丢图片；
- non-image accepting command不能吞掉图片；
- selected asset/region natural-language intent正确绑定；
- all run paths hit N15；
- permission/feature/quota/approval errors一致；
- command accepted vs run completed状态区分；
- no second upload/Provider path。

## 10. 验收

至少完成 Browser + Agent Tool + Slash/command 三条REAL路径对同一 Session Canvas行为的等价性测试后 ACCEPTED。
