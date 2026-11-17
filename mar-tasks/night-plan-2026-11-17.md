# Gece planı — 2026-11-17 (kullanıcı uyuyor, otonom)

Kullanıcı talimatı: sıradan geliştirmeye devam et; limit biterse gece yenilenmesini bekle, sonra devam et.
**Sonunda yapılan tüm değişiklikleri bir fable agent ile incelet** (kullanıcı açıkça istedi; başlangıç noktası `b219c95`).

Kurallar: aynı anda en fazla 3 canlı agent (yük 140'a çıkınca seed-sweep test'leri timeout oluyor).
Her brief'te ayrı `--port=418N --tag=tNNN`, scratchpad log'larına task prefix'i. Her merge sonrası
typecheck + lint + test; wave sonunda `wow` + `wow-high --assert`, yeşilse push. Kullanıcı kararı gereken
işlere dokunma (560, 561, 573, 586 peer, arch yeniden seçimi, bütçe artışı).

## Wave A
- [x] TASK-688 wall-foot hatch + strata wedges (shader, çalışıyor, port 4181)
- [x] TASK-635 M50 worldgen polish: Coding waterfalls, right-edge mesh steps (worldgen, port 4182)
- [x] TASK-332 capybaras (DevOps spring) + puffins (Marketing) (life, port 4183)

## Wave B (688 merge olduktan sonra; 636 aynı terrain dosyasına dokunur)
- [ ] TASK-636 M50 shader polish (shader)
- [x] TASK-637 T0 program count +2 (engine, araştırma) — başladı, port 4183
- [x] TASK-650 M51 courier follow-ups (life + engine) — başladı 02:40, port 4184

- [x] TASK-694 (yeni) terrain 2 u mesh sabit köşegen → duvar dibi basamakları (688 sonrası; shader/engine)
- [ ] TASK-636 brief'ine ekle: DevOps yol "kamuflajı" zone paint ile çözülmüyor (635 denedi, geri aldı) → crisp weight / decal

## Wave C
- [ ] Wave 4 CONDITIONAL QA satırlarının yeniden denetimi: 593 / 597 / 602 / 605 / 609 (qa agent)
- [x] TASK-610 docs (docs agent)

## Final
- [ ] **Fable review agent**: `git diff b219c95..HEAD` kod incelemesi (correctness, determinizm, dispose, bütçe)
  + raporu `mar-docs/qa/` altına yaz; bulguları task olarak aç, kullanıcıyla birlikte değerlendir.
- [ ] MEMORY.md handoff, push, worktree temizlik satırı.

## Günlük
- 02:35 TASK-332 merge (puffin colony, Marketing; capybaras zaten TASK-433/507 ile vardı). D-195 yazılacak. Nit: D-puffins-ledge kamerası ön planda bulanık kaya. Push wave A sonunda.
- 03:05 TASK-635 merge: şelaleler pre-rim lip'te sıralanıyor (seed 1001 9 → 11, Coding 1 → 3); yeni otomatik Design arch (−92.6, −116.7) — **kullanıcı onayı / veto: `arch: NONE`**. Mesh basamakları ve DevOps yolları çözülmedi (render işi). Hash'ler yeniden pinlendi (1001 world 9a2bd0a89f280b4a).
- 03:30 TASK-688 merge (strata row from wall top, ripples flatOnly). LIMIT doldu: push YAPILMADI. Devam: 650/637 sonuçları, tam test + wow/wow-high, docs (D-193…197, task satırları), push, sonra wave B/C + fable review.
- 05:40 TASK-637 merge (Kawase blur, sadece yorum). TASK-650 bitti, wave A wow bitince merge (+ kendi wow --assert; agent wow koşamadı). **Kullanıcı onayı:** boşta courier gemisi agent sayılmıyor (`liveCount`), alternatif low agents +7. 636 + 694 çalışıyor.
- 07:40 650 + 694 + 610 merge, birleşik main 4766 test + wow --assert yeşil, push 90f4973. Bekleyen: 636 → sonra wave C QA re-audit → fable review.
