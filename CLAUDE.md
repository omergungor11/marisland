# Marisland

three.js ile **tamamen kodla üretilen**, tatlı/cozy stilize bir takımada: 5–7 ada tek haritada,
yakınlaştıkça açılan detay, yaşayan canlılar, gündüz/gece ve hava durumu. Faz 1 = yaşayan
diorama, Faz 2 = sandbox inşa (arazi fırçası, prop koy/kaldır).

- **GitHub**: https://github.com/omergungor11/marisland (public)
- **Demo**: https://omergungor11.github.io/marisland/ (GitHub Pages, `main`'e push'ta deploy)

## Kaynak belgeler — işe başlamadan oku

| Dosya | Ne |
|---|---|
| `mar-plans/PROMPT.md` | İnşa prompt'u: hedef, öncelikler, çalışma döngüsü |
| `mar-plans/ARCHITECTURE.md` | Sistemler — **nasıl** (modüller, pipeline, LOD, capture, bütçe, fazlar) |
| `mar-docs/ART_BIBLE.md` | Görünüm ve hareket — **ne** (palet, adalar, prop'lar, zoom kademeleri, animasyon, wow çekimleri) |
| `mar-docs/VISUAL_QA.md` | Görsel kabul kriterleri (TASK-007'de oluşturulur) |

Çelişki olursa: kullanıcı > PROMPT.md > ARCHITECTURE.md (sistem) / ART_BIBLE.md (görünüm) >
skill'ler. Belgeyi değiştiren bir karar alırsan `mar-docs/DECISIONS.md`'ye yaz ve belgeyi güncelle.

## Workspace

```
src/
  core/     saat, döngü, rng (label-fork), noise, scope/dispose, params, kalite
  world/    SAF veri üretimi — three import'u yok (Node/Worker'da çalışır)
  content/  ART_BIBLE tabloları → config (palet, prop tanımları, kurallar, kademeler, çekimler, bütçeler)
  geo/      prosedürel mesh fabrikaları
  render/   backend, materyaller, shader'lar, arazi, su, gökyüzü, bulut, prop batcher, gölge, post
  detail/   zoom-kademe FSM, fade/pop
  life/ anim/ env/ camera/ interact/ ui/ capture/ debug/
scripts/shots.ts   Playwright ekran görüntüsü harness'ı
mar-docs/shots/    milestone contact sheet'leri (M1.jpg …)
```

## Komutlar

```bash
pnpm dev                         # http://localhost:5173
pnpm build && pnpm preview       # VITE_BASE=/marisland/ ile Pages alt yolu
pnpm typecheck && pnpm lint && pnpm test
pnpm shots [ci|dev|wow] [--assert] [--gpu]   # ekran görüntüsü seti + manifest + contact.jpg
```

Bir iş bitmiş sayılmadan önce typecheck + lint + test geçmeli; **görsel bir iş ayrıca
`pnpm shots` çıktısına bakılarak** değerlendirilmeli (`visual-qa` skill'i).

## Altın kurallar

1. **Ekrana bakmadan "güzel" deme.** Görsel değişiklik → shots → contact sheet'i Read ile aç →
   ART_BIBLE §11 kriterleriyle değerlendir.
2. **Determinizm.** `world/`, `life/` ve sim kodunda `Math.random` / `Date.now` yok; RNG label ile
   fork'lanır. Aynı URL → aynı piksel.
3. **İçerik veridir.** Renk, boyut, yoğunluk, animasyon parametresi `src/content/`'te durur; motor
   kodu bunları gömmez.
4. **Dış asset yok.** Geometri ve texture kodla üretilir. Tek istisna self-host fontlar
   (`@fontsource`).
5. **Her GPU kaynağının sahibi var.** app veya world scope'una kayıt, yeni seed'de `dispose`.
6. **Bütçe sayılarla.** `src/content/budgets.ts`; `shots --assert` aşımda başarısız olur.
7. `main` her zaman çalışır ve deploy edilebilir durumda kalır.

## Agent'lar ve skill'ler

| Agent | Model | Alan |
|---|---|---|
| `engine` | opus | renderer, döngü, kamera, kalite, capture, zoom FSM, HUD |
| `worldgen` | opus | takımada/heightfield/zon/yerleşim/scatter — saf veri |
| `shader` | opus | su, arazi, ışık, gölge, gökyüzü, hava, post |
| `props` | sonnet | prosedürel model fabrikaları |
| `life` | sonnet | canlılar, animasyon, tepkiler, intro |
| `qa` | sonnet | shots + wow checklist puanlama (kod yazmaz) |
| `devops` | sonnet | tooling, CI, Pages deploy |
| `docs` | haiku | md belgeler, task-index |

Skill'ler (`.claude/skills/`): `threejs-stylized`, `island-worldgen`, `cute-motion`, `visual-qa`.
Bağımsız task'lar paralel agent'lara, bağımlılar sıralı gider. Paralel agent'lar aynı dosyaya
dokunmaz; ortak dosya (ör. `app.ts`, `package.json`) değişikliği orchestrator'da birleşir.

## Conventions

- Commit: `feat|fix|refactor|docs|chore|test|perf(scope): açıklama` — attribution satırı YOK
- Her task ayrı commit; her milestone sonunda push (Pages deploy'u tetikler)
- Kod standartları → `mar-config/conventions.md`, teknolojiler → `mar-config/tech-stack.md`

## Proje durumu ve hafıza

- `mar-tasks/task-index.md` — faz/milestone/task listesi; task bitince durumunu güncelle
- `mar-tasks/phases/` — task detayları ve acceptance criteria
- `mar-docs/MEMORY.md` — gotcha'lar ve öğrenilen pattern'ler; keşfedince güncelle, eskiyeni sil
- `mar-docs/DECISIONS.md` — mimari kararlar (tarih + gerekçe)

Session'a başlarken durumu `/cold-start` ile al; devrederken `mar-docs/MEMORY.md`'ye "nerede
kaldım" notu bırak.
