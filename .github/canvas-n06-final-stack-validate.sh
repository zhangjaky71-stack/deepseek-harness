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
  packages/canvas/canvas/src/interaction.ts \
  packages/canvas/canvas/tests/interaction-features.spec.ts \
  packages/canvas/media-workflow/tests/plugin-node.spec.ts \
  packages/canvas/media-workflow/tests/registry.spec.ts \
  packages/canvas/media-workflow/tests/built-lib.e2e.ts \
  packages/canvas/media-workflow/tsconfig.json \
  packages/client/ui-canvas/tsdown.config.ts \
  packages/host/apiproxy/tests/fetch-client-prompt-preparation.spec.ts

git diff --cached --check
git commit -m 'fix(canvas): clear host build blockers for N06 validation'
git push origin HEAD:fix/canvas-n06-v2.2-remote-history
