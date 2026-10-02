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
- Edge recipe pitfalls (round 5): literal quotes inside `--load-extension` /
  `--disable-extensions-except` values are unreliable through this shell - use a space-free
  junction path (e.g. `C:\junc\wshs`) pointing at the repo; and the profile `Preferences` file
  existing is NOT proof the extension loaded - verify in-page before trusting a session.
  Harness note: `matrix-lib.js` `gaps.*` is always null (labelInfo.rect lacks `right`); take
  inter-button gaps from the run-line output instead.
- Captured DOM snapshots for offline reference go to the system temp dir, e.g.
  `C:\Users\prodb\AppData\Local\Temp\opencode\ws-rim-browse.html`. Never commit captures.

## Filter variation matrix (standing runtime check)

Every runtime round must re-run the filter variation matrix: capture all three control rects
(x/y/w/h), the two gaps and the computed font-size as a baseline, then sweep every sort option,
every star state (default, 1+..5+), the hide toggle off/on/off, and at least 3 mixed combos,
asserting every capture matches the baseline (<=0.5px) with no ellipsis on known labels at 1576.
Also repeat two different sort options at 1280 (main path; their rects must match each other).
On the fallback path (640/520) the native sort's forced width is CLEARED - it sits at its
natural width and may wrap to a second row - so there compare only our two buttons' equal
widths and label independence. Exact steps
and screenshots: acceptance items 8-17 of
`.opencode/tasks/2026-10-01-stable-geometry-across-filters.md`.

Heavy-filter case (round 3): the matrix must also include a star filter that leaves FEWER THAN
3 visible cards and one that leaves only 1-2 rows. Every button rect, both gaps and the computed
font must still match the unfiltered baseline: the scan derives W/columns from the unfiltered
grid structure, so filtering cannot move anything. Fallback-latch recovery: if the fallback
layout ever appears (see the row-wrap signature in the round-3 notes), any filter change, DOM
mutation or window resize must restore the grid placement with the native sort at the shared
width - the fallback must never stick. Canonical <3-visible repro: `browsesort=mostrecent` plus
the "5 Stars Only" star option hides all 30 sample rows (30/30 hidden, 0 visible) - the exact
pre-fix fallback trigger. Measurement-side note: the geometry probe temporarily un-hides our
`hidden-item` cards in a synchronous batch and re-hides them; expect remove+add mutation pairs
during probes, and after any measurement-triggering action verify filtered rows are STILL
hidden (leak count must be zero) with no visible flicker.
- Helper reference: `WSHSDom.getSortOptionLabels` (steam-dom.js) returns the native sort
  dropdown's option label list used to seed the frozen worst-case ink constant.

### Round-2 runtime notes (native sort anatomy and login-gated checks)

- Native sort anatomy expectation (acceptance item 13): the left sort glyph sits 10px from the
  button's left edge, the right chevron 10px from the right edge, and the label ink is centered
  between them with equal icon-to-ink gaps (difference <=1px) for every label length
  ("Most Recent" through "Most Popular (Three Months)" and "Total Unique Subscribers").
  "Whitespace" means the icon-to-ink gap on each side, not raw edge distance: raw edge
  whitespace is structurally ~8px asymmetric on all three buttons (25px left icon vs 17px
  chevron) and that asymmetry is expected.
- Fallback width note: at 520px the two injected buttons are equal and label-stable, and the
  star button's left edge can sit 4px left of the viewport (known 4px overflow, no breakage).
- Native sort dropdown behavior (Steam's, not the extension's): the TIME FRAME radio group is
  hidden for time-independent sorts (Most Recent, Last Updated, Total Unique Subscribers) and
  the "All Time" choice maps to `browsesort=toprated` with no `days` parameter. A sweep can
  therefore see fewer than the full 12 native radios.
- Sort popover close: Steam's popover ignores synthetic outside-clicks in automation; close it
  by re-clicking the sort button or pressing Escape.
- Login-required checks: the logged-in card width W=262.5 and the hide row-count change
  (`.user_action_history_icon.subscribed` rows disappear) need an authenticated Steam session;
  without a login, mark them login-required instead of claiming a pass.
- Console budget: the "at most one [WSHS] warn" allowance is per page load (one page
  lifecycle), not per state; sweeps and resizes must not add a second warning. The budget
  counts only [warn] lines (the error budget is zero; other console levels are unrestricted).

### Round-3 runtime notes (heavy filters, fallback signature, screenshot measurement)

- Star dropdown label mapping: the option text for the top state is "5 Stars Only" (options:
  "Show All", "5 Stars Only", "4+ Stars", "3+ Stars", "2+ Stars", "1+ Stars"), while the button
  label it produces is "5+ Stars". A naive snapshot-regex harness that clicks the option text
  and then asserts the same text on the button breaks; select the option by its `data-stars`
  value or position and assert the button label separately.
- Fallback signature in a screenshot: our two buttons (star, hide) are right-anchored in the
  injected wrapper at the ~4px wrapper gap and the native sort button wraps to a SECOND row
  below them (the wrapper is `margin-left:auto` inside Steam's flex-wrap row). The shared width
  is then the frozen Iworst+78 fallback constant (~255.2px), not the card width. The second-row
  sort is the quickest way to identify the fallback path in a screenshot.
- Pixel-measuring user screenshots: run a local System.Drawing script (PowerShell
  `Add-Type -AssemblyName System.Drawing`, load the PNG, scan a horizontal pixel line for the
  dark button-background runs) and report button edges and gaps in pixels; user screenshots are
  1:1. Sanity anchors at 13px: label ink ~67.1px for "Star Rating" and ~50.2px for "5+ Stars".

### Collection-page checklist (classic layout, 2026-10-01)

Page: `https://steamcommunity.com/sharedfiles/filedetails/?id=3521297585` - legacy layout, no
`#CommunityTemplate`, no `window.SSR`, all 865 rows in the DOM, anchor is the native
`.subscribeCollection` 3-button row. The controls get a collection-scoped `.general_btn` skin
there, and the row wraps our wrapper onto a second line (the row is too narrow for two more
buttons); the three native buttons keep their look (only their width stretches - see the geometry
line below).

- Controls render inside/next to the `.subscribeCollection` row, 30px tall, dark chip,
  icon + label, unchanged on hover except the native blue `#97C0E3` hover.
- "Hide Subscribed" on hides only rows whose `.general_btn.subscribe` has `toggled`
  (add/remove `toggled` live on rows to simulate); off restores all rows, no holes.
- Star filter narrows rows by `img.fileRating` (`N-star.png`); clearing it restores all.
- State survives a reload through the existing `hideSubscribed` / `starFilter` storage keys.
- A row with no rating or unknown subscribed state is never hidden by hide-subscribed.
- Zero console errors.
- Bar geometry (two-row aligned layout): the `.subscribeCollection` bar must stay within its container
  at any viewport (bar right edge = container content right edge, no overhang). Row 1 = the 3 native
  buttons, row 2 = the 2 injected chips; both rows end on the SAME line - the right edge of the
  rightmost visible green per-row subscribe button (fallback: the bar's content right edge), so
  button 3's right edge = chip 2's right edge. `collection-row-align.js` aligns them: chip 1's left
  edge = native button 1's left edge, the native buttons stretch proportionally to their natural
  widths (inline `width` only, 5px gaps kept unchanged, look otherwise untouched), and the 5px gap
  between the chips stays centred on native button 2's live (stretched) midpoint. The gap between the
  rows is 5px. When the script cannot measure, or the 3 native buttons are not on one line (top
  deltas > 1px), the inline widths are cleared and the natives + wrapper fall back to Steam's natural
  layout.

### No-extension injection harness (classic pages, CSP-safe)

The legacy collection page's CSP blocks localhost fetch/script (connect-src/script-src), so runtime
checks cannot load repo files from a server and the automation browser cannot install the unpacked
extension. Established harness (rounds 2b-5): after a clean reload, inject the current repo files
with a hidden file input + FileReader (steam-dom.js, content.js, collection-row-align.js in that
order, plus styles.css injected as a `<style>` tag), under a localStorage-backed `chrome.storage` shim so `hideSubscribed` / `starFilter`
persistence can be exercised. Hash-match the injected bytes against the repo files before asserting.

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
