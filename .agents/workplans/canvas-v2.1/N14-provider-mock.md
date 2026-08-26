# N14 — Executor / Media Provider Adapter、路由与 Mock Provider（rc.8 Revision）

## 1. 节点目标

在 N12 Executor contract 之上建立与 Canvas Domain 解耦的 Provider Adapter 层，用可故障注入的 Mock Provider 打通图片/视频执行测试，并为 Python/本地 runtime 等非 Provider executor 保留并列扩展路径。

## 2. 前置依赖

`N12, N13`

## 3. 本节点范围

- MediaProvider interface。
- NodeExecutor → semantic request → Provider Adapter。
- inline/polling/callback/resume/cancel operation shape。
- Provider registry/routing。
- Mock image/video。
- failure injection。
- executor/provider error normalization。

## 4. 明确不在本节点处理

- Provider 不直接写 Canvas/Session。
- Browser 不拿 Provider credential。
- Workflow config 不保存真实 Provider payload/URL。
- Python/local transform executor 不强塞进 MediaProvider interface。

## 5. 目标关系

```text
MediaWorkflow Node
      ↓
N12 NodeExecutor
      ↓
Semantic Media Request
      ↓
MediaProvider Adapter
      ↓
Provider API
      ↓
Normalized Executor Result
      ↓
N12/N16 Run pipeline
```

并列 executor：

```text
TransformExecutor
PythonCodeRuntimeExecutor
RemoteWorkflowExecutor
ProviderExecutor
```

## 6. 核心契约

Provider credential 不进入 Workflow、Session、Projection、Tool result、Browser。

Provider URL/模型凭据由部署配置和 N13 resolver 决定；Workflow 只能表达 semantic requirement/明确 model selection。

## 7. 实施步骤

1. 定义 MediaCapability 与 semantic request。
2. N12 executor 通过 Provider registry/adapter 执行 provider-backed node。
3. 定义 operation handle：providerTaskId/mode/resume/cancel。
4. Mock 支持 text-to-image/image-edit/text-to-video/image-to-video。
5. Mock 输出固定测试 media refs/bytes fixture，经 N17/N21 store seam 落盘。
6. delay/429/5xx/rejection/timeout/cancel/duplicate completion 注入。
7. 错误归一化，不泄漏 secret/provider raw response。

## 8. 测试要求

- [ ] success/cancel/timeout/429/5xx/rejection。
- [ ] duplicate completion 幂等。
- [ ] provider unregister/disposal。
- [ ] 不接云服务也能跑完整 Mock DAG。
- [ ] 换 Provider 不需要修改 Canvas Domain/N12 scheduler。
- [ ] Provider 不直接调用 CanvasService/Session append。

## 9. 验收标准

- [ ] 真实 Provider 接入只新增 Adapter/registration/config。
- [ ] Executor 与 Provider lifecycle 解耦。
- [ ] credential boundary 清晰。

## 10. 风险与禁止项

禁止把真实 Provider payload 当 MediaWorkflow config；必须经 Adapter。
