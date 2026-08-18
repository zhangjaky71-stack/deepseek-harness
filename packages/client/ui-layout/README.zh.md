# @deepseek-ai/dsh-client-ui-layout

[English](README.md) | 中文

该外壳插件提供三栏 AppFrame：工作区侧边栏、Infinite Canvas 画布栏和对话侧边栏。画布通过 iframe 访问独立运行的 `apps/infinite-canvas` 服务 `http://127.0.0.1:3000/`。工具详情保持挂载，在打开时覆盖对话侧边栏。两个侧边栏都可以水平拖拽调整宽度；工作区侧边栏保留 56px 的折叠控制栏。该插件还会将已解析的 `ctx.theme` 快照投影到 document。

AppFrame 在运行时拥有的 `root` slot 下声明 `sidebar`、`conversation`、`details` 和 `shell.overlay`。会话 owner share 为空；侧边栏 owner share 包含 `collapsed` 与 `width`。注册方通过标准 hooks 获取业务数据，并从自身 inject 接口获取操作。

`/client` 导出插件主体（`apply` 和 `inject`）、`LayoutController` 与 owner-share 接口。AppFrame 和瞬态布局 store 保持包内私有。

## 模型体验

无。布局外壳只管理浏览器查看状态，不会将任何内容放入模型请求。

#### KV Cache 影响

无；该包不会组装或发送提供商请求。

## 已知限制与暂缓事项

- **画布生命周期独立** — Infinite Canvas 未在 `127.0.0.1:3000` 监听前，中间栏不可用；该包不会启动、配置或代理该服务。
- **面板几何信息是瞬态状态** — 重新加载会恢复侧边栏默认值并关闭详情覆盖层；切换到不同 Session 也会关闭覆盖层。
