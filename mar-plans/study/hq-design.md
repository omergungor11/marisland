# HQ "Yedi Kapı Kavşağı" ve Design "Cam Sera" — ada tasarım etüdü

> Araştırma + tasarım belgesi (2026-10-17). Kaynak: D-057, task-index M20 (TASK-465…470),
> `mar-plans/ISLAND_CULTURES.md` §2.1 / §2.6, ART_BIBLE §4 / §6 / §11 / §12, planlar
> `src/world/gen/plans/{hq,design}.ts`, kültür ledger'ları, `budgets.ts` ve ladder kareleri
> `study-shots/L-hq/*.png`, `L-design/*.png` (seed 1001, 14:00, 48° pitch; dosya adı = kamera
> mesafesi u). Kod değişmedi; bu belge TASK-466…470 ve sonrası için girdi.

## 0. Çerçeve ve kısıtlar (ikisi için ortak)

| Kısıt | Değer | Sonuç |
|---|---|---|
| Kültür def tavanı (`cultureCapOverride`) | HQ **12 / 1 tier-1**, Design **15 / 2 tier-1** | **İkisi de TASK-465 ile doldu** (HQ 8 + 4, Design 10 + 5). Aşağıdaki kataloğun her maddesi ya mevcut def'in **varyantı**, ya başka adanın def'inin **yeniden kullanımı**, ya **content / placement / shader / life** işidir. Yeni def isteyen maddeler ayrıca işaretli ve §6'da tavan sorusu olarak kullanıcıya gidiyor. |
| Variant kuralı (D-050) | Varyantlar ledger'a girmez; LOD1'i aynı olan varyantlar T0–T1'de tek gruba katlanır (D-032) | Varyant = T2'de +1 LOD0 grubu (+gölge), T0–T1'de bedava. "Silüet çeşitliliği" ucuza varyantla alınır. |
| Çapraz def kullanımı | Başka adanın def'i (`pigeonPerch`, `reflectingPoolEdge`, `hedge`…) ledger'a girmez | Bedeli: o adada +1 LOD0 grubu, kültür dilinin bulanıklaşması. Her kullanım gerekçeli. |
| Draw call | medium 300, W11 146 (D-049 sonrası), low 170 | T2 yakın çekimlerde (def, variant) grup sayısı belirleyici; W11'e giren LOD1 grubu eklemekten kaçın. |
| Program | 9 / 17 / 24 sabit (D-033) | Shader işleri mevcut `SURFACE` dalları (`stained` 12, `flow` 10, `marquee` 11) ve `aSpin.w` kanalıyla; yeni program yok. |
| Determinizm | rng label-fork, closed-form mover'lar (`render/culture-movers.ts`) | Her yeni hareket `CULTURE_MOVERS` tablosuna satır olarak girer, agent değil. |
| Palet | Sadece ART_BIBLE §2 tabloları (validator) | Sokak tint'leri = `THEMES[*].accent`; cam = `DESIGN_CULTURE_KIT.glass`. |
| Silüet (P2) | Ada başına tek baskın dikey | HQ: saat kulesi (11 + 6.5 u). Semafor tepede 8.8 u + 18–20 u tepe = ikinci dikey riski → §6 sorusu. Design: Atelier Tree; sera 10.5 u glade seviyesinde kalır. |

Ada şekilleri (`content/islands.ts` ARCHETYPES): **Hearthholm** 110–140 u hilal, `peak` 11–13 → bluff ile 18–20 u, duvar 6–7 u, koy `coveHalfDeg` 45°, `harbour` anchor koyun en düz diskinde, terrace step 3. **Mossgrove** 80–110 u kubbe, bluff ile 22.5–24.5 u, duvar 5–6.5 u, koy 55°, orman eşiği −0.6 (adanın %90'ına kadar orman), `giantTree` anchor zirvede, dere zirveden bluff dudağına → 1–3 şelale (`content/waterfalls.ts`).

---

## 1. HQ · Hearthholm — Liman Loncası → Yedi Kapı Kavşağı

### 1.1 Şu an (seed 1001, L-hq)

| Tier | Kare | Okunan | Zayıf |
|---|---|---|---|
| T0 | `700.png`, `480.png` | Yeşil hilal, kahverengi bluff, koy; batı ucunda coral leke | Saat kulesi 700 u'da seçilmiyor (ince gri çizgi); doğu tepesi tek ton yeşil + ağaç noktası; hiçbir "liman" işareti (iskele, feribot izi) yok. Ada "yeşil hilal" ötesinde kimliksiz. |
| T1 | `340.png`, `240.png`, `170.png` | Köy batı kum dilinde: ~8 turuncu çatı, kule, tek iskele, 2 kayık; dış kıyıda 3 şelale (KD, D, G); koy içi kumsal | **Adanın doğu %60'ı boş**: orman dolgusu + çim açıklıkları + 3–4 kaya. Koy içi kumsal tamamen boş. Bluff dudakları kullanılmıyor. Köy adanın "köşesinde kalmış" gibi; hilalin iç kavisi (en güzel kıyı) hiçbir şey taşımıyor. Tek iskele, tek kayık grubu: "takımadanın limanı" okunmuyor. |
| T2 | `120.png`, `85.png`, `60.png` | Quad, kahve kiosk çardakları, tente, flama ipleri, fener direkleri, banklar, `hqAnnex` kulesi; bir koyun, bir martı, bir bot | **Her bina aynı gri-mavi kutu + turuncu piramit çatı** (`hqOffice` ×6–7). ISLAND_CULTURES'ın krem duvar + mavi panjur + çan nişi dili yok (duvarlar gri). Lonca Salonu `hqAnnex` diğerlerinden sadece daha uzun. Sokak hiyerarşisi yok: lane'ler eşit, yön bilgisi yok. Kıyı rıhtımı yok; kum çıplak. |
| T3 | `42.png`, `30.png`, `21.png` | Çiçek tarhları, bank, flama, bot (satchel), kiosk içi, pencereler | 21 u'da kadraj %60 çatı + çim: mikro hikâye yok (kedi, şişe rafı, signpost tartışması iskelede ve köşede). Çim üstü kum yollar sert geçişli. Detay katmanı "ofis kampüsü", "liman" değil. |

**Kullanılmayan toprak**: doğu tepesi (zirve 18–20 u, adanın yarısından fazlası), hilalin iç kavisi (koy rıhtımı), üç şelale dudağı, bluff sırtı, batı kum dili (sadece kule). Tek kullanılan: koy yanındaki düz disk (quad) + bir lane demeti.

### 1.2 Ada haritası (yeniden yapılan HQ)

Şematik üstten görünüm; koy ağzı aşağıda (GB). Gerçek açılar seed'e göre `ctx.islands` yönlerinden gelir.

```
                     ~ ~ ~ ~  dış deniz  ~ ~ ~ ~
            ╭──────────── bluff + 3 şelale (ŞB = şelale balkonu) ────────────╮
            │  [ŞB1]        DOĞU TEPESİ (18–20 u)                             │
            │        ┌────────────────┐    [SEMAFOR TEPESİ]  ⟟ semaphoreTower │
            │        │ LONCA TERASI   │     ○ summit terrace, 2. pierSignpost │
            │        │ hqAnnex v2     │     ◦ bench ring, pennant ring        │
            │        │ + 2 küçük kule │   ╱  Hilal Sırtı Patikası              │
            │        └───────┬────────┘  ╱     (lanterns, milestones)   [ŞB2] │
            │   G5 ▲    G6 ▲ │   ╱───╱  POSTA AVLUSU                           │
            │  (Marketing)(Design) │  ▣ sorting yard: goodsStall v0, mailbags,   │
            │        ╲       │ ╱    cargoCrate ×7, fence, pigeonPerch          │
            │         ╲      │╱     ⟋ mailLine pylon (üst uç)                  │
            │    G4 ▲──┐  ╔══╧══╗  ╱                                    [ŞB3] │
            │  (Research)│ ║PUSULA║╱  G7 ▲ (QA)                                │
            │            │ ║MEYDAN║── sokak 7 ──▲                               │
            │   clock ⌂──┤ ║ R≈10 ║     G3 ▲ (DevOps)                          │
            │   tower    │ ╚══╤══╝                                              │
            │      G2 ▲──┘    │ harbour lane (HQ'nun kendi sokağı)              │
            │    (Coding)     │ ⟋ mailLine (alt uç, iskele kökü)                │
            │  ┌──────────────┴──────────────┐                                 │
            │  │ RIHTIM (plaza paving bandı) │  bellPost, awning, timetable,   │
            │  │ ferryOffice, crane, crates  │  gullPerch ×3, lanternPost sık  │
            │  └───┬────────────────┬────────┘                                 │
         batı kum  ║ FERİBOT İSKELE ║ POSTA İSKELESİ (kısa, rowboat coral)     │
         dili      ║ (mevcut)       ║                                          │
           ╰───────╨────────────────╨─────── KOY İÇİ ──────────────────────────╯
                     ⊙ Martı Kayası      ⊙ ⊙ kanal şamandıraları (buoy) ⊙ ⊙
                   (rockCluster+perch)      ⇣ feribot rotası koy ağzından
```

| Zon | Yer (hilal üstünde) | Amaç | Ana prop'lar | Bağlantılar |
|---|---|---|---|---|
| **Z1 Pusula Meydanı** | Koy yanı düz disk (bugünkü quad), R 7 → **10** | Takımada haritası mozaiği; 7 sokağın hub'ı | `clocktower` v2 (meydan iç kenarı), `coffeeCart`, `guildNoticeBoard`, 7 `pennantLine` (her sokak başında o kültürün varyantı), fener direkleri | 7 sokak + harbour lane |
| **Z2 Yedi Sokak + Kapılar** | Meydandan gerçek ada yönlerine, 14–26 u | Her ada HQ'da temsil | `cultureGate` v0–6 (sokak sonu), `goodsStall` (o adanın malı, sokak başına 1–2), `lanternPost`, avenue `roundTree`, `bench` | Z1 ↔ Z3/Z5/Z6; suya çıkan sokaklar için §6 S1 |
| **Z3 Rıhtım (Harbour lane sonu)** | Koyun iç kavisi, pier kökü etrafında 30–40 u band | "Liman" kimliği | Mevcut kit (awning, timetable, signpost, bell, crane, crates, perches, ferryOffice) + **plaza paving bandı** (rıhtım), `lanternPost` 1.0 yoğunluk, `barrel` / `crate` yığınları | Z1 harbour lane; Z4 posta iskelesi; Z7 mail line alt ucu |
| **Z4 İskeleler** | Koy içi | 2 iskele: feribot (mevcut) + **posta iskelesi** (kısa) | `dock` ×2, `rowboat` coral varyantı ×2 (posta sandalı), `sailboat` v2 feribot moorings | Z3; ferry rotası |
| **Z5 Posta Avlusu** | Doğu tepesinin meydana bakan omzu (8–11 u kot) | Posta ayrımı, mail line üst ucu | `mailLine` pylon v0, `goodsStall` v0 (koli) ×2, `mailbag` ×4–6, `cargoCrate` ×7, `fence`, `pigeonPerch` (Research def'i, yeniden kullanım), `harbourCrane` v1 | Z2 (Design/QA sokağı geçer), Z6 sırt patikası |
| **Z6 Lonca Terası** | Omzun üstü, 11–13 u, meydanı gören düz pad | Lonca Salonu'nun **tepeden** meydana bakması | `hqAnnex` v2 (Guild Hall, crown), 2 × `hqAnnex` v0 "lonca kuleleri" (ikiz, küçük ölçek), `meetingPavilion` (bandstand), `flowerBed` yarım halka, `bench` | Z5, Z7 sırt patikası, merdiven ⇒ Z1 |
| **Z7 Semafor Tepesi** | Zirve 18–20 u | Relay işaret kulesi + seyir terası | `semaphoreTower`, küçük `plaza` disk, `pierSignpost` (ikinci; bearing param), `bench` ×3 (adaya bakar), `pennantLine` halkası | Z6 ⇒ **Hilal Sırtı Patikası** |
| **Z8 Hilal Sırtı Patikası + Şelale Balkonları** | Bluff dudağı boyunca Z7'den dış kıyıya | Doğu yarıyı "yürünür" yapar; 3 şelale dudağında balkon | `lanternPost` her 5 düğüm, `bench` + `fence` çifti her şelale dudağında (ŞB1–3), `rockCluster`, `flowerBed` | Z7 ↔ ŞB'ler ↔ Z2'nin doğu kapıları |
| **Z9 Koy İçi Kumsal** | Hilalin iç plajı, Z3 dışındaki kum | Boş kum yerine "bekleme plajı" | `buoy` kanal işaretleri (su, 2 sıra), **Martı Kayası** (`rockCluster` + `gullPerch` ×2, gull landing), `driftwood`, `tidePool`, `messageBottle` serpme (T3), `bench` çiftleri plaj üstü | Z3; feribot rotası şamandıralar arasından |
| **Z10 Batı Kum Dili** | Kulenin arkasındaki uç | Kıyı işaretleri | `lanternPost` ikiz "koy ağzı fenerleri" (kırmızı/yeşil varyant, gece), `palm` ×2 (mevcut) | Z1 harbour lane batı ucu |

Sokak yönleri: `ctx.islands` bearing'leri sıralanır; hilalin uzun ekseni boyunca düşen 4–5 yön tam uzunlukta, suya 12 u içinde çarpan 2–3 yön için **§6 S1** kararına göre (dogleg / kıyı kapısı + mini iskele). Sokak ucu kapısı kültür accent'inde; **o sokağın** `pennantLine` varyantı ve `goodsStall` varyantı aynı kültür (bugün random).

### 1.3 Fikir kataloğu — HQ

Alanlar: pitch · yer · tier · hareket · wow · maliyet S/M/L · agent · yeniden kullanılan · bütçe riski. "Def" sütunu: **V** = varyant, **R** = çapraz yeniden kullanım, **C** = content/placement/shader/life (yeni def yok), **N** = yeni def gerekir (tavan).

| # | Ad (TR / EN) | Pitch | Yer | Tier | Hareket | Wow anı | $ | Agent | Reuse | Def | Risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| H1 | **Pusula Mozaiği / Compass Mosaic** | Meydan zemini: 7 ada konumu, 7 accent ışını, ortada çan glifi; gerçek `ctx.islands` yönleri | Z1 | T1 (zemin, D-031) | — | Üstten bakınca yıldız (W20) | M | shader + worldgen | `Zone.plaza` + yeni `mosaic` surface kind? → TASK-468 zaten | C | Program yok; ground layer `mosaic` var (Design terrazzo) — ışın tint'i için 7 renkli varyant gerekir |
| H2 | **Sokak Tint Şeritleri / Street Kerb Stripes** | Her sokağın iki kenarında 0.4 u accent şeridi (tam zemin boyaması değil); meydandan kapıya | Z2 | T1 | — | T1'de 7 renkli yelpaze | S | shader | `GROUND` layer `stripe` (TASK-440'ta atlanmıştı: edge-aware ground lazım) | C | Edge-aware stripe layer yoksa M; alternatif: `lanternPost` accent varyantı dizisi (H5) |
| H3 | **Kültür Fenerleri / Culture Lanterns** | Her sokakta fener direği camı o kültürün accent'i; gece sokak kendi renginde ışık havuzu | Z2 | T2 | Flicker (mevcut) | W21'de 7 renkli ışık havuzu | S | props (V) + shader (pool colour by variant) | `lanternPost` + lantern pools (TASK-305) | V | T2'de +7 LOD0 grubu (variant başına) — **LOD1 ortak** → T0/T1 bedava; T2 çağrı +7 (+7 gölge) |
| H4 | **Sokak Malı Tezgâhları / Goods Rows** | Sokak başına 1–2 `goodsStall` o kültürün varyantında; önüne o adanın `cargoCrate` varyantı; bot satıcı | Z2 | T2 | Tente flutter (`windy`), satıcı bot idle | T2'de "kim ne satıyor" | S | worldgen + life | `goodsStall` v0–6, `cargoCrate` v0–6, TABLEAU `stand` | C | — |
| H5 | **Yedi Kapı Gece Sırası / Gates in Relay Order** | 21:00 relay: HQ adımında kapı fenerleri 10 s aralıkla relay sırasında (HQ→DevOps→QA→Coding→Mkt→Design→Research) yanar; semafor kolları sıradaki adayı gösterir | Z2, Z7 | T2 | Lamp set + `hooks.arms` closed-form | W21 | M | life (469) + content (`rhythm.ts` lamps) | `CULTURE_MOVERS` satırı, D-052 relay clock | C | 0 program; kolların açısı = `atan2(island − tower)` world'den |
| H6 | **Lonca Terası / Guild Terrace** | Guild Hall meydanın içinde değil, **tepeden** meydana bakan teras padında; önünde bandstand pavilion, merdiven meydana | Z6 | T1 (yapı ≥ 3 u) | — | T1'de ada "kat kat" okunur (Amalfi yönünün ucuz hâli) | M | worldgen | `crownLot` → `tryLot` on `addPad(group, step)` (Research `Pad.group` kancası D-046) | C | Pad relaxation: teras padı quad padına `padStep` ile bağlanmasın |
| H7 | **İkiz Lonca Kuleleri / Twin Guild Towers** | Guild Hall'un iki yanında `hqAnnex` v0 küçük ölçekli (scale 0.75) ikiz; meydan–teras ekseni simetrik | Z6 | T1 | — | Silüet: kule + 2 kulecik + çan nişi | S | worldgen | `hqAnnex` (rollVariants 2) | C | LOD1 grubu zaten var (0 yeni grup) |
| H8 | **Bina Çeşitliliği / Lot Mix Variety** | `lotMix`'e `barn` ("ambar", rıhtımda, kapı rengi 7 varyant?), `cottage` roof v (memur lojmanı, tepe omzu), `towerHouse` (defSwap'ten çıkar) ekle; `hqOffice` oranı 4 → 2; duvarlar **krem** (`OFFICE_PAL` swap) + mavi panjur | Z2, Z3, Z5 | T1 | — | "Aynı turuncu kutu" şikâyeti biter | M | worldgen + props (V) | `barn`, `cottage`, `towerHouse` mevcut; `hqOffice` v? | V/C | T2 +3–4 LOD0 grubu (kabul edilebilir: W16 ≤ 230 kontrol); hqOffice duvar rengi content ise S |
| H9 | **Rıhtım Bandı / Stone Quay** | Koy iç kavisinde 3–4 u genişlikte `plaza` paving bandı (`paintZone` gibi), kenarında `barrel`/`crate`, sık fener; kum sadece plaj kalır | Z3 | T1 (zemin) | — | T1'de koy "liman" olur | S | worldgen | `paintZone` (design.ts'teki), `Zone.plaza` | C | Blocked scatter zonu; iskele kökü apron'u korunur |
| H10 | **Posta İskelesi / Mail Jetty** | İkinci, kısa iskele; coral `rowboat` ×2 (posta sandalı), `mailbag` kökte; 09:00 posta saati sandal çıkar | Z4 | T1 | Boat bob; mover değil, mooring | 2 iskele = "takımada limanı" | S | worldgen + life | `dockWithLink` ikinci çağrı, `rowboat` tint varyantı? | V/C | Rowboat coral varyantı yoksa mevcut renk; `findDock` iki kez (minDist) |
| H11 | **Kanal Şamandıraları / Channel Buoys** | Koy ağzından iskeleye 2 sıra `buoy` (6–8), feribot rotası aralarından; gece üst küre emissive (varyant) | Z9 (su) | T2 | Swell bob (mevcut), bell | Feribot şamandıra kapısından girer (W16) | S | worldgen + props (V) | `buoy`, `routes.ts` ferry stop node | V | Su üstü fixture: `FLOATING_FIXTURES` listesine (rainbowArc gibi) |
| H12 | **Martı Kayası / Gull Rock** | Koy içinde küçük `rockCluster` + 2 `gullPerch`: gull landing hedefi, tepesinde uyuyan martı (spot critter) | Z9 | T2 | Gull landing (#12), ruffle | T2'de canlı koy | S | worldgen + life | `rockCluster`, `gullPerch`, `SPOT_CRITTERS` gull | C | Perch landing listesine kaya eklenir |
| H13 | **Posta Avlusu / Sorting Yard** | Mail line üst ucunda çitli avlu: 7 `cargoCrate`, 4–6 `mailbag`, 2 `goodsStall` v0, `harbourCrane` v1, `pigeonPerch` (posta güvercinleri) | Z5 | T2 | Crane sack swing (mevcut mover), pigeon spot critter | "Posta nereden geliyor" cevabı | M | worldgen + life | `CULTURE_MOVERS.crane`, Research `pigeonPerch` | R/C | `pigeonPerch` HQ'da +1 grup; Research kimliği "güvercin" → HQ'da "posta güvercini" diye anlamlı |
| H14 | **Posta Saati / Mail Hour 09:00** | Ritüel (20 s): 4 çuval mail line'dan kayar (469 mover), vinç sallanır, posta sandalı iskeleden çıkar, çan 1 vuruş | Z5→Z3 | T2 | Closed-form: `sackPos(t)` cable boyunca `mailCablePoint` | W22 | M | life | `MAIL_LINE` sag fonksiyonu, `rhythm.ts` slot | C | Mover `range` 260 u; agent yok |
| H15 | **Feribot Kuyruğu / Ferry Queue 17:45** | `ferriesHome` slotunda timetable önünde 4–6 bot kuyruk (TABLEAU `queue` → `timetableBoard`), satchel'li; feribot gelince dağılır | Z3 | T2 | Bot hop (mevcut) | Rhythm W → P (TASK-451 bulgusu) | S | life | `TABLEAU`, `coffeeQueue` pattern | C | Agent cap 60 (medium): tableau cap 5/ada — queue bot'ları ambient pool'dan |
| H16 | **Hilal Sırtı Patikası / Crescent Ridge Walk** | Meydan → teras → zirve → bluff dudağı boyunca dış kıyıya; her 5 düğüm fener, "mil taşı" (`rockCluster` küçük + glyph? hayır: sade), sırtta `pennantLine` | Z8 | T2 | — | Doğu tepesi artık boş değil; gece fener dizisi T1'den okunur (W3/W15) | M | worldgen | `pathLink`, `pathLanterns`, `pathSparesSlopes` | C | Path A* bluff dudağına çok yaklaşmasın (`forestMinShore` benzeri eşik) |
| H17 | **Şelale Balkonları / Falls Balconies ×3** | Her şelale dudağında `fence` + 2 `bench` + fener; TABLEAU `gaze` bot (şelaleye bakan çift) | Z8 | T2–T3 | Flow (mevcut) | Şelale sonunda biri var (W13 HQ versiyonu) | S | worldgen + life | `content/waterfalls.ts` lip pozisyonları (ctx'ten okunur) | C | Dudak relief yüksek: bench için küçük pad |
| H18 | **Koy Ağzı Fenerleri / Harbour Entrance Lights** | Batı kum dili ucunda + karşı bluff ayağında 2 `lanternPost` varyantı (kırmızı / yeşil cam, 3 u direk); gece 20:00 pier lanterns slotuyla | Z10, Z9 | T2 | Flicker | W3/W21'de koy ağzı çift ışık | S | props (V) + content | `lanternPost`, `rhythm.hq.lamps` | V | — |
| H19 | **Şişe Postası Sahili / Bottle Beach** | Koy plajına `messageBottle` serpme (T3, 6–10), `driftwood`, `tidePool`; `bottleShelf` hikâyesi ferryOffice'ten plaja taşınır | Z9 | T3 | Crab (mevcut) | W8 benzeri makro ama HQ hikâyesiyle | S | worldgen | `messageBottle` (ART_BIBLE §5 T3; def varsa) | C | Def yoksa N (küçük, noShadow) |
| H20 | **Sandık Kedileri / Crate Cats** | Posta avlusu ve rıhtımdaki `cargoCrate` üstüne spot cat ×2 (uyur); kule dibinde `catOnTimetable` kalır | Z3, Z5 | T3 | Tail curl, sleep dusk→dawn | T3 "liman kedisi" | S | life | `SPOT_CRITTERS` cat, story spot kind yeni ('crateCat') | C | Story kind `HQ_CULTURE.storySpots`'a satır |
| H21 | **Semafor Terası / Semaphore Lookout** | Zirve diski: `semaphoreTower`, ikinci `pierSignpost` (bearing param, "buradan görünen adalar"), 3 bank adaya bakar, `pennantLine` halkası (7 varyant) | Z7 | T2 | Kollar (H5), flama flutter | Zirveden tüm takımada; W22 başlangıç | S | worldgen | `pierSignpost` bearing API (D-051) | C | Semafor + kule silüeti → §6 S2 |
| H22 | **Orchestrator Bağlama Direği / Airship Mast** | Semafor tepesine 16 u flama ipi (`pennantLine` 7 varyant dikey?) + airship orbit'i HQ üstünde yavaşlar (zaten) → "bağlanıyor" izlenimi; direk = semaforun kendisi | Z7 | T1 (airship) | Sky craft (mevcut) | T1'de airship + semafor aynı karede | S | content (`sky-craft.ts` orbit bias) | D-038 orbit, §12.3 | C | Airship gölge yok; sadece orbit merkezini HQ zirvesine çek |
| H23 | **Gece Lamba Seti / Night Lamp Set** | `rhythm.hq.lamps.defs` ← `cultureGate`, `semaphoreTower`, `goodsStall` (tente altı), H18 fenerleri; 20:00→06:00 | tümü | T2 | Ramp 8 s | W3 "≥ 8 bloomed emissives" rahat geçer; W21 | S | content | lamp set D-052 | C | Emissive maskeleri 465 kitinde `hooks.lamp` var |
| H24 | **Kahve Terası / Coffee Terrace** | Meydanın koya bakan kenarı: `coffeeKiosk` + 4 `bench` + `ferryAwning` v1 (şemsiye) + `flowerBed`; 12:00 coffee queue burada | Z1/Z3 sınırı | T2 | Queue (mevcut) | Golden Harbor (W2) ön planı | S | worldgen | mevcut kit | C | — |
| H25 | **Feribot Fanfarı Görünür / Fanfare Framed** | 06:00/18:00 fanfar: 2 feribot aynı anda şamandıra kapısından çıkar (route phase hizası), çan 3 vuruş, martılar havalanır; TASK-451 "fanfare unframed" düzelir → W16 saatini 06:00'a al | Z4/Z9 | T1 | `life/ferry.ts` timetable phase | — | S | life + qa | D-054 dwell, `CULTURE_MOVERS.bell` | C | 2 feribot hattının phase'i aynı stop'ta hizalanır |

Yeni def gerektirenler (tavan 12 doluysa **yapılamaz**, §6 S4): `harbourLight` (H18 için gerçek deniz feneri yerine lanternPost varyantı yeter), `quayWarehouse` (H8 `barn` ile ikame). `messageBottle`, `tidePool`, `driftwood`, `buoy`, `rockCluster` mevcut def'ler (H11, H12, H19 yeni def istemez).

### 1.4 Wow çekimleri — HQ

| ID | Çekim | Seed · kamera · zaman | Pass kriterleri (§11 stili) |
|---|---|---|---|
| W20 | **Pusula Yıldızı / Compass Star** | 1001 · raw cam meydan üstü ≈ 75 u, pitch ≈ 65° (ladder dışı, raw) · 15:00 | Meydan mozaiği bütün; **≥ 6 sokak** meydandan ayrı tint'te ayrılıyor; **≥ 5 `cultureGate`** kadrajda ve accent'i ΔE > 15 ile birbirinden ayrı; ≥ 4 `goodsStall`; saat kulesi tepesi kesilmemiş; ≤ 260 calls (medium) |
| W21 | **Kapılar Yanıyor / Gates Relay** | 1001 · raw cam iskele kökünden harbour lane boyunca meydana, ≈ 40 u, alçak · 21:00 + simt 12 | ≥ 3 kapı feneri yanık, her biri kendi accent hue'sunda (±15°); semafor kolları + lambası gökyüzüne karşı okunur; timetable arkadan aydınlık; fener havuzları ≥ 2 renk; land L ≥ 0.12; relay flash HQ'da sönmüş, DevOps adımı başlamış (arka planda Emberpeak ×4 parlak) |
| W22 | **Posta Hattı Sabahı / Mail Line Morning** | 1001 · raw cam posta avlusundan iskeleye bakar, ≈ 55 u · 09:00 + simt 6 ve + 7 (1 s ara) | Kablo kesintisiz (sag görünür); **≥ 2 çuval** kabloda, iki kare arasında ilerlemiş; iskele + rıhtım + ≥ 1 feribot kadrajda; sağda bir şelale şeridi; sis yok, deniz doygun |

### 1.5 Paketler — HQ

| Paket | İçerik | Bağımlılık | Agent | Doğrulama |
|---|---|---|---|---|
| **M20-core HQ** (TASK-466) | Z1 meydan R 10, 7 sokak + kapılar, tezgâhlar, posta avlusu + mail line anchors, semafor tepe; `pennantLine`/`goodsStall` varyantı sokağın kültürüyle eşlenik (H4) | 465 ✓ | worldgen | `pnpm test` plan testleri, `shots ladder:hq`, D-culture-hq re-pin |
| **M20-core HQ shader** (468) | H1 mozaik, H2 şeritler (edge-aware yoksa fener dizisine düş) | 466 | shader | W20 |
| **M20-core HQ life** (469) | H5 kapı sırası + semafor kolları, H14 posta saati mover, stall keeper bot | 466 | life | W21, W22 delta kareleri |
| **HQ+1 "Doğu Tepesi"** | H6 Lonca Terası, H7 ikiz kuleler, H16 sırt patikası, H17 şelale balkonları, H21 semafor terası, H13 posta avlusu dekoru | 466 | worldgen | ladder L-hq drift ≤ 4; W11 call ≤ 150 |
| **HQ+2 "Liman"** | H8 lot mix + krem duvar, H9 rıhtım bandı, H10 posta iskelesi, H11 şamandıralar, H12 martı kayası, H24 kahve terası, H19 şişe sahili | 466 | worldgen + props (varyantlar) | W16 ≤ 230; W2 ≥ 3 boat |
| **HQ+3 "Gece ve Ritim"** | H3 kültür fenerleri, H18 koy ağzı fenerleri, H23 lamp set, H22 airship bias, H25 fanfar kadrajı | HQ+2 | shader + content + life | W3, W15, W21 |
| **HQ+4 "Hayat"** | H15 kuyruk, H20 sandık kedileri, ŞB gaze çifti, pigeons | HQ+1 | life | agent cap 60 (medium) `workers.test.ts` |
| **QA** (470) | W20–W22 preset, `--assert` ×3, L-hq ladder, 10-seed sweep (sokak yönleri su/kara dağılımı her seed'de ≥ 4 kara sokağı) | hepsi | qa | contact sheet M20.jpg |

### 1.6 Kullanıcıya sorular — HQ

| # | Soru | Seçenekler |
|---|---|---|
| S1 | Gerçek yönü 12 u içinde suya çıkan sokaklar ne olur? | (a) Karada dogleg: yöne başlar, kıyıda hilal eksenine kıvrılır, kapı kıvrım sonunda; (b) **Kıyı kapısı**: kapı rıhtımda durur + o kültürün rengi/flamasında mini bağlama kazığı; (c) Yalnızca kara yönleri sokak (4–5), kalanlar meydanda kapı olarak yan yana ("deniz kapıları") |
| S2 | Semafor (8.8 u) 18–20 u zirvede saat kulesini (17.5 u, koy kotu) geçer — P2 "tek baskın dikey" | (a) Kabul: semafor ince kafes, kule kütle (farklı dil); (b) Semafor zirveden omza (11–13 u) iner; (c) Saat kulesi +4 u büyür (LOD1 re-pin) |
| S3 | Lonca Salonu nerede? | (a) Bugünkü gibi crown lot, sokaklardan birinde; (b) **Lonca Terası** meydanın üstünde, merdivenli (H6); (c) Zirvede semaforun yanında |
| S4 | HQ def tavanı 12 doldu | (a) **12'de kal**, her şey varyant/placement; (b) 14'e çık: `messageBottle` + `harbourLight`; (c) 16'ya çık (ambar, kıyı kapısı iskelesi) |
| S5 | Bina çeşitliliği nasıl? | (a) Mevcut def'ler (`barn` ambar, `cottage` lojman, `towerHouse`); (b) `hqOffice` yeni geometri varyantları (çan nişi, balkon) — props işi; (c) **ikisi** |
| S6 | Koy içi kumsal | (a) Tümü rıhtım (paving) — "Büyük Liman" yönünün izi; (b) **Rıhtım sadece iskele çevresi, kalan plaj şişe/tide pool**; (c) Olduğu gibi kum |
| S7 | Mail line yönü ve yoğunluğu | (a) Tepe → iskele, 09:00 ve 17:45'te 20 s burst; (b) Sürekli yavaş akış (1 çuval / 40 s); (c) İki yönlü (ikinci kablo) |
| S8 | Sokak zemini | (a) Kenar şeridi (0.4 u accent); (b) Tam sokak tint'i (accent ×0.35 + paving); (c) Zemin değişmez, sadece fener + flama renk verir |

---

## 2. Design · Mossgrove — Cam ve Işık Stüdyosu → Cam Sera

### 2.1 Şu an (seed 1001, L-design)

| Tier | Kare | Okunan | Zayıf |
|---|---|---|---|
| T0 | `700.png`, `480.png` | Altıgenimsi yeşil kubbe, pembe noktalar, bluff, güney şelale köpüğü; zirvede mor-yeşil ağaç lekesi | Design, Research'ün yanında **"pembe noktalı yeşil top"**; cam / ışık işareti sıfır (vitray kanopi 700 u'da renkli nokta vermiyor). Hiçbir açık renkli / parlak kütle yok. |
| T1 | `340.png`, `240.png`, `170.png` | Atelier Tree, kum rengi glade, mor çatılı atelier + gallery (mozaik çatı güzel), batıda heykel bahçesi (torus / arch), mantar korusu, mor çardak güneyde, batı iskelesi + lantern boat, güney şelale | **Adanın %70'i çam + pembe ağaç dolgusu**; doğu yarı tamamen orman; dere ve easel walk görünmüyor; şelale dudağında hiçbir şey; bluff çevresi ve koy plajı (KD kum) boş. Yerleşim merkezde sıkışık, "kurgu" yok: heykel bahçesi, çardak, mantarlar birbirinden bağımsız adacıklar. |
| T2 | `120.png`, `85.png`, `60.png` | Glade: bunting (cam çan ipi), stained screen, hot shop (gri tezgâh + fırın), mantarlar, kaide üstü bot, flama ipleri, cullet + 5 kostik sırası, bot + tilki + orb, koyun | **Hot shop gri bir blackboard gibi**: fırın ağzı koru, baca dumanı (0 particle bug) yok → "cam üfleme" okunmuyor. Kostikler düz, mat lekeler (slab). Mor çardak (`galleryPavilion` v2) glade'den kopuk. Prizmalar zor seçiliyor. Glade zemini (confetti gravel) büyük ve boş. |
| T3 | `42.png`, `30.png`, `21.png` | Cullet gökkuşağı sırası (iyi), tilki + orb, gaffer bot, vazo botu, çiçekler, mantar benekleri | 21 u'da ana özne "bot + gri tezgâh": sıcaklık yok (kor parça emissive silik gündüzde), cam parıltısı yok; mantarlar Design'ı değil "orman"ı anlatıyor. Easel walk kadrajda hiç yok. |

**Kullanılmayan toprak**: doğu yarısı (orman), güney şelale dudağı ve dere boyu, bluff sırtı, KD koy plajı, batı iskelesi çevresi (sadece bot), zirve–glade arası yamaç (sadece patika).

### 2.2 Ada haritası (yeniden yapılan Design)

Şematik; zirve (Atelier Tree) kuzeyde, şelale güneyde, iskele batıda (seed 1001 düzeni; diğer seed'lerde anchor'lar döner).

```
                 ~ ~ ~ ~ ~ ~   KD koy plajı: DENİZ CAMI PLAJI (Z9)   ~ ~ ~ ~
       ╭──────────────────────── bluff sırtı ─────────────────────────────╮
       │        ♣ ATELIER TREE (zirve, 22–24 u)  ♣                          │
       │        ○ KÖK AVLUSU: gatherRing, orbs, lantern pools (Z2)          │
       │   çam  ╲      ╲ dere kaynağı                 VİTRAY DEĞİRMEN SIRTI │
       │  korusu ╲      ╲                          ✶ stainedWindmill        │
       │          ╲  PRİZMA YOLU (Z4)               ░ çiçek tarlası (hue    │
       │  HEYKEL   ╲  ⌒ ⌒ ⌒ prismArch ×4–5         ░ cluster'lı) + sheep    │
       │  BAHÇESİ   ╲   ╔═══════════════╗          (Z6)                     │
       │  (Z7)       ╲  ║  SERA MEYDANI ║ ─ glasshouse ×3 (sky/mint/pink)   │
       │  ◎ torus     ╲ ║ ◉ CONSERVATORY║ ─ glasshouse ×3 (violet/amber/…) │
       │  ◎ arch  prism ║  r 7.6, 10.5u ║   (Z1)                            │
       │  ◎ stack       ╚═══════╤═══════╝                                   │
       │       ╲    SICAK ATÖLYE│AVLUSU (Z3)  ⌂ hotShop + baca + terrazzo   │
       │  FENER ╲       ░ MANTAR│KORUSU (Z8)   fox+orb, fireflies           │
       │  SOKAĞI ╲  (lanternPost cam varyantı dizisi)                       │
       │ (Z5)     ╲             │ dere ↓   EASEL WALK (bank)                 │
       │  ║ iskele ╲      ═════╪═════ CAM KÖPRÜ (Z10)                       │
       │  ║ lantern  ╲          │  kostikler dere yatağında                  │
       │  ║ boat      ╲   [ŞELALE BALKONU] bench+fence (Z11)                 │
       ╰──────────────╲────────┼───────────── bluff ──────────────────────╯
            ~ ~         ~ ~   ║║║ şelale ribbon   ◠ rainbowArc (06–07:30, 16:30–18:30)
```

| Zon | Yer | Amaç | Ana prop'lar | Bağlantılar |
|---|---|---|---|---|
| **Z1 Sera Meydanı** | Bugünkü glade quad'ı, levelled disk R ≥ 10 (quad R 4.5 → 10), terrazzo | **Hero**: conservatory 4 kapı körfezi = 4 yol; iki yanda 2×3 glasshouse gökkuşağı sırasında; önde "Prizma Güneş Saati" | `conservatory`, `glasshouse` v0–4 (+1 tekrar), `prismSculpture` (saat), `causticDecal` halkası, `glassOrb`, `flowerBed`, `bench`, `lanternPost` | Z2 (kuzey kapı), Z3 (lee kapı), Z4/Z5 (batı kapı), Z6 (doğu kapı) |
| **Z2 Kök Avlusu** | Atelier Tree dibi, zirve | Gece merkezi (Light Night), kanopi vitray altı | `giantTree` v3, `gatherRing` (buraya taşınır), `glassOrb` ×3, `lanternPost` halkası, `bunting` v3 | Z1 kuzey kapısı; treehouse ladder |
| **Z3 Sıcak Atölye Avlusu** | Meydanın lee kenarı (mevcut hot shop mantığı) | Üretim; dumanı glade'den uzak | `hotShop` + clutter (mevcut), `culletCrate` ×3, `sampleShelf`, **baca duman emitter'ı (bug fix)** | Z1 lee kapısı; Z8 |
| **Z4 Prizma Yolu** | İskele → Sera Meydanı batı kapısı (ana giriş), ~30 u | Her 7–8 u'da `prismArch`, altında renkli havuz; arada `stainedScreen` | `prismArch` ×4–5, `causticDecal` (pool, 468 shader'ı yoksa fallback), `stainedScreen` ×2, `flower` serpme | Z5 ↔ Z1 |
| **Z5 Fener Sokağı + İskele** | Batı koyu: iskele, lantern boat, plaj | Gece giriş | `dock`, `sailboat` v4, `lanternPost` **cam varyantı** (5 hue) dizisi iskeleden yola, `glassOrb` ×2 kayada, `buoy` cam varyantı ×3 | Z4 |
| **Z6 Vitray Değirmen Sırtı** | Doğu omzu, çam inceltilmiş açık çayır (meadow boyama) | Değirmen + "renk tarlası lite" + koyunlar | `stainedWindmill`, `flower` hue-cluster scatter, `fence`, `haybale`? (off) → `bench`, `sheep` (life) | Z1 doğu kapısı; Z12 çan yolu |
| **Z7 Heykel Bahçesi** | Batı açıklığı (mevcut) | Mevcut; prizmalar arası | mevcut + `prismSculpture` ×2 | Z4 kavşağı |
| **Z8 Mantar / Işık Korusu** | Mevcut koru, Z3'ün altı | Gece ateş böceği + orb; tilki | `giantMushroom` ×5–7, `glassOrb` (fox), fireflies swarm anchor | Z3, Z10 |
| **Z9 Deniz Camı Plajı** | KD koy kumu (bugün boş) | Kum zeminde cam speckle + glint; `tidePool`, `shell` | ground table `sandWet/sandDry` speckle, `tidePool`, `driftwood` | Z12 çan yolu ucu |
| **Z10 Dere + Cam Köprü + Easel Walk** | Dere, glade'in altından şelaleye | Köprü dere üstünde (span 7 u), easel'lar köprü ile dudak arasında bankta | `glassBridge`, `easel` ×4, `stainedScreen` ×1, `causticDecal` dere yatağında (köprü ışığı) | Z3/Z8 ↔ Z11 |
| **Z11 Şelale Balkonu** | Şelale dudağı (bluff lip) | Bakış noktası; prizma botu; altta gökkuşağı | `bench` ×2, `fence`, `lanternPost`, story `prismRainbow` buraya taşınır, `rainbowArc` (mevcut, denizde) | Z10 |
| **Z12 Cam Çan Yolu** | Z6'dan doğu bluff sırtı boyunca Z9'a inen kıyı patikası | Doğu yarıyı yürünür kılar | `bunting` v3 (cam çan) ×4–6 ağaçlar arası, `lanternPost` cam varyantı, `blossomTree` korusu (çam yerine) | Z6 ↔ Z9 |

Çam inceltme: `pine` scatter kuralına district `avoid` + `density` 0.85 → 0.55; Z1/Z4/Z6/Z12 çevresi 10 u'da pine yok, `blossomTree` cluster'ları kalır; bluff halkası (shore 4–12 u) çam kalır (silüet kenarı).

### 2.3 Fikir kataloğu — Design

| # | Ad (TR / EN) | Pitch | Yer | Tier | Hareket | Wow anı | $ | Agent | Reuse | Def | Risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| D1 | **Sera Meydanı / Conservatory Forecourt** | Quad R 4.5 → 10 levelled terrazzo disk; conservatory ortada, 4 kapı = 4 yol; lot'lar (atelier/gallery) halkaya itilir | Z1 | T0–T1 (sera ≥ 3 u, LOD1 D-031) | — | T0'da **beyaz-cam kubbe** = Design'ın yeni uzak işareti | M | worldgen (467) | `campusQuad` spec `quadR`, `addPad`, `paintZone` plaza | C | Pad 10 u disk kubbe yamacında relief büyük → `maxRelief` 2.5 → 4 + pad; lot sayısı 4–6 düşebilir |
| D2 | **Gökkuşağı Sırası Seralar / Rainbow Glasshouse Rows** | 2 sıra × 3 `glasshouse`, hue sırası sky→mint→pink / violet→amber→sky; içlerinde `flowerBed` aynı hue | Z1 | T2 | — | T1–T2'de "renk tarhı" okunur | S | worldgen | `GLASSHOUSE_HUES` varyantları | C | Sıra paralel pad'ler: `Pad.group` paylaşsın |
| D3 | **Prizma Yolu / Prism Walk** | İskele → batı kapı, `prismArch` ×4–5 her 7–8 u, `hooks.pool` altında renkli havuz (468) | Z4 | T2 | Havuz güneşle kayar (caustics mover reuse) | W23 | M | worldgen + shader (468) + life (mover) | `CULTURE_MOVERS` caustics, `causticDecal` fallback | C | Pool shader yoksa decal; patika eğimi: arch pad'leri 2 u disk |
| D4 | **Prizma Güneş Saati / Prism Sundial** | Meydan merkezinde `prismSculpture` v2 (büyük ölçek 1.4) + 12 küçük `causticDecal` halkası = saat işaretleri; kostik lekesi güneşle halkada dolaşır | Z1 | T2 | caustics mover (TASK-431) | 16:30 prism hour'da leke "16" işaretinde | S | worldgen + life | mover zaten var | C | Prism hour'da ölçek clamp 3 (ISLAND_CULTURES) |
| D5 | **Fener Sokağı / Glass Lantern Lane** | `lanternPost` cam varyantı (5 hue camlı kafes, 2.2 u): iskeleden meydana 8–10 direk; gece **renkli** ışık havuzları | Z5, Z4 | T2 | Flicker | W25'te renkli havuz dizisi | S | props (V) + shader (pool colour by variant) | lantern pools (TASK-305), lamp set | V | T2 +5 LOD0 grubu; LOD1 ortak |
| D6 | **Deniz Camı Plajı / Sea-Glass Beach** | KD koy kumuna ground `speckle` (ROOFS[2], ROOFS[4], FLOWERS[0]) + mevcut glint; `tidePool`, `shell`, `driftwood` | Z9 | T1 zemin, T3 prop | Shore lap (mevcut) | Makro çekimde "cam kırığı kumsal" | S | content (ground table) + worldgen | D-030 layer mekanizması | C | Palette rule ok; speckle amplitude ≤ 1.1 |
| D7 | **Cam Köprü + Dere Kostikleri / Bridge Caustics** | `glassBridge` dere üstünde; köprü altı dere yatağına 3 `causticDecal` (köprü balustrade'inin suya ışığı) | Z10 | T2–T3 | Decal güneşle kayar (mover) | W24 | S | worldgen | `causticDecal` floating? Dere yatağı kara zonu (stream carve) → grounded çalışır | C | Dere köprü için ≥ 7 u düz segment lazım (`resample`); yoksa köprü dere kavşağı yerine glade kenarı hendeği |
| D8 | **Şelale Balkonu / Falls Balcony** | Dudakta `fence` + 2 `bench` + fener; `prismRainbow` story (bot + mini gökkuşağı) buraya; altta `rainbowArc` | Z11 | T2–T3 | Flow, rainbow dither gate | W24 | S | worldgen + life | `waterfalls.ts` lip, story spot | C | Dudak relief; bench pad küçük |
| D9 | **Vitray Değirmen Sırtı / Stained Windmill Meadow** | Doğu omzu meadow boyama (R 12), `stainedWindmill` ortada, `flower` scatter hue-cluster (cluster noise → 5 renk şerit benzeri), `fence`, koyunlar | Z6 | T1 (değirmen 5.8 u; T0 değil) | Rotor `aSpin` (469), koyun | T1'de doğu yarı canlı; dönen vitray | M | worldgen + life | `flower` def 5 varyant, `THEME_LIFE.design` sheep | C | Flower varyantı cluster'a göre seçilebilir mi? (scatter `variantBy: cluster` yoksa S→M) |
| D10 | **Cam Çan Yolu / Chime Walk** | Z6'dan doğu bluff sırtı boyunca Z9'a patika; `bunting` v3 ×4–6 ağaçlar arası (bugün 2–3), cam fenerler | Z12 | T2 | Flutter ×2 gust | Gust geçince çan dizisi dalgalanır | S | worldgen | `chimes` sayısı, `pathLink` | C | Patika bluff dudağına yakın: `pathSparesSlopes` |
| D11 | **Kök Avlusu / Root Yard** | `gatherRing` ağaç dibine; 3 `glassOrb` + `lanternPost` halkası + `bunting`; Light Night ritüeli burada başlar (hash halkaları ağaçtan dışa) | Z2 | T2 | Light Night (mevcut relay) | W17'nin ön planı dolar | S | worldgen | `gather` ring param → tree anchor | C | `landmarkAccess` hub ile çakışma |
| D12 | **Mücevher Ada Lamba Seti / Jewel Lamp Set** | `rhythm.design.lamps.defs` ← `conservatory`, `glasshouse`, `prismArch`, `stainedWindmill`, D5 fenerleri; 20:00→06:00, ramp 30 s | tümü | T1–T2 | Ramp | W25; T0'dan **çok renkli tek ada** (§2.6 hedefi) | S | content | D-052 | C | Emissive panes 465'te `emissive: 1` → hazır |
| D13 | **Sera Kelebek Evi / Butterfly House** | Butterfly spawn anchor'ı conservatory + glasshouse sıraları (bugün: çiçekler); 8–12 kelebek gündüz sera çevresinde figure-8 | Z1 | T2 | #16 | T2'de sera "yaşıyor" | S | life | TASK-332 butterflies (particle, agent değil: `LIFE.butterflies` 6/10/16) | C | Agent cap'e girmez; sayı kalite tablosundan |
| D14 | **Sera Kapısı Kedisi / Doorway Cat** | Güney kapı körfezinde güneşlenen spot cat; gece sera içi ışığına kıvrılır | Z1 | T3 | Sleep cycle | Makro: cam + kedi | S | life | `SPOT_CRITTERS` cat, story kind yeni | C | — |
| D15 | **Bahçıvan Botu / Gardener Tableau** | Glasshouse sırasında `stand` pose + crate item (fide kasası), ikinci bot `paint` pose ("boyama" değil "sulama": item paintPot) | Z1 | T3 | Tableau | T3 hikâye | S | life | TABLEAU, CARRIED_ITEM_SLOT crate / paintPot | C | tableau cap 5/ada (medium) → öncelik sırası |
| D16 | **Fırın Dumanı Fix / Hot Shop Smoke** | Hot shop bacası 0 particle (TASK-420…426 follow-up): `fixtureEmitters` + `addChimney` hook; ayrıca fırın ağzı emissive gündüz 0.6 → T2'de kor görünür | Z3 | T2 | #20 smoke, lava glow #22 | Hot shop artık "gri tezgâh" değil | S | engine/life | `puffs.setEmitter`, EMISSIVE lava | C | Bug fix; particles bütçesi geniş |
| D17 | **Kor Parça Isı Döngüsü / Gather Heat Cycle** | Gaffer botunun borusu ucunda emissive damla `#FF6A3D` → `#F5C84C` → cam rengi (40 s döngü) — ISLAND_CULTURES'ta tarif edilmiş, bugün yok | Z3 | T3 | Emissive uniform döngüsü (aSeed phase) | 21 u'da sıcaklık | M | life + shader (creature program mode 8 item) | carried item blowpipe (slot 13) | C | Creature program 15/16 attr; renk döngüsü uniform + hash ile, attr eklemeden |
| D18 | **Cam Şamandıralar / Glass Float Buoys** | `buoy` cam-küre varyantı (violet/sky/amber) ×3 iskele yaklaşımı + lantern boat ring'inde 4; gece hafif emissive | Z5 (su) | T2 | Swell bob | Gece koyda renkli noktalar | S | props (V) + worldgen | `buoy`, `FLOATING_FIXTURES` | V | Ring 30 u dışarı: fade mesafesi |
| D19 | **Ayna Gölet / Mirror Pond** | Meydan önünde `reflectingPoolEdge` (Coding def'i) + terrain-painted su blob + `lilyPad`; "Fener Ormanı" yönünden alınan tek parça | Z1 güney | T2 | Ripples | Gece fenerlerin "yansıması" — **yansıma yok** (TASK-353 pending) | M | worldgen | Coding pool mekaniği (MEMORY: blob kerb'i doldurmuyor) | R | Yansıma olmadan göl = koyu disk; §6 S5 |
| D20 | **Blossom Koruları Çamın Yerine / Blossom Groves** | `pine` density 0.85 → 0.55 + district avoid; Z4/Z6/Z12 çevresi `blossomTree` cluster; bluff halkası çam kalır | tümü | T0–T1 | Sway | T0'da ada "pembe-beyaz-yeşil" olur, Research'ten ayrılır | S | worldgen (content scatter) | scatter kuralları | C | **TASK-464**: T0 blob renkleri karışık pine/blossom hücrelerde soluyor → bu paket 464'e bağlı |
| D21 | **Vitray Kapı Rozetleri / Door Rosettes** | `atelier` ve `galleryPavilion` kapı üstü yuvarlak vitray (0.7 u) geometri varyantı (`stained` tag) — ISLAND_CULTURES'ın "boğa gözü" | lot'lar | T2 | stained (güneş + gece) | T2'de her bina "cam" | S | props (V) | `tagStained`, atelier variants | V | LOD0-only fark → LOD1 ortak, T2 +0–2 grup |
| D22 | **Gece Fener Kayığı Turu / Lantern Boat Loop** | Lantern boat ring'i (30 u) iskele önünden geçsin; 20:00'de iskele fenerleri + kayık fenerleri aynı ramp | Z5 | T1–T2 | Ring (D-054) | W25 arka plan | S | life | `boats-culture` ring param | C | — |
| D23 | **Relay: Sera Kubbesi Palet Döngüsü / Dome Palette Cycle** | 21:00 Design adımında conservatory feneri 7 accent'i sırayla (10 s) — kanopi vitrayı için planlanan (§2.6) kubbeye de | Z1 | T1 | Emissive uniform per def | W15'te Design "takımadanın paleti" | M | shader + engine | D-052 relay clock; per-def emissive hue uniform yeni | C | Per-def uniform = aynı program, ek uniform; `aSpin.w` tag ile seçilir |
| D24 | **Easel Walk Taşınır / Easel Walk on the Falls Reach** | Easel'lar köprü ile dudak arasında, suya bakar; `stainedScreen` araya; bank patikası balkona bağlanır | Z10 | T2 | — | W24'te easel + köprü + şelale tek karede | S | worldgen | `easelWalk` `from` param = köprü | C | Dere eğimi: `maxRelief` 2 |
| D25 | **İkinci Gökkuşağı / Second Rainbow** | İkinci şelale varsa (count 1–3) doğu şelalesinde ikinci `rainbowArc` (T1 def, +1 LOD1 grup W11'de görünür) | doğu bluff | T1 | Dither gate | T0–T1'de iki yay | S | worldgen | `rainbow` scan `count: 2` | C | W11 +2 call (yay + gölge yok) → §6 S7 |

Yeni def gerektirenler (tavan 15 dolu, §6 S6): `glassLanternPost` (D5 varyantla çözülür), `seaGlassScatter` (D6 ground layer ile çözülür). `lilyPad`, `tidePool`, `driftwood`, `shell`, `buoy` mevcut def'ler. Bu etütte **0 yeni def** varsayımıyla her madde yapılabilir.

### 2.4 Wow çekimleri — Design

| ID | Çekim | Seed · kamera · zaman | Pass kriterleri |
|---|---|---|---|
| W23 | **Sera Prizma Saati / Conservatory Prism Hour** | 1001 · raw cam Prizma Yolu'nun batı ucundan seraya, ≈ 45 u, alçak (pitch ≈ 18°) · 16:45 + simt 4 | ≥ 3 renkli havuz patikada, hue'ları farklı (ΔE > 20); sera kubbesi bütün, ≥ 8 pane güneşle içten aydınlık (`stained`); ≥ 2 glasshouse sırası kadrajda; Atelier Tree kanopisi serayı aşıyor (P2); batıya uzun gölgeler; ≤ 280 calls |
| W24 | **Cam Köprü Şelalesi / Glass Bridge Falls** | 1001 · raw cam denizden şelaleye, ≈ 42 u, hafif yukarı · 17:00 + simt 4 | Şelale şeridi dudaktan suya kesintisiz; köprü dudağın üstünde, balustrade panelleri ≥ 3 renk; `rainbowArc` ≥ 4 bant denizde; balkonda bench + bot; easel ≥ 1; köpük diski + mist; iki kare (0.5 s) arasında flow streak kaymış |
| W25 | **Mücevher Sera Gecesi / Jewel Conservatory Night** | 1001 · raw cam KB'dan meydana, ≈ 70 u · 20:30 + simt 30 (Light Night'ın ortası) | Sera + ≥ 4 glasshouse + değirmen kanatları yanık, **≥ 5 hue**; fener sokağı ≥ 4 renkli havuz; ağaç kanopisi vitray ≥ 6 panel; ≥ 10 ateş böceği koruda; lantern boat iskelede yanık; land L ≥ 0.12; arkada başka ada yok |

### 2.5 Paketler — Design

| Paket | İçerik | Bağımlılık | Agent | Doğrulama |
|---|---|---|---|---|
| **M20-core Design** (TASK-467) | D1 meydan + sera, D2 sıralar, D3 arch dizisi, D7 köprü, D9 değirmen (yer), D20 çam inceltme (ilk kademe) | 465 ✓ (D20 tam hâli 464'e bağlı) | worldgen | plan testleri, `ladder:design`, D-culture-design re-pin |
| **M20-core Design shader** (468) | D3 pool'lar, sera cam (stained + gece), D23 opsiyonel | 467 | shader | W23, W25 |
| **M20-core Design life** (469) | Değirmen rotor, D4 güneş saati mover bağlama, D16 duman fix | 467 | life | delta kareler |
| **Design+1 "Bahçe"** | D4 güneş saati, D8 balkon, D10 çan yolu, D11 kök avlusu, D24 easel taşıma, D6 plaj, D25 ikinci gökkuşağı (karar) | 467 | worldgen + content | L-design drift ≤ 4; W11 ≤ 150 |
| **Design+2 "Cam Gecesi"** | D5 fener varyantı + havuz rengi, D12 lamp set, D18 şamandıra, D21 rozetler, D22 kayık turu | 468 | props (V) + shader + content | W25, W15, W17 |
| **Design+3 "Hayat"** | D13 kelebekler, D14 kedi, D15 bahçıvan, D17 kor döngüsü | 469 | life | agent cap, tableau cap |
| **QA** (470) | W23–W25 preset, `--assert` ×3, L-design ladder (pair 380 blob — 464), 10-seed sweep: her seed'de sera + ≥ 4 glasshouse + köprü yerleşmiş | hepsi | qa | contact sheet |

### 2.6 Kullanıcıya sorular — Design

| # | Soru | Seçenekler |
|---|---|---|
| S1 | Sera nereye? | (a) **Glade quad'ının yerine** (R 10 pad, lot'lar halkaya); (b) Glade'in altında yeni teras (zirve–şelale arası), glade atölye avlusu kalır; (c) Zirvede ağacın yanı (P2 ihlali — önerilmez) |
| S2 | Glasshouse düzeni | (a) **2 sıra × 3, gökkuşağı sırası, meydanın iki yanı**; (b) 5 adet dağınık (her biri bir patika kavşağında); (c) Tek uzun sıra doğu sırtında değirmene kadar |
| S3 | Çam inceltme derecesi | (a) %35 (density 0.55) + district avoid; (b) **Çam sadece bluff halkasında, iç kubbe blossom + açık çayır**; (c) Dokunma (TASK-464 bitene kadar) |
| S4 | Prizma Yolu güzergâhı | (a) **İskele → sera** (giriş aksı); (b) Ağaç → sera (zirve inişi); (c) Sera çevresinde halka (4 kapı arası) |
| S5 | Ayna gölet (D19) | (a) Evet, yansımasız da olsa koyu disk + lily pad; (b) **Hayır**, TASK-353 (reflections) bitince; (c) Yerine sera içi gölet yeter |
| S6 | Design def tavanı 15 doldu | (a) **15'te kal** (varyant + reuse); (b) 17: `glassLanternPost` + `lilyPad`; (c) 18+: ek cam prop'lar (cam heykel bahçesi) |
| S7 | İkinci gökkuşağı (D25) | (a) Tek (şimdiki); (b) **İki** (+2 call W11); (c) Seed'e göre 1–2 |
| S8 | Değirmen yeri | (a) **Doğu sırtı çayırı** (D9); (b) Şelale dudağı, köprünün yanı (su + rüzgâr tek karede); (c) Sera meydanının köşesi |

---

## 3. Ortak notlar ve sıra

- **Sıra**: 466 ∥ 467 (worldgen, ayrı dosyalar `plans/hq.ts`, `plans/design.ts`, content `themes/*`, `cultures/*`) → 468 ∥ 469 → 470. HQ+1 ve Design+1 worldgen paketleri 466/467 ile aynı dosyalara dokunur → **sıralı**, aynı agent'a. +2 paketleri (props varyant + shader + content) paralel; +3 life paralel.
- **TASK-464 bağımlılığı**: Design çam inceltme (D20) ve T0 blob renkleri birlikte; HQ'nun doğu tepesi ağaçları da `roundTree` → blob rengi tek tür, sorun yok.
- **W11 koruması**: her iki adada T0–T1'de yeni LOD1 grubu yalnızca `conservatory`, `stainedWindmill`, `semaphoreTower`, `rainbowArc` ×2 (karar). Far merge (D-049) sayesinde T0–T1 çağrı artışı ≤ +4.
- **Hash re-pin**: her iki plan değişikliği height (pad'ler) / zone / sites / routes / props hash'lerini değiştirir; diğer adalar değişmez (D-044 fork). Seed 1001 raw cam'ler (W16, W17, W19, D-culture-*) re-pin.
- **Bu belgeden ART_BIBLE'a**: §4 roster satırları (Hearthholm "crescent crossroads", Mossgrove "glass conservatory"), §11 W20–W25, §12.1 kit tabloları (HQ 12, Design 15) ve lamp set satırları; DECISIONS'a kullanıcı cevaplarıyla D-058 (sokak/su kuralı, semafor kotu, tavan).
