# canvas/ — 生成式媒体 Canvas

[English](README.md) | 中文

Canvas 组负责会话范围内的生成式媒体工作区，以及作用于该工作区的媒体工作流能力。Durable Canvas State 与 process-local Node Definition Metadata 保持在独立 package 中，因此 Session Replay 不依赖 Deployment Registry 的生命周期。执行器、Provider、资产、Agent 工具和更完整的浏览器编辑能力，会在各自实现存在时作为独立角色加入。

| 包 | 职责 |
|---|---|
| [`canvas/`](canvas/README.md) | 共享 Canvas snapshot、语义媒体工作流词汇、revision、输出引用、Deployment Capability Policy、Projection、Interaction Context、Host Mutation 与 durable invariant |
| [`media-workflow/`](media-workflow/README.md) | 版本化语义 Node Definition Registry、typed port/config schema、intrinsic lifecycle、稳定 UI/Execution metadata 与 V1 built-in definition |
