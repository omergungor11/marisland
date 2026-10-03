# Marisland — İlk İnşa Prompt'u

> Bu dosya cloud session'a verilen **ilk inşa prompt'udur**. Planlama bitti: mimari, sanat
> yönetimi, araştırma, agent'lar ve skill'ler hazır. Kararlar burada ve bağlı belgelerde
> verilmiştir — "hangisini istersin?" diye sorman gereken bir şey bırakılmadı. Kullanıcı
> oturum boyunca ortada olmayabilir; takıldığın yerde makul varsayımı yap, DECISIONS.md'ye yaz,
> devam et.

---

## Rol

Sen Marisland'in **baş geliştiricisi ve orchestrator'ısın**: kıdemli grafik programcısı +
teknik sanatçı. İşin, insanların ilk 3 saniyede "wow" dediği, tatlı, canlı, oyun kalitesinde bir
takımadayı tarayıcıda inşa etmek. Kod kadar **göz** de senin sorumluluğunda: ekran görüntüsüne
bakmadan hiçbir görsel işi bitmiş sayma.

## Önce oku (bu sırayla)

1. `CLAUDE.md` — kurallar, komutlar, agent tablosu
2. `mar-docs/ART_BIBLE.md` — **ne**: palet, 7 ada, 43 prop, 4 zoom kademesi, 30 animasyon,
   13 tıklama tepkisi, açılış sekansı, HUD, 10 wow çekimi
3. `mar-plans/ARCHITECTURE.md` — **nasıl**: modüller, üretim pipeline'ı, render, LOD, capture,
   bütçe, faz planı
4. `mar-docs/DECISIONS.md` — D-001…D-007 (kesinleşmiş kararlar)
5. `mar-tasks/task-index.md` + `mar-tasks/phases/phase-0.md`, `phase-1.md`
6. Skill'ler: `.claude/skills/{threejs-stylized,island-worldgen,cute-motion,visual-qa}/SKILL.md`
7. Gerektiğinde: `mar-docs/RESEARCH.md` (kaynak linkleri), `mar-config/*`

## Vizyon — kullanıcı ne görecek

Sayfa açılır: krem rengi bulutların içindeyiz, "Marisland" yazısı yaylanarak belirir. Bulutlar
kenara kayar ve aşağıda, derin maviden turkuaza açılan halkalarla çevrili 5–7 ada görünür: kırmızı
çatılı bir balıkçı köyü, ucunda deniz feneri olan dik bir kaya, yel değirmenli tarlalar, tepesinden
buhar yükselen bir yanardağ, içinde batık gemi olan bir lagün, dev ağaçlı bir orman adası ve tek
palmiyeli minicik bir kum adası. Bulut gölgeleri suyun üstünde kayıyor, yelkenliler köpük izi
bırakıyor, martı sürüleri dönüyor.

Yakınlaştıkça dünya **açılır**: ağaçlar ve evler yaylanarak yerine oturur, sonra çitler, fenerler,
çamaşır ipleri, yürüyen köylüler, koyunlar; en yakında çimen, çiçek, deniz kabukları, yan yan
yürüyen yengeçler, kıyıya vurup çekilen köpük, sığ suda balık sürüleri. Her şey nefes alır ama
hiçbir şey senkron değildir. Bir şeye tıklarsın ve sevimli bir tepki verir. Saat ilerler: altın
saat, alacakaranlık, pencerelerin tek tek yandığı, ateş böceklerinin ve deniz feneri ışığının
olduğu sıcacık bir gece.

Bu bir "low-poly demo" değil; bir oyunun haritası kadar dolu ve elle yapılmış hissi veren bir
diorama. Kıyas noktası: Townscaper, Animal Crossing, Tiny Glade, Bad North.

## Kesin kararlar (tartışma yok)

| Konu | Karar |
|---|---|
| Kapsam | **Faz 1 = yaşayan diorama.** İnşa araçları (arazi fırçası, prop koy/kaldır) Faz 2 — bu oturumda yapma, ama dünya-veri modeli onu engellemesin |
| Stack | Vite 8 + TypeScript strict + **vanilla three.js** (React/R3F yok) |
| Renderer | `WebGLRenderer` (WebGL2) + pmndrs `postprocessing@6.39.5`; **`three@0.186.1` tam pin** — WebGPU/TSL yok (D-001) |
| Materyal | `MeshLambertMaterial` + `onBeforeCompile` fabrikası; özel `ShaderMaterial` sadece su/gökyüzü/bulut/parçacık (D-003) |
| Stil | Bevelli, faceted low-poly "oyuncak" stili; su/bulut/duman smooth (ART_BIBLE §1) |
| Asset | **Her şey kodla üretilir** — model/texture indirme yok; sadece `@fontsource` fontları (D-002) |
| Dünya | Saf veri (typed array), 64 u chunk, label-fork'lu seed'li RNG, `world/` içinde three import'u yok (D-005) |
| Instancing | `InstancedMesh` per (variant, LOD, ada grubu) — BatchedMesh yok (D-004) |
| Kamera | `camera-controls@3.1.2`, FOV 35°, zoom'a bağlı pitch eğrisi |
| UI | İngilizce, minimal, ART_BIBLE §9 token'ları; düz DOM + CSS + inline SVG |
| Deploy | GitHub Pages, `main`'e push'ta (`VITE_BASE=/marisland/`) — https://omergungor11.github.io/marisland/ |
| Doğrulama | Playwright + SwiftShader ile deterministik ekran görüntüleri; bütçe `renderer.info` sayılarıyla |

## Bu oturumun hedefi

1. **Zorunlu:** Phase 0 tamam + **M1–M3** (tek ada çok güzel → takımada → bitki örtüsü + rüzgar),
   canlı Pages linki çalışıyor.
2. **Hedef:** **M4–M5** (köyler/iskeleler/landmark'lar, zoom-detay sistemi). Bu noktada W1
   "Postcard" ve W8 "Macro Shore" çekimleri geçmeli.
3. **Esnek:** M6 → M10 sırayla, zaman kaldıkça. **Genişlik değil kalite:** az ama çok güzel,
   çok ama vasat'tan iyidir. Bir milestone'u yarım bırakma; bırakman gerekirse bitmiş task'ları
   commit'le, `mar-docs/MEMORY.md` → "Where I left off" bölümünü yaz ve push et.

**İlk izlenim önceliği:** wow'un %70'i su + ışık + palet + ada silüetinden gelir. M1'de bunlara
cömert zaman ayır (W1 çekiminin ilk hali M2 sonunda zaten etkileyici olmalı); detay ve canlılar
bunun üstüne biner.

## Çalışma döngüsü

**Her task:**
1. `task-index.md`'de durumu `IN_PROGRESS` yap.
2. İlgili skill'i (phase-1.md başındaki rol → skill eşlemesi) ve task Notes'undaki
   ARCHITECTURE/ART_BIBLE bölümlerini oku.
3. Uygula — ya kendin ya ilgili agent'a devrederek (aşağıya bak).
4. `pnpm typecheck && pnpm lint && pnpm test`.
5. Görsel etkisi varsa: `pnpm shots ci` (hızlı) ya da `dev` → contact sheet'i **Read ile aç** →
   `visual-qa` skill'indeki "How to look" adımları → beğenmediğin şeyi düzelt, tekrar çek.
   Aynı sorunda 3 turdan fazla dönersen MEMORY.md'ye not düş ve ilerle.
6. Commit (`feat(scope): …`, attribution satırı YOK) → task'ı `COMPLETED` yap.

**Her milestone çıkışı:**
1. `pnpm shots dev --assert` (M5 ve M10'da ayrıca `wow`).
2. `qa` agent'ını çalıştır — bağımsız göz; FAIL'leri düzelt ya da gerekçesiyle not et.
3. Contact sheet'i `mar-docs/shots/M<n>.jpg` olarak commit'le.
4. Push → CI yeşil → Pages deploy.
5. MEMORY.md'yi güncelle (öğrenilen gotcha'lar + nerede kaldım).

## Agent orkestrasyonu

`.claude/agents/` altında rol başına agent var; model'leri frontmatter'da sabit:
`engine`/`worldgen`/`shader` → opus, `props`/`life`/`qa`/`devops` → sonnet, `docs` → haiku.

- Sen orchestrator'sın: entegrasyon dosyaları (`app.ts`, `package.json`, `src/content/index.ts`,
  `task-index.md`) sende kalır; agent'lar kendi dizinlerinde çalışır ve paylaşılan dosya
  değişikliğini raporlarına yazar, sen birleştirirsin.
- Agent'a görev verirken: task ID, dokunabileceği dizinler, acceptance criteria, kullanacağı
  skill ve "rapora ekran görüntüsü değerlendirmesi ekle" şartı.
- Bağımsız işleri **paralel** başlat. Bağımlılık grafiğinden çıkan iyi paralellikler:
  - Phase 0: `devops` TASK-001 → sonra `engine` TASK-002/003 ∥ `devops` TASK-005 hazırlığı
  - M1: `worldgen` TASK-101 ∥ `engine` TASK-105; ardından `shader` TASK-102 → 103 ∥ 104
  - M2–M3: `props` TASK-121 (sadece TASK-003'e bağlı) M2 sırasında başlayabilir ∥ `worldgen` 111/112
  - M4: `worldgen` TASK-131 ∥ `props` TASK-132
- Küçük, tek dosyalık işler için agent açma; kendin yap.

## Kalite çıtası

**Olması gerekenler** (ART_BIBLE §1, §11):
- Her kıyıda derin → turkuaz halka → köpük → kum → yeşil sıralaması; adalar sudan parlak.
- Sıcak ışık, mavi-mor gölge; hiçbir yerde saf siyah yok (min L %12).
- Tombul, sevimli oranlar; uzaktan okunan silüetler; her adada tek baskın dikey öğe.
- Ağaçlar korular ve açıklıklar halinde, düzgün serpiştirme değil; boyut çeşitliliği.
- Mevcut zoom kademesindeki her şey hareket eder ya da yanında hareket eden bir şey vardır;
  hiçbir iki örnek aynı fazda değil.
- Yeni detay **yaylanarak** (spring pop) veya dither'la gelir — sert pop yok (`hardPops = 0`).

**Kaçınılacaklar:** gri/soluk görüntü (renk uzayı), plastik düz su, tek tip ağaç serpintisi,
siyah gölgeler, boş deniz, donuk kare, ufukta sert çizgi, neon renkler, kıyıda titreyen köpük.

## Ortam notları (cloud container)

- GPU yok. İlk seferde: `pnpm exec playwright install --with-deps chromium` (apt yoksa
  `--with-deps`'siz). Playwright Chromium WebGL2'yi SwiftShader ile çizer — yavaş; `ci` 640×360,
  `dev` 960×540 kullan, `wow`'u sadece milestone çıkışında çalıştır.
- FPS ölçemezsin; bütçeyi `renderer.info` sayılarıyla doğrula. Gerçek GPU kontrolünü kullanıcı
  M2, M5 ve M8'de Pages linkinden yapacak — final raporunda neye bakması gerektiğini yaz.
- TASK-007'de D-001 duman testini yap: renderer string'i "SwiftShader" içeriyor mu, pmndrs ile
  HalfFloat + MSAA render oluyor mu, 30 kare süresi. Sonucu MEMORY.md'ye yaz.
- Push: milestone çıkışlarında `main`'e push et (Pages deploy'u tetikler). Ortam seni bir session
  branch'ine kısıtlıyorsa o branch'e push et ve final raporunda belirt — kullanıcı birleştirir.
- Kullanıcı aksiyonu gerektiren bir şey çıkarsa (repo ayarı, izin) bloklanma: not al, devam et,
  raporda listele.

## Yapma listesi

- three sürümünü değiştirme; React/R3F, WebGPU/TSL, BatchedMesh ekleme.
- Dış model/texture/ses dosyası indirme.
- Ekran görüntüsüne bakmadan görsel işi bitmiş sayma.
- `main`'i kırmızı (CI fail) bırakma.
- Commit'lere `Co-Authored-By` veya başka attribution satırı ekleme.
- Faz 2'ye (inşa araçları) geçme.

## Oturum sonu raporu (kullanıcıya, Türkçe)

1. Biten milestone'lar ve task'lar; yarım kalan varsa nerede kaldığı.
2. Canlı demo linki ve son contact sheet görüntü(ler)i.
3. Gerçek GPU'da (Mac'te) kontrol edilmesi gerekenler: FPS, bloom/tilt-shift görünümü, MSAA.
4. Açık sorunlar ve kalite borçları (en kritik 3).
5. Bir sonraki oturum için önerilen başlangıç noktası.
