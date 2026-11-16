# Gece planı — 2026-11-17 (kullanıcı uyuyor, otonom)

Kullanıcı talimatı: sıradan geliştirmeye devam et; limit biterse gece yenilenmesini bekle, sonra devam et.
**Sonunda yapılan tüm değişiklikleri bir fable agent ile incelet** (kullanıcı açıkça istedi; başlangıç noktası `b219c95`).

Kurallar: aynı anda en fazla 3 canlı agent (yük 140'a çıkınca seed-sweep test'leri timeout oluyor).
Her brief'te ayrı `--port=418N --tag=tNNN`, scratchpad log'larına task prefix'i. Her merge sonrası
typecheck + lint + test; wave sonunda `wow` + `wow-high --assert`, yeşilse push. Kullanıcı kararı gereken
işlere dokunma (560, 561, 573, 586 peer, arch yeniden seçimi, bütçe artışı).

## Wave A
- [ ] TASK-688 wall-foot hatch + strata wedges (shader, çalışıyor, port 4181)
- [ ] TASK-635 M50 worldgen polish: Coding waterfalls, right-edge mesh steps (worldgen, port 4182)
- [ ] TASK-332 capybaras (DevOps spring) + puffins (Marketing) (life, port 4183)

## Wave B (688 merge olduktan sonra; 636 aynı terrain dosyasına dokunur)
- [ ] TASK-636 M50 shader polish (shader)
- [ ] TASK-637 T0 program count +2 (engine, araştırma)
- [ ] TASK-650 M51 courier follow-ups (life + engine)

## Wave C
- [ ] Wave 4 CONDITIONAL QA satırlarının yeniden denetimi: 593 / 597 / 602 / 605 / 609 (qa agent)
- [ ] TASK-610 docs (docs agent)

## Final
- [ ] **Fable review agent**: `git diff b219c95..HEAD` kod incelemesi (correctness, determinizm, dispose, bütçe)
  + raporu `mar-docs/qa/` altına yaz; bulguları task olarak aç, kullanıcıyla birlikte değerlendir.
- [ ] MEMORY.md handoff, push, worktree temizlik satırı.

## Günlük
