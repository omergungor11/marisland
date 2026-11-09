# Ağaç türleri — yeni modeller, mevcut modellerin detaylandırılması, çeşitlendirme

Durum: **spec (Design, 2026-11-09)**. Uygulama coding/props adasında. Bu belge ART_BIBLE §Vegetation tablosunu
genişletir; çelişkide ART_BIBLE §1 (shape language, faceted, top-heavy) kazanır. Karar numarası HQ'dan istenir
(aşağıda "HQ'ya öneri").

## 0. Bugünkü durum (kodda okundu)

| Tür | Dosya | Varyant | Renk | Bulgu |
|---|---|---|---|---|
| `roundTree` | `src/geo/trees.ts` | 3 (H 4.4/5.0/5.8) | `FOLIAGE.deciduous` 3 ton, Y-gradyan | 3–5 blob, düz gradyan; gövde düz frustum; tüm adalarda aynı yeşil |
| `pine` | `trees.ts` | 3 (H 6/7.4/8.6) | `FOLIAGE.pine` 2 ton | 3 koni; tek siluet, adalar arası fark yok |
| `palm` | `trees.ts` | 3 (H 5.4/6.1/6.8) | `FOLIAGE.palm` 2 ton | 7 frond, 2–3 hindistan cevizi; en iyi detaylı olan |
| `blossomTree` | `src/geo/themes/design.ts` | 3 | tek pembe | yalnız Design; `roundTree` kopyası |
| `treeBlob` | `trees.ts` | 3 | kind başına palet | T0 proxy; kind = deciduous / pine / palm / blossom |

Sorun tek cümle: **dört silüet, üç yeşil.** Aynı ağaç kümesi her adada tekrar ediyor; adayı ağaçtan tanımak mümkün değil.

## 1. Tasarım ilkeleri (yeni türler için bağlayıcı)

1. Shape language: kapsül / kubbe / damla. Canopy ≥ %55 yükseklik (cypress hariç, aşağıda gerekçe). Eğim ≤ 12° (palm, olive 25°).
2. Faceted: ağaç smooth shading kullanmaz. Detay **geometriyle ve vertex-color ile** gelir, texture yok.
3. Her tür **iki okuma mesafesinde** çalışır: T1'de siluet + 2 renk, T2'de detay (kabuk bandı, meyve, çiçek).
4. Her türün **tek, ayırt edici silueti** olur: kürenin, konisinin, şemsiyenin, sütunun, perdenin kendi harfi var.
5. Renk veridir: tüm hex'ler `src/content/palette.ts`'e gider, geometri koda gömmez (altın kural 3).

## 2. Mevcut modellerin detaylandırılması (U = upgrade)

### U1 roundTree — "bahçe ağacı" (3 → 5 varyant)
- **Gövde:** kök kaidesi (3 kama, `WOOD.logs`), gövde ortasında 1 kalınlaşma, tacın altında görünen çatal (2 kısa dal frustum'u). Şimdi düz bir kalem.
- **Taç:** gölge/ışık iki katman. Üst: `#8FD16A`, alt/iç: `#3E9A52` → altı hafif **mavi-yeşile** kayar `#3A9A6A` (güneş sıcak, gölge soğuk; shot'larda derinlik verir). 3–5 ana blob'a ek **2–3 küçük parlak blob** (0.14·R, `#B7E58A`) güneş tarafında.
- **V3 elma:** ana tacın kabuğunda 6–9 nokta `#FF7A5C` (0.09 u küre, 2 u'dan uzakta okunmaz, T2'de görünür).
- **V4 çift taç:** iki ayrı tepe (Y-şekilli gövde), geniş ve alçak (H 4.0, genişlik 6.2). Siluet "iki yumru".
- **Maliyet:** LOD0 ≤ +45 üçgen/ağaç, LOD1 değişmez; `TARGET` tavanı §7'ye göre birlikte yükselir.

### U2 pine — "dağ çamı" (3 → 4 varyant)
- Koni **etekleri sarkık**: `skirtCone` amp 0.14 → 0.22 ve alt katta 3 küçük sarkık dilim.
- Katman renk basamağı: alt katman `#2F7D5B`, üst `#3C8F68` **ve en üst uç `#5DB98A`** (yeni açık uç, taze sürgün).
- Gövde: kat arasında 0.25·h görünür gövde boşluğu (şimdi tıkız).
- **V3 yüksek çam:** 4 katman, dar (rad ×0.8), H 9.6. **V4 bodur çam:** 2 geniş katman, H 4.2 (kayalık/rim için).
- Kozalak: LOD0'da alt katta 3 küçük kahve oval (`WOOD.dark`, 0.12 u).

### U3 palm — "kumsal palmiyesi" (3 → 4 varyant)
- Frond uç rengi: son segment `#B6E36A` (güneşte solmuş uç). Frond sayısı varyantla 6/7/9.
- Gövde halka sayısına çıkıntı: her halkada 1 hafif kalın bant (kabuk izi).
- **V3 çift palmiye:** aynı kökten iki gövde, biri 25° eğik, biri 10° (ilişki hissi, `palmlagoon`).
- Hindistan cevizi demeti 2–3 → 3–5, bir demet sarı `#E8C55B` (olgunlaşmamış).

### U4 blossomTree — "üç renk" (Design)
- Pembe `#FF8FB1` korunur (D-031, T0 blob pembe kalır). Varyant başına **kısmi hue kayması:** V0 `#FF8FB1`, V1 `#FFB3C9`, V2 `#E7A6F0` (lila). T0 blob'u ortalama pembe `#FF8FB1` kalır.
- Gnarled gövde: 1 iç bükey eğri (S-eğrisi, palm'ın `sAmp` mantığı), koyu `WOOD.dark`.
- Çiçek kümeleri: kabukta 8–12 → 12–16 küme, 2 u'dan yakında beyaz `#FFF0F5` merkez noktası.
- Yaşam (life adası): dönem dönem 3–5 yaprak/taçyaprağı sürüklenmesi (ART_BIBLE §Interactions "Tree" satırıyla uyumlu).

## 3. Yeni türler (N = new)

Seçim ölçütü: (a) adayı ağaçtan tanıtır, (b) KKTC/Akdeniz karakterini taşır (kullanıcının coğrafyası),
(c) çoğu mevcut fabrikaların kombinasyonu, yeni teknik gerektirmez.

| # | Tür | Siluet | Boyut | Ana renkler | Tarif |
|---|---|---|---|---|---|
| N1 | **Şemsiye çam** (umbrella pine) | düz üst "şemsiye" | 6–8 u | taç `#4E9E5B` → üst `#7DBE63`; gövde `#C18A5E` | İnce eğik gövde (≤12°), tepede 3 yassı blob (Y ×0.45) yan yana, çatı gibi. Okunaklı en güçlü siluet. Kıyıya yakın. |
| N2 | **Selvi** (cypress) | uzun dar sütun | 7–10 u | `#2F7D5B` → uç `#3C8F68` | Kapsül gövdeli sütun (2 üst üste yassılmış lathe), taç ≥ %80 (top-heavy kuralının istisnası: sütun zaten "hepsi taç"). **Sıra halinde** yol/avlu boyunca. |
| N3 | **Zeytin** (olive) | bodur, burgulu | 3.5–4.5 u | taç `#A9C47F` / `#8FB36A`; gövde `#8A6E54` | Kalın, burgulu 2 gövde; geniş alçak gümüş-yeşil taç (5 blob, Y ×0.7). Eğim ≤ 25° (palm istisnasına bağlanır). Ürün: 4–6 koyu nokta `#4A3F5E`. |
| N4 | **Huş** (birch) | ince, beyaz gövde | 5–7 u | gövde `#FAFAF5` + 4–5 koyu bant `#5B5566`; taç `#C9E86F` / `#A6DB5E` | İnce hafif eğik gövde, bantlar vertex-color; taç küçük hafif (3 küçük blob). Mossgrove içinde ışık noktası. |
| N5 | **Söğüt** (willow) | perde | 5–6 u | taç `#A6DB5E` → sarkıtlar `#7BC950` | Kısa kalın gövde + kubbe taç + 14–18 ince sarkıt şerit (eğik düz quad, 2 segment, windMul 1.2). **Yalnız su kenarı** (shore 0.5–5). |
| N6 | **Sonbahar akçaağaç** (maple) | roundTree benzeri, sıcak | 4.5–5.5 u | `#F2A33C` / `#E8735A` / `#F5C84C` (3 tonlu taç) | Yeni geometri **gerekmez**: roundTree V0–V2 + `autumn` taç paleti. Yer örtüsüne düşmüş yaprak (zone boyama, Design `leaf litter` mantığı). |
| N7 | **Yanık gövde** (charred snag) | çıplak dal | 3–5 u | gövde `#5B5566`; uç `#E8735A` (kor) | Yaprak yok, 3–4 çıplak kısa dal, uçlarında emissive nokta (gece parlar, `emberpeak`). T0 blob'u yok (küçük). |

### 3.1 Öncelik dalgaları (bütçe bilinci)
- **Dalga A (en ucuz, en görünür):** U1, U2, U3 + N6 (palet) + N4 huş. Yeni fabrika 1 (huş), kalan veri.
- **Dalga B:** N1 şemsiye çam, N2 selvi, N3 zeytin. KKTC kimliği bu dalgada gelir.
- **Dalga C:** N5 söğüt, N7 yanık gövde, U4.

## 4. Ada başına tür dağılımı (archetype → yeni tablo)

Mevcut archetype adları `placement.ts`'ten: `hearthholm`, `millbrook`, `mossgrove`, `beaconrock`, `emberpeak`, `palmlagoon`.
Yüzdeler **o adadaki ağaç sayısının payı**, toplam 100.

| Archetype | Kimlik cümlesi | roundTree | pine | palm | N1 şemsiye | N2 selvi | N3 zeytin | N4 huş | N5 söğüt | N6 akçaağaç | N7 yanık |
|---|---|---|---|---|---|---|---|---|---|---|---|
| hearthholm (köy/kasaba) | "Akdeniz köyü" | 20 | 10 | 8 | 20 | 15 | 20 | 0 | 0 | 7 | 0 |
| millbrook (değirmen/dere) | "dere kıyısı" | 30 | 5 | 0 | 0 | 5 | 0 | 15 | 20 | 25 | 0 |
| mossgrove (orman) | "yosunlu orman" | 25 | 40 | 0 | 0 | 0 | 0 | 25 | 0 | 10 | 0 |
| beaconrock (kayalık) | "rüzgârlı fener" | 10 | 45 | 0 | 25 | 5 | 15 | 0 | 0 | 0 | 0 |
| emberpeak (volkan) | "kül ve kor" | 0 | 45 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 50 |
| palmlagoon (kumsal) | "tropik göl" | 0 | 0 | 70 | 15 | 0 | 0 | 0 | 15 | 0 | 0 |
| Design kubbesi | "pembe-yeşil" | 0 (kapalı) | 35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Design'da kalan **%65 blossomTree** (U4, üç hue). Toplam 100.

Yerleşim kuralı eklemeleri (veri, `placement.ts` / theme `scatter` tablosuna coding'in yazacağı):

| Tür | zones | shore | heights | slopeMax | minDist | cluster |
|---|---|---|---|---|---|---|
| N1 şemsiye | grass, sandDry | [1, 10] | [0.5, 12] | 0.45 | 4.5 | scale 26, thr 0.0 |
| N2 selvi | grass, plaza kenarı, path | [2, 1000] | [1, 30] | 0.4 | 2.6 | **sıra:** `rows` mekanizması (rim palm sırası gibi), aralık 3.2 u |
| N3 zeytin | grass, rock | [3, 1000] | [1, 20] | 0.6 | 3.8 | scale 30, thr 0.1 |
| N4 huş | forest, meadow | [3, 1000] | [2, 30] | 0.6 | 3.0 | scale 18, thr −0.1 (gruplu, 4–7'li) |
| N5 söğüt | grass, lagoon kenarı | [0.5, 5] | [0.3, 6] | 0.3 | 6.0 | yok, maxPerIsland 6 |
| N6 akçaağaç | grass, meadow | [3, 1000] | [1, 25] | 0.55 | 4.0 | scale 24, thr 0.15, **lekeli** grup |
| N7 yanık | sandBlack, crater, rock | [2, 1000] | [1, 40] | 0.9 | 3.5 | scale 20, thr −0.2 |

## 5. Çeşitlendirme mekanikleri (ucuz, yeni geometri yok)

1. **Renk çeşitliliği = pişirilmiş palet varyantları.** Doğrulandı (coding raporu, 2026-11-09): batcher instance rengi taşımıyor (`instanceColor` yok). Bu yüzden ±6 % değer / ±4° hue kayması varyant geometrisinin vertex-color'ına pişer: her tür için 2 palet kayması (ör. roundTree V0–V4'ten ikisi `#8FD16A`, ikisi `#9AD464`-ekseninde sıcak, biri soğuk). Instance rengi eklemek ayrı bir engine işi, bu spec'in kapsamı dışı.
2. **Ölçek:** mevcut ±15 % jitter yeter; N2/N4 için alt sınır ×0.9 (sütun/huş çok cüce görünmesin).
3. **Rota/yön:** yaw serbest, lean ≤ 12°; palm V3'te çift gövdenin yönü seed'den.
4. **Mevsim kayması (opsiyonel, sonra):** N6 oranı `weather`/gün saatinden bağımsız sabit; sonbahar bir ada kimliği, mevsim sistemi değil. Mevsim sistemi bu spec'in dışında.
5. **Zemin ilişkisi:** her tür kendi altına küçük zemin işareti bırakır (zone boyama): selvi/zeytin altı `#C9B28A` kuru toprak, huş altı `#7BC950` taze çim, akçaağaç altı `#F2A33C` yaprak lekesi (Design `leaf litter` ile aynı mekanik).

## 6. T0 uzaktan okuma (D-031: uzak blob ağacı eşleşmeli)

`CANOPY_KINDS` (`render/props/clusters.ts`) şimdi `deciduous | pine | palm | blossom`. Öneri:
- **Yeni kind: `autumn`** (turuncu `#F2A33C`), çünkü N6 bir adada belirgin leke olacak ve yeşil blob'a çevrilirse D-031 bozulur.
- N1, N3, N4, N5 → `deciduous` (blob rengi yeşil; olive/söğüt'ün gümüş-sarı tonu uzaktan farksız). N2 → `pine` (`BLOB_KIND_SCALE.pine` 0.8 doğru). N7 → blob yok.
- Blob **ölçek kaydı:** N1 şemsiye 1.2 (geniş), N2 0.6 (dar). `BLOB_KIND_SCALE` tablosuna kind yerine **def başına** override gerekiyorsa coding önerir.

## 7. Bütçe ve kabul

- Başlangıç ölçümü (coding, 1. adım): her türün LOD0/LOD1 üçgen ve vertex sayısı (`geo` testi), seed 1001 medium'da ağaçların toplam üçgen payı. Sayılar bu belgeye eklenir.
- Hedef: medium tavanı 950k üçgen (D-156). **Toplam ağaç payı bugünküne göre en çok +8 %**; Dalga A tek başına +4 %'i geçmez.
- **Mevcut LOD0 tavanları** (`geo.test.ts` `TARGET`): palm 700, roundTree 500, pine 350, treeBlob 60. U1–U3 bu tavanları aşacak; tavan, test içinde ilgili dalgayla **birlikte** yükseltilir (üçgen payı +%8 kuralı geçerli kalır). Başlangıç önerisi: roundTree 500 → 620, pine 350 → 430, palm 700 → 780. Gerçek sayı §8.1 ölçümüyle kesinleşir.
- Yeni türlerin LOD0 tavanı (öneri): tür başına 280 üçgen (söğüt 360, N7 120). LOD1: ≤ 40 üçgen. Her biri `TARGET` tablosuna eklenir.
- **Varyant sayısı riski:** `scatter.ts:258` varyantı `rng.int(0, variants-1)` ile seçiyor. Çekim sayısı sabit, konumlar kaymaz, ama `variants` 3 → 5 olunca mevcut ağaçların varyant indeksleri değişir; hash/pin testleri etkilenebilir. Çözüm: ilk üç varyantı **aynen koru**, yeni varyantlar 3 ve 4'e eklenir, ve testler pinlerin yenilenmesiyle aynı commit'te güncellenir.
- Her yeni tür: determinizm testi (aynı seed → aynı geometri), `dispose`, `windy` bayrağı doğru (söğüt sarkıtları rüzgârda daha çok).

### Görsel kabul (qa'ya devredilecek preset önerileri)
`src/content/shots.ts`'e eklenecek preset **id**'leri (raw kamera değerlerini coding/qa yazar; bu adada `pnpm shots` kapalı):

| Önerilen id | Kadraj niyeti | Geçme ölçütü |
|---|---|---|
| `W-trees-lineup` | hepsi tek karede, düz zemin, T2 mesafesi | ≥ 9 tür, her silüet tek bakışta ayırt edilir, hiçbiri başkasına benzemez |
| `W-trees-hearthholm` | köy yamacı, şemsiye + selvi + zeytin | ≥ 4 tür görünür, selvi sırası net, "Akdeniz" okunur |
| `W-trees-millbrook` | dere kıyısı, söğüt + huş + akçaağaç | söğüt su kenarında, turuncu leke yeşille tek karede dengeli |
| `W-trees-mossgrove` | orman içi T1 | huş çam arasında ışık noktası; çam çeşitliliği 4 varyant |
| `W-trees-emberpeak-night` | volkan eteği gece | yanık gövde uçları parlar, siluet gökyüzüne karşı okunur |
| `W-trees-far-t0` | T0 harita, tüm adalar | adalar arası ağaç rengi farkı okunur; blob rengi geometriyle eşleşir (D-031) |

## 8. Uygulama sırası (coding için somut adımlar)

1. **Ölç:** mevcut tür başına üçgen/vertex + ağaç payı → bu belgenin §7'sine yaz. *Çıktı: sayı tablosu.*
2. **Palet:** `palette.ts` `FOLIAGE`'a `autumn`, `olive`, `umbrella`, `birch`, `willowStrand` anahtarları + `BARK` (huş bandı). *Çıktı: testli veri.*
3. **Dalga A, alt adımlar (coding raporuyla yeniden sıralandı):** (a) U1/U2/U3 detayı + `TARGET` tavanları, (b) N4 huş fabrikası, (c) en son `autumn` kind'ı: `CANOPY_KINDS`, `cellKey` çarpanı, `TreePalette` / `PaletteKind` tipleri ve `BLOB_KIND_SCALE` birlikte değişir, ayrı commit. *Çıktı: `W-trees-lineup` kısmi, `shots` tablosu.*
4. **Dalga B:** N1, N2, N3 + yerleşim kuralları + selvi sırası. *Çıktı: `W-trees-hearthholm`.*
5. **Dalga C:** N5, N7, U4 + T0 kind eşleme. *Çıktı: `W-trees-far-t0`, `-emberpeak-night`.*
6. Her dalgada: `pnpm typecheck && lint && test`, `shots --assert`, contact sheet Read ile bakılır (visual-qa).

**Dokunulmaz:** `src/world/` (seed determinizmi): yeni def'ler registry sonuna eklenir, mevcut scatter indeksleri kaymaz (props.ts başlık notu).
