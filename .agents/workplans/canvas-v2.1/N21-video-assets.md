# N21 — Video Asset Store、授权 Binary Route 与 Range Playback

> 项目：`zhangjaky71-stack/deepseek-harness`  
> 基线：Canvas / Media Workflow V2.1 Production Hardening  
> 文档性质：工程实施节点文档  
> 使用方式：后续可以直接引用节点编号进行“实施 / Code Review / 验收 / 修复”。  
> 总原则：具体 TypeScript API 签名以实施时仓库当前源码为准；职责边界、状态不变量和验收条件以本节点文档为准。

## 1. 节点目标

为视频建立独立 durable asset 生命周期和受授权的 HTTP Range 读取能力，不把大视频塞进 Typert/Session。

## 2. 前置依赖

`N04, N19`

依赖节点未验收时，不应把本节点公开 API 视为稳定。

## 3. 本节点范围

- media-assets abstraction。
- media-assets-local。
- VideoAssetRef。
- content-addressed storage。
- 授权 HTTP route。
- Range/206。
- MediaStage video playback/export。

## 4. 明确不在本节点处理

- 不越级实现尚未到达的后续 Provider/UI/治理能力，除非为编译所需的最小 seam。
- 不改变 V2.1 已冻结的核心不变量。
- 不通过临时 Browser state、直接 Provider 调用或 Session 私有 hack 绕过前置架构。

## 5. 预计代码位置

- `packages/canvas/media-assets/**`
- `packages/canvas/media-assets-local/**`
- `webserver route integration`
- `packages/client/ui-canvas/src/client/MediaStage.tsx`

实际开始实施时必须再次读取目标目录附近的 `AGENTS.md`，代码位置可依仓库当前结构小幅调整。

## 6. 核心接口 / 行为契约

视频读取：

```text
GET media asset
→ authenticate/resolve session
→ authorize canvas.asset.read
→ parse Range
→ stream bytes
```

Typert Remote 只传 metadata/ref。

## 7. 实施步骤

1. 定义 VideoAssetRef/metadata。
2. 实现 save/read/range local store。
3. 实现 session/canvas reference authorization。
4. 正确返回 Accept-Ranges/Content-Range/Content-Type。
5. UI `<video controls playsInline>`。
6. 支持原视频 export/download。
7. 处理 not found/unauthorized/invalid range。

## 8. 工程约束

- 所有 durable state 只在 commit point 发布。
- 产品可见 plugin 必须有符合仓库要求的 REAL composition coverage。
- package 行为变化同步更新 README/JSDoc。
- `src/types.ts` 保持 types-only；测试放 package-level `tests/`。
- 新增 package 必须提供 `./invariant` 并正确接 aggregate/build 配置。
- Registry/listener/subscription 必须证明 disposal/HMR 安全。

## 9. 测试要求

- [ ] 完整读取。
- [ ] Range 206。
- [ ] seek。
- [ ] unauthorized。
- [ ] asset not found。
- [ ] 大文件不进入 JSON Remote。

## 10. 验收标准

- [ ] 浏览器可稳定播放/拖动视频。
- [ ] 视频 asset 受 Host 权限保护。
- [ ] Session 只持久化 VideoAssetRef。

## 11. Definition of Done

- [ ] 代码通过 typecheck/lint/build（按仓库对应命令）。
- [ ] 本节点单元测试通过。
- [ ] 必要 integration / REAL composition 测试通过。
- [ ] README/JSDoc 与公开行为一致。
- [ ] 没有未说明的架构偏差。
- [ ] 提交/PR 描述包含测试证据与剩余限制。

## 12. 风险与禁止项

- 直接暴露本地文件路径或 provider URL；禁止。

## 13. 验收时应输出的结果

后续如果用户要求“验收本节点”，应至少输出：

1. 实际修改文件清单。
2. 关键接口与设计是否符合本节点契约。
3. 测试命令与结果。
4. REAL composition/E2E 证据（如适用）。
5. 未解决问题及严重度。
6. `ACCEPTED / ACCEPTED WITH FOLLOW-UP / REJECTED` 结论。

## 14. 实施指令示例

后续可以直接说：`实施 N21`、`检查 N21`、`验收 N21` 或 `修复 N21 验收问题`。
