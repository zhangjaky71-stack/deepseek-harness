# @deepseek-ai/dsh-client-web

[English](README.md) | 中文

Web 启动内核：`new AppWebEntry(el, seams?).run()` 通过两个阶段挂载客户端。模块阶段消费 Host 安装的 `window.__ModuleLoader__` facade，并以 `window.__DSH_BOOT__`、外壳静态模块种子以及可选测试传输覆盖调用 `create()`。Facade 会接管 parser 预载的 registration、构造客户端模块系统、暴露解析后的 manifest，并从 queue 模式切换到 live registration。随后内核预取 manifest 的 `immediately` 层级。

插件阶段挂载仓库内置的 Cordis Loader，通过 Loader 的 `internal` 接口注入模块系统，为图中的每个 entry 统一创建 Loader entry，等待系统停稳，并审计所有 entry 是否都达到 ACTIVE。只有该审计通过后，内核才通过 `ctx.uiRenderer.mount(container)` 把现有挂载点交给动态 UI 渲染器。因此 React root 创建、hydrate、slot 渲染、应用组装以及浏览器标题投影都属于 [`@deepseek-ai/dsh-client-ui-renderer`](../ui-renderer/README.md)，而不属于 Web 内核。

启动页由不依赖框架的普通 DOM 和包内 CSS 构成。客户端 bundle 加载期间以及插件激活失败时，它都保持可用。UI 渲染器会 hydrate 带标记的启动 DOM，再切换到组装完成的应用，因此整个交接过程不需要第二个由 shell 持有的 React root。若图已经停稳但仍缺少 `uiRenderer`，系统会把它作为明确的启动故障显示，而不是无限等待依赖。

`PLATFORM_MODULES`（`src/platform.ts`）仍是当前私有组合中 shell 静态播种共享模块身份以及客户端 bundle external 基线的真源。rc.8 bootstrap 协议另外会在 Vite shell 前由 HTML parser 预载 modules 与 runtime bundle。本分支有意保留现有私有静态 seed 兼容面，等待更广泛的 rc.8 build-system 同步；它不会提前声称仓库已经采用上游全部静态／动态 external 拆分。

可选参数 `seams` 会转发模块系统的 `loadBundle` 传输覆盖（`BootSeams`），用于外部 `<script>` 执行无法到达页面上下文的测试环境；普通浏览器调用方省略该参数。

## 模型体验

无。启动内核只负责启动浏览器插件树；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **应用会等待完整客户端名册**：只要一个 entry 失败，不依赖框架的启动页就会保留并显示醒目的故障报告；当前不支持部分 UI 可用。
- **私有静态模块 seed 仍比官方 rc.8 final tree 更宽**：renderer/root ownership 与 HTML bootstrap 协议已经对齐；剩余 build/external 分区必须作为仓库级 rc.8 同步的一部分验证，而不是在这里悄悄重写。
