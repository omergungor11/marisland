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
