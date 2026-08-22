# N03 — Event Sourcing、CanvasService 与原子提交（0.1.1-rc.2 Revision）

Status: `REVALIDATION REQUIRED`

## 1. 目标

建立唯一 Host Canvas semantic write authority：所有 Browser Remote、Agent Tool、未来 Slash/Workflow 指令都通过 CanvasService/统一 command 层验证并追加 Session durable events。

## 2. 依赖

`N01, N02`

## 3. Authority

```text
Browser / Agent
   ↓ command
CanvasService
   ↓ validate + CAS + authorization hooks
Session append
   ↓
Projection
```

Browser 不能直接写 Projection；Provider 不能直接 append Canvas completed/output state。

## 4. 原子提交

一次 semantic operation 要么完整提交，要么不改变 durable Canvas：

- workflow operations 原子；
- multi-field Run transition 原子；
- output asset link 只有在 binary authority 已成功持久化后才可提交；
- CAS conflict 不能部分写入。

## 5. 0.1.1-rc.2 Image boundary

Image output 顺序必须是：

```text
raw bytes
→ Harness Attachment save/normalize
→ stable image ref
→ CanvasService append output/link event
```

`RequestImageAttachment`、variant transform/cache、Files upload identity 不属于 CanvasService durable event input。

## 6. Event/version contract

- event schema/version 显式；
- migration 由 N02 处理；
- current Canvas generation/identity replacement 不 silent rebind old commands；
- workflow/layout/run revision 各有自己的 owner；
- Registry/Settings/HMR mutation 本身不生成 Canvas event。

## 7. Disposal/replay

CanvasService process caches 可以优化，但 Session store/log 永远能重建 authority。插件/HMR dispose 后重建服务不得依赖旧进程内对象。

## 8. 测试

- atomic workflow edit；
- CAS conflict 无部分 event；
- Canvas generation replacement；
- replay 与 live state 一致；
- attachment save failure 时无 completed/output event；
- Browser/Provider 无旁路写入；
- registry/settings 变化不产生 semantic event。

## 9. 验收

在 0.1.1-rc.2 Session/Projection 基础设施上重跑 event/replay tests，并与 N05 最新 projection fold 联合验证后才能重新 ACCEPTED。
