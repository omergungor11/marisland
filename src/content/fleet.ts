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
  /** Running dot pulse (s). */
  pulseSeconds: 1.6,
  /** Panel hidden below this viewport width (px): it would cover a phone screen. */
  minViewport: 600,
  /** Space kept free above the bottom dock (px from the viewport bottom). */
  bottomClear: 104,
  top: 72,
  fonts: { header: "600 18px/1.1 'Fredoka',sans-serif", row: "700 13px/1.3 'Nunito',sans-serif" },
  status: {
    queued: '#B8B3C9',
    // running = the island accent (pulsing)
    running: '',
    waiting: '#F5B83D',
    done: '#6CC07A',
    error: '#E2574C',
    stopped: '#B8B3C9',
  } satisfies Record<SessionStatus, string>,
  statusLabel: {
    queued: 'sırada',
    running: 'çalışıyor',
    waiting: 'onay bekliyor',
    done: 'bitti',
    error: 'hata',
    stopped: 'durduruldu',
  } satisfies Record<SessionStatus, string>,
  liveCount: (n: number): string => `${n} canlı`,
  more: (n: number): string => `+${n} daha`,
  empty: 'Bu adada session yok',
  /** Fleet view (M41): header and the search box. */
  fleetTitle: 'Filo',
  fleetIslands: (n: number): string => `${n} ada`,
  searchPlaceholder: 'Ara: başlık, agent, ada, durum',
  searchEmpty: 'Eşleşen session yok',
} as const;

/** Terminal view of one session (M41, `ui/fleet-term.ts`): same card, slides over the list. */
export const FLEET_TERM = {
  back: 'Listeye dön',
  newTitle: 'Bu adada yeni session',
  placeholder: 'Devam prompt’u… (Enter gönderir)',
  newPlaceholder: 'Ne yapılsın? (Enter başlatır)',
  running: 'çalışıyor…',
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
  fonts: {
    line: "600 12.5px/1.4 'Nunito',sans-serif",
    mono: "500 11.5px/1.45 ui-monospace,'SF Mono',Menlo,monospace",
  },
  colors: { stderr: '#C2413A', resultBg: '#6CC07A26', failBg: '#E2574C1F', userBg: '#3B3A5A0D' },
} as const;

/**
 * Session <-> bot binding (TASK-564, `life/fleet-bots.ts`): a live session seats one department bot
 * at a desk and floats an accent diamond over its head (FLEET_BEACON_SLOT, life/geo/workers.ts).
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
  /** Open-air desk stops (content/offices WORK_SPOTS defs) a department's bot prefers: they read from outside. */
  openDesks: { coding: ['pergolaDesk'] } as Readonly<Partial<Record<string, readonly string[]>>>,
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
} as const;
