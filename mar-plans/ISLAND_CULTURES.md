# Marisland — Ada Kültürleri Planı (M19 "Seven Cultures")

> Kullanıcı isteği: "Adaları daha da özgün yap, çok daha fazla detay ekle. Her adanın kendi
> kültürü olsun. Yaratıcı ol, bolca detay görmek istiyorum."
> Bu belge bir **yaratıcı + uygulama planıdır**; repo'ya dokunmaz. Kaynaklar: CLAUDE.md,
> PROMPT.md, ARCHITECTURE §4/§8, ART_BIBLE §2/§4/§5/§6/§7/§11, DECISIONS D-044…D-048,
> task-index (M17b), `src/content/{islands,themes/*,props-themes/*,life,budgets,shots,sky-craft}.ts`,
> `render/props/batcher.ts` başlığı, `shots/wow/{W1,W5,W11,W14}.png`.

---

## Seçimler (kullanıcı onayı)

| Ada | Seçilen kültür |
|---|---|
| HQ — Hearthholm | **Liman Loncası (Harbour Guild)** |
| Coding — Millbrook | **Rüzgâr Bahçeleri (Wind Gardens)** |
| DevOps — Emberpeak | **Kor Demircileri (Ember Smiths)** |
| Marketing — Beacon Rock | **Karnaval Yayıncıları (Carnival Broadcasters)** |
| QA — Palmlagoon | **Müfettişler Adası (Inspectors' Island)** |
| Design — Mossgrove | **Cam ve Işık Stüdyosu (Glass & Light Studio)** — alternatif seçildi; Paint Forest yedek |
| Research — Lonely Palm | **Yıldız Akademisi (Stargazer Academy)** |

---

## 0. Mevcut durum (doğrulandı)

| Archetype (slot) | Theme | Bugünkü ad | Hero dikey | Accent | Bot aksesuarı |
|---|---|---|---|---|---|
| hearthholm (hero 110–140 u, liman hilali) | **HQ** | Orchestrator campus | Orchestrator Tower (clocktower v2) | `#E8735A` | headset |
| millbrook (flat plato 80–110 u) | **Coding** | Tech Park | 3 wind turbine (24/19/16 u) | `#5B9BE6` | hood |
| emberpeak (yanardağ 90–120 u) | **DevOps** | Ember Works (TASK-405) | koni + buhar, cooling tower | `#FF9F43` | hard hat |
| beaconrock (sea stack 40–60 u) | **Marketing** | Media Rock (TASK-403) | broadcast lighthouse 15.5 u | `#E35D6A` | cap |
| palmlagoon (plato 70–100 u) | **QA** | Test Factory (TASK-401) | check tower ~20 u | `#3FBF8F` | visor + badge |
| mossgrove (orman kubbesi 80–110 u) | **Design** | Atelier Tree | giant tree v2 18 u | `#B07CE0` | beret |
| lonelypalm (kampüs tepesi 52–58 u) | **Research** | Observatory University (TASK-402b) | observatory ~11 u + dish | `#4FC3C9` | monocle |

**Sert kısıtlar** (plan bunların üstüne kurulu):
- Medium draw-call bütçesi **300**, W11 "Concept" **298** (D-048). Low 170, high 350. Program sayısı 9/17/24 — **0 yeni program**.
- Draw call = (def, variant, LOD0, island) × görünür + (def, LOD1-variant) tüm adalar + shadow pass. Tier ≥ 2 def'ler uzakta dither ile kaybolur ve D-048 "far-group skip" sayesinde **W11'de 0 call** eder.
- Creature program attribute 15/16 dolu; bot aksesuarı `aSeed` slot'larıyla kodlanır (7 dept + 4 carried item).
- Agent cap medium 60; ambient worker slot'ları ada başına 9–12. **Mover'lar (render/movers.ts) agent bütçesine girmez.**
- Determinizm: `Math.random`/`Date.now` yok, label-fork RNG, ada başına fork (D-044).
- `world/` saf veri, `geo/` fabrikalar, `render/` GPU, `life/` canlılar, `content/` tablolar.

---

## 1. Vizyon — bu dünyada "kültür" ne demek

Marisland bir yazılım şirketinin org chart'ı olarak takımada (D-024). "Kültür" = her adanın
**meslek etrafında büyümüş mikro-uygarlığı**: insanları nasıl giyinir, çatıları neden o şekilde,
akşam ne yapar, neye bayram der, hangi malı üretip hangi komşuya yollar. Kurumsal değil **cozy**:
Animal Crossing'in köy kimliği + Townscaper'ın el yapımı hissi; ofis değil **atölye, lonca, kasaba**.

Kültürün beş görünür katmanı (her ada için hepsi doldurulur):

1. **Silüet + renk imzası** (T0): 2 saniyede "bu hangi ada" dedirten şey.
2. **Mimari sözlük** (T1): çatı biçimi, malzeme, süs — her adada 1 form, 2 malzeme, 1 süs motifi.
3. **Kit** (T2): 8–15 imza prop; bayrak/flama; tekne; ticaret malı.
4. **Ritim + ritüel** (T2, zamanla): günün dört dilimi + bir festival; gece ne yanıyor.
5. **Ambient story** (T3): zoom'layan kullanıcının keşfettiği, sessiz 5–7 mini sahne.

Ortak çatı: **Pennant (flama) sistemi** — her adanın accent rengi ve flama kesimi, tüm
dünyada yönlendirme, tekne yelkeni ve kasa rengi olarak tekrar eder (§3.3). Böylece adalar
birbirinden farklı ama **aynı dünyadan** okunur.

---

## 2. Adalar

Format: iki konsept (★ = önerilen), sonra önerilen için detay bible'ı. Hex'ler ART_BIBLE §2
paletinden; palet dışı tek tük renk `(yeni)` ile işaretli ve §4.5'teki palette-atlas kuralına uyar.

### 2.1 HQ — Hearthholm

| | Konsept | Pitch |
|---|---|---|
| ★ | **Liman Loncası (Harbour Guild)** | Takımadanın feribot limanı ve postanesi: çanlar, tarifeler, flamalar, kahve. Her ada buraya tekne yollar; "orchestrator" = liman reisi. |
| | **Sabah Nöbeti Kasabası (Standup Town)** | Plaza bir amfi; her sabah tüm botlar daire olur, dev sprint-board totemi ve takvim duvarı. Daha "ofis", daha az deniz. |

**Detay bible — Liman Loncası**

- **Sakinler:** headset'li liman memurları; gövde coral `#E8735A` / `#F09A7E` / `#D45F4A` tint'leri, **beyaz kaptan şapkası** (cap aksesuar varyantı, brim coral), omuzda posta çantası (carried item `satchel`, yeni slot 11). Yürüyüş: hızlı, "tarifeye yetişen" adım (step 0.4 s); iskelede durup saat kulesine bakma idle'ı.
- **Mimari:** beşik (gable) çatı coral `#E8735A`, krem duvar `#FFF4E0`, beyaz trim, mavi panjur `#5DA9E9`, kemerli kapı 0.9×1.6 u, coral/beyaz çizgili tente, çatı tepesinde **çan nişi** (bell gable). Süs motifi: pusula gülü madalyonu.
- **İmza prop'lar:**
  - S: `timetableBoard` (tarife panosu, 7 renkli satır), `mailbag` (posta çuvalı yığını), `bellPost` (çan direği), `lifebuoyRing` (duvar simidi), `gullPerch` (martı konma kazığı — gull landing noktası)
  - M: `ferryAwning` (iskele bekleme tentesi + bank), `harbourCrane` (küçük el vinci), `guildNoticeBoard` (7 flama + ilan), `coffeeCart` (kiosk'tan küçük, seyyar)
  - L: `guildHall` — mevcut `hqAnnex` **varyantı** (T0; yeni LOD1 grubu yok): çan kulesi nişi + yedi flama direği. `ferryPier` — mevcut dock'a **tente + tarife** eklentisi (tier 2 def).
- **Bayrak/amblem:** kırlangıç kuyruklu (swallowtail) coral flama, beyaz pusula-çan glifi. HQ tek başına **yedi flamayı birden** taşır (lonca salonu + pier).
- **Tekneler:** **Feribot** (beyaz gövde, coral şerit, tente, 6 u) — mevcut sailboat rotasını kullanan yeni hull varyantı; her iskeleye uğrar. Posta sandalı (rowboat varyantı, coral).
- **Günlük ritim:**
  - 06:00 **Sabah Çanı** — kule çanı sallanır (aSpin `spin` tag, 3 s), feribotlar aynı anda kalkar (route phase hizası), martılar havalanır.
  - 12:00 — kahve arabası kuyruğu, iskele tentesinde yemek, botlar ikişerli chat.
  - 17:45 — feribotlar döner, posta çuvalları iskeleye yığılır (mover: crane kaldırır).
  - 20:00+ — iskele fenerleri `#FFB347`, tarife panosu arkadan aydınlatmalı (screen class 'chart'), kule halkası dönüyor.
- **Ritüel:** **Feribot Fanfarı** (06:00 ve 18:00): tüm feribotlar limandan V şeklinde çıkar, kule çanı + 6 sparkle ring (click burst reuse), flamalar gust'la dalgalanır.
- **Zanaat/mal:** posta, kahve, tarife. İskelede 7 renk kasa (origin renkleri, §3.3).
- **Ambient story'ler (T3):**
  1. Tarife panosunun üstünde uyuyan kedi (cat spot).
  2. Kaptan şapkalı bot martıya simit atıyor; martı `gullPerch`'e konuyor.
  3. Bankta unutulmuş şemsiye + yarım kahve.
  4. İki bot signpost önünde haritaya bakıp tartışıyor (chat pair, `pierSignpost` spot).
  5. Mesaj şişesi rafı: 5 şişe, biri mantarsız.
  6. Posta çuvalının içinden çıkan yavru kedi (cat variant scale 0.6).
- **Zoom okunurluğu:** T0 coral hilal + kule + limandan açılan beyaz feribot izleri (wake) · T1 çan nişli çatılar, tenteler, yedi flama · T2 tarife panosu, kuyruk, martı kazıkları · T3 kedi, şişeler, şemsiye, kahve buharı.

### 2.2 Coding — Millbrook

| | Konsept | Pitch |
|---|---|---|
| ★ | **Rüzgâr Bahçeleri (Wind Gardens)** | Açık havada kodlayan, uçurtma uçuran, lastik ördek'e tapan bahçeci-hacker kolonisi. Pergola masalar, hamaklar, çit labirenti, bisiklet. |
| | **Monorepo Manastırı (Monorepo Monastery)** | Taş avlulu, skriptorium'lu, mum ışıklı sessiz keşiş-kodcular. Çok güzel ama düz yeşil plato + türbinlerle çelişir. |

**Detay bible — Rüzgâr Bahçeleri**

- **Sakinler:** hoodie'li (mevcut `hood`), mavi `#5B9BE6` / `#82B6F0` / `#4479C9` tint; **gözlük** (lens aksesuar varyantı), laptop carried item. Hareket: yavaş, düşünceli; hamakta sallanma pose'u (gait `rest`), uçurtma tutma pose'u (kol yukarı).
- **Mimari:** düz/alçak eğimli çatılar `#5DA9E9` ve teal `#3FB8AF`, beyaz `#FAFAF5` duvar, cam bant, ahşap deck `#D2A679`; pod'larda **çim çatı** (`#7BC950`). Süs motifi: köşeli parantez `< >` şeklinde pergola kirişleri.
- **İmza prop'lar:**
  - S: `rubberDuck` (sarı `#FFE45C` lastik ördek, her masada + havuzda 1 dev şişme), `kite` (direğe bağlı, gust'la yükselir — aSpin yaw tag), `whiteboardA` (karalamalı tahta), `snackCrate`, `mugStack`
  - M: `pergolaDesk` (masa + tente + 2 sandalye, tier 2), `hammock` (iki direk + katener + bez; `laundry` tekniği), `bracketHedge` (mevcut `hedge` varyantı: `{ }` kıvrımı), `kiteRack`
  - L: `giantDuck` — havuzda 3 u şişme ördek (tier 1, tek def, no shadow), `windChimeTower` — türbin dibinde rüzgâr çanı kulesi (türbin def **varyantı**; yeni LOD1 yok)
- **Bayrak/amblem:** üçgen uçurtma kesimli mavi flama, beyaz `</>` glifi. Türbin kuleleri 3 renk şerit ile numaralı (0/1/2).
- **Tekneler:** **Mavi skiff** (küçük motorlu, build kasası taşır → QA). Havuzda ördek ailesi (var).
- **Günlük ritim:**
  - 06:30 — ördekler havuzda, botlar bisikletle gelir (bikeRack dolu).
  - 11:00–15:00 — pergola masalar dolu, uçurtmalar havada (rüzgâr > 0.6'da), solar tracker güneşi izler.
  - 17:30 — hamak saati; türbin uçlarında kırmızı uyarı ışığı yanar (emissive, 1 s blink).
  - Gece — pencereler mavi-beyaz monitör ışığı ('code' screen), ağaçlarda **fairy light** (lantern pool, `#FFC870` küçük noktalar).
- **Ritüel:** **Uçurtma Günü** (her gün 14:00, rüzgâr ≥ 0.5): kite rack'ten 6 uçurtma aynı anda yükselir (mover, closed-form), bir tanesi çite takılır (sabit story). Yılın festivali §3.2'de (Launch Day: türbin uçları mavi yanar).
- **Zanaat/mal:** build kasaları (mavi), uçurtma, lastik ördek. Çıkış: skiff ile QA'e; drone kuryeleri (var) HQ'ya.
- **Ambient story'ler:**
  1. Server shed'de sıcak rack'in üstünde uyuyan kedi (kullanıcının örneği).
  2. Hamakta laptop göğsünde uyuyan bot; yanında devrilmiş kupa.
  3. Çite takılmış uçurtma; altında ona bakan bot.
  4. Bisiklet yolundan geçen ördek ailesi; bekleyen bot (chat-stop pose, 4 s).
  5. Tahtada bir bug çizimi ve "?" (vertex-colour glif).
  6. Havuzdaki dev ördek üstünde martı.
- **Zoom:** T0 açık yeşil plato + 3 beyaz türbin + mavi ayna havuz · T1 düz çatılar, pergola sıraları, dev ördek · T2 uçurtmalar, hamaklar, bisikletler · T3 kupalar, lastik ördekler, tahtadaki karalama.

### 2.3 DevOps — Emberpeak

| | Konsept | Pitch |
|---|---|---|
| ★ | **Kor Demircileri (Ember Smiths)** | Yanardağ eteğinde liman-dökümhane loncası + onsen kültürü: baret, turuncu yelek, lav camından fener, vardiya sonu kaplıca. "Release Night" ateş töreni. |
| | **Buhar Manastırı (Steam Abbey)** | Buharla dönen dev dua çarkları, uptime çanları, keşiş-operatörler. Mistik ama konteyner limanıyla çelişir. |

**Detay bible — Kor Demircileri**

- **Sakinler:** sarı baret `#FFD23F` (var), **turuncu yelek** (gövde tint `#FF9F43` + reflektif şerit `#FFF4E0`), crate carried item; eldiven. Hareket: ağır, salınımlı adım; çekiç vurma pose'u (gait `hammer`, 1.1 Hz), kaplıcada oturma pose'u (su hizasında baş + baret).
- **Mimari:** testere-dişi ve varil (barrel) çatılar koyu çelik `#666C7A`, turuncu `#FF9F43` trim, bazalt duvar `#7A7584`, oluklu panel, **perçin dizileri**, bakır boru `#C9754A`, lav-cam fener `#FF6A3D`. Süs motifi: alev içinde çekiç+dişli madalyonu (dökümhane alnında).
- **İmza prop'lar:**
  - S: `lavaLantern` (lav-cam fener, emissive `#FF6A3D`, gece), `ingotStack` (turuncu-sıcak → gri soğuyan külçe yığını; 3 renk varyantı), `anvil`, `pagerRock` ("on-call" taş üstünde pager), `incidentSign` ("Days since incident: 42" — iki varyant: 42 / 0)
  - M: `onsenDeck` (kaplıca kenarı ahşap deck + havlu rafı + fener; capybara spot'u), `signalHorn` (liman sireni, kırmızı), `serverShrine` ("ilk sunucu" kaidesi + çiçek + mum), `rivetBarrel` kümeleri, `pipeValveWheel` (dönen volan, spin tag)
  - L: `forgeBell` — dökümhane bacası varyantı: çan + çatı feneri (foundry def **varyantı**). `onsenHouse` — hot spring yanında küçük hamam (tier 1, tek def).
- **Bayrak/amblem:** kare turuncu flama, siyah çekiç-dişli glifi. Konteynerlerde origin renkleri.
- **Tekneler:** **Cargo ship** (var) + **römorkör** (kısa, kırmızı baca, cargo mover rotasında önde). Ore train (var). Ambar vinci (var).
- **Günlük ritim:**
  - 06:00 — siren (ışık flaşı), vardiya iskeleden dökümhaneye yürür, fırınlar `#FF6A3D` kısık.
  - 10:00–16:00 — çekiç sahneleri, külçeler turuncu, tren mekiği, konteyner kaldırma.
  - 17:30 — **vardiya sonu**: botlar onsen'e, buhar yoğun, capybaralar (TASK-332) arasında baretli bot.
  - Gece — fırın ağızları, lav fenerleri, data center LED şeritleri (var), rail lambaları; krater kenarı lav glow (var).
- **Ritüel:** **Release Night** (21:00, 40 s): krater ring-puff "burp" + 12 ember, vinç ışıklı konteyneri gemiye indirir (mover), liman sireni 3 flaş, gemi kalkar; `incidentSign` 0'a döner (varyant swap, 23:00'te geri 42'ye... şaka: ertesi sabah 1). Takımada relay'inin DevOps adımı (§3.2).
- **Zanaat/mal:** külçe, konteyner (turuncu = deploy), lav-cam fener (diğer adaların iskelelerinde birer tane görülür — ticaret kanıtı).
- **Ambient story'ler:**
  1. Kaplıcada baret takmış capybara ve yanında baretli bot.
  2. Sıcak konteyner çatısında uyuyan bot (`rest` pose).
  3. Vinç kabininde kıvrılmış siyah kedi.
  4. Boş ore cart'ta tek bir çiçek.
  5. `incidentSign` önünde durup bakan iki bot (chat).
  6. Pager'ın etrafında dönen yengeç (crab spot, siyah kum).
- **Zoom:** T0 siyah koni + plume + turuncu noktalar + cooling tower · T1 çelik çatılar, vinç, tren, gemi · T2 fenerler, volanlar, külçe yığınları, onsen · T3 pager, çiçekli cart, perçinler, kedi.

### 2.4 Marketing — Beacon Rock

| | Konsept | Pitch |
|---|---|---|
| ★ | **Karnaval Yayıncıları (Carnival Broadcasters)** | Kalıcı sahil lunaparkı + yayın istasyonu: konfeti, flama, maskot, patlamış mısır, "Golden Hour Launch Show". Balonlar buradan kalkar. |
| | **Korsan Radyo Feneri (Pirate Radio Rock)** | 60'lar açık deniz radyosu: plak işaretleri, DJ kabini fenerde, vinil kültürü, antenler. Retro-cool ama daha az "cozy aile". |

**Detay bible — Karnaval Yayıncıları**

- **Sakinler:** kırmızı siperlikli şapka (var), **kırmızı-beyaz çizgili gövde** (tint `#E35D6A` + beyaz şerit), megafon carried item (yeni slot 12). Hareket: zıplayarak (hop 0.18 u), el sallama sıklığı 2×; **maskot bot** = 1 adet dev köpük yengeç kostümü (creature geo, scale 1.6, slow waddle).
- **Mimari:** çizgili tente çatılar kırmızı `#E35D6A`/beyaz, **marquee** saçaklar (ampul dizisi `#FFB347`), krom `#A9AEB8` trim, kırmızı halı `#E35D6A` (ground tile layer), neon tüp çerçeveler (emissive, gece). Süs: yıldızlı megafon madalyonu.
- **İmza prop'lar:**
  - S: `popcornCart` (sarı/kırmızı çizgili), `confettiCannon` (sahne kenarı), `photoBoothSign`, `posterRoll` yığını (mor sargılı — Design'dan gelir), `megaphoneStand`
  - M: `marqueeSign` (ampullü tabela, 3 kelime varyantı: SHOW / LIVE / NEW — glif), `balloonMast` (balon bağlama direği; sky-craft kalkış noktası), `selfieSpot` (fener manzaralı platform + korkuluk), `prizeBooth` (`fairBooth` varyantı: pelüş yığını)
  - L: `searchlightPair` — sahne arkası 2 projektör (beam cone, lighthouse beam tekniği, sadece 17:30–23:00), `mascotStatue` (fuar girişinde 3 u yengeç heykeli — **tier 1**, landmark-ish ama tek def)
- **Bayrak/amblem:** uzun streamer (flama kurdelesi) kırmızı, beyaz yıldız-megafon. Fuar alanı bunting her gust'ta flip (var).
- **Tekneler:** **Parti dubası** (pontoon, flama + ampul dizisi, demirli — bob only), reklam şamandıraları (var).
- **Günlük ritim:**
  - 09:00 — afiş ekibi billboard'a yeni slide yapıştırır (SLIDES zaten döner; yanına merdiven+kova story).
  - 12:00 — fuar açılır: dönme dolap döner (var), booth'larda bot, popcorn arabası kuyruğu.
  - **17:30 Golden Hour Launch Show** — sahne ışıkları, dönme dolapta LED chase (yeni surface kind `marquee`), konfeti (particle burst, 6 s), fener 3 flaş, **balon kalkışı**: balonlardan biri mast'tan yükselip orbit'e girer (sky-craft phase reset görsel hilesi).
  - Gece — neon tabelalar, marquee ampuller, dev ekran, projektörler gökyüzünü tarar.
- **Ritüel:** Launch Show (yukarıda) + relay adımı: 21:00'de fener üçlü flaş + searchlight'lar dikey.
- **Zanaat/mal:** poster, balon, popcorn; dışarı: her adaya flama kumaşı (pennant line'lar Marketing'den gelir — iskelelerde "MKT" damgalı kumaş rulosu).
- **Ambient story'ler:**
  1. Maskot yengeç kameraya el sallıyor (25 u içinde wave reaksiyonu).
  2. Popcorn izi ve peşinde 3 martı (gull landing chain).
  3. Fenerle selfie çeken bot (kol yukarı pose, `selfieSpot`).
  4. Dönme dolap operatörü kabinde uyuyor.
  5. Antene takılmış kaçak balon (küçük, sallanıyor).
  6. Ödül standında tek bir dev pelüş ördek (Coding'den "hediye").
- **Zoom:** T0 kırmızı/beyaz stack + dönme dolap + ekran parıltısı · T1 çizgili tenteler, marquee, maskot heykeli · T2 popcorn arabası, konfeti topları, balon direği · T3 pelüşler, poster ruloları, selfie botu.

### 2.5 QA — Palmlagoon

| | Konsept | Pitch |
|---|---|---|
| ★ | **Müfettişler Adası (Inspectors' Island)** | Damga, pano, çizgili bariyer, yeşil tik kültürü; yakalanan "bug"lar uğur böceği olarak kavanozda evcil hayvan. Gece UV ışıkla bug avı. |
| | **Cankurtaran Akademisi (Lifeguard Academy)** | QA = sahil güvenlik: kırmızı/sarı kuleler, düdük, kurtarma botları, şamandıra sınavları. Palmiyelerle uyumlu, fabrika platosuyla az. |

**Detay bible — Müfettişler Adası**

- **Sakinler:** yeşil vizör + rozet (var), gövde `#3FBF8F` / `#7FD8B3` / `#2E9E74`, **clipboard** carried (var) + **damga** pose'u (kol aşağı vuruş, 0.8 s, gait `stamp`). Hareket: düzenli, sıra hâlinde; her 4. adımda durup etrafa bakma (scan).
- **Mimari:** testere-dişi hangarlar nane `#7FD8B3`/beyaz (var), **sarı-siyah hazard şerit** `#F5C84C`/`#666C7A` (ground tile layer + bariyerler), beton `#D3D8E3`, yeşil tik `#3FBF8F` her kapı üstünde, cam gözlem kabinleri. Süs: kalkan içinde tik.
- **İmza prop'lar:**
  - S: `bugJar` (cam kavanoz + uğur böceği, pencere pervazı), `stampDesk` (damga + mürekkep), `conePyramid` (koni piramidi — birinin sanatı), `clipboardWall` (asılı 6 clipboard), `scoreboard` ("BUGS: 0" / "BUGS: 1" iki varyant)
  - M: `inspectionBooth` (cam kabin + bariyer), `dummyBench` (bankta mola veren sarı/siyah crash-test mankeni + kahve), `uvLampPost` (gece mor `#B39DFF` emissive — lantern pool'un ayrı hue'su), `flagMast` (yeşil bayrak, test turu bitince yükselir — mover)
  - L: `hallOfChecks` — hangar **varyantı**: ön duvarında 12 yeşil tik rozet dizisi. `bugZoo` — terrarium'un QA varyantı (tier 1, yeşil çerçeve, içinde böcek yaprakları).
- **Bayrak/amblem:** chevron kesimli yeşil flama, beyaz tik. Her kasa üstünde yeşil tik damgası (QA onayı → DevOps'a gider).
- **Tekneler:** **Teftiş botu** (yeşil/beyaz çizgili hull, döner lamba; inspection buoy'ları turlar — closed-form rota), inspection buoy (var).
- **Günlük ritim:**
  - 08:00 — hangar kapıları açılır, bantlar çalışır (var), damga masaları dolar.
  - **12:00 Siren Testi** — tüm extractor fanlar 10 s hızlanır, bariyerler kalkar-iner, koniler… olduğu yerde kalır (şaka: bir tanesi devrilir, 20 s sonra düzelir — spring).
  - 16:00 — **Yeşil Işık Töreni**: test cart turu tamamlanınca check tower 3 s yeşil flaş + bayrak yükselir.
  - Gece — **Bug Avı**: yard lambaları mora döner (`uvLampPost`), botlar fenerle (lantern carried item, mevcut `lantern` emissive) sıra hâlinde yürür, kavanozlar hafif yeşil parlar.
- **Ritüel:** Yeşil Işık Töreni (her tur) + relay adımı: 21:00'de check tower 5 s yeşil, tüm hangar tikleri yanar.
- **Zanaat/mal:** onaylı kasa (yeşil tik), bug kavanozu (Research'e numune), koni. Giriş: Coding'den mavi build kasaları.
- **Kritter:** **uğur böcekleri** — butterfly def'inin kırmızı/siyah renk varyantı (aynı geometri, aynı program), QA'de gündüz çiçekler yerine `bugJar`/`bugZoo` etrafında.
- **Ambient story'ler:**
  1. Bankta kahve içen crash-test mankeni; yanında bot ona bakıyor.
  2. Koni piramidinin tepesine konan martı.
  3. Büyüteçle karınca izi inceleyen bot (karınca = 12 nokta, closed-form çizgi mover).
  4. Scoreboard "BUGS: 0" → 1'e düşer, kavanozdan uğur böceği kaçar (30 s döngü).
  5. Damga masasında uyuyan bot, elinde damga.
  6. Kıyıda "teftiş edilen" yengeç: koni + bariyer arasında.
- **Zoom:** T0 nane kare plato + yeşil tik kulesi · T1 hazard şeritler, bayrak direği, teftiş botu · T2 kabinler, mankenler, UV lambalar · T3 kavanozlar, damgalar, karınca izi.

### 2.6 Design — Mossgrove

| | Konsept | Pitch |
|---|---|---|
| ★ | **Cam ve Işık Stüdyosu (Glass & Light Studio)** — *kullanıcı seçimi* | Dev ağacın altında cam üfleme kolonisi: kor hâlinde cam, fasetli renkli cam çatılar, kanopide vitray, prizma heykeller, güneşle yer değiştiren renk lekeleri (kostik), şelalede gökkuşağı, gece "mücevher ağaç". |
| | **Boya Ormanı (Paint Forest)** | Boya sıçramış bohem sanat komünü: renk-sıralı çamaşır ipi, çömlek fırını, boyalı dere, ağaç dalında stüdyolar, Fener Gecesi. (Alternatif; ilk öneriydi.) |

**Research ile ayrım (açık kural).** İki ada da "cam" kullanır; dilleri zıt tutulur:

| | Design — Glass & Light | Research — Observatory University |
|---|---|---|
| Renk | **doygun, renkli** (ROOFS + FLOWERS hex'leri, ≤ 2 % ekranda %90'a kadar) | **berrak / soluk aqua** `#8EEBE0`, lila `paneHigh`; renksiz |
| Form | **fasetli, eğri, damla / küre / prizma**; kalın (≥ 0.15 u) | **düz pane, ızgara çerçeve, kubbe**; ince ve düzenli |
| Sıcaklık | **sıcak, erimiş**: kor `#FF6A3D` → turuncu → renk (ısı tonu geçişi) | **soğuk, bilimsel**: terrarium, glasshouse, lens |
| Işık davranışı | **güneşi kırar**: vitray içinden geçen renk, kostik lekeleri, gökkuşağı, gece içten parlar | **güneşi yansıtır**: cam parıltısı, gece kendi soluk tint'inde glow |
| Yasak | Design'da düz pane / aqua cam **yok** | Research'te renkli / fasetli cam **yok** |

Bağ: Research'ün teleskop merceği ve terrarium kavanozları Design'ın hot shop'unda yapılır (§3.1 — mor kasada "lens" Research iskelesine gider).

**Detay bible — Cam ve Işık Stüdyosu**

- **Sakinler:** bere (var) + alnına itilmiş **kehribar koruyucu gözlük** (lens aksesuar varyantı, amber `#F5C84C`; Coding'inki berrak/mavi), gövde `#B07CE0` / `#C9A2EC` / `#9260C4`, deri önlük + ısı eldiveni (ön yüz `#8A5A3B` bant), carried item **üfleme borusu** (yeni slot 13: boru + ucunda emissive kor damla `#FF6A3D` → zamanla `#F5C84C` → berrak renge soğur). Hareket: yavaş; boruyu döndürme idle'ı (bilek 0.5 Hz), **"ışığa tutma" pose'u** (parçayı güneşe kaldırır — Marketing selfie pose'unun geometrisi, farklı item).
- **Mimari:** çatılar kiremit yerine **fasetli renkli cam pul** (ROOFS hex'leri karışık, per-face jitter ±8°, güneşe bakan fasetler lit program'da zaten parlar), krem duvar `#FFF4E0` üstüne fırın yanında is bandı `#8A5A3B`, **tuğla fırın** `#C29A74`/`#A8754F`, bakır baca `#C9754A`, her kapının üstünde **yuvarlak "boğa gözü" vitray** (rozet, 0.7 u, 6 dilim). Zemin: **cam kırığı terrazzo** (paving + speckle layer, FLOWERS renkleri — mevcut layer mekanizması). Süs motifi: prizma üçgeni + 3 ışın glifi.
- **İmza prop'lar** (yeni def tavanı 10: 5 tier-3, 4 tier-2, 1 tier-1, 0 tier-0; büyük parçalar varyant):
  - S (tier 3, `noShadow`): `culletCrate` (renk ayrılmış cam kırığı kasası, 5 renk varyantı, tek LOD), `blowpipeRack` (duvara dayalı borular), `glassOrb` (fasetli küre kümesi, kaide/ağaç kovuğu, 3 renk; gece hafif emissive), `sampleShelf` (mini vazo vitrini, "seconds" eğri vazo varyantı), `causticDecal` (zemin renk lekesi: 0.5–1.5 u düz elips, 5 renk; **güneşle kayar**, §ritim)
  - M (tier 2): `hotShop` **kit prefab** (B3: fırın ağzı lav emissive `#FF6A3D` + tezgâh + tavlama fırını + üstünde kor parça, baca → chimney-smoke emitter tag), `prismSculpture` (fasetli kristal sütun 2.2 u, 3 renk, tek LOD1; her birinin altında causticDecal anchor'ı), `stainedScreen` (ayaklı vitray paravan 1.8×2.2 u, 2 desen varyantı; **`stained` surface tag** → güneş arkadan vurunca renk geçirir), `gatherRing` (6 cam tabure daire, chat hub)
  - L: `rainbowArc` (**tier 1**, tek def, 14 u yarıçap bantlı emissive yay, dither opaklık; şelale ayağında, 06:00–07:30 ve 16:30–18:30 arası görünür, güneşin tersine yönelik), `canopyVitray` — giantTree **v3 varyantı** (dallar arasına 10–14 renkli fasetli panel + ağaç kovuğunda stüdyo penceresi; LOD1 v2 ile aynı), `glassPavilion` — galleryPavilion **varyantı** (fasetli renkli cam çatı), `glassChimeLine` — bunting **varyantı** (cam damlalar; gust'la flutter var), fener kayığı — sailboat **v5** (gövdede 6 cam fener, gece emissive)
- **Bayrak/amblem:** yuvarlak fistolu (scallop) mor flama, beyaz prizma-üçgeni + 3 ışın.
- **Tekneler:** **Fener kayığı** (koyu mor hull `#9260C4`, bordada cam fenerler; gece parlayan tek tekne) — cam fener ve vazo taşır → HQ, Marketing; lens kasası → Research.
- **Günlük ritim — ada rengi güneşle değişir** (ucuz hileler: emissive uniform + instance transform + varyant swap; 0 program):
  - **06:00 şafak** — doğuya bakan `stainedScreen`'ler ve kanopi panelleri **içten pembe-turuncu** yanar (`stained` tag: emissive = panel rengi × güneş rengi × max(0, dot(n, −sunDir)) — ART_BIBLE Dawn güneşi `#FFD2A1`), hot shop fırını yeniden yakılır (glow 0 → 1, 20 s ramp), cam çan ipi hafif salınır. Şelale ayağında **sabah gökkuşağı** (07:30'a kadar).
  - **09:00–12:00** — hot shop'ta çalışma: kor parça ısı tonu döngüsü (`#FF6A3D` → `#F5C84C` → renk; ingot tekniği, 40 s), kostik lekeler prizmaların **hemen altında, kısa ve yoğun**; çatı pulları güneş açısına göre farklı fasetlerde parlar (lit program zaten).
  - **12:00 öğle** — adanın en doygun hâli: tüm vitraylar üstten aydınlık (dot ~0 → emissive düşük, vertex colour baskın), orb'larda glint.
  - **16:30–18:30 altın saat ("Prizma Saati")** — kostik lekeler güneşin tersine **uzar ve kayar** (mover: pos = prizma + sunDir.xz · h / tan(elev), scale 1/sin(elev) clamp 3; renk × Golden `#FFB866`), batıya bakan paravanlar içten yanar, **şelalede gökkuşağı**, botlar `gatherRing`'de parçaları ışığa tutar (gaze pose; chat hub). Ada bu saatte "renk saçar" — W19 çekimi.
  - **19:15 alacakaranlık** — kostikler söner (güneş < 0), hot shop ağzı kırmızı kalır.
  - **20:00+ gece — "mücevher ağaç"** — kanopi vitrayı **içten** stüdyo ışığıyla yanar (`stained` tag gece dalı: emissive = panel rengi × `#FFC870` × 0.8, bloom eşiğinde), easel walk'un cam fenerleri (light walk), orb'lar soluk, fırın ağzı lav glow, fener kayığı iskelede parlar, ateş böcekleri. Design gece **tek renkli değil**: 5–7 renkli tek ada (diğer adalar sıcak amber), uzaktan bile imza.
- **Ritüel:** **Işık Gecesi** (20:00, 60 s): ağaçtan dışa halka halka tüm cam yanar (hash sırası, 0.3 s aralık), cam çan ipi gust'la çalar (flutter ×2), botlar `gatherRing`'de. **Relay adımı** (21:00): kanopi vitrayı 7 accent rengini **sırayla** döner (emissive uniform döngüsü, 10 s) — "takımadanın paletini Design yapar".
- **Zanaat/mal:** cam fener (HQ iskele fenerleri + Marketing marquee ampulleri Design yapımı — iskelelerde mor kasa), vazo, prizma, **lens** (Research). Giriş: Research'ten kum/silika kavanozu (teal kasa), DevOps'tan bakır boru (turuncu kasa, hot shop yanında).
- **Ambient story'ler (T3):**
  1. Hot shop'ta kor parçayı döndüren bot; yanında **sıcak tavlama fırınının üstünde uyuyan kedi** (warm-spot cat).
  2. Vazoyu güneşe tutan bot; önündeki zeminde tek büyük kostik leke.
  3. Cam küreye bakan tilki — kürede küçük tilki yansıması (orb varyantı: içinde turuncu nokta; TASK-332 fox).
  4. Devrilmiş cullet kasası; kırıklar etrafına **gökkuşağı sırasıyla** dizilmiş (birinin sanatı).
  5. "Seconds" rafı: eğri vazo, "2nd" tabelası; büyük kâsenin içinde oturan martı.
  6. Şelale kenarında bankta oturan bot, elinde küçük prizma; kayada minik gökkuşağı (rainbowArc'ın 0.3 ölçekli varyantı, tier 3).
- **Zoom:** T0 pembe-yeşil kubbe + mor dev ağaç, kanopide renkli noktalar; gece **çok renkli parlayan tek ada** · T1 fasetli cam çatıların parıltısı, hot shop bacası, altın saatte gökkuşağı yayı · T2 prizmalar, paravanlar, cam çan ipi, zemindeki renk lekeleri, fener kayığı · T3 cam kırıkları, borular, orb'lar, fırın üstündeki kedi.

### 2.7 Research — Lonely Palm

| | Konsept | Pitch |
|---|---|---|
| ★ | **Yıldız Akademisi (Stargazer Academy)** | Cübbe-kep kolej kültürü: dış mekân kara tahtaları, çimende tripod teleskoplar, çay arabası, baykuş, hava balonu; "Kuyruklu Yıldız Gecesi" ve kep fırlatma. |
| | **Deniz Laboratuvarı (Marine Station)** | Denizaltı, gelgit ölçerler, akvaryum tankları, balina. Research vessel'la uyumlu, kampüsle az. |

**Detay bible — Yıldız Akademisi**

- **Sakinler:** monokl (var) + **mortarboard kep** (aksesuar varyantı: siyah kare + püskül `#F5C84C`), gövde `#4FC3C9` / `#86D9DD` / `#36A3A9`, **kitap yığını** carried (yeni slot 14). Hareket: dalgın; yürürken kitaba bakma (baş aşağı 10°), teleskopta durup "gökyüzüne bakma" pose'u.
- **Mimari:** teal/arduvaz `#3FB8AF`/`#666C7A` çatılar, tuğla `#C29A74` + krem stuko `#FFF4E0` (var), bakır-yeşil kubbeler `#7FD8B3`, beyaz gözlemevi, cam `#8EEBE0`, pirinç `#E0B050` detaylar. Süs: yıldız + teleskop glifi; her kapı üstünde Roma rakamıyla fakülte numarası.
- **İmza prop'lar:**
  - S: `chalkboard` (dış mekân, kuyruklu yıldız çizimi), `teaTrolley`, `bookCart`, `tripodTelescope` (çimende, 1.4 u, pivot yukarı), `pigeonPerch` (heykel başı — gull landing variant), `labFlask` rafı
  - M: `lectureSteps` (çimende 3 basamak amfi — chat hub), `orrery` (pirinç güneş sistemi, spin tag, 2 u), `weatherBalloonCart` (mast dibinde beyaz balon + sepet), `owlBox` (mast'ta baykuş yuvası), `miniVolcanoTerrarium` (terrarium varyantı: içinde minik Emberpeak + buhar!)
  - L: `observatorySlit` — observatory **varyantı**: kubbe yarığı açık + teleskop dışarıda (gece swap, LOD1 aynı). `bellCupola` — campus tower varyantı: çan + saat.
- **Bayrak/amblem:** beş köşeli yıldız kesimli teal flama, beyaz teleskop. Kütüphane önünde yedi fakülte flaması (bilim dallarının adaları: her ada bir "fakülte").
- **Tekneler:** research vessel (var) + **ölçüm sandalı** (rowboat varyantı, beyaz, pruvada enstrüman).
- **Günlük ritim:**
  - **06:00 Hava Balonu** — mast dibinden beyaz balon yükselir (mover, 60 u'da dither fade), baykuş yuvaya döner.
  - 09:00–16:00 — dersler: lectureSteps'te 4–6 bot + tahtada hoca (pose), çay arabası turu (worker itinerary spot), orrery döner.
  - 17:45 — altın saat: parterre'de kitap okuyan botlar (bench spot), kubbe yavaşça güneşe döner (yaw tag).
  - **22:00 Kuyruklu Yıldız Gecesi** — kubbe yarığı açılır (varyant swap + 2 s dither), teleskop gökyüzünü izler, gökte 8 s'lik kuyruklu yıldız (sky shader'da tek streak, emissive), botlar kep fırlatır (click-burst sparkle reuse, 6 kep = sparkle yerine siyah kare), baykuş uçar.
- **Ritüel:** Kuyruklu Yıldız Gecesi + relay adımı: 21:00'de dish'ler aynı anda HQ'ya döner, kubde yarığı teal ışık.
- **Zanaat/mal:** yıldız haritası tüpleri (teal), terrarium kavanozu (Design ve Coding bahçelerine — orada "R&D" etiketli bitki kavanozu görünür), hava balonu.
- **Ambient story'ler:**
  1. Gözlemevi koltuğunda kitapla uyuyan bot.
  2. Gece weather mast'ta baykuş (yeni critter: gull geo + kahverengi/beyaz renk, gece-only, 4 s blink).
  3. Scholar statue'nün kafasında güvercin (gull landing variant, scale 0.7).
  4. Tahtada kuyruklu yıldız çizimi + "?" (glif).
  5. Terrarium içinde minik buhar tüten yanardağ.
  6. Teleskop tripodu ve basamak olarak kullanılan kitap yığını; üstünde bot.
- **Zoom:** T0 beyaz kubbe + yeşil parterre ızgarası + dish · T1 kubbeler, çan kulesi, amfi · T2 tripodlar, orrery, çay arabası, balon arabası · T3 kitaplar, tahta, fincanlar, güvercin.

---

## 3. Adalar arası kültür

### 3.1 Ticaret rotaları (ne, hangi tekne, nereden nereye)

| Rota | Tekne | Yük (görünür kasa rengi) | Mevcut sistem |
|---|---|---|---|
| HQ ↔ her ada | **Feribot** (beyaz/coral, tente) | yolcu bot + posta çuvalı | `SAILBOAT` rotaları (Catmull-Rom) → hull varyantı + her iskeleye dwell |
| Coding → QA | mavi skiff | build kasası `#5B9BE6` | sailboat rota tipi `cargo`, iskele dwell 6 s |
| QA → DevOps | teftiş botu | onaylı kasa (yeşil tik) | aynı |
| DevOps → HQ, Marketing, QA | cargo ship (var) + römorkör | konteyner (turuncu = deploy) | `harbour-routes.ts` stadium loop'una ikinci durak |
| Design → HQ, Marketing | **fener kayığı** (gece parlayan tek tekne) | cam fener + vazo (mor); HQ iskele fenerleri ve Marketing marquee ampulleri "Design yapımı" | sailboat rota tipi |
| Design → Research | fener kayığı | **lens** kasası (mor, teleskop merceği) | aynı rota, ikinci dwell |
| Research → Design, Coding | ölçüm sandalı / research vessel | silika/kum kavanozu (teal; Design'da hot shop yanında), terrarium kavanozu (Coding bahçesi) | rowboat spot'u + vessel demirli |
| DevOps → Design | cargo ship | bakır boru (turuncu; hot shop bacası) | stadium loop ek durak |
| Marketing → her ada | **balonlar** (gökyüzü) | flama kumaşı (kırmızı rulo) | sky-craft orbit'leri |

Kasalar her iskelede birikir (`cargoCrate` 7 renk varyantı); hangi adada hangi renklerin
yığıldığı o adanın "ithalatını" anlatır (HQ'da yedi renk; QA'de mavi+yeşil; Marketing'de mor+turuncu).

### 3.2 Ortak festival — **Launch Day Relay** (her oyun günü 21:00, 70 s)

Takımadanın tek ortak töreni; sürüm çıkıyor. Bir **ışık bayrak yarışı** olarak saat 21:00'de
sırayla, 10 s arayla:

1. HQ — kule halkası 2× hızlı, çan, tüm feribotlar düdük (ışık) → 2. DevOps — krater burp + vinç konteyneri gemiye → 3. QA — kule 5 s yeşil, tikler yanar → 4. Coding — türbin uçları mavi, uçurtmalar fırlar → 5. Marketing — fener 3 flaş, searchlight'lar dikey, konfeti → 6. Design — kanopi vitrayı 7 accent rengini sırayla döner, cam çan ipi çalar → 7. Research — dish'ler HQ'ya döner, kubbe yarığı teal.

Hepsi **zaman-uniform'u** ile sürülür (`uFestival` = 0..1, ada başına faz offset); yeni program yok, agent yok. W15 "Relay Night" çekiminin konusu.

### 3.3 Ortak tabela sistemi — **Pennant (flama) sistemi**

- Her adanın **accent rengi + flama kesimi** (swallowtail / kite / square / streamer / chevron / scallop / star) tüm dünyada aynı anlama gelir.
- `pierSignpost`: her iskelede 7 oklu yön tabelası (ok rengi + kesim = hedef ada; ok yönü gerçek bearing — worldgen hesaplar).
- `pennantLine`: her adada kendi rengi; HQ'da yedi renk; Marketing'de hepsi (üretici).
- `cargoCrate`: origin rengi. Yelkenler: hedef adanın accent şeridi (sail varyantı).
- Ada etiketleri (T0 pill, var) zaten accent noktası taşıyor → sistem uçtan uca tutarlı.

### 3.4 Gökyüzü araçları bu dünyanın neresinde

- **Balonlar = Marketing'in "Hype Fleet"i.** Fuar alanındaki `balloonMast`'tan kalkar (Launch Show'da biri yükselir), her balon bir departman flaması taşır (balloon `tints` → 7 accent, sepetten sarkan flama streamer'ı; medium 4 balon = o seed'de rastgele 4 departman, high 5).
- **Zeplin = HQ'nun "Orchestrator Airship"i**: krem/turuncu gövde zaten HQ tonunda; kuyruğa yedi flama + gövdeye pusula-çan amblemi. Günde iki kez (08:00, 18:00) HQ kulesinin üstünde 20 s yavaşlar (orbit hız modülasyonu) — "all-hands" duyurusu.
- **Research hava balonu** küçük, beyaz, sabah kalkar, 60 u'da kaybolur (sky-craft'a girmez; mover).
- **Drone kuryeler** (var) Coding ↔ HQ arası mavi paket taşır.

---

## 4. Mühendislik kısıtları ve strateji

### 4.1 Bütçe gerçeği

- W11 (postcard, 7 ada) **298/300**. T2 görünümler ≤ 237, low ≤ 170'e yakın (D-macro 128).
- Her yeni **tier 0/1 def** = W11'e +2 call (LOD1 grubu + shadow). Her yeni **tier 2/3 def** = W11'e **0** (dither + D-048 skip), ama T2/T3 bakışta +2 (lit + shadow) per ada frustum'da.
- Yani kültür detayı "ucuz" olmak için **T2/T3'te yaşamalı**; T0/T1 kimliği **mevcut def'lerin varyantları** üzerinden verilmeli (D-032: LOD1 aynıysa tek grup).

### 4.2 Strateji (öncelik sırasıyla)

| # | Kural | Kazanç |
|---|---|---|
| B1 | **Far structure merge (TASK-407):** T0–T1'de bir adanın tüm LOD1 yapı instance'ları → ada başına **tek merged BufferGeometry** (far-blob ve terrain far-merge emsali). T2'ye geçişte instanced LOD0 gruplarına swap (mevcut tier geçişi + dither). | W11 ≈ 298 → **~190–210** (Research'ün ~20 grubu × 2 → 2). Tüm M19 headroom'u buradan. |
| B2 | **Varyant-öncelikli kimlik:** T0/T1 kültür parçaları mevcut def'lere varyant olarak (guildHall = hqAnnex v, forgeBell = foundry v, observatorySlit = observatory v, atelierTreePlatforms = giantTree v). LOD1 geometrisi aynı → 0 yeni LOD1 grubu. | ada başına 1–2 "büyük" parça bedava |
| B3 | **Kit prefab:** aynı sitede duran 3–6 küçük parça tek def'te birleşir (`containerYard` emsali): `onsenDeck`, `hotShop`, `gatherRing`, `lectureSteps`, `dummyBench`, `inspectionBooth`. | 5 def yerine 1 |
| B4 | **Tier ≥ 2 kuralı:** kültür kitinin ≥ %70'i tier 2–3; tier 3 mikro-def'lere `PropFlag.noShadow` (yeni flag, TASK-408) → +1 call yerine +2. | T2/T3'te ada başına ≤ 24 ek call |
| B5 | **Ada başına yeni def tavanı: 10** (≥ 7'si tier ≥ 2, ≤ 1'i tier 1, 0 tier 0). Ledger `content/cultures/<theme>.ts` başında yorum olarak + `budgets.ts`'e `cultureDefsPerIsland: 10` sabiti; test `cultures.test.ts` sayar. | öngörülebilirlik |
| B6 | **Palette atlas:** yeni renk yok; vertex colour, ROOFS/FLOWERS/WALLS/EMISSIVE'den. Palet dışı 3 istisna (`#FFD23F` hat var, `#B39DFF` UV flowers'tan, `#E0B050` brass sky-craft'tan) zaten dünyada. | 0 texture |
| B7 | **Screen/surface:** yeni surface kind iki tane — `marquee` (LED chase) ve `stained` (emissive = renk × güneş rengi × max(0, dot(n, −sunDir)) + gece lamba terimi; Design vitrayları) — ikisi de mevcut `aSpin.w` tag dalında, tek GLSL branch; mevcut `chart/code/checklist/terminal/spectrum/canvas` korunur. | 0 program |
| B8 | **Hareket = mover veya tag, agent değil:** balon, bayrak, vinç, uçurtma, karınca, kostik lekeleri (güneşle kayar), gökkuşağı (zaman kapılı) → `render/culture-movers.ts` (closed-form, sim time + sun dir). Botlar sadece pose/itinerary kazanır (agent cap sabit 60). | agent 0 |
| B9 | **Zemin dekorasyonu = ground layer:** hazard şerit, kırmızı halı, cam kırığı terrazzo (speckle) → mevcut `GroundSpec.layer` (tile/speckle) + 1 yeni `stripe` layer. Prop değil. Kostik lekeleri hareket ettiği için layer değil, tier-3 `noShadow` decal instance'ı. | 0 call |
| B10 | **Reuse:** butterflies → ladybug (renk), gull → owl/pigeon (renk + scale), bunting → glassChimeLine, hedge → bracketHedge, terrarium → bugZoo/miniVolcano, fairBooth → prizeBooth, lantern pool → UV hue, lighthouse beam → searchlight, lava emissive → hot shop fırın ağzı, ingot ısı tonu → kor cam. | geo yazma yükü ↓ |

**Kabul çizgisi:** M19 sonunda medium W11 ≤ 260, tüm T2 kültür çekimleri ≤ 300, low tüm ci ≤ 170; programlar 9/17/24 değişmez; agent cap değişmez; `hardPops = 0`; ladder ΔE eşiği (D-035) geçer.

### 4.3 Determinizm

- Kültür yerleşimi `rng.fork('culture', islandId)` ve alt-fork'lar `('story', k)`, `('kit', def)`; ada başına bağımsız (D-044 ile aynı sebep: bir adanın planı diğerini oynatmaz).
- Mover'lar ve festival sim-time fonksiyonu; capture'da dondurulur (`simt`).
- Varyant swap'ları (incidentSign, observatorySlit, heykel örtüsü) zaman-fonksiyonu + hash; `Date.now` yok.
- Hash pin'leri (height/zone/sites/routes/props) kültür yerleşimiyle değişir → `--assert` re-pin, tek commit'te.

### 4.4 Katman sahipliği (kim neye dokunur)

| Katman | Dosyalar | Agent |
|---|---|---|
| content | `src/content/cultures/{index,types,hq,coding,devops,marketing,qa,design,research,signage,rhythm}.ts`, `props-themes/<theme>.ts` (append), `life.ts`, `life-critters.ts`, `sky-craft.ts`, `shots.ts`, `budgets.ts` | ilgili agent; `index/types` orchestrator |
| world (saf veri) | `world/gen/plans/<theme>.ts` (kültür fixture + story spot emisyonu), `world/types.ts` (`StorySpot`) | worldgen |
| geo | `geo/themes/culture-<theme>.ts` (yeni, her ada ayrı dosya), `geo/themes/signage.ts`, `geo/themes/index.ts` (register — orchestrator birleştirir), `geo/sky-craft.ts` | props |
| render | `render/props/far-merge.ts` (yeni), `batcher.ts`, `render/culture-movers.ts` (yeni), `render/culture-clock.ts` (yeni), `render/materials/*` (stripe layer, marquee kind), `render/sky-craft.ts` | engine / shader / life (movers) |
| life | `life/workers*.ts`, `life/geo/workers.ts` (pose + carried), `life/critters.ts`, `life/geo/critters.ts` | life |

Ortak dosyalar (`app.ts`, `content/props.ts`, `geo/themes/index.ts`, `world/types.ts`,
`task-index.md`) **orchestrator'da birleşir**; agent'lar raporuna yazar.

---

## 5. Task kırılımı — M19 "Seven Cultures"

Format task-index ile aynı. Dalgalar sıralı, dalga içi paralel (≤ 3 agent). Bir dalgada iki agent
aynı dosyaya dokunmaz. Her satır: dokunulan dosyalar + doğrulama.

### Dalga 0 — bütçe kapısı + sözleşme (3 paralel)

| ID | Task | Agent | Boyut | Bağımlılık | Dosyalar | Doğrulama |
|---|---|---|---|---|---|---|
| TASK-407 | **Far structure merge:** T0–T1'de ada başına tek merged mesh (LOD1 yapı instance'ları, renkler aynı), T2'de instanced gruplara swap, edit/flood hide'ı (D-022) koruyan rebuild yolu, far-blob'larla aynı dither | engine | L | — | `render/props/far-merge.ts` (yeni), `render/props/batcher.ts`, `batcher.test.ts`, `render/rebuild.ts` | `pnpm shots wow --assert` ×3 kalite: W11 ≤ 230; `ladder` ×7 ada step ΔE ≤ 5; W1/W11 piksel farkı sadece dither; E-flood edit log geçer; DECISIONS D-049 taslağı raporda |
| TASK-408 | **Kültür sözleşmesi:** `CultureDef` tipi (palette, kit ledger, stories, rhythm, festival step, pennant), 7 stub dosya, `PropFlag.noShadow`, `budgets.cultureDefsPerIsland = 10`, `world/types.ts` `StorySpot`, `cultures.test.ts` (tavan + tier oranı + palette atlas kontrolü) | engine (orchestrator) | S | — | `content/cultures/*` (yeni), `content/props.ts` (flag), `content/budgets.ts`, `world/types.ts`, `content/cultures/cultures.test.ts` | `pnpm typecheck && pnpm test`; test tavanı ihlal eden sahte def'te kırmızı |
| TASK-409 | **Pennant & signage kiti:** `pennantLine` (7 kesim × accent, tek LOD1), `pierSignpost` (7 ok, bearing parametreli), `cargoCrate` (7 renk, tek LOD1), `sailStripe` yelken varyant geometrisi, amblem glif yardımcıları (`glyphs.ts`: tik, yıldız, çekiç, fırça…) | props | M | — | `geo/themes/signage.ts` (yeni), `geo/themes/glyphs.ts` (yeni), `geo/themes/signage.test.ts`, `content/props-themes/signage.ts` (yeni), `content/cultures/signage.ts` | geo testleri (bounds, min kalınlık 0.12 u, vertex sayısı); `?debug=gallery` çekimi `D-gallery-signage`; manuel: T2'de 7 kesim birbirinden ayırt edilir |

### Dalga 1 — kültür kitleri, geometri (props; 3 + 3 + 1 paralel, her biri ayrı dosya)

| ID | Task | Agent | Boyut | Bağımlılık | Dosyalar | Doğrulama |
|---|---|---|---|---|---|---|
| TASK-410 | HQ Liman Loncası kiti: timetableBoard, mailbag, bellPost, gullPerch, ferryAwning, harbourCrane, guildNoticeBoard, coffeeCart; `hqAnnex` v2 (guildHall), ferry hull varyantı (`life/geo` değil: `geo/coastal.ts` sailboat varyant 3) | props | M | 408, 409 | `geo/themes/culture-hq.ts` (yeni), `geo/coastal.ts`, `content/props-themes/hq.ts` (append), `content/cultures/hq.ts` (kit ledger) | `culture-hq.test.ts`; `cultures.test.ts` tavan; gallery shot `D-gallery-hq`; ≤ 10 def, ≤ 1 tier-1 |
| TASK-411 | Coding Rüzgâr Bahçeleri kiti: rubberDuck, kite, whiteboardA, pergolaDesk, hammock, kiteRack, giantDuck (T1), bracketHedge (hedge v3), windChimeTower (windTurbine v varyant, LOD1 aynı) | props | M | 408 | `geo/themes/culture-coding.ts`, `geo/themes/coding.ts` (varyant), `content/props-themes/coding.ts`, `content/cultures/coding.ts` | aynı kalıp; `D-gallery-coding` |
| TASK-412 | DevOps Kor Demircileri kiti: lavaLantern, ingotStack (3 ısı tonu), anvil, pagerRock, incidentSign (2 v), onsenDeck, signalHorn, serverShrine, pipeValveWheel (spin tag), onsenHouse (T1); foundry v2 (forgeBell) | props | M | 408 | `geo/themes/culture-devops.ts`, `geo/themes/devops-works.ts` (varyant), `content/props-themes/devops.ts`, `content/cultures/devops.ts` | aynı; `D-gallery-devops` |
| TASK-413 | Marketing Karnaval kiti: popcornCart, confettiCannon, posterRoll, marqueeSign (marquee surface tag), balloonMast, selfieSpot, prizeBooth (fairBooth v3), searchlightPair (beam quad), mascotStatue (T1) | props | M | 408 | `geo/themes/culture-marketing.ts`, `geo/themes/marketing-media.ts` (varyant), `content/props-themes/marketing.ts`, `content/cultures/marketing.ts` | aynı; `D-gallery-marketing` |
| TASK-414 | QA Müfettişler kiti: bugJar, stampDesk, conePyramid, clipboardWall, scoreboard (2 v), inspectionBooth, dummyBench, uvLampPost, flagMast; testHangar v2 (hallOfChecks), terrarium v3 (bugZoo), teftiş botu hull (sailboat v4) | props | M | 408 | `geo/themes/culture-qa.ts`, `geo/themes/qa-factory.ts` (varyant), `geo/coastal.ts` (410 ile **sıralı**: 410 bitince), `content/props-themes/qa.ts`, `content/cultures/qa.ts` | aynı; `D-gallery-qa` |
| TASK-415 | Design Cam ve Işık kiti: T3 `noShadow` — culletCrate (5 renk), blowpipeRack, glassOrb (3 renk, gece emissive), sampleShelf (+ "seconds" v), causticDecal (5 renk elips); T2 — hotShop kit prefab (fırın ağzı lav emissive + tavlama + kor parça ısı-tonu varyantları + smoke tag), prismSculpture (3 renk, tek LOD1), stainedScreen (2 desen, `stained` surface tag), gatherRing; T1 — rainbowArc (bantlı emissive yay, dither opaklık; + 0.3 ölçekli T3 mini varyantı); varyantlar: giantTree v3 canopyVitray (LOD1 v2 ile aynı), galleryPavilion v (fasetli cam çatı), bunting v glassChimeLine, sailboat v5 fener kayığı (emissive fenerler); bull's-eye rozet pencere atelier lot facade'ına. **Kural:** düz pane / aqua `#8EEBE0` yok (Research dili) | props | M | 408 | `geo/themes/culture-design.ts`, `geo/themes/design.ts`, `geo/landmarks.ts` (giantTree v3), `geo/coastal.ts` (414'ten sonra), `geo/decor.ts` (bunting v), `content/props-themes/design.ts`, `content/cultures/design.ts` | `culture-design.test.ts` (cam kalınlığı ≥ 0.15 u, hiçbir vertex colour `#8EEBE0` değil, tier dağılımı 5/4/1/0); `D-gallery-design`; giantTree v3 LOD1 hash == v2 |
| TASK-416 | Research Yıldız Akademisi kiti: chalkboard, teaTrolley, bookCart, tripodTelescope, pigeonPerch, lectureSteps, orrery (spin), weatherBalloonCart, owlBox, miniVolcanoTerrarium (terrarium v4); observatory v3 (slit açık), campusTower v (bellCupola) | props | M | 408 | `geo/themes/culture-research.ts`, `geo/themes/campus.ts`, `geo/themes/science.ts`, `content/props-themes/research.ts`, `content/cultures/research.ts` | aynı; `D-gallery-research` |

Paralellik: {410, 411, 412} → {413, 414, 415} → {416}. `geo/coastal.ts` üç task'ta sırayla
(410 → 414 → 415). `geo/themes/index.ts` kayıtlarını orchestrator her alt-dalga sonunda birleştirir.

### Dalga 2 — yerleşim, saf veri (worldgen; 3 + 3 + 1, ada başına ayrı plan dosyası)

| ID | Task | Agent | Boyut | Bağımlılık | Dosyalar | Doğrulama |
|---|---|---|---|---|---|---|
| TASK-420 | HQ yerleşim: iskele tentesi + tarife + lonca salonu varyantı, martı kazıkları, 7 flama direği, kasa yığınları (7 renk), signpost bearing'leri, 6 story spot (`StorySpot{kind, pos, rotY, defs}`), feribot rotaları her iskeleye dwell | worldgen | M | 410, 409 | `world/gen/plans/hq.ts`, `content/cultures/hq.ts` (site sayıları), `world/gen/routes.ts` (**sadece bu task**; dwell/cargo rota tipi) | plan testi (30 seed: ≥ 5 story spot, flama 7, signpost her iskelede); hash re-pin; `D-culture-hq` çekimi (T2 70 u, 08:00) |
| TASK-421 | Coding yerleşim: pergola masalar lawn'da, hamaklar türbin dibinde, kite rack + takılı uçurtma, dev ördek havuz B'de, bracketHedge labirenti, story spot'lar | worldgen | M | 411 | `world/gen/plans/coding.ts`, `content/cultures/coding.ts` | plan testi; `D-culture-coding` (T2, 14:00 rüzgârlı) |
| TASK-422 | DevOps yerleşim: onsen deck + house hot spring'de, fenerler quay/rail boyunca, külçe yığınları dökümhane önünde, shrine, incidentSign kapıda, story spot'lar; QA/HQ kasaları quay'de | worldgen | M | 412 | `world/gen/plans/devops-works.ts`, `content/cultures/devops.ts` | plan testi (levelSafe korunur); `D-culture-devops` (T2 17:45 onsen) |
| TASK-423 | Marketing yerleşim: popcorn + confetti sahne kenarı, marquee tabelalar, balloonMast fuar alanı kenarında (sky-craft spawn anchor'ı yazılır), selfieSpot fener ledge'i, mascotStatue giriş, story spot'lar | worldgen | M | 413 | `world/gen/plans/marketing.ts`, `content/cultures/marketing.ts` | plan testi; `D-culture-marketing` (T2 17:35 show) |
| TASK-424 | QA yerleşim: kabinler bariyerlerde, dummyBench yard'da, UV lamba direkleri, flagMast kule dibinde, kavanozlar pervazlarda (lot facade offset), bugZoo, karınca izi polyline, story spot'lar | worldgen | M | 414 | `world/gen/plans/qa.ts`, `content/cultures/qa.ts` | plan testi; `D-culture-qa` (T2 12:00 siren) |
| TASK-425 | Design yerleşim: hotShop glade quad'ının bir kenarına (lot gibi pad, baca rüzgâr altı), prismSculpture'lar sculpture garden yayında (mevcut torus/stack/arch ile dönüşümlü; her prizma için `causticAnchor` {pos, h, renk} yazılır), stainedScreen'ler easel walk'ta easel'lerle dönüşümlü (doğu/batı yüzleri karışık — şafak ve altın saatte ikisi de yanar), glassChimeLine glade lanes'te, gatherRing şelale manzaralı bankta, culletCrate/blowpipeRack hot shop yanında, `rainbowAnchor` = şelale ayağı (waterfall verisinden, `world/gen/waterfalls.ts` okunur, yazılmaz), fener kayığı dock'ta, terrazzo için glade paving zone işareti, story spot'lar (6) | worldgen | M | 415 | `world/gen/plans/design.ts`, `content/cultures/design.ts` | plan testi (30 seed: ≥ 2 prizma, ≥ 2 paravan, hotShop her seed, rainbowAnchor şelale varsa); hash re-pin; `D-culture-design` (T2 17:30 "Prizma Saati") |
| TASK-426 | Research yerleşim: lectureSteps lawn'da, tripodlar çimende, çay arabası itinerary spot, orrery quad'da, balon arabası mast dibi, owlBox, miniVolcano terrarium sırada, 7 fakülte flaması kütüphane önünde, story spot'lar | worldgen | M | 416 | `world/gen/plans/research.ts`, `content/cultures/research.ts` | plan testi (alan kısıtı: garden → glasshouse → base sırası korunur, MEMORY notu); `D-culture-research` (T2 22:00) |

Paralellik: {420, 421, 422} → {423, 424, 425} → {426}. Dalga 2 bitince `settlement-props.ts`'de
tanınmayan def (−1) kalmadığı `prop-mirror.test` ile doğrulanır.

### Dalga 3 — hayat ve hareket (3 paralel, ayrı dosyalar)

| ID | Task | Agent | Boyut | Bağımlılık | Dosyalar | Doğrulama |
|---|---|---|---|---|---|---|
| TASK-430 | **Kültür saati + Launch Day Relay:** `rhythm.ts` tablosu (ada × saat dilimi → lamp set, varyant swap, festival faz), `uFestival`/`uCultureLamps[7]` uniform'ları, relay sıralayıcı, varyant swap'ı dither ile (hardPops 0), UV hue lantern pool | engine | M | Dalga 2 | `content/cultures/rhythm.ts`, `render/culture-clock.ts` (yeni), `render/uniforms.ts`, `render/night/*` | `culture-clock.test.ts` (21:00+10k s'de adım k aktif); W15 "Relay Night" çekimi; `hardPops = 0` |
| TASK-431 | **Kültür mover'ları:** closed-form sahneler — HQ çan + feribot fanfarı hizası, DevOps vinç kaldırma, QA bayrak + devrilen koni + karınca izi, Coding uçurtma kalkışı, Marketing konfeti (particle burst) + searchlight, **Design kostik lekeleri** (instance pos/scale/renk = f(sunDir, prizma anchor); güneş < 0 → gizli) + **gökkuşağı yayı** (zaman kapısı 06:00–07:30 / 16:30–18:30, yaw = güneşin tersi, dither fade-in 2 s) + kor parça ısı-tonu varyant swap'ı, Research hava balonu + teleskop izleme; hepsi sim-time (+ sun dir uniform'u), 260 u'da gizli | life | M | Dalga 2 | `render/culture-movers.ts` (yeni; movers.ts kalıbı), `content/cultures/movers.ts` | `culture-movers.test.ts` (t → poz deterministik; kostik 12:00'de prizma altında, 17:30'da ≥ 2× uzun); `D-culture-*` çekimlerinde hareket 0.5 s farkla değişir; W11 call farkı 0 |
| TASK-432 | **Bot kültürü:** yeni carried slot'lar (satchel 11, megaphone 12, blowpipe 13 — ucu emissive kor damla, books 14), aksesuar varyantları (kaptan şapkası, berrak gözlük Coding / kehribar gözlük Design, mortarboard — attribute eklemeden `aSeed` kodlaması), pose'lar (hammer, stamp, rest/hammock, selfie = "ışığa tutma", gaze-up, pipe-turn idle), per-tema itinerary + WORK_SPOTS yeni spot'lara (Design: hotShop → gatherRing → stainedScreen), chat hub = gatherRing/lectureSteps, story spot'ta "tableau" botu (ambient pool'dan, sabit) | life | M | Dalga 2 | `content/life.ts` (ACTIVITY, WORKERS, WORK_SPOTS), `life/workers.ts`, `life/workers-world.ts`, `life/geo/workers.ts`, `life/life-material.ts` (sadece decode) | `workers.test.ts`; attribute sayısı 15/16 değişmedi; agent cap 60 aşılmaz (`--assert`); `D-story-*` macro çekimleri |
| TASK-433 | **Kritter kültürü:** ladybug (butterfly renk v, QA), owl (gull v, Research gece), pigeon (gull v, scale 0.7, heykel perch), **warm-spot cat** (Design tavlama fırını + DevOps vinç kabini: `cat spot kind = warm`, uyku pozu gündüz de), orb-fox (Design: glassOrb'a bakan tilki, TASK-332 fox ile), forge-cat (siyah), capybara baretli varyant (TASK-332 ile birleşir), maskot yengeç (creature scale 1.6, Marketing), kâsede martı (gull landing spot = sampleShelf) | life | M | 432 (dosya çakışmasın diye sıralı) | `content/life-critters.ts`, `life/critters.ts`, `life/geo/critters.ts`, `life/land.ts` (cat spot kind) | `critters.test.ts`; `D-story-*`; iki aynı tür senkron değil (global fail) |

### Dalga 4 — görsel kalite (2 paralel)

| ID | Task | Agent | Boyut | Bağımlılık | Dosyalar | Doğrulama |
|---|---|---|---|---|---|---|
| TASK-440 | **Kültür zemini + ışık:** `stripe` ground layer (hazard, kırmızı halı), Design glade paving'de **cam kırığı terrazzo** (mevcut speckle layer, FLOWERS renkleri — yeni mekanizma yok), `marquee` surface kind (LED chase), **`stained` surface kind** (emissive = vertex renk × güneş rengi × max(0, dot(n, −sunDir)) gündüz; gece × `#FFC870` × 0.8 — mevcut `aSpin.w` tag dalı, `uSunDir`/`uSunColor` zaten var), kostik decal'larının renk × güneş rengi tint'i (instance colour), rainbowArc emissive bant materyali (lit program emissive + dither opaklık; transparent program yok), hot shop fırın ağzı = lava emissive sınıfı, lava-cam fener/UV/cam orb emissive hue'ları bloom eşiğinde, searchlight beam (lighthouse beam reuse), gece grade'inde ada başına hue spare (Design gece çok renkli kalır, diğerleri amber) | shader | M | Dalga 3 | `content/themes/<theme>.ts` (**sadece `ground`**), `content/activity.ts` (SURFACE), `render/materials/*`, `render/night/*` | `pnpm shots wow dev --assert` ×3; programlar 9/17/24 sabit; W3/W10 regresyon yok (ΔE ≤ 3); `D-culture-*` gece varyantları; `stained` 12:00'de ≈ 0 emissive, 06:00 doğu yüzü > 0.5 (shader birim testi) |
| TASK-441 | **Gökyüzü kültürü:** balon tints → 7 accent + sepet flaması, zeplin HQ livery (yedi flama kuyruk, amblem), `balloonMast` spawn anchor'dan kalkış (Launch Show'da faz reset), zeplinin HQ üstünde yavaşlaması, Research hava balonu mover'ı (431 ile sözleşme: sky-craft değil) | props | S | 423, 431 | `content/sky-craft.ts`, `geo/sky-craft.ts`, `render/sky-craft.ts` | `sky-craft.test.ts`; `D-sky-*` çekimleri ≤ 300 kalır (bugün 338–341 → 407 sonrası düşmeli; düşmezse D-sky cam'leri re-pin) |

### Dalga 5 — çekimler, QA, docs (sıralı)

| ID | Task | Agent | Boyut | Bağımlılık | Dosyalar | Doğrulama |
|---|---|---|---|---|---|---|
| TASK-450 | **Preset'ler:** W15–W19 (§6; W19 çift saat 12:00/17:30), `D-culture-<theme>` ×7, `D-story-<k>` ×8 macro, `D-gallery-<theme>` ×8; pin'ler; `wow`/`dev`/`ci` set üyelikleri; `--assert` ×3 kalite | engine | S | Dalga 4 | `content/shots.ts`, `scripts/shots.ts` | contact sheet açılıp okunur; bütçe tablosu raporda |
| TASK-451 | **M19 QA:** 10 seed sweep, ladder ×7, before/after W11 call tablosu, ART_BIBLE §11 + yeni §12 kültür checklist puanı (her ada: 5 katman var mı?), regresyon listesi | qa | M | 450 | `mar-docs/shots/M19.jpg` | rapor; FAIL'ler düzeltme task'ına döner |
| TASK-452 | **Docs:** ART_BIBLE §4 kültür sütunu + §5 kit tabloları + §7 yeni animasyon satırları + §11 W15–W18 + yeni §12 "Cultures"; DECISIONS D-049 (far merge) D-050 (kültür sözleşmesi + def tavanı) D-051 (pennant sistemi); MEMORY; task-index M19 | docs | S | 451 | `mar-docs/*`, `mar-tasks/*` | — |

**Sıra ve paralellik özeti:** D0 {407 ∥ 408 ∥ 409} → D1 {410 ∥ 411 ∥ 412} → {413 ∥ 414 ∥ 415} → {416} →
D2 {420 ∥ 421 ∥ 422} → {423 ∥ 424 ∥ 425} → {426} → D3 {430 ∥ 431 ∥ 432} → {433} → D4 {440 ∥ 441} →
D5 450 → 451 → 452. Her task ayrı commit; D0, D2, D4 sonunda push (Pages).
**Kesme noktası:** 407 W11'i ≤ 230'a indiremezse D1'e geçmeden dur — tavan 10 yerine 6'ya iner ve
tier-1 def'ler yasaklanır (plan hâlâ çalışır, kit küçülür).

---

## 6. Yeni wow / dev çekimleri

| ID | Çekim | Seed · kamera · saat | Geçme kriteri |
|---|---|---|---|
| **W15** | **Relay Night** | 1001 · postcard pose · 21:00 +35 s | 7 adanın ≥ 5'inde festival ışığı aktif ve birbirinden farklı renkte; Design fenerleri havada; DevOps krater burp; land L ≥ 0.12; W11 ile aynı kadraj |
| **W16** | **Harbour Guild Morning** | 1001 · T2 70 u HQ limanı, pitch 38° · 06:05 | ≥ 3 feribot V hâlinde çıkıyor (wake), yedi flama okunur, çan direği, martılar kalkmış, posta çuvalları iskelede |
| **W17** | **Jewel Tree Night** | 1001 · raw cam easel walk'tan dev ağaca, ≈ 45 u · 20:15 | Kanopi vitrayında ≥ 8 panel ≥ 4 farklı renkte yanık (bloom), hot shop ağzı kırmızı, ≥ 6 cam fener light walk'ta, fener kayığı iskelede parlıyor, ateş böcekleri; ada gece diğerlerinden **renk sayısıyla** ayrılır (≥ 4 hue ≥ %60 doygunluk) |
| **W18** | **Green-Light** | 4004 · `village:qa` · 16:00 (cart turu bitişi) | Kule yeşil flaş, bayrak direkte yukarıda, hazard şeritler + UV direkleri, ≥ 2 bugJar, dummyBench okunur |
| **W19** | **Prism Hour** | 1001 · raw cam sculpture garden'dan şelaleye, güneş arkada ≈ 40 u · 17:30 | ≥ 2 prizma ve altlarında güneşin tersine uzamış kostik lekeleri (12:00 çekimine göre ≥ 2× uzun), şelale ayağında gökkuşağı yayı, batıya bakan paravan içten yanık, `gatherRing`'de ≥ 2 bot ışığa tutma pozunda; aynı kadraj 12:00'de: gökkuşağı yok, lekeler prizma altında (çift çekim) |
| D-culture-hq … -research | ada başına T2 kültür çekimi (saatler §5 Dalga 2) | — | kit ≥ 6 def görünür; call ≤ 300 medium |
| D-story-1…8 | T3 macro: rack kedisi, hamak botu, onsen capybara, maskot selfie, manken molası, **tavlama fırını kedisi + kor parça**, uyuyan astronom, incidentSign | 1001 · raw cam ≈ 18 u | sahne tek bakışta okunur; hiçbir şey yüzmüyor; hardPops 0 |
| D-gallery-<theme> ×8 | `?debug=gallery` kit vitrini | — | tüm def/varyantlar, min kalınlık, bevel |
| D-sky-hype | Marketing fuarından balon kalkışı, raw cam ≈ 60 u · 17:35 | 1001 | balon mast'tan ayrılmış, konfeti, searchlight; ≤ 300 |

---

## 7. Riskler

| Risk | Önlem |
|---|---|
| 407 far-merge ladder'ı kırar (geometri aynı ama normal/AO farkı) | LOD1 vertex colour + normal aynen kopyalanır; ladder step ΔE ≤ 5 kapı; pixel diff raporu |
| Edit modu (Phase 2) merged mesh'i eskitir | `rebuild.ts` edit komutunda etkilenen adayı yeniden merge eder (EDIT_LOGS E-* setleri kapı) |
| Research'te yer yok (MEMORY) | 426 kiti küçük (tripod, trolley, steps); lectureSteps garden'dan sonra yerleşir, sığmazsa düşer |
| Aksesuar/pose `aSeed` kodlaması taşar | 432 önce decode tablosunu yazar; attribute eklenmez; sığmayan varyant düşer (mortarboard önce, kaptan şapkası sonra) |
| T2 çekimlerde call 300'ü aşar | B5 tavanı + noShadow; aşarsa önce tier-3 shadow'lar, sonra def birleştirme (B3) |
| Festival + gece grade'i W3/W10 kriterlerini oynatır | 440'ta regresyon ΔE ≤ 3 kapısı; festival sadece 21:00–21:10 |
| Design gece çok renkli glow W10 "Rainy Grove" ve ladder gece adımlarını bozar | `stained` gece terimi 0.8 ile sınırlı, bloom eşiği altında kalan paneller çoğunluk; W10 yağmurda vitray emissive × 0.6 (weather delta) |
| Design ile Research cam dili karışır | TASK-415 testi: Design vertex colour'da `#8EEBE0` / `paneHigh` yok; Research kiti renkli faset almaz (docs §12 kuralı); QA 451 checklist maddesi |
