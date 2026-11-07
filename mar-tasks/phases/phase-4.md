# Phase 4: Fleet — the control room for a self-improving agent fleet

Goal (user, 2026-11-07, D-141): the seven department islands show **real Claude Code sessions**. A side
panel per island lists who works on what and since when; a row opens the terminal stream; a bot takes a
prompt; islands hand work to each other through approval gates; later the fleet grows its own knowledge
base, agents and skills under HQ review, and every island has daily / weekly / monthly reports.
Plan: `mar-plans/FLEET.md`. Shared contract: `src/fleet/protocol.ts` (changes go through the orchestrator).

Decisions already taken: runtime = Claude Code CLI (`claude -p`, subscription, no API key); hand-offs are
approval-gated with per-request caps; no "free" mode. Start slice = M40.

---

## M40 — Fleet Bridge + Island Panel

### TASK-562 — Bridge server (devops)

`server/bridge.ts` run by `pnpm bridge` (tsx). `tsconfig.node.json` includes `server`; eslint covers it.
- HTTP + WebSocket on `FLEET_PORT` 5174 (`ws` package, pinned). Endpoints: `GET /api/sessions`,
  `GET /api/sessions/:id/lines?from=`, `POST /api/start` (`{island, prompt, agent?}`), `/ws` for
  `FleetEvent` / `FleetCommand` (one JSON per message; `snapshot` on connect).
- `start`: `FleetSession` queued → spawn `claude -p <prompt> --output-format stream-json --verbose
  --include-partial-messages --session-id <uuid> --permission-mode acceptEdits --permission-prompts none
  --max-turns <cfg> --allowedTools <cfg…>` with `cwd = fleet/islands/<island>/` and `--add-dir` from config.
  Partial message chunks update `lastLine` only; whole `assistant` / `tool_use` / `tool_result` / `result`
  events become `FleetLine`s (`text` ≤ 400 chars). Raw stdout lines are appended to `fleet/runs/<id>.jsonl`.
- Title: after the first assistant text, `claude -p --model haiku --max-turns 1 --no-session-persistence
  --output-format json` asks for a 4-7 word Turkish title; on failure the draft title stays.
- `result` → `done` / `error` (+ `turns`, `costUsd`, `endedAt`); process exit without result → `error`
  with the exit code; `stop` → SIGTERM → `stopped`. `fleet/runs/index.json` holds sessions + requests;
  on restart it is reloaded and live sessions become `error: bridge restarted`.
- `fleet/fleet.config.json`: per-island `addDirs`, `allowedTools`, `maxTurns` 30, `maxChildren` 6, `model`.
  Seven `fleet/islands/<theme>/CLAUDE.md` skeletons (8-12 lines each: who the department is, what it
  owns, how it reports). `fleet/runs/` gitignored.
- Pure parts testable without spawning: stream-json → `FleetLine` reducer, index load / save, config
  validation (`server/bridge.test.ts`, vitest picks it up).
- Acceptance: `pnpm bridge` up; `curl -X POST :5174/api/start -d '{"island":"coding","prompt":"Say hi and
  list the files in your cwd"}'` runs a real session; WS shows `session` (queued → running → done) and
  `line` events; the jsonl exists; the title changed to a haiku one. `pnpm typecheck && pnpm lint && pnpm
  test` green. One real session is the only token spend allowed (plus haiku titles).

### TASK-563 — Fleet client + island panel (engine)

- `src/fleet/client.ts`: connects to `ws://localhost:5174/ws` when `?fleet` is unset or `=live`,
  reconnects with backoff (1 s → 30 s), exposes a store (`sessions`, `requests`, `lines by session`,
  `connected`) with a subscribe callback; `send(FleetCommand)`. When the bridge is absent: one console line
  `fleet: bridge yok`, no retries after 3 failures, panel hidden. `?fleet=mock` → `src/fleet/mock.ts`:
  deterministic sessions on every island (seeded by `seed`, wall-clock offsets relative to page open, a
  scripted line feed on a timer, frozen under `simt`/capture) so shots are reproducible. `?fleet=0` off.
- `src/ui/fleet-panel.ts` (`createFleetPanel(root, store, opts)`): left dock panel, same DOM + CSS pattern
  as `edit-panel.ts` (styles in `styles.ts`, Fredoka / Nunito, cream palette, island accent colour from
  `ISLAND_ACCENTS`). Header: island name + theme icon + live count. Rows: status dot (queued grey,
  running accent pulse, waiting amber, done green, error red, stopped grey), agent, title (2 lines max),
  "12 dk" live duration (`startedAt`, updates every second, `endedAt` freezes it), `lastLine` muted.
  Live rows first, then recent (max 12, "+N" footer). Row click selects (highlight only; the terminal view
  is M41, leave a `onSelect(sessionId)` hook). Panel shows when `tier ≥ 1` and the nearest island is known
  (the app already resolves island focus for labels / fly-to: reuse that, do not add a second nearest
  search per frame; update on change only). Hidden with `?hud=0`, in photo mode, in edit mode.
- `src/content/fleet.ts`: colours, pulse period, row cap, duration format thresholds, panel width — content
  is data.
- Wiring in `app.ts` next to `createHud`; HUD unaware except an `openPanel` exclusivity rule if needed.
- Acceptance: `pnpm dev` + `?fleet=mock&seed=1001` → fly to Coding → panel lists its sessions, durations
  tick, change island → content swaps; bridge absent → no panel, no errors; `pnpm shots dev --only=<new
  F-panel shot>` reproducible twice (add `F-panel` to the dev set in `src/content/shots.ts` with
  `fleet=mock`, not to ci / wow). `typecheck`, `lint`, `test` green; budgets untouched (DOM only).

### TASK-564 — Session ↔ bot binding (life) — after 563

A live session puts one department bot at a desk / work spot with a visible marker (screen glow or a
small accent badge, no new program); done sessions release it. Hover shows the title. Deterministic
mapping (session id hash → bot index). `src/life/fleet-bots.ts`, wired in `app.ts` by the orchestrator.

### TASK-565 — Keyboard camera: WASD + Q/E (engine)

Inside `src/camera/controls.ts` (+ `src/camera/keys.ts`): W/S forward/back, A/D truck, Q/E azimuth
rotate, held keys polled per frame; speed scales with camera distance (`CAMERA_MOVE.keys` in
`src/content/tiers.ts`: unitsPerSecond at reference distance, rotate rad/s, ease). Arrow keys mirror WASD.
No effect while an input / textarea / contentEditable has focus, in capture mode, or with modifiers.
Stops the tour like any input. Unit test for the key-state → velocity math. The user will add more
shortcuts later: keep the key map in content.

### TASK-566 — M40 shots + QA (qa) — after 563 / 564 / 565

F-panel and a Coding close-up with a bound bot; checks: panel legible at 960×540 and 1280×720, no overlap
with the HUD dock / island labels, durations and accents right, bot marker visible at T2, budgets unchanged.

---

## M41 — Detail + fleet view

Contract additions: `FleetSession.lastSeq` (bridge sets it on every `session` event). `send` and `tail` exist in
`FleetCommand` already. Keys: the prompt box and the search box must swallow WASD / Q / E / B / H while focused
(the camera keys already ignore INPUT / TEXTAREA focus; verify the HUD H toggle does too).

### TASK-568 — Bridge M41 (devops)
- `send(sessionId, prompt)`: only when the session is not live; spawn `claude -p --resume <id> "<prompt>"` with
  the same `islandSpawn` flags (`--settings`, `--add-dir`, `--allowedTools`, `--max-turns`, `--model`) and cwd;
  status → `running`, `turns` / `costUsd` accumulate, lines append with continuing `seq` to the same jsonl;
  `result` → `done` again; the bounds check runs again. A `send` on a live session answers `error`.
- `tail(sessionId, from)`: serve from memory when `from ≥ first cached seq`, else reduce the jsonl from disk.
- `lastSeq` on every `session` event and in `snapshot`.
- Request title: when the root session's haiku title lands, copy it to the request and broadcast `request`.
- `GET /api/sessions?q=` and a `query` on the snapshot are NOT needed; the client filters locally. Skip.
- Tests: resume arg builder, tail source selection, request title propagation. One real resume is the only
  token spend allowed (the user's bridge on 5174 must not be used; run your own on 5175 with `PORT=5175` or a
  config override — add `FLEET_PORT` env support to `server/config.ts` if missing).

### TASK-569 — Panel M41 (engine)
- Terminal view inside the fleet panel (same card, slides over the list): header with back arrow, title, agent,
  status dot, duration, cost; body = lines (`assistant` body text, `tool_use` as `▸ Bash pnpm test`, `tool_result`
  muted first line, `result` summary bar, `stderr` red), autoscroll unless the user scrolled up ("↓ yeni satırlar"
  pill), `tail` on open (`linesOf(id).length` → `from`); footer = prompt textarea (Enter sends, Shift+Enter newline)
  → `send` when the session is not live, disabled with "çalışıyor…" while live, plus a Stop button on live rows.
- Bot click (`hit.name === 'workers'` with a bound session) → opens that session's terminal; bot click without a
  session → prompt box "Bu adada yeni session" → `start { island, prompt }`. The row's `onSelect` from TASK-563
  opens the terminal.
- Fleet view: when no island is focused (tier 0 or `islandNear` null) the panel shows all islands: one block per
  island (icon, name, "N canlı"), rows as today; a search box on top filters title / agent / island / status
  (local, case- and Turkish-insensitive: `ı/i`, `ş/s`…); row click flies to the island (reuse the app's fly-to)
  and selects. Panel width may grow to `FLEET.fleetWidth` in this mode.
- Row-diff renderer: keyed rows, update text / classes in place; no innerHTML rebuild on feed lines.
- Mock: `send` and `start` work offline (new session with the prompt as draft title, a scripted 6-line run
  over ~10 s of feed, then `done`), so the whole flow is testable without the bridge and in shots.
- Dev shots `F-terminal` (Coding, terminal open on the running session, simt 2) and `F-fleet` (overview with the
  fleet view and a search term via a `fleetQuery` preset field); both deterministic twice; ci untouched.

---

## M42 — Request chains + approval gates

The user's scenario: "Marketing adasındaki bir agent'a 'benim için 5 sosyal medya gönderisi hazırla' dedim; o
Design adasıyla konuşsun, Design'dan gelen rapora göre gerekirse Coding'le konuşsun; hepsi bir arada çalışsın."
Hand-offs are approval-gated (user decision 2026-11-07) with per-request caps.

**Mechanism (D-149, option A "report line")**: an island asks another island by ending its final message with
one or more `## → <ada>: <istek>` sections (already in `fleet/CLAUDE.md`'s report format). The bridge parses
the final assistant text of every run; each line becomes a `FleetGate { fromSessionId, fromIsland, toIsland,
prompt, status: 'pending' }`, the parent session goes `waiting`, the panel shows a gate card ("Marketing →
Design: … · İzin ver / Reddet"). On allow the bridge starts a child session on `toIsland` (same `requestId`,
`parentId`) whose prompt is the hand-off text plus a short context header (request title, parent island, the
parent's "Özet" section). When the child finishes, the bridge **resumes the parent** with "Design adasından
rapor:\n<child Özet>" so the parent can continue, answer the user, or ask the next island (→ Coding), each
step gated again. Caps: `maxChildren` per request (manifest, default 6), depth ≤ 3, one pending gate per
parent at a time; deny → the parent is resumed with "Design'a devir reddedildi" so it can finish on its own.
Option B (a bridge MCP tool the agent calls mid-run, parent blocks until the child answers) is deferred: it
needs an MCP server in the bridge and keeps a session open while waiting; the report-line route reuses
resume (D-145) and spends nothing while a gate waits.

### TASK-574 — Bridge chains (devops)
- `server/chain.ts` (pure): `parseHandoffs(finalText)` → `{ island, prompt }[]` (tolerant: `## → design:`, `→
  Design :`, Turkish names from `island.json.name` and ThemeIds), `childPrompt(request, parent, handoff,
  parentSummary)`, `reportBackPrompt(childIsland, childSummary)`, `parseSummary(finalText)` ("## Özet"), cap
  checks (`maxChildren`, depth, one pending per parent).
- Lifecycle: on `result` of a run with hand-offs → gates created (`gate` events), parent `waiting`; `gate
  allow` → child `start` with `parentId` / `requestId`; child `done` → parent `send(reportBackPrompt)`; child
  `error` / `stopped` → parent resumed with the failure line; `gate deny` → parent resumed with the denial.
  Gates persist in `index.json`; a restart keeps pending gates. `snapshot.gates` filled.
- `FleetRequest` gains nothing new; children are found by `requestId` + `parentId`.
- Tests on the pure parts; ONE real chain allowed for acceptance (marketing → design, 2 short runs + 1 resume)
  on your own bridge port 5175.

### TASK-575 — Panel chains (engine)
- Gate card at the top of the island list and the fleet view: "Marketing → Design" with the prompt (2-line
  clamp), İzin ver / Reddet buttons → `gate` command; pending gates also pulse the parent's status glyph
  (waiting ring) and show a count badge in the fleet header ("2 kapı").
- Terminal header shows the request: "İstek: <title> · 3 session" with a chain strip (island discs in order,
  current one lit); clicking a disc opens that session.
- Fleet view groups chained sessions under their request title when a request has > 1 session.
- Mock: a scripted chain (marketing → design → coding) with a pending gate so shots cover it; `F-gate`,
  `F-chain` dev shots.

### TASK-576 — Fleet docs for chains (docs, haiku)
- `fleet/CLAUDE.md`: the `## → <ada>: <istek>` syntax becomes the official hand-off (one per section, what to
  include, that a report comes back and the session continues), the `## Özet` section is mandatory because it
  travels; island `CLAUDE.md`s get one line each on whom they typically hand to (marketing → design / coding,
  design → coding / marketing, coding → qa / devops, qa → coding, devops → coding, research → anyone, hq → all).
- `mar-plans/FLEET.md` "İstek zinciri" section with the diagram.

### TASK-577 — M42 scenario QA (qa)
- The 5-social-media-posts request end to end on a scratch bridge (3-4 real short runs): gates appear, allow
  → child runs, parent resumes with the report, chain strip in the terminal, fleet view grouping; budgets and
  determinism unchanged (mock shots). Report `mar-docs/qa/m42-chains-<date>.md`.
