#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path

def replace(path: str, old: str, new: str, count: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f'{path}: replacement count for {old!r} is {actual}, expected {count}')
    file.write_text(text.replace(old, new, count))

interaction = 'packages/canvas/canvas/src/interaction.ts'
replace(
    interaction,
    "selectedNodeIds: selectedNodeIds as CanvasInteractionContext['selectedNodeIds']",
    "selectedNodeIds: selectedNodeIds as NonNullable<CanvasInteractionContext['selectedNodeIds']>",
)
replace(
    interaction,
    "selectedEdgeIds: selectedEdgeIds as CanvasInteractionContext['selectedEdgeIds']",
    "selectedEdgeIds: selectedEdgeIds as NonNullable<CanvasInteractionContext['selectedEdgeIds']>",
)

for path in [
    'packages/canvas/canvas/tests/interaction-features.spec.ts',
    'packages/canvas/media-workflow/tests/plugin-node.spec.ts',
    'packages/canvas/media-workflow/tests/registry.spec.ts',
]:
    replace(path, 'await contexts.pop()!.dispose()', 'await contexts.pop()!.fiber.dispose()')

built = 'packages/canvas/media-workflow/tests/built-lib.e2e.ts'
replace(built, "const root = resolve(packageDir, '../../..')\n", '')

media_tsconfig = 'packages/canvas/media-workflow/tsconfig.json'
replace(media_tsconfig, '"outDir": "lib"', '"outDir": "lib/types"')

media_manifest = 'packages/canvas/media-workflow/package.json'
replace(
    media_manifest,
    '  "files": [\n    "lib/**/*.js",',
    '  "files": [\n    "lib/invariant.js",\n    "lib/**/*.js",',
)

canvas_manifest = 'packages/canvas/canvas/package.json'
replace(
    canvas_manifest,
    '  "files": [\n    "lib/index.js",',
    '  "files": [\n    "lib/*.js",\n    "lib/index.js",',
)

media_tsdown = Path('packages/canvas/media-workflow/tsdown.config.ts')
if media_tsdown.exists():
    raise SystemExit('packages/canvas/media-workflow/tsdown.config.ts unexpectedly already exists')
media_tsdown.write_text(
    "import { defineConfig } from 'tsdown'\n\n"
    "export default defineConfig({\n"
    "  entry: [\n"
    "    'lib/types/index.js',\n"
    "    'lib/types/types.js',\n"
    "    'lib/types/builtins.js',\n"
    "    'lib/types/invariant.js',\n"
    "  ],\n"
    "  outDir: 'lib',\n"
    "  format: ['esm'],\n"
    "  platform: 'node',\n"
    "  target: 'es2024',\n"
    "  fixedExtension: false,\n"
    "  dts: false,\n"
    "  clean: false,\n"
    "})\n"
)

ui_canvas_tsdown = Path('packages/client/ui-canvas/tsdown.config.ts')
if ui_canvas_tsdown.exists():
    raise SystemExit('packages/client/ui-canvas/tsdown.config.ts unexpectedly already exists')
ui_canvas_tsdown.write_text(
    "import { clientBundle } from '../tsdown.client.ts'\n\n"
    "export default clientBundle('@deepseek-ai/dsh-client-ui-canvas', ['lib/types/index.js', 'lib/types/invariant.js'])\n"
)

prompt = 'packages/host/apiproxy/tests/fetch-client-prompt-preparation.spec.ts'
file = Path(prompt)
text = file.read_text()
anchor = "import { describe, expect, it } from 'vitest'\n"
if text.count(anchor) != 1:
    raise SystemExit(f'{prompt}: import anchor count={text.count(anchor)}')
text = text.replace(anchor, anchor + "import { SessionId } from '@deepseek-ai/dsh-session'\n", 1)
text = text.replace("sessionId: 'session-preparation',", "sessionId: SessionId('session-preparation'),", 1)
file.write_text(text)

real = 'packages/bundle/base/tests/canvas-real-composition.spec.ts'
replace(
    real,
    '''    "- id: invariants",
    "  name: '@deepseek-ai/dsh-invariants'",
''',
    '',
)

projection_store = 'packages/client/runtime/src/client/sessions/projection-store.ts'
replace(
    projection_store,
    'if (current?.value !== value || current.seq !== baseline.asOfSeq || current.generation !== 0) this.changed(key)',
    'if (current === undefined || current.value !== value || current.seq !== baseline.asOfSeq || current.generation !== 0) this.changed(key)',
)
replace(
    projection_store,
    'if (previous?.value !== control.value || previous.seq !== seq || previous.generation !== control.generation) this.changed(key)',
    'if (previous === undefined || previous.value !== control.value || previous.seq !== seq || previous.generation !== control.generation) this.changed(key)',
)

canvas_view = 'packages/client/ui-canvas/src/client/CanvasView.tsx'
replace(
    canvas_view,
    "{presentation.showOutput && canvas?.output !== null ? <OutputGrid canvas={canvas} interaction={interaction} onSelectOutput={onSelectOutput} t={t} /> : <div className={css.emptyOutput}>{t('minimal.emptyOutput')}</div>}",
    "{presentation.showOutput && canvas !== null && canvas.output !== null ? <OutputGrid canvas={canvas} interaction={interaction} onSelectOutput={onSelectOutput} t={t} /> : <div className={css.emptyOutput}>{t('minimal.emptyOutput')}</div>}",
)
replace(
    canvas_view,
    "onSelect={onSelectOutput === undefined ? undefined : () => { onSelectOutput(canvas, index) }} t={t}",
    "{...(onSelectOutput === undefined ? {} : { onSelect: () => { onSelectOutput(canvas, index) } })} t={t}",
)

editor_store = 'packages/client/ui-canvas/src/client/store.ts'
for old, new in [
    ('  readonly saveStatus: CanvasSaveStatus', '  saveStatus: CanvasSaveStatus'),
    ('  readonly draft: CanvasNodeDraft | null', '  draft: CanvasNodeDraft | null'),
    ('  readonly undo: readonly CanvasEditorHistoryEntry[]', '  undo: readonly CanvasEditorHistoryEntry[]'),
    ('  readonly redo: readonly CanvasEditorHistoryEntry[]', '  redo: readonly CanvasEditorHistoryEntry[]'),
    ('  readonly clipboard: CanvasClipboard | null', '  clipboard: CanvasClipboard | null'),
    ('  readonly localPositions: Readonly<Record<string, { readonly x: number; readonly y: number }>>', '  localPositions: Readonly<Record<string, { readonly x: number; readonly y: number }>>'),
]:
    replace(editor_store, old, new)

capability_test = 'packages/client/ui-canvas/tests/capability-gate.client.spec.ts'
replace(
    capability_test,
    "  slots.register({\n    name: 'root',\n    children: { 'conversation.view': { kind: 'list', scope: 'session' } },\n  }, () => null)",
    "  slots.register({\n    name: 'root',\n    children: { 'conversation.view': { kind: 'list', scope: 'session' } },\n    inject: () => ({}),\n  }, (_p: { renderSlot?: unknown }) => null)",
)

bundle_test = 'packages/client/ui-canvas/tests/client-bundle.client.spec.ts'
replace(bundle_test, 'await enabled.ctx.dispose()', 'await enabled.ctx.fiber.dispose()')
replace(bundle_test, 'await disabled.ctx.dispose()', 'await disabled.ctx.fiber.dispose()')

features_test = 'packages/client/ui-canvas/tests/features.client.spec.tsx'
replace(features_test, '  } as CanvasSnapshot\n}', '  } as unknown as CanvasSnapshot\n}')
replace(
    features_test,
    '    useSession: selector => selector({ openState } as never),',
    "    useSession: (selector: (value: { openState: typeof openState }) => unknown) => selector({ openState }),",
)

interaction_test = 'packages/client/ui-canvas/tests/interaction.client.spec.ts'
replace(
    interaction_test,
    ")) as NonNullable<CanvasSnapshot['output']>['assets']",
    ")) as unknown as NonNullable<CanvasSnapshot['output']>['assets']",
)
replace(interaction_test, '  } as CanvasSnapshot\n}', '  } as unknown as CanvasSnapshot\n}')
replace(
    interaction_test,
    "      } as NonNullable<CanvasSnapshot['output']>,",
    "      } as unknown as NonNullable<CanvasSnapshot['output']>,",
)

state_test = 'packages/client/ui-canvas/tests/state.client.spec.ts'
replace(state_test, '  } as CanvasSnapshot\n}', '  } as unknown as CanvasSnapshot\n}')
replace(
    state_test,
    "  } as NonNullable<CanvasSnapshot['run']>\n}",
    "  } as unknown as NonNullable<CanvasSnapshot['run']>\n}",
)
replace(
    state_test,
    "} as NonNullable<CanvasSnapshot['output']>",
    "} as unknown as NonNullable<CanvasSnapshot['output']>",
)

view_test = 'packages/client/ui-canvas/tests/view.client.spec.tsx'
replace(view_test, '  } as CanvasSnapshot\n}', '  } as unknown as CanvasSnapshot\n}')
replace(
    view_test,
    "    useSession: selector => selector({ openState: 'open' } as never),",
    "    useSession: (selector: (value: { openState: 'open' }) => unknown) => selector({ openState: 'open' }),",
)
replace(
    view_test,
    "      run: { id: 'run-live', status: 'running', workflowId: workflow.id, workflowRevision: 1, startedAt: 2 },",
    "      run: { id: 'run-live', status: 'running', workflowId: workflow.id, workflowRevision: 1, startedAt: 2 } as unknown as NonNullable<CanvasSnapshot['run']>,",
)
replace(
    view_test,
    "      run: {\n        id: 'run-old', status: 'completed', workflowId: workflow.id,\n        workflowRevision: 1, startedAt: 2, finishedAt: 3,\n      },",
    "      run: {\n        id: 'run-old', status: 'completed', workflowId: workflow.id,\n        workflowRevision: 1, startedAt: 2, finishedAt: 3,\n      } as unknown as NonNullable<CanvasSnapshot['run']>,",
)
replace(
    view_test,
    "      output: {\n        runId: 'run-old', workflowId: workflow.id, workflowRevision: 1,\n        assets: [{ kind: 'video', video: { assetId: 'video-old', mediaType: 'video/mp4', bytes: 100 } }],\n        primaryAssetIndex: 0,\n      },",
    "      output: {\n        runId: 'run-old', workflowId: workflow.id, workflowRevision: 1,\n        assets: [{ kind: 'video', video: { assetId: 'video-old', mediaType: 'video/mp4', bytes: 100 } }],\n        primaryAssetIndex: 0,\n      } as unknown as NonNullable<CanvasSnapshot['output']>,",
)

layout_test = 'packages/client/ui-layout/tests/service.client.spec.ts'
replace(layout_test, '    setDetails: vi.fn(),\n', '    setDetails: vi.fn(),\n    setConversation: vi.fn(),\n')
PY

run_logged() {
  local name="$1"
  local log="$2"
  shift 2
  set +e
  "$@" >"$log" 2>&1
  local code=$?
  set -e
  if [ "$code" -ne 0 ]; then
    echo "=== ${name} failure (tail) ==="
    tail -n 180 "$log"
    return "$code"
  fi
  echo "=== ${name} PASS ==="
  tail -n 14 "$log"
}

run_logged 'immutable install' /tmp/install.log pnpm install --frozen-lockfile
run_logged 'standalone hygiene regressions' /tmp/standalone.log \
  pnpm exec vitest run \
  packages/canvas/canvas/tests/interaction.spec.ts \
  packages/host/apiproxy/tests/fetch-client-prompt-preparation.spec.ts
run_logged 'build:lib:host' /tmp/host-build.log pnpm run build:lib:host
run_logged 'build:lib:client' /tmp/client-build.log pnpm run build:lib:client
run_logged 'client hygiene regressions' /tmp/client-regressions.log \
  pnpm exec vitest run \
  packages/client/ui-canvas/tests/capability-gate.client.spec.ts \
  packages/client/ui-canvas/tests/client-bundle.client.spec.ts \
  packages/client/ui-canvas/tests/features.client.spec.tsx \
  packages/client/ui-canvas/tests/interaction.client.spec.ts \
  packages/client/ui-canvas/tests/state.client.spec.ts \
  packages/client/ui-canvas/tests/view.client.spec.tsx \
  packages/client/ui-layout/tests/service.client.spec.ts

python - <<'PY'
from pathlib import Path

required = {
    'media-workflow built LIB': [
        'packages/canvas/media-workflow/lib/index.js',
        'packages/canvas/media-workflow/lib/builtins.js',
        'packages/canvas/media-workflow/lib/invariant.js',
    ],
    'api-remotes built LIB': [
        'packages/client/connection/lib/client.js',
        'packages/client/connection/lib/index.js',
        'packages/api/remotes/lib/client.js',
        'packages/core/agent/lib/index.js',
        'packages/core/session/lib/index.js',
        'packages/canvas/canvas/lib/index.js',
        'packages/canvas/canvas/lib/typert.host.js',
        'packages/goal/goal/lib/index.js',
        'packages/goal/goal/lib/typert.host.js',
        'packages/api/gateway/lib/client.js',
        'packages/api/gateway/lib/index.js',
        'packages/typert/registry/lib/client.js',
        'packages/typert/registry/lib/index.js',
    ],
}

missing = []
for group, paths in required.items():
    absent = [path for path in paths if not Path(path).is_file()]
    if absent:
        missing.append((group, absent))
    else:
        print(f'=== {group} artifact preflight PASS ({len(paths)} files) ===')

if missing:
    for group, paths in missing:
        print(f'=== {group} artifact preflight FAILURE ===')
        for path in paths:
            print(f'  missing {path}')
    raise SystemExit(1)
PY

set +e
run_logged 'Canvas REAL Loader' /tmp/canvas-real.log \
  pnpm exec vitest run packages/bundle/base/tests/canvas-real-composition.spec.ts
canvas_code=$?

media_tmp=packages/canvas/media-workflow/tests/built-lib.e2e.spec.ts
cp packages/canvas/media-workflow/tests/built-lib.e2e.ts "$media_tmp"
run_logged 'media-workflow built-LIB' /tmp/media-built.log pnpm exec vitest run "$media_tmp"
media_code=$?
rm -f "$media_tmp"

remotes_tmp=packages/api/remotes/tests/built-lib.e2e.spec.ts
cp packages/api/remotes/tests/built-lib.e2e.ts "$remotes_tmp"
run_logged 'api-remotes built-LIB' /tmp/remotes-built.log pnpm exec vitest run "$remotes_tmp"
remotes_code=$?
rm -f "$remotes_tmp"
set -e

printf 'FINAL_SMOKE_OUTCOMES canvas=%s media=%s remotes=%s\n' "$canvas_code" "$media_code" "$remotes_code"
if [ "$canvas_code" -ne 0 ] || [ "$media_code" -ne 0 ] || [ "$remotes_code" -ne 0 ]; then
  exit 1
fi

run_logged 'built package invariants' /tmp/package-invariants.log pnpm run verify-built-package-invariants

git rm .github/workflows/canvas-n06-final-stack-hygiene.yml .github/canvas-n06-final-stack-validate.sh
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add -- \
  packages/bundle/base/tests/canvas-real-composition.spec.ts \
  packages/canvas/canvas/package.json \
  packages/canvas/canvas/src/interaction.ts \
  packages/canvas/canvas/tests/interaction-features.spec.ts \
  packages/canvas/media-workflow/package.json \
  packages/canvas/media-workflow/tsdown.config.ts \
  packages/canvas/media-workflow/tests/plugin-node.spec.ts \
  packages/canvas/media-workflow/tests/registry.spec.ts \
  packages/canvas/media-workflow/tests/built-lib.e2e.ts \
  packages/canvas/media-workflow/tsconfig.json \
  packages/client/runtime/src/client/sessions/projection-store.ts \
  packages/client/ui-canvas/tsdown.config.ts \
  packages/client/ui-canvas/src/client/CanvasView.tsx \
  packages/client/ui-canvas/src/client/store.ts \
  packages/client/ui-canvas/tests/capability-gate.client.spec.ts \
  packages/client/ui-canvas/tests/client-bundle.client.spec.ts \
  packages/client/ui-canvas/tests/features.client.spec.tsx \
  packages/client/ui-canvas/tests/interaction.client.spec.ts \
  packages/client/ui-canvas/tests/state.client.spec.ts \
  packages/client/ui-canvas/tests/view.client.spec.tsx \
  packages/client/ui-layout/tests/service.client.spec.ts \
  packages/host/apiproxy/tests/fetch-client-prompt-preparation.spec.ts

git diff --cached --check
git commit -m 'fix(canvas): clear final built-package blockers for N06 validation'
git push origin HEAD:fix/canvas-n06-v2.2-remote-history
