import type { ThemeId } from '../world/types.ts';
import type { SessionStatus } from '../fleet/protocol.ts';

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
} as const;
