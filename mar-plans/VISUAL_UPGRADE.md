# Faz 5 — Görsel Yükseltme (Visual Upgrade)

Hedef: Marisland'ın grafik varlıklarını **daha detaylı, daha çeşitli ve daha yüksek kaliteli** hâle
getirmek; fleet agent'larına (botlara) **ayırt edilebilir kimlik ve imaj** vermek. Stil değişmez:
ART_BIBLE §1 pilaları (toy-chunky, silhouette first, warm light / cool shade, detail blooms) ve
"faceted toy" aynen geçerli. Yükseltme = aynı stilin içinde **daha zengin yüzey, daha çok varyant,
daha dolu ada katmanı ve yüksek kademede daha iyi ışık**.

Kaynak gözlemler (2026-11-09, `shots/wow-mwow2`, 55 wow karesi):

| Katman | Bugün | Eksik |
|---|---|---|
| Botlar (agent'lar) | Tek şase + monitör kafa, departman rengi tint, 7 aksesuar, 8 taşınan eşya | Aynı siluet; rol (shader / engine / qa…) görünmüyor; session durumu yalnız gem ile; panelde yüz / imaj yok |
| Prop yüzeyleri | Yüz başına düz vertex rengi, ±3 % L jitter, baked AO, rim | Kenar ışığı yok, malzeme sınıfı yok (ahşap = metal = cam = kumaş), yakında tanecik / doku yok |
| Binalar | cottage / towerHouse / barn / stiltHut, 3 roll varyantı | Çatı biçimi, pencere düzeni, trim, panjur, saksı, baca çeşidi yok; adalar arası fark yalnız renk |
| Bitki / kaya | 5 ağaç tipi, 1 çalı, 1 kaya kümesi | Biyom başına siluet ve renk seti yok; kayada katman / yosun yok |
| Arazi | Catmull-Rom yumuşak, zon renkleri, kum dalgası, çim deseni | Yar katmanları, döküntü, yosun sürünmesi, patika kenarı yok |
| Su | Swell, derinlik rampası, SDF köpük, glint | Sığlıkta kostik yok, güneş parıltısı zayıf, tek köpük bandı |
| Kıyı | Kum → çim halkası, sea stack, tide pool tekil | Kaya kemeri / mağara, gelgit havuzu alanı, kumul sırtı, kelp yok |
| Yüksek kademe (high) | DOF + MSAA 4 + 2048 gölge | Hiç çekilmiyor (wow seti medium); SSAO yok, yumuşak gölge yok, god ray yok |
| Gökyüzü / bulut | Tek bulut tipi, gradyan gök, yıldızlar | Bulut arketipleri, güneş diski / hale, ay evresi yok |

## Kısıtlar (değişmez)

1. **Dış asset yok**: her doku ve geometri koddan. Procedural texture (hash / noise) serbest.
2. **Determinizm**: aynı URL → aynı piksel. Varyant seçimi RNG label fork'u ile; session imajı `sessionId` hash'inden.
3. **İçerik veridir**: her yeni sayı `src/content/`'te.
4. **Zoom ladder**: T0'da görünen siluet ve renk değişmez; detay **sıfır-ortalamalı** varyasyon ekler
   (ΔE2000 adım ort ≤ 5, p95 ≤ 12, D-035). Yeni detay LOD0'a (T2–T3) gider, LOD1 silueti korur.
5. **Program sayısı**: medium 17 / 20, high 24 / 24. Yeni özellik **mevcut programa uniform ile** girer;
   yeni `#define` = yeni program, sadece high'da ve bütçe kararıyla.
6. **Vertex attribute bütçesi**: life programı 15 / 16 slot. Bot durumları mevcut attribute'lara paketlenir.
7. **Bütçe duvarı** (medium, `wow --assert` 55 / 55): W5 789,739 / 800k tri · W-cable-dusk 294 / 300 call ·
   W27 175 / 180 MB. Aşağıdaki bütçe kararı olmadan hiçbir task LOD0'a net üçgen ekleyemez.

## Bütçe kararı (D-156, kullanıcı)

| Metrik | Bugün | Öneri | Gerekçe |
|---|---|---|---|
| medium `triangles` | 800k | **950k** | Bina / bitki varyantları LOD0'da +15–25 % tri; medium ≥ 4 GB / 4 çekirdek makinelerde seçiliyor, 1M tri sorun değil; governor zaten DPR düşürüyor |
| medium `drawCalls` | 300 | **330** | Bot şase varyantları ayrı InstancedMesh (+2–3 call), bulut arketipleri (+2) |
| medium `gpuMemoryMB` | 180 | **200** | Yeni LOD0 varyant buffer'ları (~+8–12 MB tahmin) |
| high `programs` | 24 | **30** | SSAO + yumuşak gölge + god ray + bulut programı |
| low | değişmez | değişmez | Low telefon; hiçbir M45–M49 özelliği low'a girmez |

Alternatif "bütçe-nötr": her task eklediği kadar kırpar (LOD1 sadeleştirme, far-merge). Daha yavaş ve
her dalga token harcar; önerilmez.

## Milestone'lar

Numaralar: M44 Reports (Faz 4) rezerve; görsel yükseltme **M45–M49**, task'lar **TASK-590+**.

### M45 — Agent kimliği ve imajı (life + engine + qa)
*Her session'ın botu diğerinden ayrılır; panelde aynı botun portresi görünür.*

- **Bot görünümü kontratı** `src/content/bot-look.ts` (orchestrator yazar, iki agent da okur):
  `botLook(seed: string): BotLook` = `{ chassis: 0..2, head: 0..2, dept, role, shade: 0..2, eyes }`.
  Saf fonksiyon, `core/hash`. 3D bot ve 2D portre aynı descriptor'dan üretilir.
- **Şaseler** (3): `scout` (bugünkü), `hauler` (bodur, geniş omuz, palet ayak, 0.9 u), `spire` (ince
  uzun, 1.15 u, uzun anten). **Kafalar** (3): monitör (bugünkü), kubbe vizör, yuvarlak tek göz kamera.
  Her şase kendi InstancedMesh'i (TASK-571 dersi: paylaşılan mesh'te baked varyant tri patlatır),
  aksesuar / eşya decode aynen. Agent cap 60 / 25 değişmez.
- **Rol eşyası**: fleet `agent` alanı → taşınan eşya (shader → boya fırçası, engine → anahtar,
  worldgen → harita rulosu, props → çekiç, life → ördek, qa → büyüteç, devops → baret, docs → kitap).
  Mevcut 8 eşya slotundan yeniden kullan, eksikler eklenir.
- **Göz durumları** (ekran kafada emissive maske): idle · çalışıyor (yazı noktaları) · kapı bekliyor
  (`?`) · hata (`×_×`) · bitti (`^^`). `aGait.y` boş aralığına (4..8) paketlenir; yeni attribute yok.
- **Panel imajı**: descriptor → 48 px SVG portre (şase silueti + kafa + departman rengi + rol eşyası),
  session satırı, terminal başlığı, fleet-view çipi ve hover tip'te. Mock her kombinasyonu üretir.
- **Hareket çeşidi** (cute-motion): şase başına yürüyüş (hauler paytak, spire süzülme), 4 idle beat,
  kapı beklerken yukarı bakış + gem amber nabız, bitince zıplama + 6 kıvılcım.

### M46 — Yüzey kalitesi (shader + qa)
*Aynı program sayısıyla her yüzey "dokunulabilir" okunur.*

- **Malzeme sınıfları** (lit program, uniform tablo): matte / wood / metal / glass / fabric. Sınıf,
  mevcut 16-bit `emissive` attribute'unun kullanılmayan kod aralığına girer (class 0–2 dolu). Sınıfa
  göre specular lobe, fresnel, kenar ışığı gücü.
- **Kenar ışığı**: `fwidth(vNormal)` tabanlı ince açık çizgi (bevel kenarları), 60 u'da tam, 140 u'da 0.
- **Yakın tanecik**: triplanar hash ±2–3 % L, 60 u → 140 u fade; sıfır-ortalamalı (ladder geçer).
- **Arazi**: dik yüzlerde yükseklik-hash katman bantları, yar dibinde döküntü benekleri
  (`ground-detail`), kuzey yüzde yosun sürünmesi (T2–T3), ıslak kum glint, patika kenarı aşınma.
- **Su**: sığlıkta (derinlik 0–3 u, gündüz) iki oktav voronoi kostik — terrain programına su altı
  terimi; güneş parıltısı sparkle; ikinci köpük bandı.
- Kabul: programlar 17 / 24 değişmez, `pnpm shots ladder` geçer, wow deterministik, W8 / W16 / W-morning-shift
  yan yana önce / sonra.

### M47 — Prop çeşitliliği (props + worldgen + qa)
*Hiçbir iki ev, iki ağaç kümesi, iki tekne aynı değil; her adanın kendi bitki örtüsü var.*

- **Bina varyant sistemi v2** (`geo/buildings.ts`): modüler roll = çatı biçimi (gable / hip / dormer /
  mansard) × pencere düzeni (3) × kapı (3) × trim (panjur, saksı, tente, baca tipi, plinth iki ton).
  `variants` 3 → 8; LOD1 silueti aynı (ladder). LOD0 tri ≤ bugünkü × 1.25.
- **Bitki v2** (`geo/trees.ts`): 3 yeni kanopi silueti (uzun oval, şemsiye, katmanlı), ada başına renk
  seti (Design pembe-mor, DevOps koyu çam + kor, Research servi / zeytin, HQ meyve noktalı bahçe,
  Coding açık yeşil, QA nane, Marketing turuncu-sarı), palmiye eğik / çift gövde, çalı çiçeği biyoma göre.
- **Kaya v2**: 5 siluet + yosun / liken kapak + katman çizgisi; driftwood, kelp.
- **Tekne ve iskele v2**: 3 gövde (sandal, kabinli balıkçı, şalupa) + ada renk seti; iskele süsü
  (ağ, ıstakoz sepeti, halat, merdiven), şamandıra varyantı.
- **Worldgen kuralları**: ada başına varyant ağırlıkları, kaya tarlası kümeleri, Poisson çiçek çayırı
  yamaları, patika kenarı (tutam + taş), lot çevresi çit / çalı, cottage arkası bahçe parseli. World
  hash'leri **tek seferde** yeniden pinlenir (TASK-600 tek re-pin).

### M48 — Ada detay katmanı (worldgen + props + qa)
*Kıyı ve yamaç kendi başına bakılası.*

- Kıyı mikro-manzaraları arketipe göre: kaya kemeri / sea stack kümesi (kayalık), gelgit havuzu
  alanı + deniz yıldızı (kayalık-sığ), kumul sırtı + tepe çimi (kumlu), kelp yatağı (sığ turkuaz).
- Yar çıkıntılarında bitki sekileri, şelale dibi havuzu + sis, dere ağzı çakılı.
- Köy iç mekân süsü: çamaşır ipleri, flama, sandık yığınları yoğunluğu arttırılır (rule weights).

### M49 — Yüksek kademe render (shader + engine + devops + qa)
*high kademesi gerçekten "yüksek" olur ve ölçülür.*

- **SSAO / GTAO** (pmndrs `SSAOEffect` veya N8AO; kütüphane serbest, asset değil), yalnız high.
- **Yumuşak gölge**: PCF yarıçapı + 2048 harita, kontakt sertleşmesi; `shadows.ts`.
- **God ray** (dusk / dawn, güneş diski mesh'i + `GodRaysEffect`), bloom ile dengelenir.
- **Gökyüzü / bulut v2**: 3 bulut arketipi (kümülüs, stratus tabaka, tutam), iki ton + rim; güneş
  diski + hale + lens glint; ay evreleri; yüksekliğe göre yıldız yoğunluğu. Medium'da bulut arketipleri
  de var (+2 call), geri kalanı high.
- **Ölçüm**: `pnpm shots wow --quality=high --tag=high` ayrı set + `BUDGETS.high` satırı assert; stats
  overlay'de kademe; medium wow seti **piksel aynı** kalır (high özellikleri uniform'la kapalı değil,
  pass'le yok).

## Dalga planı (paralel agent'lar, aynı dosyaya iki agent dokunmaz)

| Dalga | Task'lar | Agent (model) | Ortak dosya riski |
|---|---|---|---|
| 1 | TASK-590 bot şase / kafa / göz · TASK-591 panel portre · TASK-594 malzeme sınıfları + kenar ışığı · TASK-598 bina v2 | life (sonnet) · engine (opus) · shader (opus) · props (sonnet) | 590 ↔ 591 yalnız `content/bot-look.ts` okur; 594 `factory.ts`, 598 `geo/buildings.ts` + `content/props-buildings.ts` |
| 2 | TASK-592 bot hareket · TASK-595 arazi detay · TASK-596 su kostik · TASK-599 bitki + kaya v2 · TASK-601 tekne v2 | life · shader · shader (sıralı, aynı agent) · props · props (sıralı) | — |
| 3 | TASK-600 worldgen kuralları (tek hash re-pin) · TASK-603 kıyı mikro-manzara · TASK-606 SSAO + gölge · TASK-608 gök / bulut | worldgen (opus) · worldgen (sıralı) · shader · shader (sıralı) | 600 ve 603 arka arkaya, hash bir kez |
| 4 | TASK-607 high set + bütçe · QA 593 / 597 / 602 / 605 / 609 · docs | devops · qa · docs | — |

Her dalga sonunda: merge → `pnpm typecheck && pnpm lint && pnpm test` → `pnpm shots wow --assert` →
contact sheet'e bak → push → bridge restart (session-end ritual).

## Kabul (Faz 5 kapanışı)

- Aynı adada 10 bot: en az 3 farklı siluet, 5 farklı göz durumu çekilmiş (`F-bots` dev shot).
- Panelde her session satırı portreli; portre = 3D bot (QA yan yana karşılaştırır).
- W8 / W16 / W-morning-shift önce / sonra: kenar ışığı, malzeme farkı, bina varyantı çıplak gözle okunur.
- Seed 1001'de iki aynı cottage yok; her adanın ağaç renk seti farklı (W1 postcard'da okunur).
- `wow --assert` 55 / 55 (yeni bütçeyle), ladder geçer, low ladder 80 MB altında kalır.
- `wow-high` seti ilk kez çekilmiş, `BUDGETS.high` ile assert edilmiş.
