Lokal ortamı doğrula ve görsel durumu raporla:

1. Port temizliği — dev/preview portunda eski process varsa kapat
2. `pnpm install` (lockfile değiştiyse), `pnpm typecheck`, `pnpm lint`, `pnpm test`
3. `pnpm build` — hata/uyarı ve bundle boyutu (gzip) notu
4. `pnpm shots` — referans ekran görüntüsü setini al, her birine Read ile bak
5. Özet: her adım OK/FAIL, perf örneği (draw call, üçgen, ms/frame), görsel olarak dikkat çeken
   1–3 sorun

Sunucuları arka planda çalışır bırakma.
