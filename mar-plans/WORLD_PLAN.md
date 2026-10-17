# WORLD_PLAN — Yeni dünya ve ada tasarımları (master plan)

> Sentez belgesi (2026-10-17). Dört etüdü tek plana bağlar:
> `mar-plans/study/world.md` (dünya), `study/hq-design.md` (HQ + Design), `study/coding-devops-qa.md`,
> `study/marketing-research.md`. Ayrıntı için etütlere bak; bu belge **karar + sıra + bağımlılık** verir,
> fikirleri tekrar etmez. Kod yazılmadı. Karşılaştırma sayfası:
> `scratchpad/plan/index.html` (statik, `open` ile açılır).
>
> **Madde ID'leri** etüt dosyasına göre önek alır, çünkü etütler aynı harfleri kullanıyor:
> `W:` dünya (`W:D2` skerry, `W:K2` HQ merkez), `HQ:` (`HQ:H6`), `DS:` Design (`DS:D3`),
> `CO:` Coding (`CO:C2`), `DO:` DevOps (`DO:D4`), `QA:` (`QA:Q1`), `MK:` Marketing (`MK:M1`),
> `RS:` Research (`RS:R1`).

## 1. Vizyon

Marisland bugün "yedi ayrı disk" gibi okunuyor: her ada kendi halkasında, aralarında düz boyalı bir deniz,
gökte boş bir gece. Hedef, **tek bir takımada**: adalar sığ eşikler, kayalık adacıklar, şamandıra
hatları ve rota izleriyle birbirine bağlı; HQ gerçekten kavşakta; her adanın kültürü T0 silüetinden
T3 mikro-hikâyeye kadar kendi diliyle okunuyor; gece göğü ve deniz, adalar kadar içerik taşıyor.
Üç ilke: (1) **suyun kendisi içerik** (resif, eşik, iz, balina); (2) **her ada bir "yer"** (boş çim ve
orman dolgusu yerine zonlar, yürünebilir sırtlar, kıyı); (3) **ritüeller dünya ölçeğinde** (relay ışık
dalgası fenerler ve semaforlar arasında gezer, 22:01'de HQ'da patlar). Bütçe sabit: yeni program yok,
yeni agent yok; her hareket closed-form mover ya da `aSpin.w` tag'i.

## 2. Genel teşhis

Kaynak: ladder kareleri seed 1001 (`shots/ladder-study/L-*`, `study-shots/L-hq|design`), W1/W11/W15.

| Ada / dünya | T0 | T1 | T2 | T3 | Ana zayıflık | En büyük fırsat |
|---|---|---|---|---|---|---|
| **Dünya** | 7 silüet ayırt ediliyor; turkuaz halkalar güzel | kanallar boş, rota izi yok | — | — | Karenin %55–60'ı düz `#1E5FA8`; gece göğünde yıldız/ay yok; HQ seed 1001'de köşede | Skerry + resif + wake izi + gece göğü: 4 ucuz katman T0'ı doldurur (`W:D2`, `W:D1`, `W:B4`, `W:G5`) |
| **HQ** · Hearthholm | yeşil hilal, kule 700 u'da silik | köy batı ucunda, doğu %60 boş orman | her bina aynı gri kutu + turuncu çatı | "ofis kampüsü", liman değil | Hilalin iç kavisi ve doğu tepesi kullanılmıyor | D-057 zonlaması (pusula meydanı + 7 sokak + Lonca Terası + sırt patikası) adayı baştan sona kullanır |
| **Design** · Mossgrove | "pembe noktalı yeşil top" | %70 çam dolgusu; şelale dudağı boş | hot shop gri, duman yok, kostikler slab | ısı yok, cam parıltısı yok | Cam/ışık kimliği T0'da sıfır | Sera meydanı + gökkuşağı sıraları + prizma yolu + jewel lamp set → T0'dan "çok renkli tek ada" |
| **Coding** · Millbrook | yeşil lozenge + 3 türbin; sıcak aksan yok | kutular aynı dil, solar damgası ×6, kıyı boş | yoğunluk sadece parkta | park dışı yonca | Rüzgâr adası ama rüzgâr görünmüyor; platonun %55'i boş | Uçurtma tepesi + tünel + fırıldak/tulum: rüzgâr her kademede görünür |
| **DevOps** · Emberpeak | rosterin en güçlü silüeti | üst koni boş bazalt; üç raf bağlı değil | yamaç boş, borular ince | bazalt düz koyu | Üretim hattı okunmuyor (ne nereden nereye) | Füniküler + teleferik + zigzag fenerler: koni "kullanılır", hat ocak→fırın→rıhtım→gemi okunur |
| **QA** · Palmlagoon | nane disk + ince kule; ikinci silüet yok | GD üçte biri boş çayır | kit ince yayılmış, hazard şeridi yok | UV havuzları zayıf | "Test fabrikası" ama test edilen şey yok; hareket az | Proving Grounds: GD çayırı stunt sahası, 12:00 sirende hepsi tetiklenir |
| **Marketing** · Beacon Rock | fener güçlü; 3 sea stack çıplak; fuar stack arkasında | kırmızı bulvar leke; 25 u uçurum boş | raflar arası merdiven görünmüyor; koy boş | bulvar %60 boş zemin | Üç bedava T0 silüeti (stack'ler) ve dev uçurum yüzü kullanılmıyor | Teleferik + verici stack'ler + ON AIR neon: en az arazi, en çok T0/T1 |
| **Research** · Lonely Palm | "yuvarlak pasta"; baskın dikey yok (P2 ihlali) | 9 aynı parterre; GB çimen boş | quad çok iyi; paving blob'ları karışık | zemin hikâyesi yok; kıyıda T3 yok | Tek silüet + tek dikey yok; Comet Night'ta kuyruklu yıldız yok | Zirve sırtı + yıldız merdiveni + meridyen terası; dünya `W:G2` kuyruklu yıldızı ile Comet Night hero olur |

## 3. Ortak kararlar

### 3.1 Kültür tavanı politikası (D-057'yi genelleştirir)

- Varsayılan **10 def / 1 tier-1** kalır. Override yalnızca kullanıcının seçtiği **signature** paketi
  gerektirirse ve o adanın D-0xx kaydıyla verilir. Quick-win paketleri **0 yeni def** ile tasarlandı
  (hepsi varyant, çapraz reuse, content, placement).
- Önerilen tablo (yön seçimine bağlı; Round 3'te onaylanır):

| Ada | Bugün | Önerilen | Gerekçe |
|---|---|---|---|
| HQ | 12 / 1 (dolu) | **12 / 1** kalsın | Etüt her maddeyi varyant/reuse ile çözdü (`HQ` §1.3 Def sütunu) |
| Design | 15 / 2 (dolu) | **15 / 2** kalsın | `DS` etüdü 0 yeni def varsayımıyla yazıldı |
| Coding | 10 / 1 | yön A ise **12 / 2** (tünel tier-1, windsock) · C ise 10 | `CO:C1` tier-1 slotu giantDuck ile çakışır |
| DevOps | 10 / 1 | yön B ise **12 / 1** (funicularRail + car) · A ise 11 | `DO:D4` 2 def |
| QA | 10 / 1 | yön A ise **12 / 1** (dropTower tier-1, divingBoard, fan, obstacle → 4 def; 2'si varyant) | `QA:Q2` tier-1 slotu boş (QA'nın tier-1'i yok) |
| Marketing | 10 / 1 | **10 / 1** (teleferik = `mailLine` varyantı, neon = `marqueeSign` v3) · atlama kulesi istenirse 11 | `MK` A yönü ledger'sız yapılabilir |
| Research | 10 / 1 (tier-1 boş) | **11 / 1** (sundial) | Tier-1 hakkı saklanır (`RS:R5` stilt lab ileride) |

### 3.2 Bütçe gerçeği

- **Draw call** darboğaz değil: medium 300, W11 postcard far merge sonrası **146–148** (D-049). T0/T1'de
  yer bol; tıkanan yakın kareler (244–275 call, W16 ≤ 230 hedefi). Kural: tier-0/1 def = W11'e +2
  (LOD1 + gölge); tier-2/3 def = W11'e 0. Her ada için T0–T1'e yeni LOD1 grubu ≤ 2.
- **Program** darboğaz: medium **17 / 20**, high **17–24 / 24** (D-033 sabit 9/17/24). Hiçbir madde yeni
  program açmaz; gök (`W:G2/G3/G4`), su (`W:K5/D1/D9`), zemin (`DO:D1` lava) mevcut shader'lara dal.
- **Agent** darboğaz: medium **60, pik 61**. Yeni canlı yok; balina (`W:D6`), konvoy, gondol, kabin, ördek
  yarışı hepsi mover (`render/movers.ts`, `culture-movers.ts`). Maskot botu (`MK:M15`) ve Research
  balinası (`RS:R8`) bu yüzden **reddedilir**; balina dünya mover'ı olarak tek sefer yapılır ve 17:45'te
  Research burnundan geçer (iki etüt birleşir).
- Particles medium 6000: havai fişek (`W:G7`), petal rüzgârı (`W:H7`), gayzer (`DO:D7`) yağmurla
  çakışınca kapanır.
- Ladder (D-035): silüeti değiştiren her şey (knoll, sırt, kanal, stack prop'ları) L-* hedefini ve
  pair 380'i yeniden pinler; DevOps 42/21 u blob %1.1–1.2 sınırda, koniye dik prop izlenir.

### 3.3 Takımada yerleşimi

- D-057 HQ'yu "kavşak" yaptı ama seed 1001'de HQ köşede (W1 sağ üst). Yedi sokak gerçek yönlere
  bakacaksa **`W:K2` (HQ kümenin ağırlık merkezine en yakın ada) TASK-466'dan önce** yapılmalı; yoksa
  sokaklar bir yöne yığılır. Layout hash'i bir kez değişir → tüm pinned seed'ler ve raw cam'ler re-pin.
- Aynı re-pin'de **skerry'ler + Lonely Palm** (`W:D2` + `W:K6`) eklenmeli: layout iki kez kırılmasın.
- `W:K1` şablonlar (Yay / Halka / Omurga) ayrı milestone; önce K2.
- D-045 köprü yasağı: adalar arası fiziksel bağlantı yok. **Ada içi** kablo hatları (`MK:M1` teleferik
  stack'lere, `DO:D13` cevher teleferiği) ada kendi halkasında kaldığı için yasağa girmez; su altı eşik
  (`W:K3`) kullanıcı kararı (Round 1).

### 3.4 M20 def'lerinin çapraz kullanımı

Kural (D-050): başka adanın def'i ledger'a girmez; bedeli o adada +1 LOD0 grubu. **Far merge yüzünden LOD1
= v0** → T0'da köken kültür gibi okunur; o yüzden reuse ya T2+'da ya da LOD1 varyantıyla.

| M20 def | Nerede yeniden kullanılır | Not |
|---|---|---|
| `mailLine` | `DO:D13` cevher teleferiği (kova), `MK:M1` teleferik (gondol) | pylon T1; gondol/kova varyantı, mover `sackPos(t)` ortak |
| `prismArch` | `QA:Q8` teftiş kemeri (marquee LED), `MK:M14` sahil sineması ışık havuzu tekniği | TASK-468 pool shader'ı genelleştirilir |
| `glasshouse` | `CO:C7` kuluçka seraları (mavi pane), `QA:Q11` böcek kubbeleri | T2; LOD1 Design'ın → T1'de mor görünmesin diye pane varyantı LOD1'e de girer (QA sorusu) |
| `conservatory` | `RS:R11` Palm House (teal çerçeve) | Research'ün tier-1 hakkını harcamaz |
| `goodsStall` | `DO:D14` demirci çarşısı (çekiç/dişli), HQ sokakları | varyant = kültür malı |
| `cultureGate` | `MK:M11` fuar kapısı; her adanın kendi "giriş kapısı" (iskele kökü) | 7 varyant zaten var; LOD1 ortak |
| `semaphoreTower` | `W:B6` semafor zinciri: her adada tepe "sinyal lambası" varyantı | 21:00 relay'de bir sonrakine 3 flaş |
| `lectureSteps` (Research) | `CO:C8` amfi, `QA:Q15` tribün, `MK:M14` sinema bankı | mevcut, 0 def |
| `reflectingPoolEdge` (Coding) | `QA:Q3` sıçrama havuzu, `RS:R10` kanal, `DS:D19` ayna gölet | yansıma TASK-353'e kadar yok |

### 3.5 Ortak primitifler (tek task, çok ada)

| Primitif | Kullanan maddeler | Sahibi |
|---|---|---|
| **Rim yürüyüş yolu**: bluff dudağından 2 u içeride path + her N u direk; direk varyantı ada dili (ahşap / hazard / lav feneri / cam fener / teal) | `CO:C18`, `QA:Q6`, `DO:D12`, `HQ:H16`, `DS:D10`, `RS:R2` | worldgen |
| **Şelale balkonu**: dudakta fence + 2 bench + fener + gaze botu | `HQ:H17`, `DS:D8`, `CO:C10` (su soğutma) | worldgen |
| **Şamandıra zinciri**: rota polyline → fixture, gece lamp set | `W:D8`, `HQ:H11`, `DS:D18`, `MK:M17`, `RS:R7`, `QA:Q10` | worldgen + content |
| **Mini fener / beacon**: 6 u fener varyantı + instanced beam, faz sırası | `W:B1`, `QA:Q7`, `MK:M2` (verici), `DO:D5` (zirve feneri) | props + shader |
| **Kostik / renkli ışık havuzu** (TASK-468) | `DS:D3/D4/D7`, `QA:Q13`, `MK:M14`, `RS:R14` | shader |
| **Per-island lamp set** (D-052) genişletme: her ada yeni kit def'lerini kendi setine ekler | `HQ:H23`, `DS:D12`, `CO:C13`, `DO:D12`, `QA:Q17`, `MK:M5`, `RS:R2` | content |
| **Wow ID yeniden numaralama**: etütler W20–W25'i çakıştırıyor → HQ W20–22, Design W23–25, Dünya W26–28, Coding W29–30, DevOps W31–32, QA W33–34, Marketing W35–36, Research W37–38 | ART_BIBLE §11 | docs |

## 4. Ada başına

### 4.1 HQ · Hearthholm — **Yedi Kapı Kavşağı** (seçildi, D-057)

Yönler: A Büyük Liman · B Amalfi terasları · **C Yedi Kapı Kavşağı ✓**. Zonlama `hq-design.md` §1.2
(Z1 Pusula Meydanı R 10 → Z2 yedi sokak + kapılar → Z3 rıhtım → Z5 posta avlusu → Z6 Lonca Terası →
Z7 semafor tepesi → Z8 hilal sırtı + 3 şelale balkonu → Z9 koy içi).

En önemli eklemeler: `HQ:H1` pusula mozaiği · `HQ:H4` sokak malı tezgâhları (sokağın kültürüyle eşlenik)
· `HQ:H5` kapılar relay sırasında + semafor kolları · `HQ:H6`+`H7` Lonca Terası + ikiz kuleler ·
`HQ:H8` lot mix + krem duvar · `HQ:H9` rıhtım bandı · `HQ:H14` 09:00 posta saati · `HQ:H16` sırt patikası
· `HQ:H18` koy ağzı fenerleri · `HQ:H23` lamp set.

| Paket | İçerik | Boyut |
|---|---|---|
| Core (TASK-466/468/469) | Z1–Z2–Z5–Z7 + mozaik + tint + relay/mover | L + M + M |
| Quick wins (HQ+2/+3) | H8, H9, H10, H11, H12, H18, H23, H24, H25 | 6 S + 1 M |
| Signature (HQ+1) | H6, H7, H16, H17, H21, H13 — doğu tepesi | 3 M + 3 S |
| Ambitious (HQ+4) | H3 kültür fenerleri (+7 LOD0), H15 kuyruk, H20 kediler, H22 airship bias | 2 S + 2 M |

Wow: **W20 Pusula Yıldızı** (üstten, 15:00), **W21 Kapılar Yanıyor** (21:00 harbour lane), **W22 Posta Hattı
Sabahı** (09:00 delta kare).

### 4.2 Design · Mossgrove — **Cam Sera** (seçildi, D-057)

Yönler: **A Cam Sera ✓** · B Fener Ormanı · C Renk Tarlası. Zonlama `hq-design.md` §2.2 (Z1 Sera Meydanı R 10
→ Z2 kök avlusu → Z3 sıcak atölye → Z4 prizma yolu → Z5 fener sokağı + iskele → Z6 vitray değirmen
sırtı → Z9 deniz camı plajı → Z10 dere + cam köprü → Z11 şelale balkonu → Z12 cam çan yolu).

En önemli eklemeler: `DS:D1` sera meydanı · `DS:D2` gökkuşağı sıraları · `DS:D3` prizma yolu ·
`DS:D4` prizma güneş saati · `DS:D5` cam fener sokağı · `DS:D7` köprü kostikleri · `DS:D9` değirmen
çayırı · `DS:D12` jewel lamp set · `DS:D16` fırın dumanı fix (bug) · `DS:D20` çam inceltme (TASK-464'e bağlı).

| Paket | İçerik | Boyut |
|---|---|---|
| Core (TASK-467/468/469) | D1, D2, D3, D7, D9, D20 (ilk kademe) + pool shader + rotor/duman | M + M + M |
| Quick wins (+2 Cam Gecesi) | D5, D12, D16, D18, D21, D22 | 6 S |
| Signature (+1 Bahçe) | D4, D8, D10, D11, D24, D6, D25 | 7 S (worldgen) |
| Ambitious (+3 Hayat) | D13 kelebekler, D14 kedi, D15 bahçıvan, D17 kor döngüsü, D23 kubbe palet döngüsü | 3 S + 2 M |

Wow: **W23 Sera Prizma Saati** (16:45), **W24 Cam Köprü Şelalesi** (17:00), **W25 Mücevher Sera Gecesi** (20:30).

### 4.3 Coding · Millbrook — Rüzgâr Bahçeleri

Yönler (`coding-devops-qa.md` §1.2): **A Uçurtma Tepesi & Rüzgâr Tüneli (önerilen)** · B Dal Kanalı
Kampüsü · C Teraslı Kod Bahçeleri. Neden A: adanın tek sorunu "rüzgâr görünmüyor"; A bunu T0 (tepe
silüeti + uçurtma noktaları) ile T3 (fırıldak dalgası) arasında her kademede çözer, arazi değişimi küçük
(knoll). B en ayırt edici ama L (A* + heightfield + hash); C en ucuz ama kimliği "bahçe"ye kaydırır.

Eklemeler: `CO:C2` uçurtma tepesi · `CO:C1` rüzgâr tüneli · `CO:C4` fırıldak çayırı · `CO:C11` tulum
bulvarı · `CO:C9` çit glifleri · `CO:C14` türbin uç ışıkları · `CO:C13` peri ışıkları · `CO:C15` hamak
korusu · `CO:C18` rim yolu · `CO:C7` kuluçka seraları (Design `glasshouse`).

| Paket | İçerik | Boyut |
|---|---|---|
| Quick wins (yönden bağımsız) | C4, C9, C11, C13, C14, C15, C18 | 5–6 S, +1 def (windsock) |
| Signature (A) | C1 + C2 + C3 uçurtma treni | 3 M, tier-1 kararı |
| Ambitious | C10 sunucu mağarası, C12 bisiklet turu, C17 ördek feneri, C7 | 2 M + 2 S |

Wow: **Kite Hill Afternoon** (14:00 +20 s, ≥ 6 uçurtma), **Fairy Night** (19:30 pergola + peri ışıkları).

### 4.4 DevOps · Emberpeak — Kor Demircileri

Yönler (§2.2): A Lav Nehri & Kor Köprüleri · **B Vardiya Hattı / Füniküler (önerilen)** · C Buhar Vadisi &
Onsen Kasabası. Neden B: iki teşhisi birden çözer (üst koni boş, üretim hattı okunmuyor), arazi değişmez,
koni gece zigzag fenerlerle T1'den okunur; `mailLine` reuse ile teleferik ucuz. A en etkileyici T0 ama
L shader (zemin emissive) + koni oyma + W5 re-pin; ayrı milestone adayı (`DO:D2` lav şelalesi tek başına
M olarak sonradan eklenebilir). C adayı yumuşatır ama DevOps'un sorunu "sert" olması değil, boş olması.

Eklemeler: `DO:D4` füniküler · `DO:D5` zirve kulesi + uptime çanı · `DO:D13` cevher teleferiği ·
`DO:D12` fener zigzagı · `DO:D8` fumarol havuzları · `DO:D11` bazalt sütunlar · `DO:D15` kıvılcım ·
`DO:D16` deploy night · `DO:D14` demirci çarşısı (`goodsStall`) · `DO:D18` dalgakıran + tug (dünya `W:B2`
konvoyunun römorkörü ile aynı prop).

| Paket | İçerik | Boyut |
|---|---|---|
| Quick wins | D8, D11, D12, D15, D16, D5 (varyant) | 5 S + 1 S/M, 0–1 def |
| Signature (B) | D4 + D5 + D13 | 1 L + 1 M + 1 S, 2 def |
| Ambitious | D6 krater terası, D14, D17 cam ocağı, D18, (A'dan D2 lav şelalesi) | 3 M + 1 S |

Wow: **Funicular Dawn** (06:00 +5 s siren, kabin switchback'te), **Ember Lane Night** (demirci ritmi + kıvılcım).

### 4.5 QA · Palmlagoon — Müfettişler Adası

Yönler (§3.2): **A Teftiş Pisti / Proving Grounds (önerilen)** · B Kontrol Limanı & Fener Zinciri · C Böcek
Bahçeleri. Neden A: "test edilen şey görünmüyor" teşhisine doğrudan cevap; en çok hareket, hepsi mover;
GD çayırı (%35) dolar; arazi değişmez. B'nin fenerleri dünya `W:B1` fener ağıyla çakışır (aynı gece
sahnesi iki kez); C en T3-zengin ama Design `glasshouse` reuse ile QA T1'de Design gibi okunur.

Eklemeler: `QA:Q1` sekiz pisti · `QA:Q2` düşürme kulesi (tier-1) · `QA:Q4` dev fan · `QA:Q5` engel
parkuru · `QA:Q15` tribün · `QA:Q16` hangar paleti · `QA:Q6` rim yolu + hazard korkuluk · `QA:Q18` palmiye
rim'i · `QA:Q17` bug avı 2.0 · `QA:Q10` şamandıra slalomu.

| Paket | İçerik | Boyut |
|---|---|---|
| Quick wins | Q16, Q6, Q18, Q17, Q10, Q15 | 6 S, 0 def |
| Signature (A) | Q1 + Q2 + Q4 + Q5 | 1 L + 1 M + 2 S, 3–4 def |
| Ambitious | Q3 sıçrama havuzu, Q14 damga pavyonu, Q8 kemer (B'den tek parça) | 2 M + 1 M |

Wow: **Proving Grounds Noon** (12:00 +3 s siren testi), **Bug Hunt Night** (20:30, W18 güçlenmiş).

### 4.6 Marketing · Beacon Rock — Karnaval Yayıncıları

Yönler (`marketing-research.md` §1.2): **A Kablolu Karnaval (önerilen)** · B Tahta İskele Lunaparkı ·
C Yayın Kalesi. Neden A: üç sea stack T0'da bedava silüet; teleferik `mailLine` varyantı (0 ledger);
en az arazi/dock değişikliği; fuar stack arkasında kalma sorununu gondol + verici lambalarıyla çözer.
B en büyük su + ışık sıçraması ama `findDock`/carve/mooring sistemine en çok dokunur (M22+ adayı);
C T2/T3'ü doldurur ama T0'ı değiştirmez.

Eklemeler: `MK:M1` teleferik · `MK:M2` verici stack'ler · `MK:M3` deniz afişi · `MK:M4` ON AIR neon ·
`MK:M5` ampul hatları · `MK:M7` düz cadde + yıldız plakaları · `MK:M8` parti dubası · `MK:M11` fuar kapısı
(`cultureGate`) · `MK:M17` ışıklı şamandıra zinciri · `MK:M13` atlama kulesi.

| Paket | İçerik | Boyut |
|---|---|---|
| Quick wins | M11, M5, M2, M17, M8, M7 | 6 S, 0 def |
| Signature (A) | M1 + M3 + M4 + M13 | 2 M + 2 S, 0–2 def |
| Ambitious | M14 sahil sineması, M6 jumbotron (LOD1 varyantı), M10 salıncak, B boardwalk | 3 M + 1 L |

Wow: **Cable Dusk** (19:15, gondol stack ile zirve arasında), **On-Air Rock** (22:00 iki kare, neon + blink).

### 4.7 Research · Lonely Palm — Yıldız Akademisi

Yönler (§2.2): **A Zirve Rasathanesi (önerilen)** · B Gelgit Laboratuvarı · C Botanik Akademi. Neden A:
P2 ihlalini (baskın dikey yok) tek hamleyle giderir; Comet Night, dünya `W:G2` kuyruklu yıldızı ile birlikte
adanın hero anı olur; `W:G4` takımyıldızları teleskoplara anlam verir. B'nin balinası dünya `W:D6` ile
birleşir (17:45 burundan geçiş), stilt lab (`RS:R5`) tier-1 hakkıyla ileride eklenebilir. C en az risk
ama "yıldız" kimliğini büyütmez.

Eklemeler: `RS:R1` zirve sırtı · `RS:R2` yıldız merdiveni · `RS:R3` meridyen terası · `RS:R4` rim teleskop
platformları · `RS:R12` labirent karoları · `RS:R20` anemometre pod'u · `RS:R13` roket gantry · `RS:R17`
çan ritüeli · `RS:R16` kep fırlatma · `RS:R9` arboretum · `RS:R14` yıldız haritası zemini (468 reuse).

| Paket | İçerik | Boyut |
|---|---|---|
| Quick wins | R12, R20, R13, R17, R16, R9 | 6 S, 0 def |
| Signature (A) | R1 + R2 + R3 + R4 (+ `W:G2` dünyadan) | 1 M + 3 S, 1 def |
| Ambitious | R21 kıyı kırılımı (pasta silüeti), R10 kanal, R11 Palm House, R5 stilt lab | 1 L + 2 M |

Wow: **Meridyen Öğlesi** (12:00, gölge öğle çizgisinde), **Yıldız Merdiveni Gecesi** (22:05, kuyruklu yıldız).

### 4.8 Dünya (adalar arası ve çevresi)

Yönler (sentez; `world.md` paketlerinden): **A Takımada (önerilen)** — skerry + Lonely Palm + resif + ortak
şelf + balina (`W:D2 K6 D1 K3 D6`); B Trafik Ağı — konvoy, deniz uçağı, balon posta, deniz yolları
(`W:B2 B3 B7 D9`); C Gök ve Olaylar — gece göğü, kuyruklu yıldız, takımyıldız, fener ağı, havai fişek,
mevsim (`W:G5 G2 G4 B1 G7 H1`). Neden A: "yedi disk"i takımadaya çeviren tek şey; C'nin ucuz kısmı
(G5, G2) zaten quick win; B rotalar görünür olmadan (B4/D9) anlamsız, sonra gelir.

Eklemeler (P1 sırasıyla): `W:G5` gece göğü fix · `W:K5` derin deniz dokusu · `W:B4` kalıcı wake · `W:D8`
şamandıralar · `W:D3` stack tarlası + kemer · `W:H6` kanal sisi · `W:G2` kuyruklu yıldız · `W:C1` tur modu;
sonra `W:D2+K6`, `W:D1+K3`, `W:D6`, `W:B1+B6+G7`, `W:G4`.

| Paket | İçerik | Boyut |
|---|---|---|
| Quick wins (P1) | G5, K5, B4, D8, D3, H6, G2, C1 | 8 S, 1 oturum |
| Signature (P2) | D2+K6, D1+K3, D6, B1+B6+G7 (+G4) | 2 M + 2 S + 1 M |
| Ambitious (P3) | K1 şablonlar, H1 mevsim, B2+B3+B7 trafik, S1–S3 sandbox, C2+C3 kameralar | her biri ayrı milestone |

Wow: **W26 Takımada Sabahı** (06:30 kanal sisi + skerry + wake izleri), **W27 Relay Gecesi** (21:00–22:01 fener
dalgası + semafor + havai fişek), **W28 Balina** (postcard sağ alt, sırt + fıskiye).

## 5. Yol haritası

Kural: paralel agent'lar aynı dosyaya dokunmaz; `app.ts`, `budgets.ts`, `shots.ts`, `rhythm.ts` ortak
değişiklikleri orchestrator'da birleşir. Her milestone sonunda `pnpm shots ci --assert` + ladder + push.

| Sıra | Milestone | İçerik | Bağımlılık | Paralel | Boyut | Roller |
|---|---|---|---|---|---|---|
| 0 | **M20-pre** | `W:K2` HQ merkez + `W:D2/K6` skerry sınıfı layout'ta (tek re-pin) | Round 1 (K2, skerry) | — | M | worldgen |
| 1 | **M20** (bitir) | TASK-466 ∥ 467 → 468 ∥ 469 → 470 | M20-pre, Round 1 HQ/Design | 466 ∥ 467; 468 ∥ 469 | L | worldgen, shader, life, qa |
| 1' | **M21 Dünya P1** (M20 ile paralel) | G5, K5, B4, D8, D3, H6, G2, C1 — kullanıcı kararı gerektirmez | — | shader (G5/K5/G2/H6) ∥ worldgen (D8/D3) ∥ engine (C1/B4) | M | shader, worldgen, engine |
| 2 | **M22 Beş Ada Quick Wins** | Coding/DevOps/QA/Marketing/Research quick-win paketleri; rim yolu primitifi; lamp set genişletme; wow ID yeniden numaralama | M20 (468 pool shader reuse için) | 5 ada paralel: `plans/<ada>.ts` + `culture-<ada>.ts` ayrı dosyalar | L (5 × ~1 hafta-agent, paralelde 1–2 hafta) | props ×2, worldgen ×2, life, docs |
| 3 | **M23 Dünya İmza** | D1+K3 resif/şelf, D6 balina, B1+B6+G7 relay gece sahnesi, G4 | Round 1 (K3, balina), TASK-469 (semafor) | shader (D1) ∥ life (D6) ∥ props (B1) | L | shader, worldgen, life, props |
| 4 | **M24 Coding + QA signature** | A: C1+C2+C3 · A: Q1+Q2+Q4+Q5 + wow preset'leri + ladder re-pin | Round 2 | iki ada paralel | L | worldgen, props, life, qa |
| 5 | **M25 DevOps + Marketing signature** | B: D4+D5+D13 · A: M1+M3+M4+M13 | Round 2 | iki ada paralel (mailLine mover ortak → önce props) | L | props, worldgen, life, shader, qa |
| 6 | **M26 Research signature** | A: R1+R2+R3+R4 (+ R14) | Round 2, M21 G2 | — | M | worldgen, props, qa |
| 7+ | **M27+ Ambitious** | sırayla: K1 şablonlar · H1 mevsim (TASK-464 sonrası) · B2/B3/B7 trafik · ada ambitious paketleri · sandbox S1–S3 · C2/C3 kameralar · DevOps A lav | Round 3 | her biri ayrı | L'ler | — |

Notlar:
- M20-pre küçük ama **zorunlu önce**: 466 pusula yönlerini `ctx.islands`'tan okuyor; layout sonra
  değişirse 466 ikinci kez re-pin olur.
- M21 Dünya P1 hiçbir kullanıcı kararına bağlı değil; bugün başlayabilir (shader + engine, 466/467'nin
  dosyalarına dokunmaz).
- M22'nin tek bağımlılığı 468'in kostik/pool shader'ı (`QA:Q13`, `RS:R14`); o iki madde M22'nin sonuna.
- TASK-464 (T0 blob renkleri) Design çam inceltmesinin tam hâlini ve `W:H1` mevsimleri kilitliyor.

## 6. Karar listesi

### Round 1 — Dünya + HQ/Design blocker'ları (TASK-466/467'den önce)

| # | Soru | Seçenekler | Öneri · neden |
|---|---|---|---|
| R1-1 | **HQ kümenin merkezine alınsın mı, layout şablonları eklensin mi?** (`W:K2/K1`; tüm seed'ler bir kez re-pin) | (a) Sadece K2 HQ merkez · (b) K2 + K1 dört şablon · (c) Mevcut kalsın | **(a)** · D-057'nin yedi sokağı ancak HQ merkezdeyse anlamlı; K1 ayrı bahis, re-pin'i ikiye bölmez |
| R1-2 | **Takımadaya küçük adacıklar eklensin mi?** (`W:D2/K6`; K2 ile aynı re-pin) | (a) 3–6 skerry + her seed'de bir Lonely Palm · (b) Sadece Lonely Palm · (c) Hayır, su altı resif yeter · (d) Hayır | **(a)** · "yedi disk → takımada" geçişi; fener ağı, batık, sandbox adacık damgası hepsi buna oturur |
| R1-3 | **D-045 köprü yasağının kapsamı** (`W:K3` su altı eşik) | (a) Sadece taş viyadük yasak; zip line / teleferik / eşik serbest · (b) Hiçbir fiziksel bağlantı, eşik de yok · (c) Su altı eşik olur, hava hattı olmaz | **(c)** · eşik su üstüne çıkmaz, "ayrı adalar" hissi korunur; ada içi kablo hatları zaten kapsam dışı |
| R1-4 | **HQ: gerçek yönü 12 u içinde suya çıkan sokaklar** (`HQ` S1) | (a) Karada dogleg · (b) Kıyı kapısı + mini bağlama kazığı · (c) Sadece kara yönleri sokak, kalanlar meydanda yan yana "deniz kapıları" | **(b)** · yön doğruluğu korunur, kıyı kapısı limana bakan tezgâh/flama ile "o adaya buradan gidilir" der |
| R1-5 | **HQ: semafor (8.8 u) 18–20 u zirvede saat kulesini geçer** (S2, P2 tek dikey) | (a) Kabul: semafor ince kafes, kule kütle · (b) Semafor omza iner (11–13 u) · (c) Saat kulesi +4 u | **(a)** · farklı dil (kafes vs kütle) P2'yi bozmaz; semafor zirvede olmalı ki 7 adaya baksın |
| R1-6 | **HQ: Lonca Salonu nerede?** (S3) | (a) Bugünkü crown lot · (b) Lonca Terası, meydanın üstünde merdivenli · (c) Zirvede semaforun yanı | **(b)** · ada "kat kat" okunur, doğu tepesi boşluğu dolar |
| R1-7 | **HQ: koy içi kumsal** (S6) | (a) Tümü rıhtım · (b) Rıhtım sadece iskele çevresi, kalan plaj şişe/tide pool · (c) Kum kalsın | **(b)** · liman kimliği + T3 hikâye aynı anda |
| R1-8 | **Design: sera nereye?** (`DS` S1) | (a) Glade quad'ının yerine (R 10, lot'lar halkaya) · (b) Glade altında yeni teras · (c) Zirvede ağacın yanı | **(a)** · tek hero disk, 4 kapı = 4 yol; (c) P2 ihlali |
| R1-9 | **Design: çam inceltme derecesi** (S3; TASK-464'e bağlı) | (a) %35 + district avoid · (b) Çam sadece bluff halkasında, iç kubbe blossom + çayır · (c) Dokunma | **(a) şimdi, (b) TASK-464 sonrası** · T0 blob renkleri karışık hücrelerde soluyor |
| R1-10 | **Design: prizma yolu güzergâhı** (S4) | (a) İskele → sera (giriş aksı) · (b) Ağaç → sera · (c) Sera çevresinde halka | **(a)** · W23 kamerası ve gece fener sokağı aynı aks |

### Round 2 — Diğer beş adanın yönü (M22 quick win'ler bu karara bağlı değil)

| # | Soru | Seçenekler | Öneri · neden |
|---|---|---|---|
| R2-1 | **Coding yönü** | (a) A Uçurtma Tepesi & Rüzgâr Tüneli (knoll, hash re-pin) · (b) B Dal Kanalı (L, A* + heightfield) · (c) C Teraslı Kod Bahçeleri (en ucuz) · (d) A + C (tepe + teras) | **(a)** · rüzgârı her kademede görünür kılar; arazi değişimi küçük |
| R2-2 | **DevOps yönü** | (a) A Lav Nehri (L shader + koni oyma) · (b) B Füniküler Hattı (arazi değişmez) · (c) C Buhar Vadisi & Onsen · (d) A + B | **(b)** · boş koni + okunmayan üretim hattı ikisini çözer; lav şelalesi sonra tek parça eklenebilir |
| R2-3 | **QA yönü** | (a) A Teftiş Pisti · (b) B Kontrol Limanı & Fener Zinciri · (c) C Böcek Bahçeleri · (d) A + B | **(a)** · "test edilen şey yok" teşhisine en doğrudan cevap; B fenerleri dünya fener ağıyla çakışır |
| R2-4 | **Marketing yönü** | (a) A Kablolu Karnaval · (b) B Tahta İskele Lunaparkı (dock sistemi) · (c) C Yayın Kalesi · (d) A + C'nin quick kısmı | **(a)** · üç bedava stack silüeti, `mailLine` reuse, 0 ledger |
| R2-5 | **Research yönü** | (a) A Zirve Rasathanesi · (b) B Gelgit Laboratuvarı · (c) C Botanik Akademi · (d) A + stilt lab | **(a)** · P2 ihlalini kapatır; balina dünyadan gelir, stilt lab tier-1 hakkıyla sonra |
| R2-6 | **Research: yuvarlak silüet kırılsın mı?** (`RS:R21`) | (a) İkinci koy + burun (L, cam re-pin) · (b) Sadece zirve yükselsin (R1) · (c) İkisi · (d) Hayır | **(b) şimdi, (a) M27'de** · R1 tek başına T0 dikeyini verir; kıyı warp'ı 30-seed risk |

### Round 3 — Zevk ve bütçe ayrıntıları

| # | Soru | Seçenekler | Öneri · neden |
|---|---|---|---|
| R3-1 | **Kültür tavanı override tablosu** (§3.1) | (a) Tablo olduğu gibi (Coding 12/2, DevOps 12, QA 12, Research 11; HQ/Design/Marketing sabit) · (b) Hiç override yok, sadece varyant paketleri · (c) Hepsi 13/2 | **(a)** · her override seçilen signature paketine bağlı, gerekçeli |
| R3-2 | **Tek büyük deniz hayvanı** (`W:D6`) | (a) Balina (mover, T0) · (b) Dev kaplumbağa (T1) · (c) Yunus sürüsü büyüsün · (d) Hiçbiri | **(a)** · 90 s'de bir postcard'ın boş sağ altını doldurur; agent değil |
| R3-3 | **Deep band dokusu** (`W:K5`) | (a) Hafif %6–8 L · (b) Belirgin kanallar + resif lekeleri · (c) Düz, sadece glitter | **(a) önce, (b) D1 ile** · "mermer" riski; iki kademede |
| R3-4 | **Gece göğü seti** | (a) G5 fix + G2 kuyruklu yıldız · (b) + G4 takımyıldızlar · (c) + G3 aurora nadir seed · (d) Hepsi + G7 havai fişek | **(d)** · hepsi 0 program; havai fişek relay'in finali |
| R3-5 | **Mevsim** (`W:H1`) | (a) 4 game günü döngüsü · (b) Sadece `?season=` sabit · (c) Hayır | **(b)** · paylaşılabilir kartpostal; döngü TASK-464 ve ladder ×4 bedeli, sonra |
| R3-6 | **Demo açılışı** | (a) Mevcut intro + tur modu (C1) · (b) Seed'li intro varyantları (C3) · (c) Relay takip (C4) · (d) Dokunma | **(a)** · C1 mevcut preset'leri kullanır, S; C3/C4 M27 |
| R3-7 | **HQ bina çeşitliliği** (S5) | (a) Mevcut def'ler (barn, cottage, towerHouse) · (b) hqOffice geometri varyantları · (c) İkisi | **(c)** · "aynı turuncu kutu" şikâyeti ancak ikisiyle biter |
| R3-8 | **HQ mail line ritmi** (S7) | (a) 09:00 ve 17:45 20 s burst · (b) Sürekli yavaş akış · (c) İki yönlü | **(a)** · W22 delta karesi için okunur ritim |
| R3-9 | **HQ sokak zemini** (S8) | (a) Kenar şeridi (edge-aware layer, M) · (b) Tam sokak tint'i (`paintZone`, S) · (c) Zemin değişmez | **(b)** · mevcut mekanizma; stripe layer yazılmaz |
| R3-10 | **Design: glasshouse düzeni / değirmen yeri / ikinci gökkuşağı** (S2, S8, S7) | (a) 2×3 gökkuşağı sırası · doğu sırtı · iki yay · (b) 5 dağınık · şelale dudağı · tek · (c) tek sıra · meydan köşesi · seed'e göre | **(a)** · renk sırası T1'de okunur; W11 +2 call kabul |
| R3-11 | **Design ayna gölet** (S5) | (a) Evet, yansımasız · (b) Hayır, TASK-353 sonrası · (c) Sera içi gölet | **(b)** · yansıma olmadan koyu disk |
| R3-12 | **Coding ayrıntıları** | Solar: (a) kalsın · (b) yarıya · (c) tek blok + çatı panelleri · Gece: (a) soğuk · (b) sıcak · (c) park sıcak + sunucu mavi · Uçurtma treni C3: evet/hayır | **solar (b) · gece (c) · C3 evet** · yer açılır; iki ışık dili; T0 +1 call |
| R3-13 | **DevOps ayrıntıları** | Lodge'lar ops barakası varyantına: evet/hayır · Yamaç servis yolu her yönde: evet/hayır | **evet · evet** · 0 def; zigzag gece T1 kimliği |
| R3-14 | **QA ayrıntıları** | Ton: (a) gri-nane · (b) beyaz-nane-sarı oyuncak fabrika · Pist: (a) iki pist · (b) mevcut büyüsün · Tier-1: Q2 kule / Q13 büyüteç / Q8 kemer | **(b) · (a) · Q2** · W6 "neşeli"; loop + stunt sahası ayrı okunur; kule ikinci silüet |
| R3-15 | **Marketing ayrıntıları** | Uçurum yüzü: ON AIR neon / dev afiş / projeksiyon / dokunma · Fuar yeri: ledge2 / boardwalk / kumsal · Atlama kulesi (1 def): evet/hayır | **neon · ledge2 · evet** · W4 açısı; dock sistemi değişmez; cap 11 |
| R3-16 | **Research ayrıntıları** | Parterre'ler: 3–4 labirent / kanal / arboretum · Fok spot critter: evet/hayır · Tier-1 hakkı: stilt lab / Palm House / saklansın | **labirent · evet · saklansın** · 0 def; fok agent değil; hak M27 stilt lab'a |

Round 1 cevapları → `DECISIONS.md` D-058 (layout + HQ/Design zon kuralları); Round 2 → D-059…D-063 (ada
başına); Round 3 → ilgili milestone'ların task bloğuna.
