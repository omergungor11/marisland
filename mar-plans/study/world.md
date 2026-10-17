# Dünya ölçeği çalışması — adaların arası ve çevresi

> Araştırma + tasarım notu (2026-10-17). Kapsam: deniz, bağlantılar, gökyüzü, hava/olaylar,
> takımada kompozisyonu, intro/kamera, sandbox hook'ları. Tek bir adanın içi değil.
> Kaynak kareler: `scratchpad/study-shots/L-hq/{700,480,340}.png`, `L-design/{700,480,340}.png`,
> `shots/wow/{W1,W11,W15}.png`, `mar-docs/shots/M14b.jpg`, `M14b-sweep.jpg` (10 seed).
> Kod yazılmadı; `src/` ve `pnpm shots` dokunulmadı.

## 1. Şu an

**Dünya ölçeğinde okunan (iyi):**
- Yedi ada yedi silüet: siyah koni + buhar (DevOps), kırmızı-beyaz deniz feneri + dönme dolap
  (Marketing), beyaz türbinler (Coding), kubbe + çanak (Research), pembe-yeşil kubbe (Design),
  coral hilal + saat kulesi (HQ), nane plato + check tower (QA). W1'de hepsi ayırt ediliyor.
- Turkuaz halkalar ve toprak duvarlar (W11) — P3 "islands are rings" tutuyor; komşu halkalar
  bazı seed'lerde birleşip tek şelf oluyor (M14b `D-overview`), bu en güzel anlardan biri.
- Gök katmanı var: 4 balon + zeplin (W1, W11), ufukta bulut bankları (W11). Gece: Marketing
  searchlight'ları, DevOps lav parıltısı, Research teal kubbe (W15) adaları birbirinden ayırıyor.
- Şelaleler kıyıya küçük beyaz "iğne" koyuyor (W1, L-design/480) — T0'da bile okunuyor.

**Boş ya da zayıf:**

| Nerede | Kare | Sorun |
|---|---|---|
| Derin deniz (halkaların dışı) | L-hq/700, L-hq/480, W1 | Kare alanının ~%55–60'ı düz `#1E5FA8`. İki üç küçük bulut gölgesi ve 2–3 piksellik tekne noktası dışında hiçbir şey yok. "Boş deniz" PROMPT'un kaçınılacaklar listesinde. |
| Kümenin dış kenarı | `shots/ladder-study/L-marketing/700`, `L-qa/700` | Kameraya göre kümenin dışında kalan yarım kare (sol yarı) tamamen boş; tek doku düşük güneşte deep band glitter'ı (`L-research/480` sağ alt). Küme dışına hiçbir şey taşmıyor: skerry, resif, uzak silüet yok. |
| Adalar arası kanallar | W1, W11 | Feribot rotaları, kargo döngüleri, drone hatları var ama **T0'da görünmez** (wake 2 u, drone T2+). Adalar birbirine bağlı hissettirmiyor; yedi ayrı disk gibi. |
| Halka dışı sığlık yok | L-design/700 | Her ada kendi diskinde; iki disk arasında resif, kum bankı, kayalık yok. Beacon Rock'ın 2–3 sea stack'i tek istisna (W1 sağ alt). |
| Ufuk çizgisi | W11 | Bulut bankları iyi ama su düz çizgiyle bitiyor; arkada hiçbir uzak silüet yok. Dünya 7 adadan ibaret hissi. |
| Gece gökyüzü | W15 | Yıldız yok (shader'da var ama bu pozlamada/sis bandında kaybolmuş), ay görünmüyor, balonlar karanlık siluet. Relay'in gök tarafı sadece zeplin lambası. |
| Comet Night | Research kültürü | 22:00 "Comet Night" ritüelinde gökte kuyruklu yıldız **yok**; sadece pano + teleskop tableau. Adı verilen şeyin kendisi eksik. |
| Deniz canlıları T0/T1 | W1, W11 | Yunus 2 adet, 30–60 s'de bir, T1+; T0'da deniz tamamen ölü. Balina yok. |
| Seed çeşitliliği | M14b-sweep | 10 seed'in hepsi aynı "yedi yuvarlak diskin kümesi". Layout arketipi tek (dart-throw + relaxation). |
| HQ konumu | W1, W11 | D-057 HQ'yu "takımadanın kavşağı" yaptı (7 cadde gerçek adalara bakacak) ama layout HQ'yu merkeze koymuyor; seed 1001'de HQ köşede (W1 sağ üst). Pusula meydanı köşeden bakınca çarpık okunur. |
| Yakın kareler | W2, W16 | Limanda tekneler var ama ufukta geçen hiçbir şey yok; "arka plan trafiği" yok. |

**Bütçe gerçeği** (`budgets.ts`, D-049): medium W11 148/300 call → T0/T1'de bolca yer var.
Tıkanan yer **program sayısı** (medium 17/20, high 17–24/24) ve **agent** (medium 60, pik 61).
Yani dünya ölçeğinde her yeni şey: mevcut program (lit factory / water / sky / puffs), closed-form
mover (agent değil), T2'de dither-out (yakın karelerin 244–275 call'ı var).

**Kullanıcı kararı sınırı:** D-045 adalar arası köprüleri tamamen kaldırdı. Aşağıda sabit fiziksel
bağlantı (köprü, viyadük, boardwalk) **önerilmiyor**; zip line / teleferik sadece §4'te soru olarak var.

## 2. Fikir kataloğu

Sütunlar: Tier = okunduğu kademe · Zaman = saat/ritim · Maliyet S/M/L · Roller · Risk.
Determinizm varsayılanı: dünya verisi `rng.fork('<label>')`, hareket `f(simt)`.

### 2.1 Deniz

| # | Fikir | Pitch · nerede · tier | Zaman · hareket | Wow anı | Maliyet · roller | Risk |
|---|---|---|---|---|---|---|
| D1 | **Resif sığlıkları** / Reef shoals | Adalar arasındaki derin boşluğa seabed'i −2…−6 u'ya kaldıran 3–6 yama (heightfield'a noise-blob). Su shader'ının derinlik koyulaştırması + yeni "shoal" tint'iyle turkuaz-yeşil lekeler. Halkalar arası · **T0** | Statik; köpük nabzı + güneş glitter'ı üstünden geçer | W1'de deniz "düz boya" olmaktan çıkar; iki ada bir şelfle bağlanmış hissi | **S–M** · worldgen (heightfield pass) + shader (su tint band'i) | Halka rengi `uSdfTex`'ten (kıyı mesafesi) geliyor; resif kara değil → ya sdf'e "sığ seabed = kıyı" katkısı ya da ayrı depth-tint. Köpük halkası sdf'siz çıkmaz. 0 program. |
| D2 | **Kayalık adacıklar** / Skerries | 3–6 minik toprak parçası (çap 4–12 u): kum bankı + tek palmiye ("Lonely Palm" nostaljisi), martı kolonili kaya, gelgit düzlüğü. Halkaların arasında, `COAST.minIsletCells` filtresine istisna · **T0** | Statik; martı kalkışı, köpük | Yedi diskten "takımada"ya geçiş; W1'in sağ üçte birini doldurur | **M** · worldgen (layout'a `skerry` sınıfı, kendi mini halkası) + props (3 def) | Her skerry 1 terrain chunk + halka; label almamalı; rotalar A*'da engel görsün. Roster hash'leri değişir (re-pin). |
| D3 | **Sea stack tarlaları ve kemer** / Stack fields + arch | Beacon Rock'ın stack'lerini genelleştir: rüzgârüstü kıyılarda 2–4 stack kümesi, bir tanesinde kemer (iki stack + üst blok). · **T0** silüet, T1 kemer | Statik; dalga köpüğü dibinde | Bir kemerin altından geçen feribot (rota A* kemeri geçit sayarsa) | **S** · worldgen (`seaStack` scatter kuralı, mevcut def) + props (arch varyantı) | Instanced, tier 0 def zaten var. Kemer altı derinlik ≥ `ROUTES.minDepth` olmalı. |
| D4 | **Batık koyu** / Wreck shoal | `sunkenShip` landmark'ını (eski lagün) bir resif yamasına taşı: gövde −2 u'da, kırık direk su üstünde, çevresinde 3 şamandıra + balık sürüsü spot'u. · T1 direk, T3 gövde | Alçak gelgitte (D10) direk daha çok çıkar | T3'te turkuaz suyun altında tahta gövde + balıklar; "keşfettim" hissi | **S** · worldgen (anchor), life (fish spot) | Def var (`LANDMARK_RENDER.sunkenShip underwater`). Su alpha'sı derinlikle; −2 u'da görünür mü shots ile doğrula. |
| D5 | **Yosun ormanı gölgeleri** / Kelp shadows | Resif ve halka kenarında koyu yeşil-mavi yama (su shader'da noise-mask tint, geometri yok); T3'te 5–7 ince şerit "kelp" prop'u sallanır. · T0 leke, T3 şerit | Kelp sway = rüzgâr gust'ı (mevcut `aSpin` wind) | T0'da su "canlı" dokulu olur; T3'te balıklar kelp arasına girer | **S** · shader (tint) + props (kelp, noShadow) | Doku tekrarı: noise ölçeğini ada başına fork'la. |
| D6 | **Balina** / Whale | 14 u gri balina, derin kanalda closed-form yüzey turu: 90 s'de bir çıkar, 6 s sırt + fıskiye (puffs), kuyruk vurur, dalar. 1 adet · **T0** (sırt 14 u, fıskiye 8 u) | Her 90–150 s, seed'li faz; dalış parabolü | Postcard'da sağ alt boş sudan sırt + fıskiye; tıklayınca kuyruk + splash | **M** · props (geo), life (mover, `render/movers.ts` deseni) + shader (fıskiye = puffs) | Agent değil, mover; T2'de yakın kameraya dalış (`fadeNear`). Rotalarla çakışmasın: tekne polyline'larından ≥ 20 u. |
| D7 | **Yunus eskortu** / Ferry escort | Mevcut 2 yunusu serbest yerine feribotun pruvasına bağla: feribot cruise'dayken ark çizer, dwell'de dağılır. · T1 | Feribot timetable'ı ile (D-054 closed form) | T1'de "feribotla gelen yunuslar" | **S** · life (`life/ferry.ts` pose → dolphin anchor) | Agent sayısı aynı. Yunus yüksek hız 3.4 u/s'yi 2 arkla yakalamalı. |
| D8 | **Kanal şamandıraları** / Channel markers | Her feribot rotası boyunca 25 u arayla kırmızı/yeşil şamandıra çifti; gece lamba (lamp set 20:00→06:00). · **T1** sıra, T0 gece ışık noktaları | Bob + gece flicker | W15'te adalar arası noktalı ışık hatları → "bağlı" hissi | **S** · worldgen (rota polyline → fixture), content (buoy lamp set) | Buoy def ve 3 varyant var. Instance sayısı ~60–120, instanced tek call. Medium'da lamp bloom bütçesi. |
| D9 | **Deniz yolları** / Sea lanes | Rotaları su shader'ına ince, açık köpük-çizgi olarak yaz (polyline'ı `uSdfTex` benzeri ikinci kanala rasterize; 1.5 u genişlik, %12 açılma, akış animasyonu yönünde). · **T0** | Çizgi tekne yönünde kayar (uTime) | Haritadan bakınca gerçek bir "ulaşım ağı" | **M** · shader + worldgen (raster) | Doku belleği (bir kanal daha); rotalar değişince re-raster. Abartılırsa harita grafiği gibi olur — %8–12 ile başla. |
| D10 | **Gelgit** / Tide | Su seviyesi 600 s günde ±0.35 u (tek uniform). Lagün bandı genişler/daralır, kum bankları (D2) çıkar/batar, batık direği (D4) açılır. · T1–T3 | 2 kabarma/gün; köpük hattı 0.6 s gecikmeli | Sabah 06:00 kum bankında yürüyen yengeçler, 12:00'de aynı yer su altı | **S** · shader (uniform) + engine (foam sdf gelgit ofseti) | Kıyı sdf dokusu statik: foam band'ini sdf + tide ofsetiyle oku; iskele ayakları/stilt hut yüksekliği sabit kalmalı (±0.35 tolerans var). |
| D11 | **Sığ taban detayı** / Shallow floor | Halka içi tabana kum dalgası çizgileri + caustic (Design `causticDecal` shader dalı genelleştir) + 2–3 deniz yıldızı spot'u. · T3 | Caustic 2 s döngü | W8'de su altı "kristal" hissi | **S** · shader (terrain material'e sualtı dalı) | Terrain program dalı → 0 yeni program ama uniform/şube maliyeti; sadece `depth<4` cell'lerde. |

### 2.2 Bağlantılar

| # | Fikir | Pitch · nerede · tier | Zaman · hareket | Wow anı | Maliyet · roller | Risk |
|---|---|---|---|---|---|---|
| B1 | **Fener ağı** / Beacon network | Skerry'lere (D2) 2–3 mini fener (6 u) + mevcut Marketing feneri: gece her biri 8 s/tur, **faz sırası rota sırasıyla** (HQ'dan uzaklığa göre 1 s kaydırmalı) → ışık dalgası takımadayı dolaşır. · T0 gece | 18:30–06:30 | W15'te 4 huzme sırayla süpürür | **S** · props (mini fener varyantı) + shader (beam instanced, mevcut cone) | Beam opaklığı 0.35 × 4 → sis üstünde aşırı parlaklık; her beam 1 call (fade > 500 u). |
| B2 | **Kargo konvoyu** / Cargo convoy | ISLAND_CULTURES §3.1'in yapılmamış satırları: römorkör + 2 mavna (origin-renkli konteyner) HQ↔DevOps↔QA stadyum döngüsünün T0 versiyonu; konvoy 3.6 u/s, mavnalar 6 u arayla spring-follow. · **T0** (3 nokta + ortak wake) | Sürekli; HQ'da 06:00/18:00 fanfare'de iskelede | Postcard'ın boş suyunda hareket eden "tren" | **M** · life (mover, `harbour-routes.ts` loop genelleme) + props (tug/barge) | Mover = agent değil ama wake mesh'i paylaş (D-055). Rota-rota çakışma: loop'u A* rotasından türet. |
| B3 | **Deniz uçağı** / Seaplane | Marketing'in sarı deniz uçağı: fuar koyundan kalkar (wake 6 s), 45 u'da takımadayı 1 tur dolaşır, HQ önüne iner; 1 adet. · T0 (şerit + gölge), T1 | 09:00 ve 15:00, 90 s uçuş; pervane `aSpin` tag | Kalkış köpüğü + iniş sıçraması; balonların arasından geçiş | **M** · props (geo) + life (closed-form yol: 2 spline) + shader (gölge blob) | Sky-craft ile yükseklik çakışması: 45 u balon bandının altında (34–60) → 28 u'da uç. Program 0. |
| B4 | **Kalıcı wake izleri** / Lingering wakes | Feribot/konvoy wake'i 2 u'da sönmek yerine 40 s boyunca açılan, solan köpük izi (foam-trail ring buffer, T0'da 1 px çizgi) → rotalar "kendini çizer". · **T0** | Tekne hızıyla | W1'de adaların arasında beyaz ince kavisler | **S** · shader (`foam-trail.ts` ömür + genişleme) | Trail buffer boyutu ×4; T0'da aliasing → min 1.5 px genişlik. D9'un hafif alternatifi. |
| B5 | **Drone hatları T1'e** / Drone lanes at T1 | Drone kuryeleri (T2+) gece T1'de de görünsün: paket glow'u bloom'a girsin, hat boyunca 3 ardışık drone (closed form faz). · T1 gece | 20:00–02:00 yoğun | HQ↔Coding arası mavi noktalar akar | **S** · engine (fade distance), content (`DRONES`) | Medium call +1; W15 bloom bütçesi. |
| B6 | **Semafor zinciri** / Signal chain | M20 semaforu (TASK-469) + diğer adaların en yüksek noktasına bir "sinyal lambası": 21:00 relay'de her ada sırası gelince **bir sonrakine doğru** 3 flaş yollar; HQ semaforu o adayı gösterir. · T0 gece | 21:00, 10 s aralık (D-052 faz) | Relay'in görsel "bayrağı" gökte değil kuleler arasında gezer | **S** · life (emissive tag, mevcut relay uniform) + props (lamp varyantı) | 0 program, 0 agent. TASK-469'a bağımlı. |
| B7 | **Balon posta hattı** / Balloon mail | Hype Fleet orbit yerine 1 balonu **gerçek rota**ya al: HQ mast → her ada üstünde 20 s askı (posta çuvalı iner, ip + spring) → sonraki ada. · T0–T1 | Sürekli; günde 1 tam tur (600 s / 7 ≈ 85 s/ada) | T1'de balonun altından sarkan çuvalın iskeleye inişi | **M** · life (sky-craft route modu) + props (çuval hook) | Sky-craft orbitleri eş-açısal tasarlandı (çakışmaz); rota modu ayrı yükseklik katmanı almalı. |

### 2.3 Gökyüzü

| # | Fikir | Pitch · nerede · tier | Zaman · hareket | Wow anı | Maliyet · roller | Risk |
|---|---|---|---|---|---|---|
| G1 | **Göç V'si** / Migration chevron | 9–15 kuşluk V, 110 u'da, haritayı 70 s'de bir uçtan öbür uca geçer (closed form, rüzgâr yönü). Martı sürüsünden farklı: daha büyük, kanat çırpışı yavaş, uzun boyunlu (kaz). · **T0–T1** | Şafak 05:30 ve akşam 18:30, günde 2 geçiş | Golden hour'da güneşin önünden V geçişi (W2 arka planı) | **S** · life (gull kodunu formasyon modunda) + props (kaz varyantı) | Gulls instanced; +1 call. Capture'da simt'e bağlı. |
| G2 | **Kuyruklu yıldız ve kayan yıldızlar** / Comet + meteors | Sky dome shader'ına 2 dal: (a) Comet Night 22:00–23:00 ufuktan yükselen kuyruklu yıldız (sprite değil; dome üstünde mesafe fonksiyonu kuyruk), Research çanakları ona döner (hook var); (b) açık gecelerde 40–90 s'de bir 0.6 s kayan yıldız. · **T0–T3** (gök her yerde) | 22:00 ritüeli; rastgele ama seed'li | W15'in boş göğüne "olay"; Research'ün adı olan şey nihayet gökte | **S** · shader (sky.glsl, 0 program) + life (dish yaw hook) | Yıldız görünürlüğü önce düzeltilmeli (G5). Bloom eşiği 0.9 → kuyruk HDR'de parlasın. |
| G3 | **Aurora** / Aurora | Seed'li nadir (seed hash %30) açık gecelerde 00:00–03:00 ufuk üstünde yeşil-mor perde (sky shader'da 2 oktav noise şerit, dikey gradient). Su yüzeyine hafif renk. · T0–T1 | Gece; 90 s'de bir dalga | Gece orbit'inde arkada dans eden perde | **S** · shader (sky dal + su hemi tint) | Palet: `#7FD8B3` ve `#B07CE0` tonlarında, ≤ %60 doygunluk. Her seed'de olursa sıradanlaşır. |
| G4 | **Takımyıldızlar** / Culture constellations | Hash'li yıldızlara 7 takımyıldız ekle: her kültürün glifi (çan, `</>`, çekiç, megafon, tik, prizma, teleskop) 6–9 parlak yıldız + ince çizgi; adanın üstündeki gök yönünde. · T0–T1 gece | 21:00–04:00, çizgiler Comet Night'ta belirir | Research teleskopuyla "kendi takımyıldızını" bulmak | **S** · shader (sky) + content (glyph nokta tabloları) | Çizgiler çok belirginse kitsch: alpha 0.15. Portrait'te ufuk kırpılabilir. |
| G5 | **Gece göğü düzeltmesi** / Night sky fix | W15'te yıldız ve ay görünmüyor: sis bandı + star alpha + bloom. Star peak'i ve ufuk fade'ini tier'a göre ayarla, ayı relay saatlerinde 25–40° yüksekte tut. · T0 | Gece | Night shot'ların %40'ı gökyüzü; şimdi düz lacivert | **S** · shader + content (lighting SKY) | Hiç. Önce bu, sonra G2–G4. |
| G6 | **Bulut çeşitliliği** / Cloud kinds | Tek tip 6–10 pamuk yerine 3 sınıf: alçak sabah bulutları (dawn'da 20 u'da, mist ile birleşir), DevOps buharının beslediği **tek kule kümülüs** (volkan üstünde sabit, 30 u yüksek), akşam ince sirrus (sky shader dalı). Gölge genişliği sınıfa göre. · T0–T1 | Saat ve hava FSM'ye bağlı | Golden hour'da volkan üstünde pembe kule bulut | **M** · shader (clouds) + content | Puff sayısı → bulut gölge maskesi aynı alanı örnekliyor (ARCH §7), kule bulut gölgesi volkanı karartmasın (gölge ×0.82 yerine 0.92). |
| G7 | **Havai fişek** / Fireworks | Relay'in 7. adımı (Research 22:00 comet) bittiğinde HQ limanından 20 s havai fişek: `bursts.ts` ile 6 patlama, kültür accent renklerinde; su yansıması (moon glitter dalı). · T0–T2 | 22:01, 20 s, sadece relay sonrası | Gece postcard'ında doruk; W15'e bir "W15b" | **S** · shader (bursts) + life (relay faz) | Particle bütçesi medium 6000 (yağmurla çakışmaz: yağmurda iptal). Bloom; ses tasarımı §10 kapsam dışı. |

### 2.4 Hava · mevsim · olaylar

| # | Fikir | Pitch · nerede · tier | Zaman · hareket | Wow anı | Maliyet · roller | Risk |
|---|---|---|---|---|---|---|
| H1 | **Mevsim paleti** / Seasons | 4 game günü = 1 yıl: ilkbahar (blossom yoğun, çimen `#C9E86F`), yaz (mevcut), sonbahar (yaprak `#F5C84C`/`#E8735A` karışımı, altın saat daha uzun), kış-yumuşak (soluk çimen, kar değil — sis + açık yeşil, bulut sayısı ↑). Palet tablosu + foliage tint uniform'u. · **T0** | Gün sayacına bağlı; `?season=` ile sabit | Aynı seed'in 4 kartpostalı | **M** · content (palet × 4) + shader (foliage/çimen tint uniform; blob renkleri de!) | D-031 cross-tier: T0 ağaç blob'ları da tint almalı yoksa ladder kırılır. Kar istenmez (cozy ada). |
| H2 | **Fırtına** / Squall | Rain state'inin nadir alt varyantı: 2–3 şimşek (sky flash + sun intensity spike 80 ms + 0.4 s gürültü için swell ×1.6), yel değirmenleri hızlı, balonlar alçalır (sky-craft y −10), feribotlar dwell'de bekler. · T0–T2 | Rain'in %25'i, 60 s | Flaş anında tüm adalar beyaz-mavi; sonra gökkuşağı (H3) | **S–M** · shader (flash) + life (balon/feribot gate) | Flaş foto-epilepsi: max 2/10 s, reduced-motion'da kapalı. Determinizm: flaş zamanları weather FSM seed'inden. |
| H3 | **Dünya gökkuşağı** / World rainbow | Yağmur bitince 40 s, güneşin karşısında sky dome'da 7 bantlı yay (Design'ın lokal arkı değil; gök ölçeği). · T0–T1 | Rain → clear geçişi, 17:00 öncesi | W10 sonrası "yağmur dindi" karesi | **S** · shader (sky dal) | Design rainbowArc ile aynı anda olmasın (gate). |
| H4 | **Regatta günü** / Regatta Day | Game-gün sayacı 3'e bölünen günlerde 11:00: tüm yelkenliler (4 + feribot hariç) takımadayı saran 1 ring rotasında yarışır, flama şamandıraları (D8 varyantı) ring üstünde; kazanan HQ'da 12:00 fanfare'de çan. · T0 | 11:00–11:45; sailboat hızı ×1.5, heel 12° | Postcard'da 4 wake birden kavis çizer | **M** · worldgen (ring route) + life (route swap, closed form) | Route swap dither (hardPops 0). Agent sayısı aynı. |
| H5 | **Fener salımı** / Lantern float | Design Light Night 20:00: lantern boat'tan 30 küçük yüzen fener bırakılır, rüzgârla 40 s'de HQ'ya sürüklenir, 06:00'da yok (dither). Instanced emissive küçük prop, closed form (başlangıç + rüzgâr vektörü + swell). · **T0** ışık noktaları, T2 fener | 20:00–06:00 | W15/W17 arasında suda yüzen ışık hattı | **S** · props (lantern, noShadow) + life (mover) | Bloom bütçesi; adaya çarpınca kıyıda biriksin (sdf clamp). |
| H6 | **Kanal sisi** / Channel mist | Mist bandını (var) adalar **arasına** bağla: sabah 05:30–07:30 sadece kanallarda y 0–4 u sis dili (sdf > 12 u maskesi), adalar sis üstünde ada gibi. · T0–T1 | Sabah; rüzgârla sürüklenir | "Bulut denizi" sabahı: W1'de yedi ada sisten çıkıyor | **S** · shader (mist mask = sdf) | Sis T0'da deniz boşluğunu "örter" (D1–D2 ile çelişmez: sabah 2 saat). |
| H7 | **Petal rüzgârı** / Blossom wind | Design'dan rüzgâr yönünde 120 u'ya kadar pembe petal parçacıkları (puffs materyali, 0.15 u, 400 adet) gust dalgalarında. · T1–T2 | İlkbahar (H1) ya da her gün 06:00–08:00 | Design'dan HQ'ya pembe akış | **S** · shader (puffs varyantı) | Particle bütçesi; rain ile çakışırsa kapalı. |

### 2.5 Takımada kompozisyonu

| # | Fikir | Pitch · nerede · tier | Zaman · hareket | Wow anı | Maliyet · roller | Risk |
|---|---|---|---|---|---|---|
| K1 | **Layout arketipleri** / Layout archetypes | Dart-throw kümeye 3 alternatif şablon, seed'le seçilen: **Yay** (7 ada kavisli zincir, iç deniz açık), **Halka** (ortada 90 u boş "İç Deniz", HQ halkada), **Omurga** (iki paralel sıra, arada kanal). Hepsi `LAYOUT.minGap/maxNearestGap`'i korur. · **T0** | — | Sweep sheet'inde 10 seed 10 farklı harita | **M** · worldgen (`layout.ts` şablon + relaxation) | Her şablon için 30-seed plan testleri; postcard fit (D-040) yay/omurga'da en-boy değişir. W-shot seed'leri re-pin. |
| K2 | **HQ merkezde** / HQ at the hub | D-057'nin 7 caddesi gerçek adalara bakacaksa HQ **kümenin ağırlık merkezine en yakın** ada olmalı: relaxation'da HQ'ya `pull` ×2 + diğerlerine HQ'dan açısal yayılma (60° ± 15°). · T0 | — | Pusula meydanı yukarıdan bakınca haritanın kendisi | **S** · worldgen | Layout hash değişir (tüm seed'ler re-pin: tek seferlik). TASK-466'dan önce yapılmalı, yoksa caddeler bir yöne yığılır. |
| K3 | **Ortak şelf** / Shared shelves | İki komşu ada arası < 55 u ise halkalarını sığ (−3 u) bir "eşik"le birleştir (heightfield köprüsü, su üstüne çıkmaz). Tekneler eşiğin derin geçidini kullanır. · T0 | Gelgitle (D10) eşik üstü köpüklenir | Turkuaz "boyun"lar; takımada tek organizma | **S** · worldgen | D1 ile aynı sdf sorunu; D-045 köprü yasağı toprak için değil — ama kullanıcıya sor (§4 S2). |
| K4 | **Hayalet adalar** / Ghost islands | 950–1200 u'da 3–5 ulaşılamaz pastel silüet (10–16 tri koni/kubbe, sis renginde, kamera sınırının dışında; sky layer'da değil sahnede, gölge yok). · T0, postcard ufku | Hafif sis dalgalanması | W11'de bulut bankının önünde uzak ada gölgeleri — "dünya daha büyük" | **S** · props + engine (kamera AABB'si dışı) | Kamera 800 u'ya kadar çıkıyor: silüetler hep sis içinde kalmalı (fog %75 @1200). Label yok. |
| K5 | **Derin deniz dokusu** / Deep sea texture | Deep band'e düşük frekanslı 2 oktav noise ile "abyss" (−%8 L) ve "sand channel" (+%6 L, mavi-yeşil) lekeleri; güneş glitter'ı deep'te de (TASK-353 sun glint borcu). · T0 | Lekeler sabit, glitter zamanla | Düz `#1E5FA8` biter | **S** · shader | Aşırı olursa "mermer" görünür; L farkı ≤ %8, noise ölçeği ≥ 60 u. 0 program. |
| K6 | **Lonely Palm geri** / Lonely Palm returns | Research büyüyünce bible'ın "tek palmiyeli minicik kum adası" kayboldu. D2'nin kum bankı varyantı olarak **her seed'de 1 adet**, ismi "Lonely Palm", kendi mini label'ı, tıklama tepkisi (hindistan cevizi düşer, yengeç koşar — §7 tablosunda hâlâ var). · T0 | Hindistan cevizi düşme şansı gust'ta %1 | PROMPT vizyonunun eksik parçası | **S** · worldgen + life | D2'ye bağımlı. |

### 2.6 Kamera · intro

| # | Fikir | Pitch · nerede · tier | Zaman · hareket | Wow anı | Maliyet · roller | Risk |
|---|---|---|---|---|---|---|
| C1 | **Tur modu** / Tour mode | 30 s idle orbit yerine: W-preset zinciri (W1 → W16 → W2 → W13 → W9 → W19 → W3 → W15 …) `fitToSphere` easeInOut ile 8 s kal, 4 s uç; HUD'da "Tour" düğmesi, herhangi giriş durdurur. Saat tur sırasına göre `time=` scrub eder (golden → night). · hepsi | Idle 30 s sonra | Site "kendi kendini gösterir": ilk 90 s'de 8 wow | **S** · engine (`camera/poses.ts` + `content/shots.ts` zaten var) | Preset'ler raw cam + seed'e bağlı: tur sadece `postcard/village/island:` fitted preset'leri kullansın. LOD pop'ları yolculukta (342 u eşiği) — bloom-in zaten yumuşatıyor. |
| C2 | **Binme kameraları** / Ride cams | Feribot (D-054 closed form), balon, zeplin pose'una kilitli kamera; HUD'da tekneye tıkla → "Ride" ikonu. Pitch 12°, FOV 40°. · T1–T2 | Feribot turu ~4 dk | Yunus eskortu (D7) ve kemer (D3) altından geçiş | **S** · engine (controls pose override) | Yakın kamerada tekne gövdesi çok düşük poly → ride'da gövde LOD0 varyantı. Capture'da `ride=ferry&simt=`. |
| C3 | **Intro v2** / Intro variants | Mevcut 10 s'ye 2 seed'li alternatif: (a) **Deniz seviyesinden**: kamera su üstünde 2 u, yunus arkı önden geçer, yükselerek postcard'a; (b) **Zeplinden**: HQ Orchestrator gondolundan aşağı bakış, flama ipi önde, alçalarak postcard'a. Üçü `?intro=0|1|2`. · — | Açılış | Her yeni seed'de farklı giriş | **M** · engine (`intro.ts` key setleri) + life (yunus zamanlaması) | Deniz seviyesi: ufuk + sis dolu ilk kare zayıf olabilir — shots ile doğrula. Portrait'te mevcut kalır. |
| C4 | **Relay takip** / Relay follow | 21:00'de "Watch the relay" toast: kabul edince kamera 7 adayı sırayla 10 s'de bir `island:` preset'iyle gezer, sonunda W15 postcard + havai fişek (G7). · T1 → T0 | 21:00–22:01 | Relay şu an sadece postcard'dan okunuyor; takip edince her adanın ritüeli yakından | **S** · engine (zamanlayıcı + fit) | Kullanıcı girişi iptal eder; capture'da `relay=follow&simt=`. |
| C5 | **Hızlı gün** / Time-lapse toggle | HUD time dial'a "⏩": 600 s gün 60 s olur, gölgeler akar, pencereler sırayla yanar; 2 dk sonra normale döner. · T0–T1 | — | Gölge süpürmesi + relay 6 s'de | **S** · engine (clock scale; sim ayrı saat kullanıyorsa agent'lar hızlanmasın) | Agent sim'i 10× hızda yürüyen botlar komik olur: sadece env clock'u ölçekle. |

### 2.7 Sandbox (Faz 2 hook'ları)

Mevcut: arazi fırçası, prop koy/kaldır (buoy, seaStack, sunkenShip, sailboat, rowboat, stiltHut, lilyPad dâhil), edit log URL.

| # | Fikir | Pitch · nerede · tier | Zaman · hareket | Wow anı | Maliyet · roller | Risk |
|---|---|---|---|---|---|---|
| S1 | **Adacık damgası** / Islet stamp | Fırça modu "raise seabed": −6 u'dan +1.5 u'ya kadar yükseltince D1 resifi, sonra D2 kum bankı, sonra çimenli adacık otomatik oluşur (zone/sdf incremental, TASK-202 var); 1 palmiye + halka kendiliğinden. · T0–T2 | — | Kullanıcının kendi "Lonely Palm"ı | **M** · worldgen (edit-derive: sdf/halka güncelle) + engine | SDF incremental zaten var; `COAST.minIsletCells` edit'te esnetilmeli. Rota A* yeniden koşmalı (dirty). |
| S2 | **Rota editörü** / Route editor | İki iskeleye tıkla → feribot hattı (A* + dwell), hat boyunca D8 şamandıraları otomatik; silince kalkar. Edit log'a `route` komutu. · T0–T1 | — | Kendi ulaşım ağını kurmak | **M** · worldgen (routes incremental) + life (ferry timetable rebuild) + engine (UI) | Agent sayısı: hat başına 1 feribot; medium cap 60 (pik 61!) → sadece high'da 3+ hat, medium'da 1 ek. |
| S3 | **Fener ve bayrak dikme** / Beacon & claim | Skerry'ye mini fener (B1 ağına katılır) ya da bir kültürün flama direğini dik → o adacık o kültürün "ileri karakolu": label accent'i, kargo kasası rengi, drone hattı. · T0 gece / T1 | Fener 18:30'da ağa girer | Gece kendi fenerinin ışık dalgasına katılması | **S** · engine (placeable + lamp set) + content | Lamp bloom bütçesi; label çakışma nudging var. |
| S4 | **Olay tetikleyici** / Event triggers | Edit panelinde "Festival" sekmesi: relay'i şimdi başlat, Regatta (H4), Lantern Float (H5), fırtına (H2), mevsim (H1) seç; URL'e `?event=`. · hepsi | — | Shots harness'i için de yarar (deterministik) | **S** · engine (params) | Hiç; sadece gate'lerin dışa açılması. |
| S5 | **Adacık adlandırma** / Name an islet | Kullanıcı damgası (S1) adacıklara `NAME_SYLLABLES`'tan öneri + düzenlenebilir label; edit log'da kısa string. · T0 | — | Paylaşılan URL'de "Ömer Kayası" | **S** · engine (UI + codec) | Codec sürümü +1; string uzunluğu ≤ 16. |
| S6 | **Deniz prop'ları** / Sea placeables | Placeables'a D2–D6'nın prop'ları: kelp, kemer, mini fener, batık varyantı, mavna; "floating/seabed" kuralları mevcut. · T1–T3 | — | — | **S** · engine (`content/edit.ts` listesi) | D2–D6 bittikten sonra 1 satırlık ekleme. |

## 3. Paketler

### P1 — Hızlı kazanımlar (S, büyük görsel geri dönüş; 1 oturum)

Sıra ve bağımlılık (hepsi `pnpm shots ci/dev` + W1/W11/W15 karşılaştırmasıyla doğrulanır):

| Sıra | Fikir | Neden önce | Bağımlılık |
|---|---|---|---|
| 1 | **G5** Gece göğü düzeltmesi | 3 gece wow shot'ın arka planı boş; her gök fikrinin ön koşulu | — |
| 2 | **K5** Derin deniz dokusu | T0 karelerinin yarısı; 0 program, tek shader dalı | — |
| 3 | **B4** Kalıcı wake izleri | Rotalar T0'da görünür olur, mevcut foam-trail | — |
| 4 | **D8** Kanal şamandıraları + lamp set | Gece W15'te "bağlantı" ilk kez okunur | rotalar (var) |
| 5 | **D3** Sea stack tarlaları + kemer | Mevcut def, scatter kuralı | — |
| 6 | **H6** Kanal sisi | Sabah karesi için tek maske | — |
| 7 | **G2** Comet Night'ta gerçek kuyruklu yıldız + kayan yıldızlar | Research'ün ritüeli adını hak eder | G5 |
| 8 | **C1** Tur modu | Var olan preset'leri yeniden kullanır; demonun ilk 90 s'i | — |

Doğrulama: W1/W11 "deniz boş" kriteri (deep band'de ≥ 3 görünür öğe: wake, stack, buoy ışığı),
W15'te ≥ 40 yıldız pikseli ve kuyruklu yıldız, medium program ≤ 20, W11 call ≤ 200.

### P2 — İmza (takımadayı unutulmaz yapan 4 şey)

| Sıra | Fikir | Neden imza | Bağımlılık |
|---|---|---|---|
| 1 | **D2 + K6** Skerries + Lonely Palm geri | "Yedi disk" → "takımada". PROMPT vizyonundaki kum adası geri gelir; D1/D4/B1/S1 hepsi buna oturur | K2 (layout değişecekse önce o, tek re-pin) |
| 2 | **D1 + K3** Resif sığlıkları + ortak şelf | Suyun kendisi içerik olur; W1'in %55 boşluğu turkuaz damarlara döner | sdf'e sığ-seabed katkısı (shader + worldgen ortak karar) |
| 3 | **D6** Balina | Tek bir büyük canlı, 90 s'de bir, postcard'ın sağ altında — insanlar bunu anlatır | D1 (balina rotası resiflerin dışından) |
| 4 | **B1 + B6 + G7** Fener ağı + semafor zinciri + havai fişek | Relay'in dünya ölçeğinde bir "gece sahnesi" olur: ışık dalgası kuleler ve fenerler arasında gezer, 22:01'de HQ'da patlar | D2 (fenerler skerry'lerde), TASK-469 (semafor), G5 |

İsteğe bağlı beşinci: **G4** takımyıldızları — ucuz, kültür sistemiyle uçtan uca tutarlı, Research
teleskobuna anlam verir.

### P3 — İddialı (büyük bahisler; her biri ayrı milestone)

| Sıra | Fikir | Getiri | Bedel · risk | Bağımlılık |
|---|---|---|---|---|
| 1 | **K1 + K2** Layout arketipleri + HQ merkezde | Seed çeşitliliği 1→4; D-057 pusula meydanı anlam kazanır | Tüm pinned seed'ler ve raw cam'ler re-pin (bir kerelik büyük iş); plan testleri ×4 şablon | TASK-466'dan **önce** K2; K1 sonra |
| 2 | **H1** Mevsimler | Aynı dünyanın 4 yüzü; paylaşılabilirlik | Blob renkleri, ladder (D-031/035) ×4 palet; content tabloları ikiye katlanır | TASK-464 (blob renkleri per-species) |
| 3 | **B2 + B3 + B7** Konvoy + deniz uçağı + balon posta | Takımada "çalışır": denizde, havada, gökte rota trafiği T0'da okunur | 3 yeni mover + 3 prop seti; wake paylaşımı; yükseklik katmanları | D9 ya da B4 (rotalar görünür olsun ki trafik anlamlı) |
| 4 | **S1 + S2 + S3** Sandbox: adacık damgası + rota editörü + fener dikme | Faz 2'nin "dünya" tarafı: kullanıcı sadece ada içi değil, takımadayı kurar | Incremental sdf/halka/rota; agent cap (feribot/hat) | D2, D8, B1 bitmiş olmalı |
| 5 | **C3 + C2** Intro varyantları + binme kameraları | Her açılış farklı; feribot turu 4 dk'lık "ikinci demo" | Düşük poly tekne gövdesi, yeni intro key setleri ×2 shots doğrulaması | D7, D3 (ride'da görülecek şeyler) |

## 4. Kullanıcıya sorular

1. **Takımadaya küçük adacıklar ekleyelim mi (D2/K6)?**
   (a) Evet, 3–6 skerry + her seed'de bir "Lonely Palm" · (b) Sadece Lonely Palm, 1 adet ·
   (c) Hayır, su altı resifler yeter (D1) · (d) Hayır, yedi ada net kalsın.

2. **D-045 köprü yasağı ne kadar geniş?**
   (a) Sadece taş viyadük; zip line / teleferik / su altı eşik (K3) serbest ·
   (b) Hiçbir fiziksel bağlantı yok, sadece tekne/hava (K3 eşiği de yok) ·
   (c) K3 eşiği olur (su üstüne çıkmaz), hava hattı olmaz.

3. **Layout: HQ merkeze alınsın mı, şablonlar eklensin mi (K1/K2)?** Tüm seed'ler bir kez re-pin olur.
   (a) Sadece K2 (HQ merkez), şablon yok · (b) K2 + K1 dört şablon · (c) Mevcut kalsın.

4. **Deniz hayatı için tek büyük hayvan: hangisi?**
   (a) Balina (D6) · (b) Dev deniz kaplumbağası (daha yavaş, T1) · (c) Yunus sürüsü büyüsün (D7, agent yok) · (d) Hiçbiri.

5. **Deep band dokusu ne kadar?** (K5) — (a) Hafif (%6–8 L) · (b) Belirgin kanallar + resif
   lekeleri (D1 ile) · (c) Düz kalsın, sadece glitter.

6. **Gece göğü**: (a) Sadece yıldız + ay düzeltmesi (G5) + kuyruklu yıldız (G2) · (b) + takımyıldızlar (G4) ·
   (c) + aurora nadir seed'lerde (G3) · (d) Hepsi + havai fişek (G7).

7. **Mevsim var mı?** (H1) — (a) Evet, 4 game günü döngüsü · (b) Sadece `?season=` ile sabit, döngü
   yok · (c) Hayır, hava durumu yeter.

8. **Demo açılışı**: (a) Mevcut intro + tur modu (C1) · (b) Seed'li intro varyantları (C3) ·
   (c) Relay takip (C4) ön planda · (d) Intro'ya dokunma.
