# Agent Note: Local Infinite Canvas pane

Status: implemented

English | [中文](2026-08-18-local-infinite-canvas-pane.zh.md)

## Problem

The web application needs an image-generation canvas beside the workspace navigation and coding conversation without importing the canvas application's Python runtime into the Harness process.

## Decision

`AppFrame` renders the existing sidebar, an `Infinite Canvas` iframe, and a resizable conversation sidebar. The iframe addresses the separately cloned `apps/infinite-canvas` service at `http://127.0.0.1:3000/`.

Tool details remain mounted and overlay the conversation sidebar when opened. Both sidebars retain their drag-resizable widths, while the canvas takes the remaining frame width.

## Alternatives considered

**Importing Infinite Canvas into the browser bundle** — rejected. The upstream application is a FastAPI service with its own files, dependencies, and data directories, so bundling it into the browser client would erase the process boundary that keeps its lifecycle independent.

**Proxying the canvas through the Harness web server** — rejected. The first integration needs a visible local service with no new host routing or proxy policy; the iframe can reach the loopback-only server directly.

**Keeping tool details as a fourth column** — rejected. A fourth persistent column would violate the requested three-column layout and reduce the canvas width.

## Consequences

Starting the web application and starting Infinite Canvas remain separate operations. A stopped canvas service leaves only the middle iframe unavailable; it does not prevent the Harness conversation from loading. The two applications share no session, credentials, or storage, and the canvas service accepts requests only through its local listener.

## Verification

The AppFrame test pins the local iframe URL, the details overlay behavior, and both sidebar drags. The separately started Infinite Canvas service returns its root HTML from `127.0.0.1:3000`.
