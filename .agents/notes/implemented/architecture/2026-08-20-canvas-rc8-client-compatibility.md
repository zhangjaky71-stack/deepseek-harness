# Canvas client follows the rc.8 slot and export discipline

## Decision

Canvas client work after N10 targets the DeepSeek Harness rc.8 client architecture. The dynamic `@deepseek-ai/dsh-client-ui-canvas/client` entry exports only Cordis loading values and type-only contracts. `CanvasView`, editor components, browser stores, and pure helpers remain package internals; same-package tests import their source files directly.

Canvas mode and semantic selection remain stable bare observable sources in the registration apply closure because they are not presentation-only state: the conversation prompt-preparation bridge reads the same values to stage the next request-scoped `CanvasInteractionContext` before an Agent turn. The component receives those sources only through the reserved injected `hooks` compartment. There is no second mirrored React/store copy.

N11 editor draft, save status, undo/redo history, clipboard selection, and other presentation state do not need to participate in prompt preparation. Those states therefore use a slot-declared store, with components reading `useStore` and mutating through `actions`, as required by the rc.8 client rules.

## Session-log compatibility

`canvas/change` remains a required durable Session event. It is the authoritative replay source for Canvas state and must not be marked `ignorable`; doing so would permit a reader to silently discard state required to reconstruct the Canvas. Any distribution that opens Canvas-bearing Sessions must compose the Canvas event vocabulary and projection. Optional presentation plugins may be absent, but durable Canvas semantics are not lossy UI metadata.

## Upstream overlap

The rc.8 client shell still owns the standard session/runtime shares and slot renderer. The private three-column Harness layout remains a product customization: sidebar, local Infinite Canvas, conversation, with tool details overlaying the conversation column. Upstream shell lifecycle changes must be incorporated without replacing that topology.

The rc.8 attachment and DeepSeek multimodal changes strengthen, rather than replace, the Canvas media boundary: generated image bytes continue through the attachment service, admission limits remain authoritative, and Provider/model payload details never become durable Canvas state.
