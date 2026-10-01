# TESTING

How this project is tested.

## Runtime testing (required)

User requirement (2026-10-01): "make sure to use the proper chrome dev tools mcp and what not to
test!!!". Runtime/UI acceptance must be verified in a real Chromium-family browser through the
chrome-devtools MCP server, not through jsdom mockups. jsdom is fine only for cheap static/smoke
checks; it is not acceptance.

- MCP server name: `chrome-devtools` (npm package `chrome-devtools-mcp`). It is registered in the
  opencode global config `C:\Users\prodb\.config\opencode\opencode.jsonc` as a top-level `mcp` entry
  (type local, command `npx -y chrome-devtools-mcp@latest`, enabled true).
- opencode config is NOT hot-reloaded: after any config change, quit and restart opencode before
  expecting the chrome-devtools MCP tools to appear.
- Page under test: https://steamcommunity.com/workshop/browse/?appid=294100&browsesort=trend&days=90
  (RimWorld workshop browse). Logged-out for console-clean checks; logged-in for hide/star
  filtering and card subscription state.
- The extension must be loaded unpacked in the browser the MCP drives. Gotcha (2026-10-01):
  Chrome 154.0.8037.92 (branded) ignored `--load-extension` even with
  `--enable-unsafe-extension-debugging` (0 extensions loaded); Edge 154.0.4258.37 loaded it fine.
  If the MCP's browser will not load the extension (Chrome 154 branded sets
  DisableLoadExtensionCommandLineSwitch and ignores `--load-extension`), drive Edge yourself and
  point a second MCP instance at it (verified 2026-10-01, Edge 154 headless):
  - Edge launch (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`):
    `--headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-sync
    --disable-features=Translate,DisableLoadExtensionCommandLineSwitch
    --enable-unsafe-extension-debugging --window-size=1576,935 --user-data-dir=<temp profile>
    --remote-debugging-port=9225 --load-extension=<repo>
    --disable-extensions-except=<repo> about:blank`
  - Second MCP instance (`--browserUrl` is camelCase; `--workspace` is repeatable):
    `npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9225 --workspace <repo>
    --workspace <os temp dir>`
- MCP tool gotchas (2026-10-01): `evaluate_script` wraps its `function` argument as `(<fn>)` and
  invokes it - pass a function expression; an IIFE string throws "fn is not a function".
  `take_screenshot` to a filePath outside the OS temp dir requires the `--workspace` flag above.
- Captured DOM snapshots for offline reference go to the system temp dir, e.g.
  `C:\Users\prodb\AppData\Local\Temp\opencode\ws-rim-browse.html`. Never commit captures.

## Screenshots

- Tester screenshots: `.opencode/tasks/temp-screenshots/<task>-<n>.png`. The orchestrator opens
  them to judge the overall look; pixel measurements (edges, gaps, sizes) come from the tester's
  report, not from ad-hoc image scripts.
- User screenshots: `C:\Users\prodb\Pictures\Screenshots\` (read-only; never move/rename/delete).
  When a user screenshot is referenced in a task, the task file lists the exact filenames.

## Tester reports

Every tester report ends with a **Doc gaps** line (docs that failed to mention something the change
introduced, or docs that are missing). Fix each gap before closing the task: TESTING.md is edited
by the orchestrator; anything else goes into the next coder round.

## Acceptance

Acceptance criteria live in the task file (`.opencode/tasks/<task>.md`). A task is done only when
all acceptance commands pass AND the reviewer returns no blocking findings AND the docs listed in
the task mention every new public name.
