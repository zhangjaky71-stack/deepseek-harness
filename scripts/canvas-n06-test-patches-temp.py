from pathlib import Path

path = Path('packages/canvas/canvas/tests/remote.spec.ts')
text = path.read_text()

def repl(old: str, new: str, expected: int = 1) -> None:
    global text
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'remote.spec.ts expected {expected} matches, got {count}: {old[:100]!r}')
    text = text.replace(old, new, expected)

repl(
"""    ctx.canvas.create(agent, { workflow: baseWorkflow() })
    appendCompletedRun(ctx, agent, 'run-1')""",
"""    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    appendCompletedRun(ctx, agent, 'run-1')""",
)
repl(
"const first = ctx.canvas.remoteExportListRuns(agent, { limit: 2 })",
"const first = ctx.canvas.remoteExportListRuns(agent, { canvasId: created.id, limit: 2 })",
)
repl(
"const second = ctx.canvas.remoteExportListRuns(agent, { cursor: first.nextCursor, limit: 2 })",
"const second = ctx.canvas.remoteExportListRuns(agent, { canvasId: created.id, cursor: first.nextCursor, limit: 2 })",
)
repl(
"expect(ctx.canvas.remoteExportGetRun(agent, { runId: CanvasRunId('run-2') })).toMatchObject({",
"expect(ctx.canvas.remoteExportGetRun(agent, { canvasId: created.id, runId: CanvasRunId('run-2') })).toMatchObject({\n      canvasId: created.id,",
)
repl(
"expect(ctx.canvas.remoteExportGetRun(agent, { runId: CanvasRunId('missing') })).toBeNull()",
"expect(ctx.canvas.remoteExportGetRun(agent, { canvasId: created.id, runId: CanvasRunId('missing') })).toBeNull()",
)
repl(
"""    ctx.canvas.create(agent, { workflow: baseWorkflow() })
    expect(() => ctx.canvas.remoteExportListRuns(agent, { limit: 101 })).toThrow(CanvasHistoryQueryError)

    const restricted = await harness({ permissions: { 'canvas.history.read': ['agent'] } })
    restricted.ctx.canvas.create(restricted.agent, { workflow: baseWorkflow() })
    expect(() => restricted.ctx.canvas.remoteExportListRuns(restricted.agent, { limit: 20 })).toThrow(""",
"""    const created = ctx.canvas.create(agent, { workflow: baseWorkflow() })
    expect(() => ctx.canvas.remoteExportListRuns(agent, { canvasId: created.id, limit: 101 })).toThrow(
      expect.objectContaining({ code: 'CANVAS_INVALID_HISTORY_QUERY' }),
    )

    const restricted = await harness({ permissions: { 'canvas.history.read': ['agent'] } })
    const restrictedCanvas = restricted.ctx.canvas.create(restricted.agent, { workflow: baseWorkflow() })
    expect(() => restricted.ctx.canvas.remoteExportListRuns(
      restricted.agent,
      { canvasId: restrictedCanvas.id, limit: 20 },
    )).toThrow(""",
)
path.write_text(text)
