# M50 — Ada gövdesi görünüm yükseltmesi (Ground Look)

> Plan, 2026-11-09. Kapsam: adanın **kendisi** — ağaçların ve binaların üstünde durduğu toprak kütlesi:
> üst yüzey, yamaç (bluff) duvarları, kıyı şeridi. Su shader'ı (TASK-353), post zinciri (TASK-586) ve
> prop'lar bu milestone'un dışında. Karar yazısı: D-162 (yön seçilince).
>
> Numaralandırma 2026-11-09: ilk taslak M45 / TASK-590…596 idi; paralel session'ın Phase 5 planı
> (`mar-plans/VISUAL_UPGRADE.md`, M45–M49, TASK-590…611, D-156…161) o numaraları önce aldı → M50,
> TASK-612…618, D-162+. Phase 5 TASK-595 (terrain strata / scree / moss) buraya katlandı (613 / 614);
> Phase 5 TASK-603 / 604 (kıyı kit geometrisi) peer'de kalır, 616 yalnız shader tarafı.

## 1. Sorun (kanıt)

Bakılan kareler: `shots/wow-mwow2/W1.png` (kartpostal), `W10.png` (Design T2), `W-sunken-noon.png`
(Research kıyı yakın plan), `shots/dev-new/F-panel.png` (Coding T1, 2026-11-09).

| # | Ne okunuyor | Nerede |
|---|---|---|
| G1 | Her ada aynı tan duvarlı **pankek**: duvar tek ton, tabaka yok, dudak gölgesi T0'da kayboluyor | W1, F-panel |
| G2 | Üst yüzey **düz yeşil**: yükseklik, nem, aşınma farkı yok; tema farkı sadece prop'lardan geliyor | W1, W10 |
| G3 | Kıyı **ince kum çizgisi**: duvar suya sert köşeyle iniyor, ıslak kaya bandı ve etek döküntüsü yok | W1, W-sunken |
| G4 | Yakın planda duvar **tek dokunun tekrarı** (çatlak katmanı), strata oluğu seçilmiyor | W-sunken |
| G5 | Plato kenarı **testere dişi çim parçaları**: dudak/çim sınırı 2 u grid'i ele veriyor | W-sunken |
| G6 | Silüet **kesilmiş disk**: kıyı boyunca duvar yüksekliği sabit, burun / koy farkı yok | W1 |

Mevcut altyapı bunların çoğunu zaten biliyor (`content/ground.ts` → `GROUND_WALL` strata, lip, foot, wet
line; `content/terrain.ts` → `TERRAIN_AO`, `TERRAIN_FACETS`; detail layer dizisi 30–110 u arası). Sorun
**uzak mesafede sönmesi** (T0/T1'de her şey 2 u albedo'ya düşüyor) ve kontrastın düşük tutulması.

## 2. Üç yön (kullanıcı seçer; `scratchpad/ground-compare.html`)

| Yön | Özü | Ağırlık | Risk |
|---|---|---|---|
| **A · Katmanlı kaya** | 3–4 kalın tabaka (tema tonları), sarkan çim dudağı + gölge, etekte talus, kenarda kaya çıkıntısı | shader + worldgen | bantlar 2 u grid'e sığmalı; talus tris |
| **B · Yumuşak toprak** | yuvarlak plato kenarı, toprak gradyanı (etek koyu/ıslak → üst sıcak), çim dilleri, geniş kum geçişi | worldgen + shader | kenar yuvarlanınca plato alanı küçülür, yerleşim tekrar koşar |
| **C · Boyalı minyatür** | şekiller kalır; fırça bantları, güçlü AO (etek, dudak altı), çim yükseklik gradyanı + nem lekesi, rim ışığı | shader | AO kumu/plazayı karartır; rim terimi terrain programına eklenir |

Öneri: **A + C'nin ışığı** (tabakalar şekli, AO/gradyan boyayı verir). B en pahalı (worldgen yeniden
yerleşim) ve "faceted toy" ilkesinden uzaklaşır.

## 3. Task'lar

Sıra ve paralellik: 612 önce (referans). Sonra **613 ∥ 614 ∥ 615** (farklı dosyalar). 616 → 613'ten,
617 → 614'ten sonra. 618 kapanış. Yön seçimi 613/615/617'nin iç ayrıntısını değiştirir, iskeleti değil.

| Task | Ne | Agent | Boy | Dosyalar | Kabul |
|---|---|---|---|---|---|
| TASK-612 | **Referans seti**: 4 ada (Hearthholm, Coding, Research, Emberpeak) × T0/T1/T2 × öğle/altın = 24 kare, `G-*` preset'leri `dev` setine; G1–G6 için ART_BIBLE §11'e taslak kriterler (W-G1…G6); "önce" kontak sayfası `mar-docs/shots/M45-before.jpg` | qa (+ engine preset) | S | `content/shots.ts`, `mar-docs/` | 24 kare deterministik, kriter listesi yazılı |
| TASK-613 | **Duvar paleti ve tabakalar** (G1, G4): tema başına 3–4 band tonu (`GROUND_WALL.strata` tema tablosu), band yüksekliği ada duvar yüksekliğiyle ölçeklenir (T0'da ≥ 2 band okunur), strata oluğu 15 px eşiği → mesafeye göre kalınlaşan çizgi, dudak gölgesi ve etek koyulaşması albedo'ya da yazılır (uzakta kaybolmaz), çatlak katmanı tekrarını kıran ikinci ölçek | shader | M | `content/ground.ts`, `render/terrain/terrain-material.ts`, `terrain-colors.ts` | G-*/W1'de duvar tabakalı okunur; program sayısı aynı; W1–W4 silüet aynı |
| TASK-614 | **Üst yüzey makro varyasyon** (G2): çim yükseklik gradyanı (etek koyu → tepe açık, `grassBands` genişler), nem/yıpranma lekeleri (makro noise 20–40 u, tema başına ton), yol kenarı aşınması, çim → kum geçişi 2 u'dan 4–6 u'ya çakıl benekli, orman tabanı ve çayır tonları tema başına ayrışır | shader | M | `content/terrain.ts`, `content/ground.ts` (`GROUND_MACRO`), `terrain-colors.ts` | T0'da ada üstü tek düze değil; mask metrikleri (VISUAL_QA) bozulmaz |
| TASK-615 | **Silüet ve kenar** (G5, G6): kıyı boyunca duvar yüksekliği burun/koy ile değişir (±25 %), plato kenarında kaya çıkıntıları (`Zone.rock` düğümleri, 3–6/ada), uzun adalarda teras basamağı, dudak çizgisinin 2 u grid'den kurtulması (SDF ile yumuşatılmış çim sınırı), etekte talus/kaya döküntüsü scatter (instanced, ≤ 2k tris/ada) | worldgen (+ props talus) | M | `world/islands*`, `content/islands.ts`, `world/scatter*`, `content/props*` | yerleşim testleri yeşil; tris ≤ +3 %/ada; seed determinizmi |
| TASK-616 | **Kıyı şeridi** (G3): su çizgisi üstünde ıslak kaya bandı (koyu + serin, 0.6–1.2 u), kum dalgacıkları / ıslak parlama, şelf devamı (su altı etek koyulaşır, caustics ile buluşur), köpük temas çizgisi ile hizalanma, koy plajlarında geniş gradyan | shader | S | `content/ground.ts` (`wetLine`), `terrain-material.ts`, `content/terrain.ts` (seabed rampası) | W-sunken benzeri karede duvar–su birleşimi okunur |
| TASK-617 | **Işık ve AO** (C'nin özü): `TERRAIN_AO.max` ve dudak altı / etek terimi güçlenir, `sandScale` ayrı, güneşe bakan terrain silüetinde ince rim (terrain programında ek terim, yeni program yok), gölge tonu duvarda mavi-mor kalır | shader | S | `content/terrain.ts`, `terrain-material.ts`, `content/lighting.ts` | ART_BIBLE P4 mask metriği; W2/W3 altın saat kareleri |
| TASK-618 | **Kapanış QA + belge**: 590 setinin "sonra" kontak sayfası, G kriterleri puanı, ART_BIBLE §1/§2/§11 ve ARCHITECTURE §3 güncellemesi, D-162, task-index | qa + docs | S | `mar-docs/*` | kriterlerin ≥ 5/6'sı geçer |

## 4. Sınırlar (her task için)

- Yeni shader programı yok; terrain `mar-terrain-v3` içinde kalınır. `pnpm shots ci --assert` ve
  `pnpm shots wow --assert --only=W1,W2,W3,W4,W10,W15` aynı program / call sayısıyla geçer; tris ≤ +3 %/ada.
- Determinizm: `world/` ve `content/`'te `Math.random` / `Date.now` yok; aynı seed aynı piksel.
- Renk, boyut, eşik → `src/content/` (ground.ts, terrain.ts, islands.ts). Motor kodu sayı gömmez.
- Görsel iş = `pnpm shots` PNG'sine bakılarak değerlendirilir; agent "önce / sonra" karesini raporuna yazar.
- Düşük kalite (detail kapalı) için: albedo'ya yazılan her şey orada da görünür; shader-only terimler
  `MAR_DETAIL` arkasında kalır.

## 5. Riskler

- T0 albedo 2 u/texel: ince bantlar aliasing yapar → band yüksekliği ≥ 3 texel, makro varyasyon ≥ 10 u.
- SwiftShader (CI) maliyeti: terrain fragment'a eklenen her terim ci setinde süreyi uzatır; ölçülür.
- Yerleşim (593): duvar yüksekliği değişince dock / cove kuralları yeniden koşar; placement testleri kilit.
