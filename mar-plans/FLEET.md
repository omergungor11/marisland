# Marisland Fleet — kendini geliştiren agent filosu için kontrol odası

> Faz 4 plan belgesi (D-141, 2026-11-07). ARCHITECTURE.md motoru anlatır; bu belge motorun
> üstüne gelen **çalışan agent katmanını** anlatır. Çelişkide kullanıcı > bu belge > ARCHITECTURE.

## Amaç

Marisland bir diorama değil, **gerçek Claude Code session'larının yaşadığı bir filo**: yedi ada
yedi departman, adadaki botlar o departmanın çalışan session'ları. Kullanıcı adaya yaklaşır, sol
panelde kimin ne iş yaptığını ve ne zamandır yaptığını görür, satıra tıklayıp terminali izler,
bota tıklayıp prompt yazar. Adalar birbirine iş devreder (marketing → design → coding), her devir
onay kapısından geçer. Uzun vadede filo kendi knowledge base'ini, agent'larını ve skill'lerini
üretir; HQ bunu denetler; her adanın günlük / haftalık / aylık raporu panelde durur.

## Kavramlar

| Kavram | Dünyadaki karşılığı | Veri |
|---|---|---|
| **Departman** | Ada (`ThemeId`: hq, coding, marketing, qa, design, devops, research) | `fleet/islands/<theme>/` dizini, kendi `CLAUDE.md`'si (persona + bilgi) |
| **Session** | Adadaki bir bot, çalışırken masaya oturur / iş noktasına gider | `FleetSession` (protocol.ts), ham akış `fleet/runs/<id>.jsonl` |
| **İstek (request)** | Kullanıcının bir prompt'la başlattığı iş; alt session'lar aynı isteğe bağlanır | `FleetRequest`, `parentId` zinciri |
| **Kapı (gate)** | Bir adanın başka adaya iş devretmek istemesi; panelde "İzin ver / Reddet" | `FleetGate` (M42) |
| **Başlık** | Panelde okunur tek satır | ilk prompt'tan haiku ile üretilir, sonra sabit |

## Mimari

```
tarayıcı (Vite app)                      bridge (Node, pnpm bridge, :5174)              claude CLI
┌──────────────────────┐   ws://…/ws     ┌─────────────────────────────┐   spawn -p    ┌────────────┐
│ src/fleet/client.ts  │◀──────────────▶│ server/bridge.ts            │──────────────▶│ stream-json│
│  store: sessions,    │  FleetEvent /   │  spawn, parse, persist,     │◀──────────────│  stdout    │
│  lines, requests     │  FleetCommand   │  title, broadcast           │               └────────────┘
│ src/ui/fleet-panel.ts│                 │  GET /api/sessions …        │   cwd = fleet/islands/<theme>/
│ src/life/fleet-bots  │                 │  fleet/runs/*.jsonl         │
└──────────────────────┘                 └─────────────────────────────┘
```

- **Bridge yoksa** (GitHub Pages, bridge kapalı) panel gizlidir; `?fleet=mock` deterministik sahte
  filo verir (shots ve UI işi için).
- **Protokol** tek dosyada: `src/fleet/protocol.ts` (saf tipler, three yok, Node ve tarayıcı paylaşır).
  Bridge ve client bu tiplere karşı derlenir; `tsconfig.node.json` `server/`'ı kapsar.
- **Runtime**: `claude -p --output-format stream-json --include-partial-messages --verbose`,
  aboneliğinden gider, API key yok. Mevcut agent'lar ve skill'ler aynen çalışır.
- **cwd** ada dizinidir (`fleet/islands/<theme>/`): repo kökündeki `CLAUDE.md` miras alınır, adanın
  `CLAUDE.md`'si departman kişiliğini ekler. Marisland'ın kendisi de, kullanıcının diğer işleri de bu
  dizinlerden görülebilir (`fleet/fleet.config.json` → `islands.<theme>.addDirs`).
- **İzinler**: panelden başlayan session `permission-mode acceptEdits`, `--permission-prompts none`,
  araç listesi config'ten (`allowedTools`). Varsayılan: Read/Edit/Write/Glob/Grep, `Bash(pnpm *)`,
  `Bash(git status*)`, `Bash(git diff*)`, `Bash(git log*)`. Push, force, rm -rf yok.
- **Bütçe**: `--max-turns` (varsayılan 30) ve istek başına alt session tavanı (varsayılan 6) config'te.
  Kapılar (M42) her ada geçişinde sorar; "tam serbest" modu yok (kullanıcı kararı 2026-11-07).

## Session yaşam döngüsü

```
start(island, prompt) ─▶ queued ─▶ running ─▶ done | error | stopped
                                     │
                                     └─▶ waiting (kapı bekliyor, bkz. İstek zinciri)
```

1. `FleetCommand start` gelir → bridge `FleetSession` yaratır (`status queued`, başlık = prompt'un
   ilk 60 karakteri), yayınlar.
2. `claude -p` spawn; `system/init` olayından `session_id` alınır (`FleetSession.id` = bu id,
   `--session-id` ile önceden verilir ki dosya adı baştan belli olsun).
3. Her stdout satırı → `fleet/runs/<id>.jsonl`'a ham yazılır, `FleetLine`'a indirgenerek (`kind`,
   `text`, `seq`) yayınlanır. `assistant` metni, `tool_use` adı + kısa girdi, `tool_result` ilk satır,
   `result` özet (turns, cost, duration).
4. İlk `assistant` metninden sonra başlık işi: `claude -p --model haiku --max-turns 1
   --no-session-persistence` "bu işi 4-7 kelimeyle Türkçe başlıkla" → `title` güncellenir.
5. `result` → `done`/`error`, `endedAt`, `costUsd`, `turns`. Süreç ölürse `error`, `stop` → `stopped`.
6. `send(sessionId, prompt)` → `claude -p --resume <id>` aynı kayda ekler (D-145): ada flag'leri yeniden verilir,
   `user` satırı tur sınırını işaretler, `turns` / `costUsd` koşular arası toplanır. `tail` cevabı en çok 2000 satır;
   client `last.seq + 1`'den yeniden ister.
7. Raporun sonundaki `## → <ada>: <istek>` başlıkları → her biri için `FleetGate` (`pending`), ana session
   `waiting`. İzin → child session (aynı `requestId`, `parentId`); child bitince ana session `resume` edilir.
   Ayrıntı: İstek zinciri.

Bridge yeniden başlarsa `fleet/runs/index.json`'dan session listesini geri yükler; `running` olanlar
`error` (`bridge restarted`) olur.

## İstek zinciri (M42)

Kullanıcı bir adaya prompt yazar; ada işin bir kısmını başka adaya devretmek isterse raporunun sonuna
`## → <ada>: <istek>` yazar. Her devir **kapıdan** geçer: kullanıcı izin vermeden hedef adada hiçbir şey
koşmaz. Devir sırasında hedef ada bir child session olarak çalışır, bittiğinde ana session "…adasından
rapor:" mesajıyla devam eder. Yazım biçimi ve ada tarafındaki kurallar `fleet/CLAUDE.md` →
"Başka adadan iş istemek".

```
kullanıcı: "5 sosyal medya gönderisi hazırla"
   │
   ▼
Marketing session (istek R1, depth 0) ── final: ## Özet … ## → design: görsel spec
   │
   ▼
[kapı: Marketing → Design] ── reddet ──▶ Marketing'e "devir reddedildi", kendi bitirir
   │ izin
   ▼
Design child (R1, parentId = Marketing, depth 1) ── final: ## Özet
   │
   ▼
Design biter → Marketing resume: "Design adasından rapor: …"
   │  Marketing devam eder ── final: ## Özet … ## → coding: …
   ▼
[kapı: Marketing → Coding] ── izin ──▶ Coding child (depth 2) ── biter ──▶ Marketing resume
   │
   ▼
Marketing final: ## Özet (kullanıcıya teslim)
```

**Tavanlar**
- `maxChildren`: istek başına en çok alt session (`island.json`, varsayılan 6).
- Derinlik en çok 3 (ana session 0).
- Bekleyen kapı: ana session başına bir (D-149; plan TASK-574).
- Her child kendi `maxTurns` ve `allowedTools` sınırında koşar; ada sınırları (`owner`, `addDirs`) aynen geçerli.
- "Tam serbest" yok: kapı her geçişte sorar.

**Ertelenen fikirler** (D-149, "Open")
- **MCP devir aracı** (seçenek B): bridge'de bir MCP server, agent koşu sırasında çağırır, ana session
  cevap gelene kadar bloke olur. Bekleyen session'ı açık tutar ve MCP server gerektirir; şimdilik rapor
  satırı (A) kullanılır.
- **Allowlist kapıyı atlar**: `fleet.config.json`'da "marketing → design" gibi kalıcı izin. Kapı
  güvenliğini zayıflatır; kullanıcının isteyip istemediği açık değil.

## Dizin yapısı — ada = kendi başına bir Claude Code projesi

Claude Code `CLAUDE.md`'yi cwd'den yukarı doğru hepsini yükler, `.claude/agents` ve `.claude/skills`'i
cwd'den repo köküne kadar tarar, ama **`.claude/settings.json`'ı yalnız cwd'den okur** ve auto-memory'yi
git köküne göre anahtarlar (`autoMemoryDirectory` ile yön verilir). Bu yüzden her ada dizini kendi
başına bir proje gibi davranır; plugin'e gerek yok. Kontrol kolu HQ'nun yazdığı iki dosyadır:
`island.json` (manifest) ve `.claude/settings.json` (izinler, deny kuralları).

```
fleet/
  CLAUDE.md                    filo anayasası: her ada session'ına otomatik yüklenir (ancestor walk)
  schema/island.schema.json    manifest şeması; fleet-lint doğrular
  fleet.config.json            filo geneli: port, başlık modeli, varsayılan tavanlar
  islands/<theme>/             theme = ThemeId = dizin adı
    island.json                HQ yazar: name, role, model, maxTurns, maxChildren, allowedTools, addDirs, owner, agents
    CLAUDE.md                  departman kişiliği (ada geliştirir, HQ onaylar)
    .claude/settings.json      HQ yazar: deny (kendi manifest/settings, diğer adalar, fleet/CLAUDE.md, schema, git push/commit)
    .claude/agents/<theme>-*.md  adaya özel alt agent'lar (öneki zorunlu; cwd'ye yakın olan kazanır)
    .claude/skills/*/SKILL.md  adaya özel skill'ler
    memory/MEMORY.md + *.md    auto-memory hedefi (bridge `--settings '{"autoMemoryDirectory": <abs>}'` verir)
    knowledge/                 departman knowledge base (M43)
    reports/YYYY-MM-DD.md      günlük rapor; haftalık / aylık HQ derler (M44)
  kb/                          filo geneli knowledge base (M43)
  runs/                        *.jsonl + index.json (gitignore)
server/bridge.ts               Node bridge (ws + http, tsx)
scripts/fleet-lint.ts          `pnpm fleet:lint`: yapı + şema + frontmatter + deny bloğu; vitest'ten de çağrılır
src/fleet/protocol.ts          paylaşılan tipler (saf)
src/fleet/client.ts, mock.ts   WS client + store + deterministik mock
src/ui/fleet-panel.ts          ada paneli (M40), fleet görünümü + arama (M41)
src/life/fleet-bots.ts         session ↔ bot bağı (M40b)
src/content/fleet.ts           renkler, süreler, panel ölçüleri
```

**Spawn**: `cwd = fleet/islands/<theme>/`; `--allowedTools` ve `--max-turns` manifest'ten; `--add-dir
<root>/<addDir>` her `addDirs` için; `--settings` inline JSON ile `autoMemoryDirectory` = adanın
`memory/` mutlak yolu. Repo kökündeki `.claude/settings.json` (hook'lar, plugin'ler) bu cwd'de **okunmaz**;
bu istenen bir şey (claude-mem / tokeneconomizer filo session'larına karışmaz). Transcript
`~/.claude/projects/<cwd-slug>/<id>.jsonl`'e düşer; `--resume <id>` aynı cwd'den çalışır ve `--settings`,
`--add-dir` yeniden verilmelidir.

**Kontrol (HQ)**: (1) `fleet-lint` her adada zorunlu dosyaları, `island.json` şemasını, `CLAUDE.md` ≤ 120
satır, hafıza frontmatter'ını ve settings deny bloğunun eksiksizliğini denetler; `pnpm test` içinde koşar.
(2) Bridge her session sonunda `git status --porcelain` alır: ada dizini + `addDirs` dışına yazılmış
dosya varsa session `error` olur (`reason: 'out-of-bounds write: <path>'`) ve panelde kırmızı görünür.
(3) Yalnız HQ adasının `addDirs`'inde `fleet` vardır: manifest ve settings değişiklikleri HQ session'ından
(ya da kullanıcıdan) gelir; adalar "HQ'ya öneri" satırıyla ister. (4) `owner: user` olan adaya HQ da dokunmaz.

## Milestone merdiveni

| M | Ne | Somut çıktı |
|---|---|---|
| **M40** Fleet Bridge + Island Panel | bridge, protokol, client, ada paneli, bot bağı, WASD/QE | Panelden başlatılan gerçek bir session adada canlı görünür; `shots dev` panelli kare |
| **M41** Detay + Fleet view | satır → terminal akışı, bota tıkla → prompt, ada odağı yokken tüm filo, arama, `--resume` | 20+ session'da arama; takip prompt'u aynı session'a gider |
| **M42** İstek zinciri + kapılar | ada → ada devir, `FleetGate`, istek ağacı panelde, bütçe tavanı | "5 sosyal medya gönderisi" senaryosu marketing → design → coding uçtan uca, her geçiş onaylı |
| **M43** Knowledge base + HQ | `fleet/kb`, ada `CLAUDE.md` dolumu, özelleşmiş agent/skill üretimi, HQ gözden geçirme kapısı | Bir ada yeni skill önerir, HQ onaylar, skill dizine iner |
| **M44** Raporlar | günlük / haftalık / aylık / tüm zamanlar; en önemli konular, uzun session'lar, dersler | Ada panelinde rapor sekmesi, HQ'da filo raporu |

## Kabul kriterleri (M40)

- `pnpm bridge` ayağa kalkar, `curl :5174/api/sessions` boş liste döner; `POST /api/start`
  `{island:'coding', prompt:'…'}` ile gerçek bir session koşar, `fleet/runs/<id>.jsonl` dolar, WS'te
  `session` ve `line` olayları akar, `result` ile `done` olur, başlık haiku ile değişir.
- Uygulama bridge yokken bugünkü gibi açılır (konsolda tek satır "fleet: bridge yok"), panel yok.
- `?fleet=mock` ile adaya yaklaşınca (`tier ≥ 1`, en yakın ada) sol panel o adanın session'larını
  listeler: agent, başlık, durum rengi, "12 dk" süresi canlı sayar; ada değişince içerik değişir.
- Bütçeler değişmez (panel DOM'dur), `shots ci --assert` yeşil, determinizm bozulmaz (sim zamanı
  panele girmez; "ne zamandır" duvar saatinden sayar, capture'da `simt` ile sabitlenir).
- WASD truck / forward, Q/E azimuth rotate; hız mesafeyle ölçeklenir; input/textarea odaklıyken
  çalışmaz; tour'u durdurur; `CAMERA_MOVE.keys` içerikte.
