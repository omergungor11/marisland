# Filo (adalar) nasıl geliştirilir — benzer sistemler taraması (2026-11-09)

**Soru:** Güncel benzer işlerde (agent filosu / dashboard / çok-agent orkestrasyon / kendini geliştiren agent) neler var, Marisland Fleet'e ne eklenebilir?

**Kanıt kalitesi:** Kaynakların çoğu üçüncü taraf blog; resmî Claude Code dokümanıyla doğrulanmadı. Hook adları ve "agent teams" ayrıntıları uygulamadan önce resmî dokümandan teyit edilmeli. AgentGUI makalesi okunamadı (WebFetch izni yok), yalnız arama özetine dayanıyor.

## Bulgular

1. **Görünürlük = oyun benzeri dashboard bir trend.** AgentGUI agent'ları "pixel-art ofiste, her biri kendi masasında" gösteriyor; AgentsRoom durum başına kolon açıp "bir soruda bloke olanları" en üstte tutuyor; ClawPort orchestrator → sub-agent grafı çiziyor; `nicknisi/fleet` tmux'ta "girdi bekleyen" agent'ı işaretliyor. Bizim farkımız: 3D dünya içinde yaşaması. Ortak ders: **"beni bekleyen" durumu en görünür sinyal olmalı.**
2. **Alt-agent vs takım ayrımı.** Subagent = tek yöne rapor, ucuz; agent teams = birbirine mesaj atar, pahalı, deneysel. Öneri: bir ana agent plan/entegrasyonu sahiplenir, uzmanlar sınırlı iş alır; **önce araştırma ve review gibi yazmayan işleri paralelle** (yazma çakışması yok). Bizim kapı/child modeli zaten bu çizgide.
3. **Hook'larla kalite kapısı.** Task bitmeden bloklayan (TaskCompleted), boşta kalanı geri çağıran (TeammateIdle), SubagentStart/Stop ile log + metrik. Bizde kapı yalnız ada geçişinde var; **"iş bitti" kapısı yok.**
4. **Kendini geliştiren agent'larda iki tuzak.** (a) Skill kitaplığı (yöntem) ile memory (olgu) ayrı tutulmalı; (b) memory drift: çelişen kayıtlar birikir. Ayrıca self-improvement döngüleri varyansa ve görev sırasına duyarlı, yani **ölçmeden "öğrendi" sayılmamalı.**
5. **Bağlam yönetimi:** tamamlanan fazı özetle, ağır işi subagent'a it, memory dosyalarını küçük tut. Bizde `maxTurns` ve rapor özeti var; özetin kalitesi ölçülmüyor.

## Öneriler (Marisland Fleet'e, maliyet/etki sırasıyla)

| # | Öneri | Neden | Maliyet | Nereye |
|---|---|---|---|---|
| 1 | **"Seni bekliyor" durumu**: kapı bekleyen / cevap bekleyen session için bot animasyonu + panelde en üste sabitle + sayaç | Tüm dashboard'larda ortak ana sinyal; bizde `waiting` var, görünürlüğü yok | Düşük (UI + life) | coding, life |
| 2 | **Bitiş kontrolü (done gate)**: bridge session sonunda rapor şablonunu kontrol eder (`## Özet` var mı, out-of-bounds yazma var mı zaten) ve eksikse bir kez geri gönderir | TaskCompleted hook fikri; boş/özetsiz rapor child zincirini bozuyor | Düşük (bridge) | coding |
| 3 | **Ada başına maliyet/süre sayacı** (günlük USD, tur, uzun session uyarısı) HQ panelinde | Bütçe bilinci; `costUsd` ve `turns` zaten kayıtlı, sadece toplamak gerek (M44 ile birleşir) | Düşük | coding |
| 4 | **Hafıza bakımı**: HQ haftalık "memory lint" (çelişki, eski dosya, 200 satırı aşan indeks) önerir | Memory drift riski; fleet-lint zaten frontmatter denetliyor, içerik denetimi yok | Orta | hq, coding |
| 5 | **Skill/agent önerisinin ölçülmesi**: M43'te ada yeni skill önerince, HQ onaydan önce aynı göreve skill'li/skill'siz küçük karşılaştırma ister | Self-improvement kırılgan; onayı kanıta bağlar | Orta | hq, qa |
| 6 | **Salt-okur paralel işler önce**: research/qa/review child'larını aynı istekte paralel koşturmaya izin ver (yazan adalar sıralı kalır) | Yazma çakışması riski olmadan hız | Orta (bridge'de eşzamanlı child) | coding |
| 7 | **İstek ağacı görünümü** (ClawPort tarzı graf) panelde; kurye gemileri (M51) zaten dünya içi karşılığı | Zincir derinliği 3'e kadar çıkıyor, ağaç okunurluğu | Orta | design, coding |

**Şimdilik yapma:** agent teams (deneysel, token maliyeti yüksek, kapı modelimizle çakışır); allowlist ile kapıyı atlama (D-149'da zaten ertelendi).

## Kaynaklar
- Tembo, Claude Code multi-agent orchestration — https://www.tembo.io/blog/claude-code-multi-agent-orchestration
- The Prompt Shelf, 6 patterns — https://thepromptshelf.dev/blog/claude-code-multi-agent-orchestration-patterns-2026/
- Developers Digest, agent teams/subagents/MCP — https://www.developersdigest.tech/blog/claude-code-agent-teams-subagents-2026
- AgentGUI (arXiv) — https://arxiv.org/html/2607.26300v2
- nicknisi/fleet — https://github.com/nicknisi/fleet
- AgentsRoom — https://agentsroom.dev/multi-agent-dashboard
- Dashboards should feel like games — https://www.hybr.ae/blog-posts/ai-agents-are-getting-smarter-their-dashboards-should-feel-more-like-games
- SkillForge — https://arxiv.org/pdf/2604.08618
- Fragility of Self-Improving Agents — https://arxiv.org/pdf/2608.18066
- Self-improving agents: skill library, memory — https://dev.to/sarantoon/self-improving-ai-agents-bththii-4-skill-library-memory-aela-4-layers-5am4
