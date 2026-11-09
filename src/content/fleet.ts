import type { ThemeId } from '../world/types.ts';
import type { LineKind, SessionStatus } from '../fleet/protocol.ts';

/**
 * Fleet layer (Faz 4, `mar-plans/FLEET.md`): the island panel's look and the client's timings.
 * Times in ms unless noted.
 */
export const FLEET = {
  /** Reconnect backoff: first wait, cap; a never-connected client gives up after `giveUpAfter` failures. */
  reconnect: { firstMs: 1000, maxMs: 30_000, giveUpAfter: 3 },
  /** Lines kept per session in the store (oldest dropped). */
  linesCap: 500,
  /** Wall clock under capture (`freeze=1`): 2026-11-07 12:00 UTC, so durations are reproducible. */
  captureNow: 1_794_052_800_000,
  /** The live default only on these hosts (a public page probing localhost asks for permission). */
  liveHosts: ['localhost', '127.0.0.1', '[::1]'] as readonly string[],
  /** The panel's island follows the orbit target once it moved this far (u) since the last pick. */
  focusMoveU: 6,
  /** Islands farther than `reach × focusReach` from the orbit target are not "focused". */
  focusReach: 1.6,
} as const;

export const FLEET_PANEL = {
  width: 300,
  /** Card width (px) in the fleet view (no island focused) and while the terminal is open (M41). */
  fleetWidth: 360,
  /** Rows shown; the rest collapse into the "+N" footer. */
  rowCap: 12,
  /** Running glyph halo pulse (s); off under capture (`.mar-hud-instant`). */
  pulseSeconds: 1.6,
  /** Height (px) of the list's bottom fade when rows are cut; a row reaching into it counts as hidden ("+N daha"). */
  fadePx: 28,
  /**
   * Tier >= `fromTier` (close-up) with no terminal open: the card shrinks to a strip (header + live
   * count + the live rows' titles, at most `maxRows`), so it does not cover the scene.
   */
  compact: { fromTier: 3, width: 200, maxRows: 4 },
  /** Overview (T0) island labels keep this gap (px) from the card (placeLabel moves them right of / below it). */
  labelAvoidPadPx: 8,
  /** Panel hidden below this viewport width (px): it would cover a phone screen. */
  minViewport: 600,
  /** Space kept free above the bottom dock (px from the viewport bottom). */
  bottomClear: 104,
  top: 72,
  fonts: { header: "600 18px/1.1 'Fredoka',sans-serif", row: "700 13px/1.3 'Nunito',sans-serif" },
  statusLabel: {
    queued: 'sırada',
    running: 'çalışıyor',
    waiting: 'onay bekliyor',
    done: 'bitti',
    error: 'hata',
    stopped: 'durduruldu',
  } satisfies Record<SessionStatus, string>,
  liveCount: (n: number): string => `${n} canlı`,
  /** Footer: rows past the cap plus rows the scroll cuts (short viewports), so the fade explains itself. */
  more: (n: number): string => `+${n} daha`,
  empty: 'Bu adada session yok · + ile başlat',
  /** TASK-583: the "+" button of the header / an island block opens the new-session prompt box. */
  newSession: 'Yeni session',
  /** Fleet view (M41): header and the search box. */
  fleetTitle: 'Filo',
  fleetIslands: (n: number): string => `${n} ada`,
  searchPlaceholder: 'Ara: başlık, agent, ada, durum',
  searchEmpty: 'Eşleşen session yok',
} as const;

/**
 * Status glyphs (TASK-572): readable without colour (several island accents sit close to the status
 * hues) and without the pulse (off under capture). `color: ''` = the island accent. SVG, 12×12 box.
 *   halo   — filled dot with a ring around it (running)
 *   ring   — hollow ring with a centre dot (waiting for a gate)
 *   check  — check mark (done)
 *   cross  — × (error)
 *   square — rounded square (stopped)
 *   dashed — dashed hollow ring (queued)
 */
export type StatusGlyph = 'halo' | 'ring' | 'check' | 'cross' | 'square' | 'dashed';
export const FLEET_STATUS = {
  glyph: {
    queued: 'dashed',
    running: 'halo',
    waiting: 'ring',
    done: 'check',
    error: 'cross',
    stopped: 'square',
  } satisfies Record<SessionStatus, StatusGlyph>,
  color: {
    queued: '#9A95AE',
    running: '',
    waiting: '#E0A21F',
    done: '#4FA35E',
    error: '#D9443A',
    stopped: '#9A95AE',
  } satisfies Record<SessionStatus, string>,
  /** Glyph box (px) in the rows and the terminal header. */
  sizePx: 12,
  /** Stroke width (glyph units of the 12-unit box). */
  stroke: 2.2,
} as const;

/** Terminal view of one session (M41, `ui/fleet-term.ts`): same card, slides over the list. */
export const FLEET_TERM = {
  back: 'Listeye dön',
  newTitle: 'Bu adada yeni session',
  placeholder: 'Devam prompt’u… (Enter gönderir)',
  newPlaceholder: 'Ne yapılsın? (Enter başlatır)',
  running: 'çalışıyor…',
  /** Composer placeholder of a `waiting` session (a gate or its children, M42). */
  waiting: 'devir bekliyor…',
  /** Composer placeholder of a `waiting` session with pending gates. */
  gateWaiting: (n: number): string => `kapı bekliyor · ${n} kapı`,
  send: 'Gönder',
  start: 'Başlat',
  stop: 'Durdur',
  newLines: '↓ yeni satırlar',
  noLines: 'Henüz satır yok',
  newHint: 'İlk prompt session’ı başlatır; başlık prompt’un ilk satırı olur.',
  offline: 'Bridge bağlı değil, komut gitmedi',
  turns: (n: number): string => `${n} tur`,
  cost: (usd: number): string => `$${usd.toFixed(2)}`,
  /** The body counts as "at the bottom" (keeps autoscrolling) within this many px. */
  stickPx: 24,
  /** Prompt box height (px): min, max (it grows with the text up to max). */
  promptPx: [38, 120] as const,
  /** Line marks per kind (tool_use shows the tool name in bold after the mark). */
  marks: {
    system: '·',
    user: '›',
    assistant: '',
    tool_use: '▸',
    tool_result: '↳',
    result: '✓',
    stderr: '!',
  } satisfies Record<LineKind, string>,
  /** Result bar of a failed run (the text does not start with `done`). */
  failMark: '✕',
  /**
   * Result bar copy (TASK-579): the bridge writes "done · 13 turns · $0.4100 · 3551.0 s", the
   * terminal shows "tamamlandı · 13 tur · $0.41 · 59 dk". Status words by prefix (`error_max_turns`
   * reads as `error`); the run time in `sec` under a minute, else `FLEET_DURATION` minutes / hours.
   */
  resultStatus: { done: 'tamamlandı', error: 'hata', stopped: 'durduruldu' } as Readonly<
    Record<string, string>
  >,
  sec: 'sn',
  fonts: {
    line: "600 12.5px/1.4 'Nunito',sans-serif",
    mono: "500 11.5px/1.45 ui-monospace,'SF Mono',Menlo,monospace",
  },
  colors: { stderr: '#C2413A', resultBg: '#6CC07A26', failBg: '#E2574C1F', userBg: '#3B3A5A0D' },
  /** Gönder / Başlat label colour on the island accent: ink on the light accents (contrast ≥ 2.8, tested). */
  onAccent: {
    hq: '#FFFFFF',
    coding: '#FFFFFF',
    marketing: '#FFFFFF',
    qa: '#3B3A5A',
    design: '#FFFFFF',
    devops: '#3B3A5A',
    research: '#3B3A5A',
  } satisfies Record<ThemeId, string>,
} as const;

/**
 * Session <-> bot binding (TASK-564, `life/fleet-bots.ts`): a live session seats one department bot
 * at a desk and floats an accent diamond over its head (its own InstancedMesh, life/fleet-beacons.ts).
 */
export const FLEET_BOTS = {
  /** Sim seconds a bot keeps its desk and marker after its session ended (done / error / stopped). */
  releaseDelayS: 8,
  /** The marker gem (u, bot space): centre height above the head top, half height, half width; the stalk below it. */
  beacon: {
    lift: 1.3,
    ry: 0.36,
    rx: 0.23,
    stalkFrom: 0.26,
    stalk: 0.02,
    /** Cream ring radius (x gem half width) and the gem's lit top (accent mixed toward cream). */
    ring: 1.5,
    shine: '#FFF6E0',
    shineMix: 0.25,
  },
  /** Capacity of the beacon InstancedMesh (one instance per bound bot; count 0 = no draw call). */
  maxBeacons: 24,
  /** Beacon motion on sim time (scaled by the motion scale): bob height (u, bot space) and period (s), spin (rad/s). */
  beaconMotion: { bob: 0.12, period: 2.4, spin: 0.9 },
  /**
   * Open-air stops (content/offices WORK_SPOTS defs, all in ACTIVITY itineraries) a department's bot prefers: they
   * read from outside, so the beacon is not hidden under a roof. First free stop of the list wins.
   */
  openDesks: {
    hq: ['bellPost', 'timetableBoard'],
    coding: ['pergolaDesk'],
    marketing: ['megaphoneStand', 'marqueeSign'],
    qa: ['stampDesk', 'clipboardWall'],
    design: ['hotShop', 'stainedScreen'],
    devops: ['anvil', 'incidentSign'],
    research: ['chalkboard', 'orrery'],
  } as Readonly<Partial<Record<string, readonly string[]>>>,
  /** Hover title: pointer offset (px) and max width (px); text = agent (small caps) + title. */
  tip: { dx: 14, dy: 18, maxWidth: 260 },
} as const;

/** "ne zamandır" format: under `justNowS` → "az önce", then minutes, hours + minutes, days. */
export const FLEET_DURATION = {
  justNowS: 60,
  justNow: 'az önce',
  min: 'dk',
  hour: 'sa',
  day: 'g',
} as const;

/** Deterministic `?fleet=mock` feed (label 'fleet-mock', seeded by `seed`). */
export const FLEET_MOCK = {
  perIsland: [2, 5] as const,
  /** startedAt offsets before `now` (s): 3 min … 6 h. */
  startedAgoS: [180, 21_600] as const,
  /** Finished sessions ran this long (s). */
  ranS: [120, 3600] as const,
  /** Line feed interval (s). */
  feedEveryS: [2, 4] as const,
  /** Status weights of the non-first sessions (the first of each island runs). */
  statusWeights: [
    ['running', 3],
    ['done', 4],
    ['waiting', 1],
    ['queued', 1],
    ['error', 1],
    ['stopped', 0.5],
  ] as const satisfies readonly (readonly [SessionStatus, number])[],
  agents: {
    hq: ['default', 'planner', 'reviewer'],
    coding: ['engine', 'shader', 'worldgen', 'default'],
    marketing: ['copywriter', 'social', 'default'],
    qa: ['qa', 'visual-qa', 'default'],
    design: ['props', 'art-director', 'default'],
    devops: ['devops', 'release', 'default'],
    research: ['researcher', 'analyst', 'default'],
  } satisfies Record<ThemeId, readonly string[]>,
  titles: {
    hq: [
      'Haftalık rapor taslağı',
      'Faz 4 yol haritası gözden geçirme',
      'Ada bütçe tavanlarını ayarla',
      'Karar defterine D-142 ekle',
      'Agent izin listesini denetle',
      'Aylık filo özeti hazırla',
    ],
    coding: [
      'Liman iskelesi gölge acne düzeltmesi',
      'WASD kamera hareketini ekle',
      'Su shader’ında köpük bandı titremesi',
      'Prop batcher bellek sızıntısı',
      'Zoom kademe geçişinde pop hatası',
      'Worker hareket testlerini hızlandır',
    ],
    marketing: [
      '5 sosyal medya gönderisi yaz',
      'Demo sayfası için kısa tanıtım metni',
      'Lansman e-postası taslağı',
      'Instagram hikâye serisi planı',
      'Basın bülteni İngilizce çevirisi',
      'Haftalık bülten başlıkları',
    ],
    qa: [
      'M40 ekran görüntülerini puanla',
      'Gece karelerinde siyah gölge kontrolü',
      'Panel metni okunabilirlik testi',
      'Determinizm regresyonu: seed 4004',
      'Mobil dokunmatik akış kontrolü',
    ],
    design: [
      'Fener kulesi için yeni çatı modeli',
      'Ada paneli ikon seti',
      'Gün batımı paleti ince ayarı',
      'Atölye ağacı yaprak yoğunluğu',
      'Pazar tezgâhı renk varyantları',
    ],
    devops: [
      'Pages deploy süresini kısalt',
      'CI’da shots önbelleği',
      'Bridge için systemd servis dosyası',
      'pnpm bağımlılık güncellemesi',
      'Sürüm notlarını otomatik üret',
    ],
    research: [
      'Stilize su render teknikleri taraması',
      'Prosedürel bulut yöntemleri karşılaştırma',
      'Rakip diorama oyunları analizi',
      'Agent maliyet raporu: son 30 gün',
      'Kullanıcı görüşmesi notlarını özetle',
    ],
  } satisfies Record<ThemeId, readonly string[]>,
  /** Feed / last lines: tool calls and short assistant notes. */
  lines: [
    'Read src/render/water/water.ts',
    'Edit src/content/fleet.ts',
    'Bash pnpm test',
    'Grep "shadowBias" src/',
    'Testler geçti, şimdi ekran görüntülerine bakıyorum',
    'Bash pnpm typecheck',
    'Write mar-docs/DECISIONS.md',
    'Taslağı kısalttım, iki başlık önerisi hazır',
    'Glob src/ui/*.ts',
    'Bash pnpm shots dev --only=F-panel',
    'Kontrast düşük kalmış, rengi koyulaştırıyorum',
    'Read mar-docs/ART_BIBLE.md',
  ] as readonly string[],
  /**
   * Department feed / last lines (D-143 Open): an island listed here draws from its own pool instead of
   * `lines` (same draw count, so the RNG order is unchanged); its first (running) session shows the
   * pool's first line. Coding keeps the dev tool lines.
   */
  islandLines: {
    hq: [
      'Haftalık rapor derlendi',
      'Read reports/2026-W45.md',
      'Ada bütçeleri tabloya işlendi',
      'Write memory/karar-ozeti.md',
      'Üç ada liderine özet gitti',
      'Grep "D-14" mar-docs/DECISIONS.md',
      'Maliyet tavanı aşılmamış, devam',
      'Read fleet/islands/qa/reports/son.md',
    ],
    marketing: [
      'Instagram carousel taslağı 3/5',
      'Write drafts/lansman-epostasi.md',
      'Başlık önerileri: 4 hazır, 2 elendi',
      'Read knowledge/marka-sesi.md',
      'Hashtag listesi kısaltıldı',
      'Write drafts/bulten-w46.md',
      'Görsel altyazıları Türkçe ve İngilizce hazır',
      'Glob drafts/*.md',
    ],
    qa: [
      'W27 contact sheet puanlandı',
      'Read shots/dev-t566/manifest.json',
      'F-panel PASS, F-bot WARN notu düştüm',
      'Bash pnpm shots ci --assert',
      'Gece karelerinde 2 siyah gölge buldum',
      'Write reports/m40-qa.md',
      'Seed 4004 iki koşuda aynı piksel',
      'Glob shots/dev-t566/*.png',
    ],
    design: [
      'Palet önerisi: kum + turkuaz',
      'Write knowledge/ikon-seti.md',
      'Çatı varyantı B daha sıcak duruyor',
      'Read mar-docs/ART_BIBLE.md',
      'Kontrast düşük kalmış, rengi koyulaştırıyorum',
      'Edit knowledge/palet.md',
      'Üç tezgâh rengi seçildi',
      'Glob knowledge/*.md',
    ],
    devops: [
      'Pages deploy 1 dk 12 s',
      'Bash pnpm build',
      'CI önbelleği ısındı, shots 38 s',
      'Read .github/workflows/pages.yml',
      'pnpm audit: 0 kritik',
      'Edit .github/workflows/ci.yml',
      'Bridge servisi yeniden başladı',
      'Grep "cache" .github/',
    ],
    research: [
      '3 kaynak özetlendi',
      'Read knowledge/su-render-notlari.md',
      'Karşılaştırma tablosu hazır',
      'Write reports/bulut-yontemleri.md',
      'İki makale elendi, eski sürüm',
      'Grep "toon" knowledge/',
      'Maliyet: son 30 günde $41,20',
      'Glob knowledge/*.md',
    ],
  } as Readonly<Partial<Record<ThemeId, readonly string[]>>>,
  /** Replayed history of a snapshot session (`tail`): this many steps after the prompt. */
  historySteps: [4, 9] as const,
  /** Spend per mock turn (USD), for the header and the result bar. */
  costPerTurn: [0.01, 0.09] as const,
  /** tool_result first lines per tool. */
  results: {
    Read: ['218 satır', '96 satır', '412 satır'],
    Edit: ['Dosya güncellendi'],
    Write: ['Dosya yazıldı'],
    Bash: ['Tests  3615 passed (162 files)', 'tsc: 0 hata', 'Done in 41.2s'],
    Grep: ['3 eşleşme', '11 eşleşme'],
    Glob: ['14 dosya'],
  } as Readonly<Record<string, readonly string[]>>,
  /** stderr line of a failed mock session. */
  errorLine: 'exit 1: komut başarısız oldu',
  /**
   * `start` / `send` offline (M41): the prompt as a `user` line, then these steps (`afterS` after the
   * previous one), then the result line and `done` after `doneAfterS`; ≈ 10 s in all.
   */
  script: [
    { afterS: 1.2, kind: 'assistant', text: 'Görevi okudum, ilgili dosyalara bakıyorum' },
    { afterS: 1.6, kind: 'tool_use', tool: 'Read', text: 'Read src/content/fleet.ts' },
    { afterS: 1.0, kind: 'tool_result', tool: 'Read', text: '218 satır' },
    { afterS: 2.2, kind: 'tool_use', tool: 'Bash', text: 'Bash pnpm test' },
    { afterS: 2.4, kind: 'tool_result', tool: 'Bash', text: 'Tests  3615 passed (162 files)' },
    { afterS: 1.4, kind: 'assistant', text: 'Tamam, değişiklik hazır ve testler yeşil' },
  ] as readonly { afterS: number; kind: LineKind; text: string; tool?: string }[],
  doneAfterS: 0.8,
  scriptCostUsd: 0.04,
  /**
   * Scripted request chain (M42, D-149): appended after the drawn sessions (no RNG, so those stay as
   * they were). The Marketing parent's run ended with two hand-off sections: one round (the parent
   * waits until both are answered and the allowed children are done, then resumes once with all
   * reports). Variant `pending`: both gates wait. Variant `allowed`: the Design gate was allowed and
   * its child runs, the Coding gate still waits. Ago times in s before `now`.
   */
  chain: {
    requestId: 'req-chain',
    parentId: 'mock-marketing-chain',
    title: 'Lansman haftası için 5 sosyal medya gönderisi',
    parentAgent: 'social',
    from: 'marketing' as ThemeId,
    parentAgoS: 840,
    /** The parent's first run ended (and the gates opened) this long ago. */
    gateAgoS: 150,
    /** `allowed`: the first gate's answer and its child's start. */
    childAgoS: 120,
    turns: 6,
    costUsd: 0.31,
    parentLines: [
      { kind: 'tool_use', tool: 'Read', text: 'Read knowledge/marka-sesi.md' },
      { kind: 'tool_result', tool: 'Read', text: '96 satır' },
      { kind: 'assistant', text: 'Lansman haftası için 5 gönderi: 2 duyuru, 3 ada tanıtımı' },
      { kind: 'tool_use', tool: 'Write', text: 'Write drafts/sosyal-5.md' },
      { kind: 'tool_result', tool: 'Write', text: 'Dosya yazıldı' },
      {
        kind: 'assistant',
        text: '## Özet\n5 gönderi metni drafts/sosyal-5.md içinde, Türkçe ve İngilizce.\n\n## → design: 5 gönderi için kare görsel önerisi\n\n## → coding: demo sayfasına gönderi önizleme kartları',
      },
    ] as readonly { kind: LineKind; text: string; tool?: string }[],
    /** The parent row's last line while the gates wait. */
    parentLast: '2 devir onay bekliyor: design, coding',
    /** One gate per hand-off section; `handoff` = the gate prompt (the section's text). */
    gates: [
      {
        id: 'gate-chain-design',
        to: 'design' as ThemeId,
        childId: 'mock-design-chain',
        childAgent: 'art-director',
        handoff:
          '5 gönderi için kare görsel önerisi. Her biri 1080×1080, marka paleti (kum + turkuaz); gönderi metinleri drafts/sosyal-5.md içinde, ilk ikisi lansman duyurusu, son üçü ada tanıtımı.',
        childLines: [
          { kind: 'tool_use', tool: 'Read', text: 'Read drafts/sosyal-5.md' },
          { kind: 'tool_result', tool: 'Read', text: '64 satır' },
          { kind: 'assistant', text: 'Palet: kum + turkuaz, 5 kare için kompozisyon çiziyorum' },
          { kind: 'tool_use', tool: 'Write', text: 'Write knowledge/sosyal-kareler.md' },
        ] as readonly { kind: LineKind; text: string; tool?: string }[],
        report: '5 kare görsel önerisi knowledge/sosyal-kareler.md içinde.',
      },
      {
        id: 'gate-chain-coding',
        to: 'coding' as ThemeId,
        childId: 'mock-coding-chain',
        childAgent: 'engine',
        handoff:
          'Demo sayfasına gönderi önizleme kartları: 5 kart, metin + kare görsel yeri, mobilde tek sütun.',
        childLines: [
          { kind: 'tool_use', tool: 'Glob', text: 'Glob src/ui/*.ts' },
          { kind: 'tool_result', tool: 'Glob', text: '14 dosya' },
        ] as readonly { kind: LineKind; text: string; tool?: string }[],
        report: 'Önizleme kartları demo sayfasında, testler yeşil.',
      },
    ],
    /** Child prompt = context header + hand-off (the bridge's `childPrompt`, short). */
    childPrompt: (title: string, from: string, handoff: string): string =>
      `İstek: ${title}\n${from} adasından devir.\n\n${handoff}`,
    /** The parent's resume after the round: one block per gate. */
    report: (island: string, text: string): string => `${island} adasından rapor:\n${text}`,
    denied: (island: string): string => `${island} adasına devir reddedildi`,
  },
} as const;

/**
 * Island hand-off gates and request chains (M42, D-149; `ui/fleet-panel.ts`, `ui/fleet-term.ts`):
 * the gate card on top of the island list / fleet view, the terminal's request line + chain strip,
 * the fleet view's request groups.
 */
export const FLEET_GATE = {
  /** Card head: "Marketing → Design". */
  arrow: '→',
  allow: 'İzin ver',
  deny: 'Reddet',
  /** Label over the prompt of a pending card. */
  pending: 'devir onayı bekliyor',
  /** Prompt clamp (lines) on the card. */
  promptLines: 3,
  /** Prompt toggle under the clamp (TASK-580): the full request, then back to the clamp. */
  more: 'devamı',
  less: 'daha az',
  /**
   * The gates block takes at most this share of the card's height (scrolls inside), and yields
   * further so the list below keeps `listMinPx` (two rows and the head of a third) at short viewports (TASK-580).
   */
  maxShare: 0.45,
  listMinPx: 124,
  /**
   * An answered card collapses to one muted line ("izin verildi · 2 dk"). The line stays while the
   * parent session is live (capped at `liveCapS` since the answer); once the parent ended it lasts
   * this many seconds (from the later of the answer and the parent's end), then disappears.
   * `answeredAt` comes from the bridge, else when the panel saw the answer; gates already answered
   * when first seen without it are not shown (TASK-580).
   */
  collapseS: 300,
  liveCapS: 24 * 3600,
  answered: { allowed: 'izin verildi', denied: 'reddedildi' } as const,
  /** Fleet header badge ("2 kapı") while any gate is pending. */
  count: (n: number): string => `${n} kapı`,
  /** Terminal header line when the request has > 1 session or any gate: "İstek: <title>" (ellipsis) + " · 3 session". */
  request: (title: string): string => `İstek: ${title}`,
  sessions: (n: number): string => ` · ${n} session`,
  /** Fleet view group label over the sessions of a multi-session request. */
  group: (title: string): string => `İstek · ${title}`,
  /** Chain strip discs (px): a session, the shown one (lit), gap; the status badge on a disc. */
  strip: { discPx: 24, currentPx: 30, gapPx: 14, badgePx: 12, iconPx: 13 },
  /** Fleet view: indent (px) per hand-off depth. */
  indentPx: 16,
  colors: {
    /** Card tint and its left bar (the waiting amber of FLEET_STATUS). */
    cardBg: '#FFF3D9',
    bar: '#E0A21F',
    allowBg: '#3E9A57',
    allowInk: '#FFFFFF',
    denyBg: '#3B3A5A14',
  },
} as const;
