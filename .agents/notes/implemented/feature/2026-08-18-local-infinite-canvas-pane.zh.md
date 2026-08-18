# Agent Note: Local Infinite Canvas pane

Status: implemented

English | [中文](2026-08-18-local-infinite-canvas-pane.md)

## Problem

网页应用需要在工作区导航和编程对话旁展示图像生成画布，同时不能把画布应用的 Python 运行时并入 Harness 进程。

## Decision

`AppFrame` 渲染现有侧边栏、`Infinite Canvas` iframe 和可调整宽度的对话侧边栏。iframe 指向独立克隆在 `apps/infinite-canvas` 的服务 `http://127.0.0.1:3000/`。

工具详情保持挂载，并在打开时覆盖对话侧边栏。两个侧边栏都保留可拖拽调整的宽度，画布占用框架的剩余宽度。

## Alternatives considered

**将 Infinite Canvas 导入浏览器构建** — 未采用。上游应用是拥有独立文件、依赖和数据目录的 FastAPI 服务；将它打进浏览器客户端会破坏使其生命周期独立的进程边界。

**通过 Harness Web 服务器代理画布** — 未采用。首个集成需要一个可见的本地服务，不应引入新的主机路由或代理策略；iframe 可以直接访问仅监听回环地址的服务。

**将工具详情保留为第四栏** — 未采用。固定的第四栏不符合三栏布局要求，并会挤占画布宽度。

## Consequences

启动网页应用和启动 Infinite Canvas 仍是两个独立操作。画布服务停止时，只有中间 iframe 不可用，Harness 对话仍可加载。两个应用不共享会话、凭据或存储，画布服务只通过本机监听地址接受请求。

## Verification

AppFrame 测试固定了本地 iframe 地址、详情覆盖行为和两个侧边栏的拖拽。独立启动的 Infinite Canvas 服务能从 `127.0.0.1:3000` 返回根页面 HTML。
