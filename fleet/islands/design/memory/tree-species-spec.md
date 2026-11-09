---
name: tree-species-spec
description: "Ağaç türleri genişletme spec'i yazıldı (mar-docs/TREE_SPECIES.md); uygulama coding'de, D-numarası HQ'dan bekleniyor"
metadata:
  node_type: memory
  type: project
  originSessionId: 95bef110-1f9c-4620-8689-fdcf7cb708d7
  modified: 2026-11-09T13:46:04.149Z
---

2026-11-09: Ömer ağaç çeşitlendirme istedi. Spec `mar-docs/TREE_SPECIES.md`: U1–U4 upgrade, N1–N7 yeni tür (şemsiye çam,
selvi, zeytin, huş, söğüt, akçaağaç, yanık gövde), Dalga A/B/C. Mevcut durum: 4 silüet (palm, roundTree, pine, blossomTree), tek yeşil set.

Coding child (2026-11-09) uygulayamadı: Bash `pnpm` izni yoktu, `src/` değişmedi. Bulgular spec'e işlendi: batcher'da `instanceColor` yok (renk çeşitliliği pişirilmiş varyant), `variants` 3→5 mevcut indeksleri kaydırır (ilk 3'ü koru), `geo.test.ts` `TARGET` tavanları (palm 700 / roundTree 500 / pine 350) birlikte yükselir, `autumn` kind'ı Dalga A'nın son alt adımı.

**Why:** KKTC/Akdeniz kimliği (şemsiye çam, selvi, zeytin) kullanıcının coğrafyasıyla örtüşüyor; adalar ağaçtan tanınsın.
**How to apply:** Uygulama başlamadan sayıları (üçgen payı) coding ölçmeli; medium tavanı 950k (D-156). Yeni kind `autumn` D-031 için gerekli.
Design tarafında `src/content` değişikliği geometri tüketicisi gelince yapılır (ölü veri yazma).
