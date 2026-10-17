# Coding · DevOps · QA — remake çalışması (araştırma + tasarım)

> Tarih: 2026-10-17. Kapsam: Millbrook / Rüzgâr Bahçeleri (Coding), Emberpeak / Kor Demircileri
> (DevOps), Palmlagoon / Müfettişler Adası (QA). Kod değişikliği yok; D-057'nin HQ/Design için
> yaptığı çerçeveyi üç adaya uygular. Kaynaklar: `plans/{coding,devops,devops-works,qa}.ts`,
> `content/themes/*`, `content/cultures/*`, ART_BIBLE §4/§6/§11/§12, ISLAND_CULTURES §2.2/2.3/2.5,
> ladder kareleri `shots/ladder-study/L-*` (seed 1001, 700 → 21 u) ve `shots/ladder-t451` (M19 QA,
> aynı seed; piksel düzeyinde aynı kompozisyon), wow W5/W6/W7/W18.

## 0. Ortak çerçeve ve bütçe gerçeği

| Kural | Değer | Kaynak |
|---|---|---|
| Kültür def tavanı | 10 yeni def / ada, ≥ %70 tier 2–3, ≤ 1 tier 1, 0 tier 0; **varyantlar sayılmaz**; başka adanın def'ini yeniden kullanmak sayılmaz (DevOps CI/CD belt = QA `conveyor` emsali) | D-050, `budgets.cultureDefsPerIsland` |
| Tavan aşımı | `budgets.cultureCapOverride` ile ada başına (HQ 12/1, Design 15/2) | D-057 |
| Draw call | tier 0/1 def = W11'e +2 (LOD1 + shadow); tier 2/3 def = W11'e 0, T2/T3 bakışta +2 (noShadow ile +1); medium W11 146/300 (far merge sonrası, D-049) | ISLAND_CULTURES §4.1 |
| Hareket | agent yok (cap 60); mover = closed-form (`render/movers.ts`, `culture-movers.ts`: bell / crane / kite / lift / horn / confetti / flag / ant / balloon sahneleri) veya `aSpin.w` tag (spin, yaw, screen kinds, flow) | B8, D-034, D-041 |
| Zemin | `GroundSpec.layer` (tile / speckle / mow / ripples / cracks); `stripe` layer yazılmadı (edge-aware zemin gerek, TASK-440) | B9 |
| Arazi | archetype şekli `content/islands.ts` (bluff, shelves, profile anchors); id / çap / reach korunursa diğer adalar yerinden oynamaz (D-043); büyürse seed 1001 yeniden merkezlenir (D-046) | — |
| Işık | per-island lamp set + relay adımı (Coding 4 kiteDay, DevOps 2 releaseNight, QA 3 greenLightCeremony) | D-052 |

Maliyet ölçeği: **S** = 1 agent, < 1 gün, tek dosya; **M** = 1–2 agent, 1–2 gün, plan + geo; **L** = arazi /
shader / mover zinciri, 3+ gün, hash re-pin. "Bütçe riski" = kültür tavanı ve W11 call'ı.

---

## 1. Coding — Millbrook · Rüzgâr Bahçeleri (Wind Gardens)

### 1.1 Şu an

Plato 80–110 u, 5–6 u bluff, 10–12 u tepe. Plan: pond → Tech Park (çim quad, ikiz havuz, dev ördek),
knoll'larda 3 türbin, patch grid → solar blokları, Server Yard, Hack Garden `{ }`, uçurtma tarlası, lee iskele.

| Tier | Okunuyor | Zayıf |
|---|---|---|
| T0 700/480 | açık yeşil lozenge, 3 beyaz türbin, mavi solar lekeler, mavi havuz noktası | ikinci siluet yok; sıcak aksan yok (sarı `#F5C84C` sadece T2'deki ördekte); ada "çim + mavi kutu" |
| T1 340–170 | bluff duvarları, türbinler, mavi çatılı kutular, batı şelalesi, solar grid'ler | kutular aynı dil (devOffice / devPod / serverShed = düz çatı + cam bant); solar bloğu 4–6 kez aynı damga; patikalar soluk; kıyıda hiçbir şey yok; batı lobu 2 pod, kuzeydoğu türbin dibi boş |
| T2 120–60 | pergola masalar, ikiz havuz + dev ördek, çit bahçesi, çan pagodası, hamaklar, bisiklet rafları | yoğunluk yalnız park içinde; uçurtma tarlası rüzgârüstü kenarda küçük ve tek başına; çitler tekrar; türbin diplerinde hamak dışında hikâye yok |
| T3 42–21 | ördekler, kupalar, tahta karalaması, masadaki botlar, biçme şeritleri | park dışı T3 = yonca + tutam; rüzgâr adası ama rüzgâr görünmüyor (sadece türbin ve uçurtma) |

**Kullanılmayan / tekrar eden kara:** plato alanının ~%55'i çim ya da solar; bluff çevresi hiç kullanılmıyor
(rim'de yürüyüş yolu, korkuluk, seyir noktası yok); batı lobu ve kuzeydoğu çeyreği boş; iskele tek çizgi.
Ada "sakin" olmalı ama şu an "boş".

### 1.2 Yön önerileri

**A · Uçurtma Tepesi ve Rüzgâr Tüneli (Kite Hill & Wind Tunnel).** Rüzgârı görünür kıl. Rüzgârüstü
kenarda 4–5 u yükselen bir "uçurtma tepesi" (profile knoll, `millbrook.terrace` ile uyumlu) çan türbinini
taşır; eteğinde 8–12 direkli uçurtma çayırı ve bir "ana uçurtma treni"; sırt boyunca kafes yarım-tüp bir
rüzgâr tüneli (bir ucunda dev fan, içinde yatay uçan rüzgâr tulumları) test galerisi; yollar boyunca rüzgâr
tulumu bulvarı, çatılarda fırıldak, boş çimlerde fırıldak çayırı. T0'a sarı/mavi uçurtma noktaları ve
tepe silüeti gelir; T2–T3 her gust'ta "dalga" geçer. Heightfield küçük değişir (knoll), hash re-pin.

```
            rüzgâr →
   ┌───────────────────────────────────────────┐
   │ KITE HILL (+4u)   ~~~ wind tunnel ~~~ fan │ ← sırt
   │  ▲chime  ✈✈✈✈✈ kites                     │
   │  hammocks   pinwheel meadow ░░░░░░░░      │
   │        ┌────────────┐   solar ▦▦ ▦▦       │
   │ pods   │ TECH PARK  │ hack {  } garden    │
   │  ▭ ▭   │ pools+duck │                     │
   │        └────────────┘  windsock avenue ⌇⌇ │
   │  west lobe: nap grove  ⌂ server cave      │
   └──────────────────┬────────────────────────┘
                   pier (lee)
```

**B · Kanal Kampüsü (Branch Canal Campus).** "Git" haritası suya çevrilir: iskeleden platonun ortasına
3 u genişliğinde sığ bir ana kanal (ikiz havuzun `Zone.crater` boyası + kerb), iki "feature branch" kanalı,
"merge" noktalarında yaya köprüleri, bir "merge gate" savağı. Kanal boyunca pod sıraları, kanal üstü pergola
masalar, batı lobu "feature branch marina" (mavi build skiff'leri). 11:00 ve 16:00'da lastik ördek yarışı
(mover). Turkuaz adanın içine girer; T0 silüetine mavi bir damar, T1'e köprüler, T2'ye yüzen ördekler gelir.
Heightfield + patika A* değişir, en pahalı yön ama en ayırt edici.

```
   ┌───────────────────────────────────────────┐
   │ ▲ turbine     solar ▦▦      ▲ turbine     │
   │     ═══ branch A ═══╗                      │
   │  pods ▭▭▭          ║ merge bridge          │
   │ ╔══════ MAIN CANAL ═╬════ pools+duck ══╗   │
   │ ║ marina (skiffs)   ║                  ║   │
   │ ║ west lobe    ═════╝ branch B    lock ▮   │
   │ ╚═ pier                     hack garden    │
   └───────────────────────────────────────────┘
```

**C · Terasli Kod Bahçeleri (Terraced Code Gardens).** Düz platoyu 3 yumuşak terasa böl (archetype
`terrace.step 2` zaten var; `strength` 0.3 → 0.8 + plan pad'leri). Her teras bir "katman": üstte türbinler ve
kuluçka seraları (Design `glasshouse` def'i, mavi pane varyantı), ortada park, altta bluff kenarına oyulmuş
yarım daire "Demo Day" amfisi (Research `lectureSteps` + ekran). Boş çimler T1'den okunan dev `{ }` `< >`
çit glifleri ve wisteria pergola yürüyüşüyle dolar. En yeşil, en "bahçe" yön; arazi değişimi en az (teras
kuvveti + pad'ler), bütçe en düşük (çoğu mevcut def / varyant).

```
   ┌───────────────────────────────────────────┐
   │ T3 (üst)  ▲ ▲ turbines   ⌂⌂⌂ glasshouses  │
   │ ─────────────── step 2u ──────────────── │
   │ T2 (orta)  hedge glyph  {   }  < / >      │
   │            TECH PARK  pools + duck         │
   │ ─────────────── step 2u ──────────────── │
   │ T1 (alt)  pergola walk ≋≋≋  nap grove     │
   │     ◠◠◠ DEMO DAY amphitheatre (bluff lip) │
   └──────────────────┬────────────────────────┘
                     pier
```

### 1.3 Fikir kataloğu

| # | Ad (TR / EN) | Pitch · nerede | Tier | Hareket · wow anı | Maliyet · agent | Reuse · bütçe riski |
|---|---|---|---|---|---|---|
| C1 | Rüzgâr Tüneli / Wind Tunnel Gallery | 14 u kafes yarım-tüp, bir ucunda 3 u fan, içinde 5 rüzgâr tulumu; sırt boyunca, türbinlerin arasında (A) | 1 | fan `aSpin.w = 1` rüzgârla döner; tulumlar `windy`; **wow:** gust'ta tulumlar yatay uçar, fan hızlanır | M · props + worldgen | windTurbine spin tag, bunting katener; **tier-1 slotu** (giantDuck T2'ye inmeli ya da override 12/2) |
| C2 | Uçurtma Tepesi / Kite Hill | rüzgârüstü +4 u knoll; çan türbini üstüne, 8–12 uçurtma direği eteğe, tepe yolunda bank (A) | 1 (arazi) · 2 (kit) | `kiteScene` mover; **wow:** 14:00 Kite Day'de hepsi birden kalkar, biri tepede takılı kalır | M · worldgen | kite v0–2, kiteRack, profile knoll anchor; 0 yeni def; hash re-pin |
| C3 | Ana Uçurtma Treni / Mother Kite Train | 20 u yukarıda 7 uçurtmalık tren (sky-craft deseni, Coding üstünde orbit) | sky-craft (ledger dışı) | `sky-craft.ts` orbit; **wow:** T0'da adanın üstünde mavi-sarı nokta dizisi | M · props + life | balon/airship pipeline (D-038); W11 +1 call |
| C4 | Fırıldak Çayırı / Pinwheel Meadow | boş çimlere 6×8'lik fırıldak sıraları, çatı paleti renkleri (A/C) | 3 noShadow | spin tag + faz = world x; **wow:** gust dalgası çayırdan geçer | S · props | grass wind wave; ground-cover cap'i (`scatter` yoğunluk) |
| C5 | Dal Kanalı / Branch Canal | iskele → havuzlar 3 u sığ kanal + 2 dal, kerb, 2 yaya köprüsü, 1 savak (B) | 1 | ripples layer; **wow:** T0'dan mavi damar, T2'de köprü altında ördekler | L · worldgen + shader | `Zone.crater` havuz boyası, reflectingPoolEdge, dock plank; A* / pad yeniden yönlenir, hash re-pin |
| C6 | Ördek Yarışı / Duck Race | 6 lastik ördek kanal boyunca akar, savakta bob (B) | 2 | culture-movers (ant sahnesi gibi closed-form); ritüel 11:00 / 16:00 | S · life | rubberDuck geo; 0 def |
| C7 | Kuluçka Seraları / Incubator Glasshouses | 3 Design `glasshouse` (mavi pane varyantı) + fide tepsileri; türbin terası (C) | 2 | gece cam parlar (lamp set); **wow:** 19:30 mavi-beyaz cam sırası | S · worldgen | glasshouse (TASK-465), 0 def; Design LOD1 grubu paylaşılır |
| C8 | Demo Günü Amfisi / Demo Day Amphitheatre | bluff kenarına oyulmuş yarım daire basamak + ekran (screen kind `code`) + kürsü (C) | 1 | 17:30 tableau botlar oturur, ekran slayt; **wow:** altın saatte deniz fonu önünde demo | M · worldgen + props | lectureSteps, billboard screen tag; tier-1 slotu |
| C9 | Çit Glifleri / Hedge Glyphs | SE boş çimde T1'den okunan 6 u `{ }` ve `< / >` çit harfleri (C) | 2 | — ; **wow:** 240 u'dan kod gibi okunur | S · worldgen | hedge v2 bracket varyantı; 0 def |
| C10 | Sunucu Mağarası / Server Cave | bluff duvarına oyuk, içinde ışıklı rack ağzı; yanında "su soğutma" şelalesi | 1 (varyant) | rack LED tag, şelale flow tag; **wow:** gece duvarda mavi parıltı + sis | M · worldgen + props | serverShed varyantı, waterfalls.ts; cliff oyma = Zone.cliff dokunuşu |
| C11 | Rüzgâr Tulumu Bulvarı / Windsock Avenue | patikalarda 2.2 u direkli tulumlar; pod çatılarında rüzgâr gülleri | 2 / 3 | `windy`; yön = `ctx.windDir`; **wow:** tüm tulumlar aynı yöne, farklı fazda | S · props | lanternPost direği; 1 def (windsock), vane = devPod varyantı |
| C12 | Bisiklet Turu / Bike Loop | park çevresinde bisiklet şeridi (path paint) + 2–3 bisikletli bot mover | 2 | QA test-cart deseni; **wow:** zil "ding" ring'i | M · life | movers.ts, bikeRack geo; 0 agent |
| C13 | Peri Işıklı Koru / Fairy-light Grove | quad ucu ağaçlarına 19:30'da yanan lantern-pool noktaları | 2 | lamp set; **wow:** W3 tarzı sıcak nokta bulutu | S · shader + props | roundTree emissive varyantı; 0 def |
| C14 | Türbin Uç Işıkları / Turbine Tip Lights | 18:45'ten itibaren kanat uçlarında 1 s kırmızı blink | 0 (varyant) | emissive tag; **wow:** gece T0'da üç kırmızı yanıp sönme | S · shader | windTurbine LOD1 aynı; 0 def |
| C15 | Hamak Korusu / Nap Grove | batı lobu: 6 hamak ağaç arası, kupalar, bir sincap | 2 | hammock bob; story `hammockNap` ×3 | S · worldgen | hammock, mugStack, roundTree; 0 def |
| C16 | Build Skiff | mavi skiff (sailboat varyant) Coding iskelesi → QA iskelesi ring/polyline, mavi kasa taşır | 1 (tekne) | `boats-culture` ring deseni; **wow:** QA'ya kasa teslimi | S · life | QA inspection boat emsali (D-054); 0 def |
| C17 | Ördek Feneri / Duck Beacon | iskele başında lastik ördek biçimli şamandıra feneri, 2 s blink | 2 | emissive flicker | S · props | buoy + rubberDuck; 1 def ya da buoy varyantı |
| C18 | Rim Seyir Yolu / Rim Walkway | bluff dudağı boyunca patika + korkuluk + 2 bank; Coding'de ahşap, diğer adalarda kendi diliyle | 1 (zemin) · 2 (post) | — ; **wow:** T1'de plato kenarı çizgilenir, boş kenar dolar | S · worldgen | fence def; 0 def |

### 1.4 Wow çekimi

| ID | Çekim | Kamera · zaman | Kabul |
|---|---|---|---|
| W20 | **Kite Hill Afternoon** | raw cam lee tarafından alçak, park üstünden tepeye, ≈ 70 u · 14:00 +20 s | ≥ 6 uçurtma havada, çan türbini + tünel/fan kadrajda, rüzgâr tulumları aynı yöne, tepe silüeti gökyüzüne karşı; ≤ 270 call |
| W21 | **Canal Night** (B) / **Demo Day Golden** (C) | T2 60 u · 21:30 (B: pergola lambaları ve peri ışıkları kanalda yansır) · 17:45 (C: amfide ≥ 4 tableau bot, ekran yanık, deniz fonu) | ≥ 8 bloomed emissive; land L ≥ 0.12; (C) ekran slaytı iki kare arasında değişir |

### 1.5 Paketler

| Paket | İçerik | Tahmin |
|---|---|---|
| Quick wins (yönden bağımsız) | C4 fırıldak çayırı, C9 çit glifleri, C11 tulum bulvarı, C13 peri ışıkları, C14 uç ışıkları, C15 hamak korusu, C18 rim yolu | 5–6 S, 1 hafta, +2 def |
| Signature (yöne göre) | A: C1 + C2 + C3 · B: C5 + C6 + C16 · C: C7 + C8 + C9 | A ≈ 2 M + 1 M · B ≈ 1 L + 2 S · C ≈ 2 M + 1 S |
| Ambitious | C10 sunucu mağarası, C12 bisiklet turu, C17 ördek feneri, W20/W21 presetleri, ladder L-coding re-pin | 2 M + 1 S + qa |

### 1.6 Kullanıcıya sorular

1. **Yön:** A Kite Hill & Wind Tunnel · B Branch Canal · C Terraced Code Gardens · A+C (tepe + teras, kanal yok)?
2. **Arazi:** heightfield değişebilir mi (knoll / kanal / teras → hash re-pin, seed 1001 kamera düzeltmeleri)? Evet / sadece pad düzeyi / hayır.
3. **Tier-1 slotu:** giantDuck T1'de kalsın mı, yoksa slot C1 tünel / C8 amfiye mi geçsin (ya da override 12/2 gibi)?
4. **Solar çiftliği:** şu anki boyutta kalsın · yarıya insin (yer açılır) · tek büyük blok + çatı panelleri?
5. **Gece kimliği:** soğuk mavi-beyaz monitör ışığı (şu an) · sıcak peri ışıkları · ikisi (park sıcak, sunucu mavi)?
6. **Gökyüzü:** C3 uçurtma treni Hype Fleet'e eklensin mi (W11 +1 call)?

---

## 2. DevOps — Emberpeak · Kor Demircileri (Ember Smiths)

### 2.1 Şu an

Koni 34–36 u, 90–120 u çap; koni dibinde üç raf: harbour (lee, kuzey-batı), foundry (iki basamak),
datacenter (iki basamak) + hot-spring santrali. Plan: konteyner avlusu + vinç + kule, CI/CD bandı,
fırın salonları + ray + demirciler, data center'lar, ops quad, anten sırtı, onsen, boru hatları, lav fenerleri.

| Tier | Okunuyor | Zayıf |
|---|---|---|
| T0 700/480 | siyah koni + buhar sütunu + gri soğutma kulesi + turuncu çatı noktaları — rosterin en güçlü silüeti | koni alanın ~%70'i, tekdüze koyu; tesisler dibe yapışık ayrı noktalar; turuncu glow sadece gece |
| T1 340–170 | liman avlusu (konteyner, vinç, kule) çok iyi; fırın salonu + bacalar; soğutma kuleleri; bluff duvarları | üst koni boş bazalt + kaya + minik vent; üç raf birbirine görsel bağlı değil (yol/ray yok); turuncu çatılı cottage lodge'lar üç rafta aynı; kaplıca küçük teal leke; krater içi görünmez; rim'de tuhaf çim lekeleri |
| T2 120–60 | rıhtım makineleri, lav fenerleri, onsen deck + capybara, külçe yığınları, volanlar, borular artık eğimli | koni yamacı T2'de boş; borular ince; demirciler sıradan; incident sign'ı bulmak zor; anten direkleri kule gibi değil çubuk gibi |
| T3 42–21 | pager rock + yengeç, örs, perçinli konteyner, külçe ısısı | bazalt T3'te düz koyu yüzey (cracks zayıf); siyah kum sadece koyda; kıvılcım yok |

**Kullanılmayan kara:** tüm üst koni (raf üstü 8–30 u), rüzgârüstü yamaç ve kıyı (raf yok, plaj yok),
krater çanağı, adanın çevre denizi (yalnız kargo döngüsü). Ada "fabrika" ama üretim hattı tek bakışta
izlenemiyor: ne nereden geliyor, nereye gidiyor okunmuyor.

### 2.2 Yön önerileri

**A · Lav Nehri ve Kor Köprüleri (Lava River & Ember Bridges).** Krater çentiğinden rüzgârüstü yamaca
görünür bir lav kanalı; bir "lav şelalesi" (waterfall flow tag, lav rengi), denize girdiği yerde buhar
bulutu ve siyah cam deltası, deltada obsidyen plajı ve bazalt sütun kıyısı. Kanalı ray köprüsü (ember bridge)
ve yaya köprüsü aşar; kanal kenarında lav-cam ocağı (fenerlerin kaynağı). Koni, gündüz turuncu kurdeleyle
T0'dan okunur; gece ada kendi kendini aydınlatır. Zemin emissive gerektirir (shader) ya da kurdele prop
olarak gider.

```
                 crater ◉ notch
        windward  ╱ lava river ╲   lee
   quarry ▣ ════╱═ ember bridge ═╲════ rail → foundry
          ╱ lava fall ↓            ╲
   basalt columns ▮▮▮ ∿ steam delta ∿   data center ▭▭
   obsidian beach ░░░                    plant ◍◍ onsen
                 harbour ▦▦ crane ┼ pier
```

**B · Vardiya Hattı / Funicular Works.** Üç rafı ve krateri birbirine bağlayan spiral servis rayı /
füniküler: her rafta istasyon, zirvede "uptime çanı" olan nöbet kulesi (antenna mast'ler buraya toplanır),
switchback'lerde lav fenerleri (gece koniyi zigzag noktalar çizer), iki kabin mover olarak iner-çıkar, cevher
teleferiği (HQ `mailLine` pylon + kova) ocaktan dökümhaneye. Arazi değişmez; koni "kullanılır". Üretim
hattı okunur: ocak → teleferik → fırın → ray → rıhtım → gemi.

```
                   ◉ summit station + uptime bell
                  ╱ ╲  switchback lanterns ·  ·  ·
          ·  · ╱     ╲ · funicular rail
   data center ▭╱       ╲═ cableway ═ quarry ▣
      station ▭           ╲
      plant ◍◍ onsen       ▭ station — foundry ▣▣ rail
             harbour ▦▦ crane ┼ pier  ← ships
```

**C · Buhar Vadisi ve Onsen Kasabası (Steam Valley & Onsen Town).** Kaplıca tarafı buharlı teraslı vadi:
üç renkli fumarol havuzları, zamanlı gayzerler, buhar vent sıraları, havuz üstünde kazıklı 3 hamam evi
(onsenHouse varyantları), havlu ipleri, capybara ailesi, soğutma kulesi meydanı. "Ops" kültürünün dinlenme
yüzü; gündüz T0'da geniş beyaz buhar alanı, gece sıcak buğu + fener. Ada yumuşar, şirinleşir; sanayi tarafı
olduğu gibi kalır.

```
            crater ◉ plume
     geysers ⌇ ⌇ ⌇  steam valley  vents ∴∴∴
   ◍ cooling   ⬭ teal pool   ⬭ sulphur pool   ⬭ pink pool
   ◍ tower   ⌂ onsen house  ⌂  ⌂  (stilts)  towel lines ⌇
             data center ▭▭ terrace
   foundry ▣▣ rail ═══         harbour ▦▦ crane ┼ pier
```

### 2.3 Fikir kataloğu

| # | Ad (TR / EN) | Pitch · nerede | Tier | Hareket · wow anı | Maliyet · agent | Reuse · bütçe riski |
|---|---|---|---|---|---|---|
| D1 | Lav Nehri / Lava River | çentikten rüzgârüstü yamaca 3 u kanal: zemin zonu `lava` (yeni ground spec, emissive `#FF6A3D`) ya da flow-tag kurdele prop | 0 (zemin) | akış = flow tag (D-041 ribbon) ya da zemin `ripples` layer kaydırma; **wow:** gece T0'da turuncu kurdele | L · shader + worldgen | waterfalls flow tag, lava glow 22; zemin emissive terimi = materyal değişikliği (0 program ama shader işi) |
| D2 | Lav Şelalesi ve Buhar Deltası / Lava Fall & Steam Delta | bluff dudağından denize lav kurdelesi; dipte köpük diski yerine buhar puff'ları + siyah cam deltası (sandBlack + parlak speckle) | 1 | flow tag, PUFFS.soft; **wow:** 19:15 lav denize girerken buhar | M · shader | waterfalls.ts, steam emitter; 0 def |
| D3 | Kor Köprüsü / Ember Bridge | lav kanalını aşan ray ve yaya köprüsü (railTrack segmentleri ayaklar üstünde, korkuluk) | 1 | tren mover üstünden geçer; **wow:** altta glow, üstte tren | S/M · props + worldgen | railTrack, dock ayakları; 1 def (bridgeSpan) |
| D4 | Füniküler / Funicular | rafları ve zirveyi bağlayan eğimli ray + 2 kabin (closed-form, pitch'li polyline), rafta 3 istasyon | 1 (ray + pylon) | harbour-routes tren deseni; **wow:** kabin switchback'te dönerken fenerler yanar | L · worldgen + props + life | `world/pipe-run.ts` pitched pieces, movers.ts, rackShed = istasyon varyantı; 2 def (funicularRail, funicularCar) |
| D5 | Zirve Nöbet Kulesi / Summit Watch & Uptime Bell | rim'de anten direkleri yerine tek kule: lattice + çan + kırmızı döner fener | 1 (antennaMast varyantı) | `bellScene` 06:00 siren + relay; fener = lighthouse beam mini; **wow:** gece koninin tepesinde döner kırmızı ışın | S/M · props + life | antennaMast LOD1 aynı; beam mesh; 0 def |
| D6 | Krater Seyir Terası / Crater Viewing Deck | krater dudağına çıkmalı kafes balkon + korkuluk + 2 lav feneri + bank; story: "krater bakan çift" | 2 | — ; **wow:** T3 raw cam aşağı: lav diski + puff burp | M · props + worldgen | onsenDeck kalasları, lavaLantern; 1 def |
| D7 | Gayzer Tarlası / Geyser Field | kaplıca terasında 4–6 gayzer; hash'li zamanlayıcıyla 6 u su sütunu + buhar patlaması | 2 | culture-movers parça + PUFFS burst; **wow:** 17:30 vardiya sonu toplu püskürme | M · life + shader | volcano steam emitter; 1 def (geyserCone) |
| D8 | Fumarol Havuzları / Fumarole Pools | 3 renkli (`#9FE6E0`, `#FFE45C`, `#FF8FB1`) kerbsiz havuz diskleri, kenarı tuz beyazı speckle | 1 (zemin) | ripples layer; **wow:** T1'de koyu koni üstünde üç renk leke | S · worldgen | Coding `Zone.crater` havuz boyası; 0 def |
| D9 | Onsen Kasabası / Onsen Town | havuz üstünde kazıklı 3 hamam evi (onsenHouse varyant 1–2), havlu ipleri (laundry, turuncu kumaş), capybara ×3 | 1 (varyant) · 2 | laundry flutter, capybara spot; **wow:** W5 yeniden: buhar + hamam + capybara | M · worldgen + props | onsenHouse, laundry, SPOT_CRITTERS; 0 def |
| D10 | Obsidyen Plajı / Obsidian Beach | rüzgârüstü siyah kumsalda parlak obsidyen kıymıkları (koyu + turuncu rim) ve gelgit havuzu | 3 noShadow | — ; **wow:** T3 makro: siyah cam + turkuaz | S · props | shell/starfish deseni; 1 def |
| D11 | Bazalt Sütunlar / Basalt Columns | rüzgârüstü uçurum dibinde altıgen prizma kümeleri (basaltBoulder varyantı, kolon) | 1 | köpük aralarında; **wow:** W4 tarzı kıyı | S · props | basaltBoulder; 0 def |
| D12 | Fener Zigzagı / Switchback Lantern Path | koni yamacında 2 switchback'li servis yolu (A*, `stair`), her 5. düğümde lavaLantern | 2 | lamp set 18:30; **wow:** gece T1'de koni üstünde turuncu zigzag | S · worldgen | pathLanterns; 0 def |
| D13 | Cevher Teleferiği / Ore Cableway | ocaktan fırın üst basamağına pylon + kablo, 4 kova mover | 1 (pylon) | mailLine deseni (TASK-465 pylon + cable), kova = crate cart; **wow:** kovalar lavın üstünden geçer | M · props + life | HQ `mailLine`; 0 def ya da 1 (oreBucket) |
| D14 | Demirci Çarşısı / Smiths' Lane | fırın alt rafında karşılıklı demirci + alet tezgâhları (HQ `goodsStall` çekiç/dişli varyantı), tente, asılı aletler | 2 | anvilHammer sahnesi + kıvılcım (D15); **wow:** çekiç ritmi 1.1 Hz, farklı fazlar | M · worldgen + props | smithy, anvil, goodsStall; 0 def |
| D15 | Kıvılcım / Ember Sparks | örs vuruşunda 3 turuncu kıvılcım, fırın ağzında sürekli kor parçacığı | 3 | fireflies points turuncu hue; **wow:** gece demirci sahnesi | S · shader | fireflies.ts; 0 def |
| D16 | Konteyner Gece Deploy'u / Deploy Night | konteyner LED şeritleri + vinç kaldırma + gemi korna flaşı; Release Night'a bağlı | 2 | craneScene + hornScene var; eklenen: gemi ışığı | S · life | culture-movers; 0 def |
| D17 | Lav-Cam Ocağı / Lava-glass Kiln | kanal kenarında küçük fırın + cam fener rafı (fenerlerin "kaynağı"); story: usta fener üfler | 2 | hot shop deseni (Design); **wow:** fener rafı gece yanar | S · worldgen | Design hotShop varyantı ya da smithy varyantı; 0 def |
| D18 | Rüzgârüstü Dalga Kıran / Breakwater & Tug | liman ağzına bazalt dalgakıran + kırmızı bacalı römorkör (cargo mover rotasının önünde) | 1 | harbour-routes; **wow:** tug + ship aynı döngüde | S/M · life + props | ship mover; 1 def (tug) |

### 2.4 Wow çekimi

| ID | Çekim | Kamera · zaman | Kabul |
|---|---|---|---|
| W22 | **Lava Delta Dusk** (A) | raw cam denizden rüzgârüstü deltaya, ≈ 80 u · 19:15 | çentikten denize kesintisiz turuncu kurdele, delta buharı, bazalt sütunlar, uzakta kargo gemisi; land L ≥ 0.12; ≤ 280 call |
| W23 | **Funicular Dawn** (B) / **Onsen Shift End** (C) | B: T2 70 u switchback · 06:00 +5 s (siren, fenerler yanık, pembe plume) · C: T2 60 u kaplıca · 17:30 +10 s | B: kabin kadrajda, ≥ 5 fener, çan kulesi tepede · C: ≥ 3 gayzer / buhar sütunu, ≥ 2 capybara, hamam penceresi yanık |

### 2.5 Paketler

| Paket | İçerik | Tahmin |
|---|---|---|
| Quick wins | D8 fumarol havuzları, D11 bazalt sütunlar, D12 fener zigzagı, D15 kıvılcım, D16 deploy night, D5 zirve kulesi (varyant) | 5 S + 1 S/M, 1 hafta, +0–1 def |
| Signature | A: D1 + D2 + D3 + D10 · B: D4 + D5 + D13 · C: D7 + D9 + D8 | A ≈ 1 L + 1 M + 2 S · B ≈ 1 L + 1 M + 1 S · C ≈ 2 M + 1 S |
| Ambitious | D6 krater terası, D14 demirci çarşısı, D17 cam ocağı, D18 dalgakıran + tug, W22/W23, L-devops ladder (koni paralaksı D-056 notu) | 3 M + 1 S + qa |

### 2.6 Kullanıcıya sorular

1. **Yön:** A Lava River · B Funicular Works · C Steam Valley & Onsen Town · A+B (lav + ray köprüsü, onsen küçük)?
2. **Lav nasıl:** terrain materyaline emissive `lava` zonu (shader işi, en güzel, 0 program) · flow-tag kurdele prop (ucuz, kanal kenarı sert) · sadece gece glow (en ucuz)?
3. **Arazi:** koniye kanal / vadi oyulabilir mi (D-048 rafları kalır; hash re-pin, W5 cam) · yalnız raf içi değişiklik?
4. **Koni yamacı:** servis yolu + fenerler (B/D12) her yönde geçerli mi, yoksa yamaç "vahşi" kalsın mı?
5. **Lodge'lar:** turuncu cottage tekrarı → ops barakası varyantı (çelik çatı, turuncu trim) ile değişsin mi (0 def, LOD1 yeni grup)?
6. **Tavan:** 10 → 13 override (D-057 gibi) kabul mü, yoksa 10 içinde kalalım (B yönünde 2–3 def yeterli)?

---

## 3. QA — Palmlagoon · Müfettişler Adası (Inspectors' Island)

### 3.1 Şu an

Yuvarlak-kare plato 78–100 u, 6–6.8 u bluff, 8.6–9.6 u tepe. Plan: lee koy iskelesi + kazıklı lab, beton
avlu (hub), 3 testere-dişi hangar + konveyör köprüleri, loop pist, QA kulesi, 4–5 test lab, bariyerli
kontrol noktaları, kültür kiti (kabin, manken bankı, UV lamba, skorbord, kavanoz, koni piramidi, böcek
hayvanat bahçesi).

| Tier | Okunuyor | Zayıf |
|---|---|---|
| T0 700/480 | nane plato + yeşil tik kulesi; disk üzerinde koyu fabrika bloğu | plato düz lime disk; kule ince; ikinci silüet yok; nane `#3FBF8F` yalnız çatılarda |
| T1 340–170 | fabrika bloğu (hangarlar + köprüler + kule) kuzeyde; loop pist doğuda; koy + kazıklı lab güneyde; toprak duvar katmanları | güneydoğu üçte biri boş çayır (4 çalı, 2 kaya); patikalar soluk; duvarlar her yerde aynı; palmiye 3–4; hangar duvarları gölgede gri okunuyor, "neşeli" değil |
| T2 120–60 | kabinler, bariyerler, koniler, skorbord, manken bankı, UV lambalar, bug zoo, avlu karo deseni | kit ince yayılmış; hazard şeridi zemine gelmedi (TASK-440 atladı); loop pist küçük; labs aynı kutu; rim'de hiçbir şey |
| T3 42–21 | uğur böcekleri, kavanozlar, clipboard, W18 UV gece (en iyi QA karesi) | çim tutam + boş; UV havuzları zayıf (QA 451 notu); kıyıda sadece yengeç |

**Kullanılmayan kara:** güneydoğu çayırı (~%35), plato rim'i (yürüyüş yolu / korkuluk / seyir yok), koy
dışı tüm kıyı, deniz (yalnız teftiş botu halkası). Ada "test fabrikası" ama test edilen bir şey
görünmüyor; hareket sadece bantlardaki kasa ve pistteki araba.

### 3.2 Yön önerileri

**A · Teftiş Pisti (Proving Grounds).** QA = stunt parkı. SE çayırı test sahasına dönüşür: rampalı ve
çarpma duvarlı sekiz pisti (araba zıplar), düşürme kulesi (kasa 20 s'de bir düşer, squash), sıçrama havuzu
(tramplende manken), dev test fanı (streamer'lı manken), engel parkuru (slalom koniler, lastik yığını, denge
kirişi), tribün (lectureSteps) ve bitiş damalı bayrak. 12:00 siren testi hepsini aynı anda tetikler.
T1/T2'de en çok hareket; neşeli, oyuncak. Arazi değişmez (pad'ler).

```
   ┌─────────────────────────────────────────┐
   │ hangars ▣▣▣ ═ belts ═ ▣   ✓ tower        │
   │   stamp pavilion ▭   YARD ◯   labs ▭ ▭   │
   │ bug zoo ⌂          ┌──── PROVING ──────┐ │
   │ labs ▭             │ ∞ figure-8 + ramp │ │
   │                    │ drop tower ▲  fan ◎│ │
   │ rim walkway ═══    │ splash ⬭ obstacles│ │
   │                    │ grandstand ◠◠     │ │
   │        stilt lab ⌂ └───────────────────┘ │
   └───────────────┬─────────────────────────┘
                 pier + customs arch
```

**B · Kontrol Limanı ve Fener Zinciri (Checkpoint Harbour & Beacon Chain).** "Takımadaya hiçbir şey
kontrolsüz girmez": koy ağzında teknelerin altından geçtiği tarayıcı kemer (Design `prismArch` geometrisi +
marquee ışık şeridi), karantina dubaları (kasalar + çadır, dalga bob'u), 8 şamandıralık slalom parkuru
(teftiş botu halka yerine slalom), rim köşelerinde 3 yeşil-beyaz çizgili mini fener (gece üç ışın), rim
boyunca hazard korkuluklu yürüyüş yolu. Deniz ve kıyı kullanılır; T0'a üç fener + ışın gelir.

```
   ┌─────────────────────────────────────────┐
   │ ☼ beacon ═══ rim walkway ═══ ☼ beacon    │
   │ ║ hangars ▣▣▣     ✓ tower   loop ∞ ║    │
   │ ║   YARD ◯  labs ▭▭   palms ⌇⌇     ║    │
   │ ║ bug zoo ⌂       meadow → palm grove   │
   │ ☼ beacon ═════════ walkway ═══════ ║    │
   └─────────── cove ────────┬──────────────┘
      pontoons ▭▭ ~ buoy slalom ◦ ◦ ◦ ~ ARCH ⌒ pier
```

**C · Böcek Bahçeleri (Bug Zoo Gardens).** SE çayırı dev cam böcek bahçesi kampüsü: 4–5 glasshouse kubbe
(Design def), içlerinde ×6 ölçekli uğur böceği / böcek "sergileri" (critter mesh, sabit), karınca çiftliği
duvarı (antScene), yeşil-sarı çiçek tarhları + kelebek (ladybug) çayırı, tarhların üstünde kazıklı gözlem
yürüyüş yolu, avlu girişinde 5 u büyüteç anıtı (12:00'de zeminde caustic). En T3-zengin, en şirin; "bug"
metaforu adanın tamamına yayılır.

```
   ┌─────────────────────────────────────────┐
   │ hangars ▣▣▣ ═══ ▣     ✓ tower   loop ∞  │
   │  magnifier ◎  YARD ◯   labs ▭ ▭         │
   │ bug zoo ⌂   ┌── BUG GARDENS ──────────┐ │
   │             │ ⌂ dome ⌂ dome ⌂ dome    │ │
   │ labs ▭      │ ant farm ▭ flower beds ✿│ │
   │             │ ═ stilt observation walk │ │
   │ stilt lab ⌂ └──────────────────────────┘ │
   └───────────────┬─────────────────────────┘
                 pier
```

### 3.3 Fikir kataloğu

| # | Ad (TR / EN) | Pitch · nerede | Tier | Hareket · wow anı | Maliyet · agent | Reuse · bütçe riski |
|---|---|---|---|---|---|---|
| Q1 | Sekiz Pisti / Figure-8 Crash Track | rampalı, çarpma duvarlı büyük pist (testTrack varyantı 2× boy) SE çayırında (A) | 1 (varyant) | araba closed-form, rampada parabol; **wow:** araba havada, manken sallanır | L · props + life | QA_TRACK geo, movers cart; 0 def (varyant), yeni LOD1 grubu |
| Q2 | Düşürme Kulesi / Drop Tower | 10 u lattice kule; kasa 20 s'de bir kaldırılır-bırakılır, dipte squash + "✓" lamba | 1 | liftScene (crane) + squash spring; **wow:** düşüş anı | M · props + life | qaTower lattice, crate; 1 def (tier-1 slotu) |
| Q3 | Sıçrama Havuzu / Splash Test Tank | 5×5 kerbli havuz + tramplen + manken; 30 s'de bir dalış, halka + damla | 2 | fish-jump ring; **wow:** manken dalışı | S/M · worldgen + life | Coding reflectingPoolEdge, pool zonu; 1 def (divingBoard) |
| Q4 | Dev Test Fanı / Giant Test Fan | 4 u fan + kafes, önünde streamer'lı manken direği | 2 | spin tag + windy; **wow:** 12:00 siren testinde hız | S · props | hangar fan tag; 1 def |
| Q5 | Engel Parkuru / Obstacle Course | hurdle, lastik yığını, denge kirişi, slalom konileri (tek def 4 varyant) | 2 / 3 | — ; story: "parkurda takılan manken" | S · props + worldgen | trafficCone; 1 def |
| Q6 | Rim Yürüyüş Yolu + Hazard Korkuluk / Rim Walkway | plato dudağı boyunca path boyası + sarı-siyah direkler her 3 u | 1 (zemin) · 2 (post) | — ; **wow:** T0/T1'de nane diske koyu çerçeve (hazard halkası uzaktan okunur) | S · worldgen | fence varyantı (hazard); 0 def; stripe layer'ı dolaylı çözer |
| Q7 | Fener Zinciri / Beacon Chain | rim köşelerinde 3 yeşil-beyaz mini fener (lighthouse varyantı 0.5 ölçek) + gece ışın (B) | 1 (varyant) | beam mesh 18:30 → 06:30, farklı faz; **wow:** üç ışın sis içinde | M · props + shader | lighthouse LOD1, beam; 0 def; W11'e yeni LOD1 grubu +2 |
| Q8 | Teftiş Kemeri / Inspection Arch | iskele kanalı üstünde kemer + tarayıcı LED şeridi (marquee kind); tekneler altından geçer (B) | 1 | marquee chase; **wow:** teftiş botu kemerden geçerken LED koşar | M · props | Design `prismArch` geo; 1 def ya da prismArch varyantı |
| Q9 | Karantina Dubaları / Quarantine Pontoons | koyda 2–3 yüzen platform: kasalar, çadır, lamba; dalga bob'u (B) | 2 | boat bob 3.2 s, farklı faz; **wow:** gece lamba yansıması | M · props + life | dock planks, stiltHut kazıkları; 1 def |
| Q10 | Şamandıra Slalomu / Buoy Slalom | 8 inspectionBuoy slalom; teftiş botu halka → polyline (B) | 2 | boats-culture; **wow:** bot şamandıraları yalpalayarak döner | S · life | inspectionBuoy, sailboat v3; 0 def |
| Q11 | Böcek Kubbeleri / Bug Domes | 3–4 Design `glasshouse` + içinde ×6 uğur böceği sergi (C) | 2 | — ; gece cam glow; **wow:** T2'de dev uğur böceği camın ardında | S/M · worldgen + life | glasshouse, ladybug critter mesh; 0 def |
| Q12 | Karınca Çiftliği / Ant Farm Wall | 4×2 u cam panel, içinde karınca hatları | 2 | antScene mover var; **wow:** T3 makro | S · props | antScene; 1 def |
| Q13 | Büyüteç Anıtı / Magnifier Monument | avlu girişinde 5 u büyüteç (cam pane) + kaide; 12:00'de zeminde caustic lekesi | 1 | caustic decal güneşle kayar; **wow:** öğle lekesi | M · props + shader | Design causticDecal; 1 def (tier-1 slotu) |
| Q14 | Damga Pavyonu / Stamp Pavilion | bandın üstünde açık pavyon; damga kolu geçen her kasaya 0.8 s vurur, tik yanar | 2 | liftScene türevi; **wow:** damga ritmi + kasa sıçrar | M · props + life | conveyor, stampDesk; 1 def |
| Q15 | Tribün / Grandstand | pist yanında 3 basamak + 4 tableau manken + damalı bitiş bayrağı | 2 | flagScene; story "tribünde uyuyan manken" | S · worldgen | Research lectureSteps, flagMast; 0 def |
| Q16 | Hangar Paleti / Hangar Repaint | hangar duvarı `#FFDDB0` gölgede gri okunuyor → beyaz `#FAFAF5` + nane bant ×2, kapı sarı büyütülmüş | 1 | — ; **wow:** W6 "neşeli" | S · props | QA_FACTORY renkleri; 0 def, 0 call |
| Q17 | Bug Avı 2.0 / Bug Hunt Night | UV havuzları ×1.6, kavanozlar yeşil glow, yeşil ateşböceği sürüsü (fireflies hue) + fenerli botlar | 2 / 3 | fireflies, lamp set; **wow:** W18 güçlenir | S · shader + life | fireflies.ts, lamp set; 0 def |
| Q18 | Palmiye Rim'i / Palm Rim | rim yolu boyunca palmiye sırası (PALM_FACTOR 0.45 → rim kuralı) + 2 hamak | 1 | palm sway; **wow:** T1'de plato kenarı yeşil saçak | S · worldgen | palm rule; 0 def |

### 3.4 Wow çekimi

| ID | Çekim | Kamera · zaman | Kabul |
|---|---|---|---|
| W24 | **Proving Grounds Noon** (A) | raw cam avludan SE sahasına, ≈ 65 u · 12:00 +3 s (siren testi) | araba rampada / havada, fan dönüyor (iki kare farkı), ≥ 3 manken, düşürme kulesinde kasa, tribün; ≤ 280 call |
| W25 | **Beacon Chain Dusk** (B) / **Bug Garden Macro** (C) | B: denizden koya, ≈ 90 u · 19:15 (üç ışın, kemer LED'i, bot kemer altında) · C: T3 24 u kubbe önü · 11:00 (dev uğur böceği, karınca hattı, caustic) | B: 3 ışın ayrı fazda, LED şeridi iki karede farklı · C: ≥ 2 kubbe, karınca hattı hareketli, ≥ 4 ladybug |

### 3.5 Paketler

| Paket | İçerik | Tahmin |
|---|---|---|
| Quick wins | Q16 hangar paleti, Q6 rim yolu + hazard korkuluk, Q18 palmiye rim'i, Q17 bug avı 2.0, Q10 slalom, Q15 tribün | 6 S, 1 hafta, +0 def |
| Signature | A: Q1 + Q2 + Q4 + Q5 · B: Q7 + Q8 + Q9 · C: Q11 + Q12 + Q13 | A ≈ 1 L + 1 M + 2 S · B ≈ 2 M + 1 M · C ≈ 1 S/M + 1 S + 1 M |
| Ambitious | Q3 sıçrama havuzu, Q14 damga pavyonu, (diğer yönün 1–2 parçası), W24/W25, L-qa ladder | 2 M + qa |

### 3.6 Kullanıcıya sorular

1. **Yön:** A Proving Grounds · B Checkpoint Harbour & Beacon Chain · C Bug Zoo Gardens · A+B (saha + fenerler)?
2. **Ton:** fabrika gri-nane kalsın mı, yoksa Q16 ile beyaz-nane-sarı "oyuncak fabrika"ya mı dönsün?
3. **Pist:** mevcut loop korunup ikinci büyük pist mi (iki pist) · mevcut pist büyütülsün mü (tek)?
4. **Deniz:** koy ağzında kemer + dubalar iskele yerleşimini değiştirir (findDock) — kabul mü?
5. **Tier-1 slotu:** Q2 düşürme kulesi · Q13 büyüteç anıtı · Q8 kemer (hangisi adanın ikinci silüeti)?
6. **Tavan:** 10 → 12 override mı, 10 içinde mi (A yönü 4 def, B 3, C 2–3 ile sığar)?

---

## 4. Üç ada için ortak notlar

- **Rim yürüyüş yolu** (C18 / Q6 / D12) üç adada aynı worldgen primitifiyle yapılabilir: bluff dudağından
  2 u içeride path boyası + her N u'da direk; ada dili direk varyantıyla (ahşap / hazard / lav feneri) değişir.
  HQ/Design'a da uyar; tek task, üç ada.
- **Cross-island def reuse** ucuz ve emsalli: `glasshouse` (Coding C7, QA Q11), `prismArch` (QA Q8),
  `mailLine` (DevOps D13), `goodsStall` (DevOps D14), `lectureSteps` (Coding C8, QA Q15),
  `reflectingPoolEdge` (QA Q3). Hiçbiri ledger'a girmez.
- **Hareket kuralı:** her öneri mover / tag / lamp set; 0 agent, 0 program. Tek shader işi D1 (zemin lava)
  ve Q13/C10 caustic-glow varyantları — hepsi mevcut materyal dallarında.
- **Ladder riski:** 2026-10-17 ladder-study (seed 1001) üç adada da `pass`; DevOps 42 / 21 u adımlarında
  blob %1.1 / %1.2 (koni paralaksı, D-056 notu) sınıra yakın — koniye eklenecek her dik prop (D4 ray, D5
  kule, D12 fenerler) bu adımları izlemeli. Coding'de solar T0 geçişi çözüldü; yeni tier-1 def'ler kendi
  LOD1'leriyle gelmeli (D-032), yoksa 380 u pair'i patlar.
- **Önerilen sıra:** kullanıcı yön seçer (statik karşılaştırma sayfası, ~/.claude kuralı) → her ada için
  D-0xx + task bloğu (M21 Coding, M22 DevOps, M23 QA ya da tek M21 "Üç Ada") → quick wins paralel
  (props/worldgen ayrı dosyalar) → signature sıralı → wow preset + ladder + docs.
