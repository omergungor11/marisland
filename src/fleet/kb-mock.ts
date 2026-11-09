/**
 * `?fleet=mock` knowledge base (M43, TASK-585): a deterministic in-memory tree shaped like the
 * bridge's (`protocol.ts` KbSource block): per island `CLAUDE.md`, `memory/MEMORY.md` + memory
 * files, a knowledge file; HQ / Marketing reports; `fleet/CLAUDE.md` + config; `mar-docs`; an HQ
 * memory dir. mtimes are offsets from `now` (one file is past `ADMIN.staleDays`), jittered by the
 * labelled RNG ('kb-mock'). `addProject` validates like the bridge and answers offline.
 */
import { ADMIN } from '../content/fleet.ts';
import { THEMES } from '../content/themes.ts';
import { createRng } from '../core/rng.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import type { KbApi, KbTreeResponse } from './kb.ts';
import { mockProjects } from './mock.ts';
import type { FleetProject, KbDoc, KbFile, KbFileKind, KbHit, KbSource } from './protocol.ts';

interface RawFile {
  path: string;
  source: string;
  island?: ThemeId;
  kind: KbFileKind;
  /** Days before `now`. */
  ageD: number;
  raw: string;
}

const fm = (o: Record<string, string>, meta?: Record<string, string>): string =>
  `---\n${Object.entries(o)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}${
    meta
      ? `\nmetadata:\n${Object.entries(meta)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join('\n')}`
      : ''
  }\n---\n`;

interface IslandKb {
  persona: string;
  rules: string[];
  memories: {
    slug: string;
    name: string;
    description: string;
    type: string;
    ageD: number;
    body: string;
  }[];
  knowledge: { slug: string; title: string; body: string };
}

const ISLANDS: Record<ThemeId, IslandKb> = {
  hq: {
    persona:
      'Filonun koordinasyon adası. İstekleri adalara böler, devirleri onaylar, haftalık raporu yazar.',
    rules: [
      'Bir isteği bölmeden önce hangi adanın sahibi olduğunu yaz',
      'Bütçe tavanı aşılacaksa önce kullanıcıya sor',
      'Kararlar `mar-docs/DECISIONS.md`’ye D-numarasıyla girer',
    ],
    memories: [
      {
        slug: 'butce-tavani',
        name: 'Ada bütçe tavanları',
        description: 'Haftalık token tavanı ada başına; aşımda HQ durdurur',
        type: 'project',
        ageD: 6,
        body: '# Ada bütçe tavanları\n\nHer ada için haftalık tavan **$12**; Coding ve Research **$20**.\n\n| Ada | Tavan | Son hafta |\n|---|---|---|\n| Coding | $20 | $14,80 |\n| Research | $20 | $9,10 |\n| Marketing | $12 | $6,40 |\n\nAşım olursa [[haftalik-rapor-akisi]] içindeki uyarı satırı eklenir.',
      },
      {
        slug: 'haftalik-rapor-akisi',
        name: 'haftalik-rapor-akisi',
        description: 'Cuma raporu: her adanın son 5 session’ı ve maliyeti',
        type: 'reference',
        ageD: 2,
        body: '# Haftalık rapor akışı\n\n1. Her adanın `reports/` dizinindeki son dosyayı oku\n2. Maliyetleri topla, [[butce-tavani]] ile karşılaştır\n3. `reports/2026-WNN.md` olarak yaz\n\n> Rapor kısa kalır: ada başına en çok üç satır.',
      },
    ],
    knowledge: {
      slug: 'devir-kurallari',
      title: 'Devir kuralları',
      body: '# Devir kuralları\n\nBir ada başka bir adaya iş devrederken raporunun sonuna `## → <ada>: <iş>` başlığı yazar. HQ kapıyı açar, kullanıcı **İzin ver** derse çocuk session başlar.\n\n- Devir tek cümle iş tanımı içerir\n- Aynı tur içindeki devirler birlikte cevaplanır\n- Çocuk raporu ebeveyne geri döner',
    },
  },
  coding: {
    persona: 'Motor, shader ve worldgen işleri. three.js r186, TypeScript strict, Vitest.',
    rules: [
      'Typecheck + lint + test geçmeden iş bitmiş sayılmaz',
      'Görsel değişiklikte `pnpm shots` çıktısına bak',
      '`world/` içinde three import’u yok',
    ],
    memories: [
      {
        slug: 'golge-acne',
        name: 'Gölge acne: iskele',
        description: 'Liman iskelesindeki çizgili gölgenin sebebi ve düzeltmesi',
        type: 'feedback',
        ageD: 4,
        body: '# Gölge acne: iskele\n\nLiman iskelesinin tahtalarında **çizgili gölge** çıkıyordu. Sebep: `shadow.bias` tek başına yetmiyor, ince geometri *normalBias* istiyor.\n\n## Düzeltme\n\n- `normalBias` 0.04 → 0.02, `bias` −0.0004\n- Gölge kamerası adanın sınırına sıkıştırıldı\n  - frustum her seed’de yeniden hesaplanır\n- İskele tahtaları artık `castShadow` + `receiveShadow`\n\n```ts\nlight.shadow.bias = -0.0004;\nlight.shadow.normalBias = 0.02;\n```\n\n| Ayar | Önce | Sonra |\n|---|---|---|\n| bias | −0.002 | −0.0004 |\n| normalBias | 0.04 | 0.02 |\n\n> Gece karelerinde de kontrol et: ay ışığı aynı bias’ı kullanıyor.\n\nİlgili: [[worker-testleri]], [[eski-shader-notu]]. Ayrıntı için [three.js shadow docs](https://threejs.org/docs/#api/en/lights/shadows/LightShadow).',
      },
      {
        slug: 'worker-testleri',
        name: 'worker-testleri',
        description: 'Worker hareket testleri yavaş: sim adımını 1/15 s yap',
        type: 'feedback',
        ageD: 45,
        body: '# Worker testleri yavaş\n\nHareket testleri 1/60 s adımla 40 s sürüyordu. Test içinde adım **1/15 s** yeterli; determinizm bozulmuyor.\n\n- `stepSim(world, 1 / 15)` kullan\n- Seed 4004 iki koşuda aynı sonucu vermeli',
      },
    ],
    knowledge: {
      slug: 'render-pipeline',
      title: 'Render pipeline özeti',
      body: '# Render pipeline özeti\n\nSıra: gökyüzü → arazi → su → prop batcher → canlılar → post.\n\n1. Arazi tek mesh, kademe başına LOD\n2. Su ayrı pass değil, aynı sahnede transparan\n3. Post: bloom + outline, `quality=low`’da kapalı\n\nBütçeler `src/content/budgets.ts` içinde; `shots --assert` aşımda düşer.',
    },
  },
  marketing: {
    persona: 'Metin, sosyal medya ve lansman işleri. Marka sesi: sıcak, kısa, emoji yok.',
    rules: [
      'Her metin Türkçe ve İngilizce iki sürüm',
      'Başlık en çok 60 karakter',
      'Görsel gerekiyorsa Design adasına devret',
    ],
    memories: [
      {
        slug: 'marka-sesi',
        name: 'Marka sesi',
        description: 'Cozy, kısa cümleler, ünlem yok; “ada” kelimesi küçük harf',
        type: 'user',
        ageD: 9,
        body: '# Marka sesi\n\nMarisland **sıcak ve sakin** konuşur. Ünlem yok, emoji yok.\n\n- Kısa cümle, tek fikir\n- “Takımada” yerine çoğu yerde “adalar”\n- İngilizce sürümde *cozy* kelimesini en çok bir kez kullan\n\nÖrnekler için [[lansman-takvimi]].',
      },
      {
        slug: 'lansman-takvimi',
        name: 'lansman-takvimi',
        description: 'Lansman haftası: 5 gönderi, 1 bülten, 1 basın bülteni',
        type: 'project',
        ageD: 3,
        body: '# Lansman takvimi\n\n| Gün | İçerik |\n|---|---|\n| Pzt | Duyuru gönderisi |\n| Çar | Ada tanıtımı ×2 |\n| Cum | Bülten + basın bülteni |\n\nGörseller Design adasından gelir, bkz. [[marka-sesi]].',
      },
    ],
    knowledge: {
      slug: 'kanal-notlari',
      title: 'Kanal notları',
      body: '# Kanal notları\n\n- **Instagram**: kare görsel, 3 satır metin\n- **X**: tek cümle + demo linki\n- **Bülten**: haftalık, cuma 10:00\n\nDemo: [omergungor11.github.io/marisland](https://omergungor11.github.io/marisland/)',
    },
  },
  qa: {
    persona: 'Ekran görüntüsü puanlama ve regresyon. Kod yazmaz, rapor yazar.',
    rules: [
      'Her puan ART_BIBLE §11 maddesine bağlanır',
      'WARN ve FAIL için bir ekran görüntüsü yolu ver',
      'Determinizm: aynı URL iki koşuda aynı piksel',
    ],
    memories: [
      {
        slug: 'gece-golgeleri',
        name: 'Gece kareleri',
        description: 'Gece karelerinde siyah gölge = ambient eksik',
        type: 'feedback',
        ageD: 11,
        body: '# Gece kareleri\n\nGece karelerinde **tam siyah** gölge görürsen ambient ışık eksik demektir. Coding adasına devret, ekran görüntüsünü ekle.\n\nİlgili: [[golge-acne]]',
      },
    ],
    knowledge: {
      slug: 'puanlama',
      title: 'Puanlama ölçeği',
      body: '# Puanlama ölçeği\n\n| Puan | Anlam |\n|---|---|\n| PASS | Kabul kriterini karşılıyor |\n| WARN | Küçük kusur, iş bitebilir |\n| FAIL | Kabul edilemez |\n\nWow çekimleri 1–5 arası puanlanır.',
    },
  },
  design: {
    persona: 'Palet, ikon, prop görünümü. ART_BIBLE’ın bekçisi.',
    rules: [
      'Renk önerisi her zaman hex ve isimle',
      'Yeni prop için önce silüet çiz',
      'Palet dışı renk yok',
    ],
    memories: [
      {
        slug: 'palet-kararlari',
        name: 'Palet kararları',
        description: 'Kum + turkuaz ana ikili; gece paleti mor değil lacivert',
        type: 'project',
        ageD: 7,
        body: '# Palet kararları\n\n- Ana ikili: kum `#F4E3C1` + turkuaz `#4FC3C9`\n- Gece: lacivert `#3E4C9A`, mor değil\n- Vurgu: mercan `#FF8A65`\n\nAyrıntı: [[ikon-seti]]',
      },
      {
        slug: 'ikon-seti',
        name: 'ikon-seti',
        description: 'Ada ikonları 24 viewBox, stroke 2.5, yuvarlak uç',
        type: 'reference',
        ageD: 14,
        body: '# İkon seti\n\nTüm ikonlar **24×24** viewBox, stroke 2.5, `round` uç ve köşe. Dolgu yok; `currentColor`.',
      },
    ],
    knowledge: {
      slug: 'prop-silueti',
      title: 'Prop silüet kuralları',
      body: '# Prop silüet kuralları\n\n1. Silüet uzaktan okunur olmalı (T0)\n2. Detay yakında açılır (T2–T3)\n3. Çatılar yuvarlak, köşe yok',
    },
  },
  devops: {
    persona: 'CI, Pages deploy, bridge servisi, bağımlılıklar.',
    rules: ['main her zaman deploy edilebilir', 'Push-force yok', 'Yeni bağımlılık önce HQ onayı'],
    memories: [
      {
        slug: 'pages-deploy',
        name: 'Pages deploy',
        description: 'main push’ta deploy; VITE_BASE=/marisland/',
        type: 'reference',
        ageD: 5,
        body: '# Pages deploy\n\n`main`’e push → GitHub Actions → Pages. Alt yol için `VITE_BASE=/marisland/` şart.\n\n```bash\npnpm build && pnpm preview\n```',
      },
    ],
    knowledge: {
      slug: 'bridge-servisi',
      title: 'Bridge servisi',
      body: '# Bridge servisi\n\nBridge `localhost:5174` üzerinde WebSocket + REST sunar. Yeniden başlatmada session’lar `fleet/runs/*.jsonl` dosyalarından geri yüklenir.\n\n- `GET /api/sessions`\n- `GET /api/kb/tree`\n- `POST /api/projects`',
    },
  },
  research: {
    persona: 'Teknik tarama, rakip analizi, maliyet raporları.',
    rules: ['Her iddia için kaynak linki', 'Özet en çok 10 madde', 'Eski sürüm kaynakları ele'],
    memories: [
      {
        slug: 'su-render',
        name: 'Stilize su teknikleri',
        description: 'Köpük bandı: derinlik farkı + noise; Fresnel düşük',
        type: 'reference',
        ageD: 8,
        body: '# Stilize su teknikleri\n\n- Köpük bandı: sahne derinliği farkı + kaydırılan noise\n- Fresnel **düşük** tut, yoksa plastik görünür\n- Kaustik: sadece sığ suda, T2 ve yakını\n\nKaynak: [Stylized water notes](https://example.com/stylized-water)',
      },
    ],
    knowledge: {
      slug: 'maliyet-30-gun',
      title: 'Agent maliyeti: son 30 gün',
      body: '# Agent maliyeti: son 30 gün\n\n| Ada | Session | Maliyet |\n|---|---|---|\n| Coding | 41 | $38,20 |\n| Research | 12 | $9,40 |\n| Marketing | 18 | $7,10 |\n\nToplam **$54,70**; opus payı %71.',
    },
  },
};

const REPORTS: Partial<Record<ThemeId, { week: string; body: string }[]>> = {
  hq: [
    {
      week: '2026-W44',
      body: '# Haftalık rapor · W44\n\n- Coding: WASD kamera ve gölge düzeltmesi bitti\n- QA: 14 kare puanlandı, 2 WARN\n- Maliyet: **$31,20** (tavanın altında)',
    },
    {
      week: '2026-W45',
      body: '# Haftalık rapor · W45\n\n- Fleet: M42 devir kapıları canlıda\n- Marketing: lansman takvimi hazır, bkz. [[lansman-takvimi]]\n- Maliyet: **$44,90**; Coding tavana yakın\n\n## Sonraki hafta\n\n1. M43 admin penceresi\n2. Ada CLAUDE.md dolumu',
    },
  ],
  marketing: [
    {
      week: '2026-W44',
      body: '# Marketing · W44\n\n3 gönderi yayında, ortalama etkileşim %4,2. Bülten açılma oranı %38.',
    },
    {
      week: '2026-W45',
      body: '# Marketing · W45\n\nLansman haftası için 5 gönderi taslağı `drafts/sosyal-5.md` içinde. Görseller Design’da.',
    },
  ],
};

function rawFiles(): RawFile[] {
  const out: RawFile[] = [];
  for (const t of THEME_IDS) {
    const k = ISLANDS[t];
    const dept = THEMES[t].displayName;
    const src = `island:${t}`;
    out.push({
      path: `${src}/CLAUDE.md`,
      source: src,
      island: t,
      kind: 'claude',
      ageD: 10,
      raw: `# ${dept} adası\n\n${k.persona}\n\n## Kurallar\n\n${k.rules.map((r) => `- ${r}`).join('\n')}\n\n## Hafıza\n\nÖnce [[MEMORY]] dosyasını oku; bilgi tabanı \`knowledge/\` altında.`,
    });
    out.push({
      path: `${src}/memory/MEMORY.md`,
      source: src,
      island: t,
      kind: 'memory',
      ageD: Math.min(...k.memories.map((m) => m.ageD)),
      raw: `# ${dept} hafızası\n\n${k.memories.map((m) => `- [[${m.slug}]] — ${m.description}`).join('\n')}`,
    });
    for (const m of k.memories)
      out.push({
        path: `${src}/memory/${m.slug}.md`,
        source: src,
        island: t,
        kind: 'memory',
        ageD: m.ageD,
        raw: `${fm({ name: m.name, description: m.description }, { type: m.type })}${m.body}`,
      });
    out.push({
      path: `${src}/knowledge/${k.knowledge.slug}.md`,
      source: src,
      island: t,
      kind: 'knowledge',
      ageD: 16,
      raw: k.knowledge.body,
    });
    for (const r of REPORTS[t] ?? [])
      out.push({
        path: `${src}/reports/${r.week}.md`,
        source: src,
        island: t,
        kind: 'report',
        ageD: r.week.endsWith('44') ? 8 : 1,
        raw: r.body,
      });
  }
  out.push(
    {
      path: 'fleet/CLAUDE.md',
      source: 'fleet',
      kind: 'claude',
      ageD: 4,
      raw: '# Fleet\n\nHer ada bir departman, her session bir Claude Code koşusu. Bridge `server/` içinde.\n\n## Ortak kurallar\n\n- Commit mesajında attribution yok\n- Push sadece kullanıcı isteyince\n- Para harcayan çağrıdan önce onay\n\nAdalar arası devir: [[devir-kurallari]].',
    },
    {
      path: 'fleet/fleet.config.json',
      source: 'fleet',
      kind: 'config',
      ageD: 4,
      raw: '{\n  "model": "opus",\n  "hqMemoryDir": "~/.claude/projects/marisland/memory",\n  "budgetUsdPerWeek": 120\n}',
    },
    {
      path: 'mar-docs/MEMORY.md',
      source: 'mar-docs',
      kind: 'memory',
      ageD: 1,
      raw: '# Marisland MEMORY\n\n## Gotcha’lar\n\n- Capture modunda saat `FLEET.captureNow`’dan gelir\n- `world/` saf veri: three import’u yok\n- Paralel agent’lar aynı dosyaya dokunmaz\n\n## Nerede kaldım\n\nM43: admin penceresi ve KB route’ları paralel ilerliyor.',
    },
    {
      path: 'mar-docs/DECISIONS.md',
      source: 'mar-docs',
      kind: 'doc',
      ageD: 2,
      raw: '# Kararlar\n\n## D-141 · Fleet bridge\n\nTarayıcı ile `claude` CLI arasında yerel bir bridge; WebSocket + REST.\n\n## D-149 · Devir kapıları\n\nBir adanın raporundaki `## → ada:` başlıkları kapı açar; kullanıcı onaylar.\n\n## D-155 · Kapı bloğu sınırı\n\nKapı bloğu kartın en çok %45’i.',
    },
    {
      path: 'hq-memory/MEMORY.md',
      source: 'hq-memory',
      kind: 'memory',
      ageD: 1,
      raw: '- [[push-promptly]] — biten yeşil işi hemen push et\n- [[parallel-sessions]] — paralel session’lar aynı checkout’u paylaşır\n- [[agents-model]] — agent modeli `.claude/agents/*.md`’den',
    },
    {
      path: 'hq-memory/push-promptly.md',
      source: 'hq-memory',
      kind: 'memory',
      ageD: 12,
      raw: `${fm({ name: 'push-promptly', description: 'Biten yeşil işi onay beklemeden commit + push et' }, { type: 'feedback' })}Biten ve testleri yeşil iş **hemen** push edilir; onay için bekletilmez.\n\n**Why:** Pages deploy’u gecikiyordu.\n\n**How to apply:** milestone sonunda push, \`main\` her zaman çalışır.`,
    },
    {
      path: 'hq-memory/parallel-sessions.md',
      source: 'hq-memory',
      kind: 'memory',
      ageD: 20,
      raw: `${fm({ name: 'parallel-sessions', description: 'Commit’ten önce staged değişikliklere bak' }, { type: 'feedback' })}Başka session’lar aynı checkout’ta stage edebilir. Commit’ten önce \`git status\` ile kontrol et.`,
    },
    {
      path: 'hq-memory/agents-model.md',
      source: 'hq-memory',
      kind: 'memory',
      ageD: 26,
      raw: `${fm({ name: 'agents-model', description: 'Agent modeli tanımdan gelir, override yok' }, { type: 'project' })}\`.claude/agents/*.md\` içinde \`model:\` tanımlıysa onu kullan.`,
    },
  );
  return out;
}

/** Split `---` frontmatter off a file: flattened keys (`metadata.type`) and the body. */
export function splitFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!m) return { frontmatter: {}, body: raw };
  const frontmatter: Record<string, string> = {};
  let parent = '';
  for (const line of m[1].split('\n')) {
    const kv = /^(\s*)([\w.-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, indent, key, value] = kv;
    if (!indent) parent = value ? '' : key;
    const k = indent && parent ? `${parent}.${key}` : key;
    if (value) frontmatter[k] = value;
  }
  return { frontmatter, body: raw.slice(m[0].length) };
}

/** Case fold for search: lower case with the dotted / dotless i folded (`I`, `İ`, `ı` → `i`). */
const fold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\u0307/g, '')
    .replace(/ı/g, 'i');

const linksOf = (body: string): string[] => [
  ...new Set([...body.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g)].map((x) => x[1].trim())),
];

const MOCK_SOURCES = (): KbSource[] => [
  ...THEME_IDS.map((t) => ({ id: `island:${t}`, label: THEMES[t].displayName, island: t })),
  { id: 'fleet', label: 'Fleet' },
  { id: 'mar-docs', label: 'mar-docs' },
  { id: 'hq-memory', label: 'HQ memory' },
];

export interface KbMock extends KbApi {
  /** The raw file text (frontmatter included) by path (tests, search). */
  raw(path: string): string | undefined;
}

export function createKbMock(seed: number, now: number): KbMock {
  const rng = createRng(seed).fork('kb-mock');
  const raws = rawFiles();
  const byPath = new Map<string, { file: KbFile; raw: string }>();
  for (const r of raws) {
    const { frontmatter, body } = splitFrontmatter(r.raw);
    const name = r.path.slice(r.path.lastIndexOf('/') + 1);
    const heading = /^#\s+(.+)$/m.exec(body)?.[1].trim();
    // jitter within the day, so the order of same-age files is stable but not artificial
    const mtime = now - Math.round((r.ageD + rng.range(0, 0.6)) * 86_400_000);
    const type = frontmatter.type ?? frontmatter['metadata.type'];
    const file: KbFile = {
      path: r.path,
      source: r.source,
      ...(r.island ? { island: r.island } : {}),
      kind: r.kind,
      title: frontmatter.name ?? heading ?? name.replace(/\.[^.]+$/, ''),
      ...(frontmatter.description ? { description: frontmatter.description } : {}),
      ...(type ? { type } : {}),
      mtime,
      size: new TextEncoder().encode(r.raw).length,
    };
    byPath.set(r.path, { file, raw: r.raw });
  }
  const projects = new Map<string, FleetProject>(mockProjects(now).map((p) => [p.id, p]));
  return {
    raw: (path) => byPath.get(path)?.raw,
    tree: (): Promise<KbTreeResponse> =>
      Promise.resolve({ sources: MOCK_SOURCES(), files: [...byPath.values()].map((e) => e.file) }),
    doc(path): Promise<KbDoc | null> {
      const e = byPath.get(path);
      if (!e) return Promise.resolve(null);
      const { frontmatter, body } = splitFrontmatter(e.raw);
      return Promise.resolve({ file: e.file, text: body, frontmatter, links: linksOf(body) });
    },
    search(q): Promise<KbHit[]> {
      const needle = fold(q.trim());
      const hits: KbHit[] = [];
      if (needle)
        for (const { file, raw } of byPath.values()) {
          const lines = raw.split('\n');
          for (let i = 0; i < lines.length && hits.length < 200; i++)
            if (fold(lines[i]).includes(needle))
              hits.push({ path: file.path, line: i + 1, text: lines[i].trim().slice(0, 200) });
        }
      return Promise.resolve(hits);
    },
    addProject({ name, dir, note }) {
      const n = name.trim();
      const d = dir.trim();
      if (!n) return Promise.resolve({ error: ADMIN.mockErrors.name });
      if (!d.startsWith('/') && !d.startsWith('~/'))
        return Promise.resolve({ error: ADMIN.mockErrors.dir });
      const id = n
        .toLocaleLowerCase('tr')
        .replace(/[ıİ]/g, 'i')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (!id || projects.has(id)) return Promise.resolve({ error: ADMIN.mockErrors.taken });
      const project: FleetProject = {
        id,
        name: n,
        dir: d,
        ...(note?.trim() ? { note: note.trim() } : {}),
        createdAt: now,
      };
      projects.set(id, project);
      return Promise.resolve({ project });
    },
  };
}
