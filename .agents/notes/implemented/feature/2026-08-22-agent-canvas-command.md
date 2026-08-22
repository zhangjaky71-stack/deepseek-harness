# Agent Note: Agent-to-Canvas live command bridge

Status: implemented

## Problem

Harness embeds Infinite Canvas as a separately-run application, while the Agent loop and durable Session log live in the Host. A model-facing Canvas action therefore needs to cross Host, Web client, outer Canvas frame, and the active classic Canvas without moving Canvas execution into Harness or making React components consume Cordis directly.

A Canvas command is also a side effect. Treating ordinary Session history as an execution queue would repeat old generations after reload or resume, while relying on an opened `Session` object would drop commands for cold or off-screen sessions because its conversation window is intentionally lazy.

## Decision

The `@deepseek-ai/dsh-tool-canvas` Consumer registers one high-level `canvas` tool in the shipped Web `standard` and `code` Agent presets. Phase 1 supports `action: "generate"`; execution validates model arguments, creates an opaque `commandId`, and appends one log-only `canvas/command` event to the calling Agent's Session. The tool result says the command is queued, not completed.

The Agent loop is unchanged. The command event is the durable Host fact, and it never enters the ordered conversation surface or derived model history.

## Live delivery

The browser runtime publishes every newly arriving mux `session/event` through the generic `session/live-event` client event before any feature-specific interpretation. This feed is live-only: history fetches do not emit it.

`ui-layout` owns the Canvas integration because it owns the Canvas column. Its apply layer validates `canvas/command`, keeps only the highest observed sequence per Session in a framework snapshot store, and supplies that source to `AppFrame` through the slot inject hooks compartment. `AppFrame` remains a pure component with no Cordis access and forwards only the current Session's unseen command.

This split also keeps the browser runtime independent of `dsh-tool-canvas`: runtime transports plugin-extended Session events generically, while the feature owner interprets its event at the consumer edge.

## Canvas execution

The Phase 0 versioned `postMessage` channel adds `host:command` and `canvas:command-result`. Harness still requires the exact outer iframe window and `127.0.0.1:3000` origin.

The outer Infinite Canvas application routes a command only when its classic Canvas iframe is active. The classic page validates and deduplicates the command, then reuses its existing graph operations rather than introducing a parallel generation implementation.

For an active target, Canvas reuses a selected image-generator node when available; otherwise it creates a prompt node and generator node and connects them. The prompt remains an upstream prompt node because existing generator execution derives prompt text from graph inputs. An explicit node target must resolve to an existing image generator. Optional model selection is applied to the generator, while Canvas remains authoritative for provider/model compatibility and the actual generation request.

`canvas:command-result` is an acknowledgement of browser execution only. Phase 1 does not append it to the Session log or retroactively alter the already-completed tool result.

## Alternatives considered

**Replay `canvas/command` from Session history.** Rejected because history is state reconstruction, not an exactly-once side-effect queue. Opening or resuming a Session would otherwise regenerate old images unless a second durable delivery protocol were introduced.

**Deliver through `SessionManager` only after a Session is opened.** Rejected because cold sessions intentionally discard live conversation-window maintenance and rely on history backfill. Canvas commands need an immediate live observation independent of whether the chat window was materialized.

**Put Canvas-specific parsing in the browser runtime.** Rejected because runtime owns generic mux delivery, not the Canvas feature. `session/live-event` preserves the extension point while `ui-layout` owns the feature-specific projection.

**Let `AppFrame` subscribe to Cordis directly.** Rejected because the slot system requires presentation components to receive framework-bound hooks and callbacks rather than `ctx`. The apply layer owns subscription and the component receives a selector hook.

**Store the prompt directly on a newly-created generator node.** Rejected because classic Canvas generation reads prompts from connected upstream sources. Such a node would render as created but execute with an empty prompt.

**Implement generation again in Harness.** Rejected because Infinite Canvas already owns provider configuration, graph semantics, generation, persistence, and node refresh. The bridge carries high-level intent and invokes that existing authority.

## Verification

Package tests execute the real Canvas tool through `ToolRuntime` against a real `Session` and assert the durable event, normalization, ownership requirement, and cancellation behavior. Client bridge tests pin protocol validation, source/origin checks, and command/result message forms. AppFrame tests continue to exercise layout through the injected command hook without importing Canvas business machinery.

The shipped Agent preset configuration is part of the real Web composition, so configuration verification must resolve `@deepseek-ai/dsh-tool-canvas` from the CLI distribution rather than from a test-only mount.

## Consequences

The first vertical slice reaches the real Canvas graph with no Agent-loop change and no rewrite of the Canvas generation engine. Durable intent and live execution have separate meanings, so reloads do not repeat old work and the model cannot mistake a queued Host record for a completed generation.

The trade-off is that delivery is not recoverable yet: a command committed while no Web client observes the live mux event stays durable but will not execute after reconnect. Browser failures are acknowledged transiently but are not durable or model-visible. Video, edit, workflow-construction, durable execution state, retry, and user-facing failure presentation remain later capabilities rather than being hidden inside the Phase 1 generate command.
