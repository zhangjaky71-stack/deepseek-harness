from pathlib import Path

RC2 = '0.1.1-rc.2'


def replace_once(path: str, old: str, new: str, marker: str | None = None) -> None:
    p = Path(path)
    text = p.read_text()
    if marker is not None and marker in text:
        return
    if marker is None and new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one anchor, found {count}: {old!r}')
    p.write_text(text.replace(old, new, 1))


for path in [
    'packages/canvas/canvas/package.json',
    'packages/canvas/media-workflow/package.json',
    'packages/canvas/media-provider/package.json',
    'packages/canvas/media-provider-mock/package.json',
    'packages/client/ui-canvas/package.json',
]:
    replace_once(path, '"version": "0.1.0-rc.7"', f'"version": "{RC2}"')

replace_once(
    'packages/bundle/base/package.json',
    '    "@deepseek-ai/dsh-bash-sandbox": "workspace:^",\n',
    '    "@deepseek-ai/dsh-bash-sandbox": "workspace:^",\n'
    '    "@deepseek-ai/dsh-canvas": "workspace:^",\n'
    '    "@deepseek-ai/dsh-media-workflow": "workspace:^",\n',
    '"@deepseek-ai/dsh-canvas": "workspace:^"',
)

replace_once(
    'packages/bundle/web-app/package.json',
    '    "@deepseek-ai/dsh-client-ui-attachment": "workspace:^",\n',
    '    "@deepseek-ai/dsh-client-ui-attachment": "workspace:^",\n'
    '    "@deepseek-ai/dsh-client-ui-canvas": "workspace:^",\n',
    '"@deepseek-ai/dsh-client-ui-canvas": "workspace:^"',
)

replace_once(
    'tsconfig.client.json',
    '    { "path": "./packages/client/ui-conversation" },\n',
    '    { "path": "./packages/client/ui-conversation" },\n'
    '    { "path": "./packages/client/ui-canvas" },\n',
    '"./packages/client/ui-canvas"',
)

replace_once(
    'tsconfig.host.json',
    '    { "path": "./packages/attachment/attachment" },\n',
    '    { "path": "./packages/attachment/attachment" },\n'
    '    { "path": "./packages/canvas/canvas" },\n'
    '    { "path": "./packages/canvas/media-workflow" },\n'
    '    { "path": "./packages/canvas/media-provider" },\n'
    '    { "path": "./packages/canvas/media-provider-mock" },\n',
    '"./packages/canvas/canvas"',
)

canvas_host_rows = """

    # Deployment Canvas capabilities are independent from authorization and
    # are consumed by Host operations, Browser UI, and Agent tools.
    - id: canvas-features
      name: '@deepseek-ai/dsh-canvas/feature-service'

    # Open-world semantic media-node registry used by Editor and workflow execution.
    - id: media-workflow
      name: '@deepseek-ai/dsh-media-workflow'

    - id: media-workflow-builtins
      name: '@deepseek-ai/dsh-media-workflow/builtins'

    # One Session-backed Canvas authority for Remotes, Browser projection, and Agents.
    - id: canvas
      name: '@deepseek-ai/dsh-canvas'

    - id: canvas-invariant
      name: '@deepseek-ai/dsh-canvas/invariant'

    # Request-local Browser selection/focus context; durable Canvas state stays in Session.
    - id: canvas-interaction
      name: '@deepseek-ai/dsh-canvas/interaction-service'
"""
replace_once(
    'packages/bundle/base/cordis.patch.yml',
    "    - id: session-projection\n      name: '@deepseek-ai/dsh-session-projection'\n",
    "    - id: session-projection\n      name: '@deepseek-ai/dsh-session-projection'\n" + canvas_host_rows,
    "    - id: canvas-features\n",
)

canvas_client_row = """
    # Session-native Canvas owns the generic shell.main surface. Minimal and Editor
    # are presentation modes over the same Session projection authority.
    - id: ui-canvas
      name: '@deepseek-ai/dsh-client-ui-canvas'

"""
replace_once(
    'packages/bundle/web-app/cordis.patch.yml',
    "    - id: ui-conversation\n      name: '@deepseek-ai/dsh-client-ui-conversation'\n\n",
    "    - id: ui-conversation\n      name: '@deepseek-ai/dsh-client-ui-conversation'\n\n" + canvas_client_row,
    "    - id: ui-canvas\n",
)

Path('.github/workflows/canvas-rc2-migration-once.yml').unlink(missing_ok=True)
