# Marketing + Research remake çalışması — 2026-10-17

> Kapsam: **Beacon Rock / Karnaval Yayıncıları** ve **Lonely Palm / Yıldız Akademisi**. Araştırma + tasarım;
> kod değişmedi. D-057'nin HQ/Design için yaptığı çerçeve burada iki ada için tekrarlanır: her ada için
> 3 yön, bir fikir kataloğu, wow çekimi, paketler ve karar soruları.
>
> **Görsel kaynak:** `shots/ladder-study/L-marketing` (tam set) ve `L-research` (700–120 u, yazım
> bitince 85–21 u henüz render edilmemişti) + önceki ladder setleri (`shots/ladder-t451/L-*`, 2026-10-13;
> `shots/ladder-lhigh/L-marketing`, 2026-10-12 — lee tarafından bakan kareler, fuarı gösterir) ve
> `shots/wow-t451/` W4 · W9 · W14 · W15 kareleri okundu. Yeni ladder-study kareleri eski setlerle aynı
> bulguları veriyor (Research 120 u karesi batı/güneybatı çimeninin tamamen boş olduğunu doğruluyor). Ladder hedefi
> Marketing'de rüzgâr üstü uçuruma, Research'te doğuya baktığı için T2/T3 yorumları o açılardan; fuar
> alanının T3'ü sadece W4/W15'ten görüldü. ART_BIBLE §12.1 QA tablosu (TASK-451) ile çapraz kontrol edildi.

## 0. Ortak bütçe çerçevesi (her iki ada için geçerli)

| Kısıt | Değer | Sonuç |
|---|---|---|
| `budgets.cultureDefsPerIsland` | 10 def / ada, ≥ 70 % tier ≥ 2, tier 0 yok, en fazla 1 tier-1 | **İki ada da 10/10 dolu.** Yeni bir ledger girişi ancak D-057 tarzı `cultureCapOverride` ile gelir. |
| Marketing tier-1 | `mascotStatue` zaten tier-1 | İkinci tier-1 (ör. teleferik pilonu) cap override + tier-1 sayısı override ister. |
| Research tier-1 | 0 | **Bir tier-1 hakkı boş** (büyük sera / zirve kulesi için kullanılabilir). |
| Varyantlar | Ledger'a girmez (D-050) | En ucuz yol: `antennaTower`, `giantScreen`, `bunting`, `hedgeParterre`, `conservatory`, `cultureGate`, `mailLine`, `sailboat` **varyantları**. Başka adanın def'inin varyantı da ledger'a girmez ama LOD1 = v0'ın (D-049 far merge) — T0'da ana varyant gibi okunur, buna göre seçilmeli. |
| Draw call (medium 300) | W11 postcard 298 (MEMORY) | T0/T1'de görünen **yeni instanced grup** eklemek riskli; yeni def'ler tier 2–3'te, T0/T1 kimliği varyantlarla. |
| Agent cap (medium 60) | sheep 6, fireflies 9/swarm, tableau 5 | Yeni canlı = mevcut türlerin yeniden ağırlıklanması ya da **spot critter** (tableau, agent değil). |
| Ladder (D-035) | step ΔE ≤ 5, drift ≤ 4 | Silüeti değiştiren her şey (zirve yükseltme, iskele) L-marketing / L-research hedef ve `FRAMING.ladder.shift.research`'ü yeniden pinletir. |
| Determinizm | `rng.fork('<label>')` | Yeni her yerleşim kendi fork'uyla; mevcut fork'lara çekiliş eklenmez (komşu yerleşimler kaymasın). |

---

## 1. Marketing — Beacon Rock · Karnaval Yayıncıları

### 1.1 Şu an

Arazi: 25 u'luk stack, rüzgâr üstü sarp uçurum (P3 istisnası), lee tarafında üç raf (`ledge0` üst: anten +
ofisler, `ledge1` orta: stüdyo + dükkânlar, `ledge2`: fuar diski) ve iniş koyu + iskele. Rüzgâr üstünde üç
ayrı **sea stack** (6–15 u). Zirve: Broadcast Tower (fener v2, 19 u) → kırmızı Ad Boulevard → dev ekran.

| Tier | Ne okunuyor (P) | Zayıf (W) |
|---|---|---|
| **T0** 700–480 u | Kırmızı/beyaz fener tek baskın dikey (P2 ✓); kahverengi katmanlı stack; gece ekran + marquee parıltısı (W15'te en parlak ada ✓) | Üç sea stack **çıplak kahverengi yumru** (birinde 2 çam); gündüz stack'in üstü "yeşil kapak" — fuar ve dönme dolap lee'de, çoğu açıdan stack'in arkasında, T0'da **okunmuyor**; dev ekran gündüz ince bir levha |
| **T1** 340–170 u | Rüzgâr üstü uçurum katmanları güzel; lee raflarının kırmızı çatıları; iskele | Kırmızı bulvar **cadde değil, düzensiz leke** gibi; zirve çimeninin ~%40'ı boş (fenerin güneyi/batısı sadece çam + çiçek speckle); 25 u'luk uçuruma **hiçbir şey asılı değil** (dünyadaki en büyük boş düzlem); stack'ler yine boş |
| **T2** 120–60 u | Bulvar: billboard'lar, banner pole'lar, kafe, dev ekran, çatısında çanak olan stüdyo — "medya" okunuyor; fuar: çizgili tenteler, dönme dolap, sahne, popcorn | Raf kenarları boş ("arka duvara yaslı ofis + önünde çimen"); raflar arası merdivenler **görünmüyor** (switchback'ler zemin boyası); iskele çıplak; koyda su aktivitesi yok (plan §2.4'teki parti dubası yapılmadı); ad buoy'lar gündüz silik |
| **T3** 42–21 u | Kırmızı karo zemin, poster ruloları, popcorn arabası, banner pole'lar, maskot | Bulvar T3'te **%60 boş zemin**; karo dışında zemin hikâyesi yok; DOF 6 px bulanıklığı az nesneyle "boş sahne" hissini büyütüyor |
| **Gece** W4/W15 | Fener huzmesi, searchlight çifti, marquee, ekran, pencereler — adanın en güçlü hâli | Uçurum, stack'ler, su, koy **karanlık**; ışık sadece zirve + fuarda; iskelede tek fener |

**Kullanılmayan / tekrar eden arazi:** (1) üç sea stack — T0'da görünen üç bedava silüet; (2) rüzgâr üstü
uçurum yüzü; (3) zirve çimeninin güney/batı yarısı; (4) koy suyu ve iskele; (5) raf duvarları (3–3.5 u
toprak duvar, hepsi aynı). Tekrar eden: `mediaOffice` × 2–3 aynı kırmızı çatı kutusu; `fairBooth` sıraları.

### 1.2 Yön önerileri

**A · Kablolu Karnaval / Cable Carnival (stack'ler sahneye çıkar)**
Üç sea stack'i adanın üç "yayın istasyonu" yapar: zirveden bir **teleferik hattı** (pilon + kablo + 3
gondol; TASK-465 `mailLine`'ın gondol varyantı) stack'lerin üstünden geçip en uzaktakine iner. Stack 1: kırmızı
yanıp sönen **verici direği** (antennaTower varyantı), stack 2: denize bakan **dev afiş** (billboardV2
varyantı, sea-facing), stack 3: **atlama kulesi + splash show**. Uçurum yüzüne dikey **"ON AIR" neon**
harfleri iner. Zirve ve fuar olduğu gibi kalır; T0 silüeti "fener + üç ışıklı stack + gondol" olur.
En az arazi değişikliği, en çok T0/T1 kazancı.

```
   rüzgâr →          [stack1 ▲ verici]  ~~~ gondol ~~~ [ZİRVE: fener ▌ON AIR▐ bulvar ▬▬ ekran]
                  [stack2 ▭ afiş]                      ╲ ledge0: anten · ofisler
               [stack3 ⊤ atlama]                        ╲ ledge1: stüdyo · dükkân
                        ~ splash ~                        ╲ ledge2: FUAR ◯ dönme dolap
                                                             ╲ koy: iskele ─ parti dubası
```

**B · Tahta İskele Lunaparkı / Boardwalk Pier (fuar suya iner)**
Fuar diski raf yerine **koyun üstünde ahşap bir boardwalk'a** taşınır: kazıklı iskele, üstünde stilt
booth'lar, ucunda **su üstünde dönme dolap**, yüzen sahne, parti dubası ve ampul dizili korkuluklar — gece
su yansıması/glitter ile. Boşalan `ledge2` "stüdyo backlot" olur: dekor kulisleri, kamera vinci, karavanlar.
En büyük görsel sıçrama (su + ışık), ama kıyı/dock sistemine (`findDock`, carve, mooring) en çok dokunur.

```
                 [ZİRVE fener ▬ bulvar ▬ ekran]
                    ╲ ledge0 anten · ofisler
                     ╲ ledge1 stüdyo · dükkân
                      ╲ ledge2 BACKLOT: kulis ▭ vinç ⊢ karavan
                        ╲ koy ═══ BOARDWALK ═══╗
                           booth booth  sahne  ║ ◯ su üstü dönme dolap
                               ~ parti dubası ~╝
```

**C · Yayın Kalesi / Broadcast Citadel (zirve yoğunlaşır, raflar bağlanır)**
Zirve gerçek bir stüdyo kompleksi olur: bulvar **düz bir marquee caddesine** çevrilir (üstünde ampul
dizileri çapraz geçer), dev ekran üç yüzlü bir **jumbotron kulesi** olur, rüzgâr üstü dudağa gergili
**anten ormanı** (3–4 direk, kırmızı lambalar), raflar arası **füniküler** (duvar boyunca eğik ray + kabin
mover) ile her raf görünür biçimde bağlanır. Sea stack'lere sadece verici direkleri. Fuar kalır.
En "mimari" yön; T2/T3'ü en çok doldurur, T0'da daha az değişir.

```
   anten ormanı ▲▲▲ [fener] ═ MARQUEE CADDESİ (ampul hatları ╳╳) ═ [JUMBOTRON ▣▣▣]
                                 ║ füniküler ray
                        ledge0 ══╬══ anten · ofis · ofis
                        ledge1 ══╬══ stüdyo · foto · matbaa
                        ledge2 ══╩══ FUAR ◯ dolap · sahne
                                        ╲ koy iskele
```

### 1.3 Fikir kataloğu

Sütunlar: Tier = ilk göründüğü kademe · Maliyet S/M/L · Rol = agent · Reuse = yeniden kullanılan sistem ·
Risk = kültür cap / call / agent bütçesi. "var." = mevcut def'in varyantı (ledger'a girmez).

| # | Ad (TR / EN) | Pitch · Nerede | Tier | Hareket | Wow anı | $ | Rol | Reuse | Risk |
|---|---|---|---|---|---|---|---|---|---|
| M1 | **Teleferik / Cable Car** | Zirve dudağı → en uzak sea stack; 2 pilon + kablo + 3 gondol (kırmızı/krem) | 1 (pilon) | Gondollar kabloda 1.6 u/s, gust'ta 3° salınım | Gondol deniz üstünde, altında köpük halkaları | M | props + life | `mailLine` (TASK-465) gondol varyantı + mail sack mover | Pilon tier-1 → ikinci tier-1: **cap override şart** ya da `mailLine` varyantı (sıfır ledger) |
| M2 | **Verici Adacıkları / Transmitter Stacks** | Her stack'e bir lattice verici (antennaTower v1: kısa, kırmızı tepe lambası) | 0 (stack) | Tepe lambası 1.2 s blink, phase per instance | Gece üç kırmızı nokta + fener huzmesi | S | worldgen + props | `antennaTower` var., lamp emissive, stack anchor'ları | Stack tepe anchor'ı heightfield'dan export edilmeli (kontrol: `WINDWARD_CLIFF` stack'leri anchor veriyor mu?) |
| M3 | **Deniz Afişi / Sea-Facing Billboard** | Stack 2'nin denize bakan yüzünde 6 u afiş (billboardV2 v3, slides surface) | 1 | Slide döngüsü (SURFACE.slides) | T1'den "reklam adası" okunur | S | props | `billboardV2` var., `SURFACE.slides` | Yok |
| M4 | **ON AIR Neon Harfleri / Cliff Neon** | Rüzgâr üstü uçurum yüzüne dikey 4 harf (glyph system), 1.4 u/harf | 1 | 19:00'da sırayla yanar (0.4 s aralık), relay'de ×4 | W4 açısından uçurum artık karanlık bir duvar değil | M | props + worldgen | `signage.ts` glif, `marqueeSign` emissive sınıfı; cliff normal'ine yaslama (`Zone.cliff` + sdf gradyanı) | Yeni def `cliffSign` (tier 1 → **cap override**) ya da `marqueeSign` v3 dikey (ledger'sız) |
| M5 | **Marquee Ampul Hatları / Bulb Strings** | Bulvar üstünde çapraz 3–4 `bunting` v2 (ampul, `SURFACE.marquee` chase) | 2 | Bulb chase 0.5 s, gust flutter | Gece bulvar bir "cadde" olur | S | props + shader | `bunting` var., `SURFACE.marquee` (TASK-440) | Yok |
| M6 | **Jumbotron Kulesi / Screen Tower** | `giantScreen` v1: 10 u lattice üstünde üç yüzlü ekran, lee kenarda | 0 | Üç yüz aynı slide, relay'de flaş | T0'da gündüz de "medya" okunur (şimdi değil) | M | props | `giantScreen` var., LOD1 yenilenir | LOD1 = v0 olduğundan T0'da farklı okunmaz → **LOD1'i de varyantlamak gerek** (D-049 istisnası, QA'ya sor) |
| M7 | **Kızıl Halı Caddesi / Straight Boulevard** | Bulvar zemin boyası düz şerit (`paintZone` rect zaten var; leke pad margin'den geliyor) + kenarda yıldız plakaları (ground layer `stars`) | 1/3 | — | T1'de düz kırmızı çizgi; T3'te yıldız plakaları | S | worldgen + shader | `FLATTEN.discMargin` → rect pad margin küçült; `ground` layer (`tile` gibi yeni `stars` layer) | Shader'da yeni ground layer = program parametresi değil, uniform/layer → düşük |
| M8 | **Parti Dubası / Party Pontoon** | Koyda demirli pontoon (sailboat v5: düz tekne, ampul dizisi, streamer) | 1 | Bob (3.2 s) + ampul chase | Gece koyda su üstünde ışık | S | props + life | Sailboat varyantı, D-054 mooring | Varyant; pier berth sayısı seed'e bağlı |
| M9 | **Reklam Teknesi / Ad Boat** | Ada çevresinde ring'de dönen tekne, arkasında 4 u flama afiş (sailboat v6) | 1 | Ring 26 u, 2 u/s, afiş dalgalanır | Fuar + tekne aynı karede | S | life | D-054 kültür ring tekneleri (QA/Design örneği) | Agent: boat = mover, agent değil ✓ |
| M10 | **Zincir Salıncak / Chair-o-plane** | Fuar diskinde 6 zincirli döner salıncak, 6 u direk | 2 | Rotor mover 12 s/tur, koltuklar 20° dışa açılır | Dolap + salıncak = gerçek lunapark | M | props + engine | `ferrisWheel` rotor mover (`render/movers.ts`) | Yeni def tier-2 → **cap override (+1)** |
| M11 | **Fuar Kapısı / Carnival Gate** | Fuar girişine `cultureGate` marketing varyantı (streamer + megafon glif) — HQ için zaten yapıldı | 1 | Marquee ampul chase (varsa) | T1'de giriş okunur | S | worldgen | TASK-465 `cultureGate` v-marketing | Sıfır ledger; LOD1 ortak ✓ |
| M12 | **Füniküler / Cliff Funicular** | ledge2 → zirve, raf duvarı boyunca eğik ray + kabin | 1 | Kabin 2 u/s gidiş-dönüş, 6 s dwell | Kabin uçurum duvarında tırmanırken | L | worldgen + props + engine | QA loop track `rail` mover (`movers.ts` kind 'rail'), `pipe-run.ts` eğik parça mantığı | Yeni def (ray + kabin) tier-1 → cap override; raf duvar geometrisine yerleşim zor |
| M13 | **Atlama Kulesi / Dive Tower** | Stack 3 üstünde 5 u platform; bot 40 s'de bir atlar | 2 | Parabol düşüş + splash ring + 4 damla (fish jump reuse) | Gondol geçerken atlayış | M | life + props | Fish jump (#13), tableau bot | Yeni def tier-2 (+1) ya da `selfieSpot` v2 platform |
| M14 | **Sahil Sineması / Beach Cinema** | Koy kumsalında `giantScreen` v2 (tek yüz, alçak) + 3 sıra `lectureSteps` v2 bank, 20:00–23:00 bot seyirci | 1 | Ekran slide, botlar `sit` | Gece ekranın ışığı kumsal + suya vurur | M | worldgen + life + shader | `giantScreen`, `lectureSteps` (Research def'i) varyantları, `prismArch` ışık havuzu tekniği (TASK-468) | Varyantlar; ışık havuzu shader işi TASK-468'e bağlı |
| M15 | **Maskot Yürüyüşü / Mascot Walkabout** | `mascotStatue` yerine/ek: creature geo scale 1.6 yengeç kostümü, 12:00–18:00 fuar diskini turlar | 2 | Waddle 0.6 s, kamera 25 u içindeyse el sallar | Çocuk-TV hissi | M | life | Villager agent + accessory sistemi (plan §2.4) | 1 agent; medium cap 60'a yakın (QA onayı) |
| M16 | **Konfeti Sağanağı / Confetti Rain** | 17:30 Launch Show'da sahne üstünde 6 s konfeti (renkli kare sprite) | 2 | Burst + düşüş + 40 % fade | Golden hour + konfeti | S | life + shader | Click sparkle pool (`#FFF6C2` → 5 renk), `confettiCannon` v1 zaten "mid-blast" | Mevcutsa atla (kontrol: `culture clock` rhythm'inde konfeti var mı?) |
| M17 | **Işıklı Şamandıra Zinciri / Lit Buoy Chain** | `adBuoy` v1 emissive + aralarında ip, koyun ağzında | 2 | Bob, gece 1.5 s blink (phase) | Koy gece çerçevelenir | S | props | `adBuoy` var., `laundryLine` catenary | Varyant |
| M18 | **Vinçli Kamera / Camera Crane** | ledge1'de stüdyo önünde 5 u kamera vinci, kamera kafası `yaw` tag'iyle tarar | 2 | Yaw 20 s, gust'ta hafif | "Set" hissi | S | props | MOTION_TAG.yaw, `harbourCrane` (HQ) varyantı | Varyant |
| M19 | **Popcorn Martı Zinciri / Gull Landing Chain** | Popcorn arabasının önünde 3 martı peş peşe iner (zaten story) + yerde popcorn izi decal | 3 | Gull landing (#12) | — | S | life | Mevcut story + footprints decal sistemi | Yok |
| M20 | **Reklam Balonu / Tethered Blimp** | Fuar üstünde 14 u'da bağlı mini zeplin (airship geo ×0.5, slogan glif), halat | 1 | Yavaş yaw ±10°, gust'ta eğilir | T0'da fuar artık stack arkasında da görünür | M | props | Sky-craft airship geometrisi, `balloonMast` halatı | Yeni def tier-1 → cap override; ya da sky-craft sayısına katılan sabit "tethered" craft (engine) |

### 1.4 Wow çekimi

| ID | Çekim | Seed · kamera · zaman | Pass kriterleri |
|---|---|---|---|
| W20 | **Kablolu Alacakaranlık / Cable Dusk** | 2024 · raw cam güneybatıdan, denizden ≈ 90 u, pitch 18° · 19:15 +12 s | ≥ 2 sea stack ve gondol hattı karede, bir gondol stack ile zirve arasında havada; ON AIR harflerinin ≥ 2'si yanmış; marquee hatları + ekran glow; fener huzmesi sise değiyor; land L ≥ 0.12 |
| W21 | **ON AIR Kayası / On-Air Rock** | 2024 · W4 kamerası · 22:00, 2 kare 0.6 s arayla | Uçurumda ≥ 3 neon harf; stack tepe lambaları iki karede farklı (blink); koyda parti dubası + ışıklı şamandıralar; ≥ 2 searchlight huzmesi; ≤ 250 call (medium) |

### 1.5 Paketler

| Paket | İçerik | Ledger etkisi | Doğrulama |
|---|---|---|---|
| **Quick wins (1 gün)** | M11 fuar kapısı, M5 ampul hatları, M2 verici direkleri, M17 ışıklı şamandıra, M8 parti dubası, M7 düz cadde + yıldız plakaları | 0 yeni def (hepsi varyant / ground layer) | `pnpm shots ladder` L-marketing drift ≤ 4; W4/W15 `--assert` |
| **Signature (yön A)** | M1 teleferik (mailLine varyantı), M3 deniz afişi, M4 ON AIR neon, M13 atlama kulesi, W20/W21 | 0–2 def (neon + atlama platform yeni def ise cap 12'ye override) | Yeni W20/W21 + ladder; stack anchor testi (`world/` snapshot) |
| **Ambitious (yön B veya C)** | B: boardwalk + su üstü dolap + M14 sahil sineması + backlot · C: M6 jumbotron + M12 füniküler + anten ormanı + M10 salıncak | B: dock sistemi değişir, 1–2 def · C: 2–3 def, LOD1 varyantı | 30-seed plan testleri, W11 call ≤ 300, ladder pairs 380 |

### 1.6 Kullanıcıya sorular

1. **Yön?** A Kablolu Karnaval · B Tahta İskele · C Yayın Kalesi · A + C'nin "quick" kısmı (teleferik + jumbotron, füniküler yok).
2. **Sea stack'ler ne olsun?** Verici direkleri (ucuz) · Teleferik durakları + atlama (A) · Olduğu gibi (çam + kuş) · Birini "korsan radyo" kayası yap (retro antenler, plan §2.4 B seçeneği).
3. **Uçurum yüzü:** ON AIR neon harfleri · Dev dikey afiş · Projeksiyon ışığı (searchlight'lar uçuruma vurur) · Dokunma.
4. **Fuar nerede kalsın?** ledge2 (şimdiki) · Su üstü boardwalk (B) · Kumsal (sinema + booth'lar, raf backlot).
5. **Cap override:** Marketing için 10 → 12 def ve 1 → 2 tier-1 (D-057 benzeri) kabul mü, yoksa sadece varyant/ledger'sız paket mi?
6. **Canlı bütçesi:** maskot bot (1 agent) + dalış botu (tableau) eklenebilir mi, yoksa ada 9 slotta kalsın mı?

---

## 2. Research — Lonely Palm · Yıldız Akademisi

### 2.1 Şu an

Arazi: 52–58 u **campusHill** (TASK-402b, D-046), 4.2–4.8 u toprak duvar, çimen platosu, quad terası
(+0.8), zirve platosu (+2.1, r 0.25), çanak spur'u (140°), lab headland'i (−150°), lee koyu + iskele.
Şelale yok (noWaterfalls). Pad seviyeleri: summit / quad / garden / glass / base / dish.

| Tier | Ne okunuyor (P) | Zayıf (W) |
|---|---|---|
| **T0** 700–480 u | Beyaz kubbe, yeşil parterre ızgarası, bakır kubbeler, büyük çanak; gece teal kubbe + pencereler (W15 ✓) | Ada **yuvarlak bir pasta** (MEMORY'deki açık not): koy/burun yok, duvar her yerde aynı yükseklikte; **baskın dikey yok** — kubbe ~11 u, çan kulesi ~10 u, çanak ~9 u hepsi eşit (P2 ihlali); 2.1 u'luk "zirve" T0'da plato olarak okunmuyor |
| **T1** 340–170 u | Quad halkası (kütüphane rotunda, 4–5 fakülte, çan kulesi), 9 parterre, cam sera sırası, lab pod'ları, 2 çanak, iskelede araştırma gemisi | Parterre'ler **9 aynı yeşil waffle**; lab pod'ları propan tankı gibi (Research kimliği zayıf); base avlusu çıplak gri pad; güneybatı çimeni (sera ile base arası) boş; kıyıda tek olay koydaki 2–3 palmiye; duvar üstünde `crystalCluster` ×3 amaçsız |
| **T2** 120–60 u | Fountain, orrery, flamalar, scholar statue'ler, tea trolley, DNA/atom/roket, pergola, armillary — quad **en iyi T2 alanlarından biri** | Quad çevresindeki bej paving blob'ları **birbirine karışmış** (MEMORY: "merged paving blobs"); kütüphane doğudan kubbenin arkasında kalıyor; pergola seed'lerin ~%45'inde; lectureSteps çimende yalnız bir "basamak"; balon arabası "lolipop" (QA 451 W) |
| **T3** 42–21 u | Çay saati, kitap arabası, güvercin, flamalar, tahtada kuyruklu yıldız, saat kulesinde saat — tableau'lar çalışıyor | Zemin: gri paving + çimen, karo hikâyesi yok; gece sadece pencere + chalkboard + owl, lawn karanlık; terrarium içleri T3'te bile az okunuyor; su/kıyıda T3 yok (starfish ×4) |

**Kullanılmayan / tekrar eden arazi:** (1) güneybatı çimen (sera ↔ base arası, ~%15 ada); (2) bütün duvar
çevresi (rim) — `rimKeep` 6 u yolsuz; (3) koy dışındaki tüm kıyı ve lagün (3 instrument buoy hariç); (4)
spur'un çanak dışındaki ucu; (5) parterre'lerin 9 kopyası; (6) base avlusu.

### 2.2 Yön önerileri

**A · Zirve Rasathanesi / Summit Observatory Ridge (bir baskın dikey)**
Zirve bir **kayalık sırt** olur (summit h 2.1 → 4.5 u, r 0.25 → 0.22, soft 0.17 → 0.1: taş kenarlı,
yukarı doğru daralan): gözlemevi tepede, ona **lamba dizili Yıldız Merdiveni** (switchback + fener direkleri),
sırt kenarında korkuluklu teleskop platformları, bir **meridyen terası** (gerçek güneş gölgesiyle çalışan
güneş saati) ve küçük ikinci kubbe. Büyük çanak headland'e iner (spur boşalır → T0'da tek dikey: kubbe).
Kuyruklu Yıldız Gecesi adanın hero'su olur. Arazi değişimi orta; W9/W14 kameraları + ladder shift yeniden pinlenir.

```
                        ★ GÖZLEMEVİ (sırt 15 u)
                      ╱╲  ◔ meridyen terası · ⌖ platform
             yıldız merdiveni ≡≡≡ (lambalı)
     QUAD ◯ fountain · rotunda · çan kulesi   →  GARDEN ▦▦▦ (parterre + labirent)
     spur: ikinci kubde (küçük)                   sera sırası ⌂⌂⌂ + palm house
     headland: BÜYÜK ÇANAK + lab pod'lar          koy: iskele ─ gemi
```

**B · Gelgit Laboratuvarı / Tide-Lab Shore (bilim kıyıya iner)**
Kampüs kalır, kıyı hayat bulur: koyun yanında **stilt marine lab** (kazıklı, cam döşemeli gelgit tankı,
içinde fish school), lagünde **akvaryum kafesi halkası**, iskelede **sarı denizaltı** (09:00'da dalar,
kabarcık çıkarır), kumsalda gelgit ölçer, headland ucunda **roket test gantry'si**, 17:45'te burnun
açığında **balina ziyareti** (fışkırma = puff, kuyruk). Pasta silüeti **ikinci koy + kayalık burun** ile
kırılır (campusHill coast warp). Güneybatı çimeni **arboretum** (etiketli örnek ağaçlar). En çok hareket
ve en çok T3; agent bütçesi dikkat.

```
        gözlemevi ◉ (olduğu gibi)        headland: roket gantry ⊼ + pod'lar
   QUAD ◯ ····· GARDEN ▦▦▦ ····· ARBORETUM ♣♠♣ (etiket plakaları)
                 sera ⌂⌂⌂
   ─ kayalık burun ╮          koy: iskele ─ gemi ─ ◙ denizaltı
                   ╰~ 2. koy ~ ╔ STİLT LAB ═ gelgit tankı
                        lagün: ◌ akvaryum kafesi · ⊥ gelgit ölçer   ~~ 🐋 17:45
```

**C · Botanik Akademi / Botanical Academy (bahçe hero olur)**
Bahçe ekseni büyür: quad'dan garden'a **yansıtma kanalı** (Coding havuz tekniği, ördekler, taş köprü),
sonunda 12 u'luk **Palm House** (TASK-465 `conservatory` teal çerçeve varyantı — Research'ün boş tier-1
hakkı), parterre'lerin üçü **çit labirenti** olur (içinde kaybolan bot), gül pergola yürüyüşü, duvara gömülü
**tohum kasası** kubbesi, dev etiketli **örnek ağaç** (giant tree ×0.7 + plinth). Base küçülür (pod ×1 +
mast). En az risk (hiç arazi/kıyı değişmez), ama "yıldız" kimliği gözlemeviyle sınırlı kalır.

```
   gözlemevi ◉         QUAD ◯ ═══ KANAL ═══ ▦ labirent ▦ ═══ ▲ PALM HOUSE
                                   ╲ taş köprü · ördek    ▦ parterre ▦
   spur: çanak                    gül pergolası ╱╱╱       sera ⌂⌂ + örnek ağaç ♣
   headland: pod + mast           duvarda ◖ tohum kasası      koy: iskele ─ gemi
```

### 2.3 Fikir kataloğu

| # | Ad (TR / EN) | Pitch · Nerede | Tier | Hareket | Wow anı | $ | Rol | Reuse | Risk |
|---|---|---|---|---|---|---|---|---|---|
| R1 | **Zirve Sırtı / Summit Crag** | `campusHill.summit` h 2.1 → 4.5, kenarı `Zone.rock` + strata; gözlemevi 15 u'ya çıkar | 0 | — | T0'da tek baskın dikey | M | worldgen | `campusHill` profil, bluff strata boyası | Ladder L-research + W9/W14 cam pin; pad'ler (summit group) yeniden dengelenir |
| R2 | **Yıldız Merdiveni / Star Stair** | Quad → zirve: 2 switchback, her 3 u'da lanternPost v-teal; basamak = `stepping path` v2 | 2 | Lambalar 21:45'te açılır (lamp set) | Gece ışıklı zigzag | S | worldgen | Path linker `stair` kind (Marketing raf merdivenleri), `pathLanterns` | Research `pathLanterns: 0` (call nedeniyle) → sadece bu yolda, 6–8 instance |
| R3 | **Meridyen Terası / Meridian Sundial** | Zirve yanında 6 u disk, 2.5 u gnomon, saat plakaları (glif I–XII), öğle çizgisi pirinç | 2 | Gölge **gerçek güneşle** döner (bedava) | 12:00'da gölge öğle çizgisinde; golden hour'da uzun gölge | S | props + worldgen | Directional light gölgesi, `signage.ts` glif, plinth palette | Yeni def tier-2 → **cap override (+1)** |
| R4 | **Teleskop Platformu / Rim Deck** | Rim'de korkuluklu 3 × 2 u ahşap platform, üstünde tripod + bot (`gaze` pose) | 2 | Bot başını 8 s'de bir gökyüzüne kaldırır | Deniz kenarında teleskop silüeti | S | props + worldgen | `selfieSpot` (Marketing) v2 + `tripodTelescope`, pose 5 gaze | Varyant |
| R5 | **Stilt Deniz Laboratuvarı / Stilt Marine Lab** | Koy yanında uzun iskele ucunda kazıklı teal/beyaz lab, lomboz, çatıda küçük çanak; altında `tidePoolTank` cam tank | 1 | Pencere + tank glow; tankta 6 boid balık | Gece suyun üstünde yanan lab | M | props + worldgen + life | `stiltHut` recipe, biodome pane tekniği, fish school (#14) | Tier-1 → Research'ün **boş tier-1 hakkı**; dock carve ikinci iskele ister |
| R6 | **Sarı Denizaltı / Yellow Submersible** | Araştırma gemisinin yanında 3 u sarı denizaltı (BIODOME `sub`); 09:00 dalış, 16:00 çıkış | 2 | Bob; dalışta y −3 u + kabarcık puff'ları | Kabarcıklar ve geri çıkış | M | props + life | Boat bob (#3), puff sistemi (soft puffs), mooring | Yeni def tier-2 (+1); mover (agent değil) ✓ |
| R7 | **Akvaryum Kafesi / Sea Cage Ring** | Lagünde 8 `instrumentBuoy` v1 halkası + ip, içinde fish school | 2 | Buoy bob, balık boids içeride döner | Üstten bakınca mavi halka | S | props + life | `instrumentBuoy` var., fish school anchor | Varyant; fish school spawn anchor'ı worldgen'den |
| R8 | **Balina Ziyareti / Whale Visit** | 17:45 burnun 25 u açığında balina 3 kez yüzeye çıkar, fışkırır, kuyruk vurur | 1 | Parabol (dolphin #28) ×3 ölçek, puff fışkırma, splash | Golden hour'da balina + kampüs | L | life + props | Dolphin arcs, puff, splash ring | Yeni creature geo → 1 agent slot; medium 60 cap kontrolü |
| R9 | **Arboretum / Labelled Grove** | Güneybatı çimende 6 farklı tür (pine, blossom, palm, giant mushroom, roundTree ×1.4, pergola'lı asma) + `specimenPlate` glif plakası | 1/3 | Tree sway (var) | T2'de "bahçe botaniği" | S | worldgen + props | Scatter rules (theme), `signage` glif plakası | Plaka tier-3 yeni def (+1) ya da `chalkboard` v2 (ledger'sız) |
| R10 | **Yansıtma Kanalı / Reflecting Canal** | Quad → garden 3 u genişlik su şeridi, taş köprü, 2 ördek + yavru | 1 | Swell, ördek zinciri (#27) | Gece ay glitter'ı kanalda | M | worldgen + shader | Coding reflecting pool (terrain-painted water blob), ducks | Ördekler low'da 0; paving blob temizliği ile birlikte (MEMORY) |
| R11 | **Palm House / Great Glasshouse** | Garden ekseni sonunda `conservatory` (TASK-465) teal-çerçeve varyantı, 12 u | 1 | Pane glow gece | T1'de ikinci silüet (kubbe + cam) | M | worldgen | Design `conservatory` def'i, `glasshouse` pane varyantları | Varyant → ledger'sız; ama LOD1 = Design'ın (far merge) → T0'da mor çerçeve okunabilir, QA |
| R12 | **Çit Labirenti / Hedge Maze** | 9 parterre'nin 3–4'ü `hedgeParterre` v2–v5 labirent karoları (4 açıklık deseni, deterministik eşleştirme); içinde `pace` yapan bot | 1 | Bot 2 u ileri-geri, 6 s'de bir durur | Üstten labirent deseni | S/M | props + worldgen | Hedge geometrisi, tableau `pace` | Varyantlar; karo eşleştirme worldgen'de |
| R13 | **Roket Test Standı / Launch Gantry** | `rocketMonument` v1: kırmızı gantry + hortumlar, headland ucunda; 12:00 "test ateşlemesi" = altında 4 s buhar + click-shake | 1 | Puff burst 4 s, roket 0.15 u titreşim | Öğle siren + buhar | S | props + life | Click reaction (volcano shake), puff | Varyant |
| R14 | **Yıldız Haritası Zemini / Star-Map Plaza** | Quad paving'ine takımyıldız mozaik layer (çizgi + nokta); gece zayıf teal glow | 2 | Gece 0.3 emissive, kuyruklu yıldız gecesi ×2 | Üstten bakışta takımyıldız | S/M | shader + content | HQ compass mosaic ground kind (TASK-468) | TASK-468'e bağımlı; ground layer = uniform |
| R15 | **Kuyruklu Yıldız / Comet Streak** | 22:00 gökyüzünde 8 s tek emissive streak, kubbe yarığı yönünde | 0 | Streak 8 s, kuyruk fade | Comet night'ın asıl wow'u | M | shader | Sky dome shader, moon glitter tekniği | Mevcutsa atla (kontrol: comet night rhythm'inde streak var mı?); program sayısı değişmez (sky uniform) |
| R16 | **Kep Fırlatma / Cap Toss** | 17:45 lectureSteps'te 5 bot kep fırlatır (siyah kare sprite ×6, parabol) | 3 | Burst 1.2 s + düşüş | Golden hour mezuniyet | S | life | Click sparkle pool (sprite kare), tableau botlar | Yok |
| R17 | **Çan Ritüeli / Bell Hour** | 09:00 çan 6 kez sallanır (yaw tag), campus bot'ları 10 s hızlı yürür | 2 | Çan ±25° 0.8 s, bot speed ×1.5 | Ders zili | S | life + props | `campusTower` v3 bell çan parçası `MOTION_TAG.yaw` | Varyant; LOD1 aynı |
| R18 | **Fok / Seal on the Pier** | İskele ucunda uyuyan fok (capsule + yüzgeç, gri), öğlen `blink`, gün batımı `stare` | 3 | Spot critter sleep/blink | Gemi + fok | S/M | props + life | `life-spot-critters` (capybara/cat türü) | Yeni SpotSpecies; agent değil ✓ |
| R19 | **Gelgit Ölçer / Tide Gauge** | Kumsalda 2.5 u ölçek direği + şamandıra; şamandıra swell ile iner-çıkar | 3 | y = swell(t) (TS twin) | Dalga ölçerin canlı oynaması | S | props | Swell formülü TS twin (`core`), noShadow | Yeni def tier-3 (+1) ya da `instrumentBuoy` v2 |
| R20 | **Anemometre Çatısı / Weather Roof** | Lab pod v2: çatıda dönen rüzgâr kepçeleri + yön oku (spin + yaw tag), `weatherMast` v1 ile eşleşir | 2 | Spin rüzgârla (windmill kuralı #18) | Pod'lar "tank" değil "istasyon" | S | props | `MOTION_TAG.spin` / `yaw`, QA hangar fan | Varyant |
| R21 | **Kıyı Kırılımı / Coast Break** | `campusHill` ikinci koy (−60°) + kayalık burun (+100°, sea stack v-arch "deniz kemeri") | 0 | Foam ring (var) | T0 pasta değil, ada | L | worldgen | Coast warp, `seaStack` var. + `WINDWARD_CLIFF` olmadan kayalık zon | Ladder/W9/W14/W11 pin; 30-seed testleri; rimKeep |

### 2.4 Wow çekimi

| ID | Çekim | Seed · kamera · zaman | Pass kriterleri |
|---|---|---|---|
| W22 | **Meridyen Öğlesi / Meridian Noon** | 1001 · raw cam güneyden yüksek 3/4, ≈ 70 u, pitch 40° · 12:00 | Güneş saati gölgesi öğle çizgisinde (±3°), lectureSteps'te ≥ 4 bot, labirent deseni üstten okunur, ≥ 2 flama hattı, roket gantry buharı (simt 2–6), hiçbir prop eğimde |
| W23 | **Gelgit Laboratuvarı Akşamı / Tide-Lab Dusk** | 1001 · raw cam denizden koya, ≈ 55 u, pitch 16° · 19:15 +8 s | Stilt lab pencereleri + tank glow su üstünde; denizaltı kabarcıkları ya da yüzeye çıkışı; araştırma gemisi + iskele feneri; gözlemevi kubbesi ufukta arkada; ≤ 260 call |
| (alt.) | **Yıldız Merdiveni Gecesi / Star Stair Night** | 1001 · W9 kamerası · 22:05 | Sırt üstünde kubbe yarığı açık + teal glow, merdiven lambaları ≥ 6, comet streak karede, kubbe ufkun üstünde |

### 2.5 Paketler

| Paket | İçerik | Ledger etkisi | Doğrulama |
|---|---|---|---|
| **Quick wins (1 gün)** | R12 labirent karoları, R20 anemometre pod'u, R13 roket gantry + öğle buharı, R17 çan ritüeli, R16 kep fırlatma, R9 arboretum (plaka = chalkboard v2) | 0 yeni def | ladder L-research, W9/W14 `--assert`, 30-seed plan testi (parterre eşleştirme) |
| **Signature (yön A)** | R1 zirve sırtı, R2 yıldız merdiveni, R3 meridyen terası, R4 rim platformları, R15 comet streak, Star Stair Night | 1 def (sundial, cap 11) | W9/W14 cam re-pin, `FRAMING.ladder.shift.research`, W11 call ≤ 300 |
| **Signature (yön B)** | R5 stilt lab (tier-1 hakkı), R6 denizaltı, R7 kafes halkası, R19 gelgit ölçer, R18 fok, W23 | 2–3 def (cap 12–13), 1 tier-1 | Dock carve testi (iki iskele), agent sayımı medium ≤ 60, W23 |
| **Ambitious** | R21 kıyı kırılımı + R8 balina + R10 kanal + R11 Palm House (yön C'nin omurgası) | 0–1 def, 1 agent | Ladder pairs-research 380, W11, 30-seed, heightfield snapshot güncellemesi |

### 2.6 Kullanıcıya sorular

1. **Yön?** A Zirve Rasathanesi · B Gelgit Laboratuvarı · C Botanik Akademi · A + B'nin kıyı kısmı (zirve + stilt lab, balina yok).
2. **Yuvarlak silüet kırılsın mı?** Evet, ikinci koy + burun (R21, arazi + cam re-pin) · Sadece zirve yükselsin (R1) · İkisi de · Hayır, prop'larla yetin.
3. **Boş tier-1 hakkı neye gitsin?** Stilt marine lab (R5) · Palm House varyantı (R11, hak harcanmaz) · Zirvede ikinci kubbe · Saklansın.
4. **Parterre'ler:** 3–4'ü labirent (R12) · Hepsi kalsın, kanal eklensin (R10) · Yarısı arboretum olsun.
5. **Yeni canlı bütçesi:** Balina (1 agent, L) · Fok (spot critter, agent yok) · İkisi · Hiçbiri.
6. **Cap override:** Research 10 → 12/13 def kabul mü (D-057 gibi), yoksa sadece varyant paketi mi?

---

## 3. Sıralama önerisi (iki ada birlikte)

1. İki quick-win paketi paralel (`props` + `worldgen`, ayrı dosyalar: `culture-marketing.ts` / `culture-research.ts`
   varyantları, `plans/marketing.ts` / `plans/research.ts`) — ledger'sız, ladder'ı bozmaz.
2. Kullanıcı yön seçer (statik HTML karşılaştırma sayfası: her ada için 3 yön × 1 ASCII/sketch + 2 referans kare).
3. Seçilen yönün signature paketi: önce worldgen (anchor/arazi), sonra props, sonra life, sonra shader; QA sonda
   yeni wow çekimlerini pinler (`content/shots.ts`), `ART_BIBLE §4/§12` satırları + `DECISIONS` D-058 yazılır.
4. Ambitious paket ayrı milestone (M22+), W11 call bütçesi ölçülüp karar verilir.
