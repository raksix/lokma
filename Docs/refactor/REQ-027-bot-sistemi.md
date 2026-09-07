# REQ-027 — Bot sistemi refaktörü (Grok mantığı + Hermes bots referanslı)

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "abi bot sistemini refaktör edelim. grok bot çalışma mantığı. hermes bots diye bir şey oluşturu, hermes agentin reposundan adamlar nasıl yapmış bakabilirsin. ayrı sohbet arayüzleri falan var, sağlam bir şekilde o mantıkta yaparsın".
- **Interpretation:** Bot sistemi Grok tarzı çalışma mantığıyla elden geçirilir: her botun ayrı sohbet arayüzü, kendi kişiliği/belleği/bütçesiyle bağımsız çalışması. Referanslar: (1) Hermes agent reposundaki `bots` yapısı — uygulamada `hermes-agent` skill'i üzerinden incelenir (nasıl tanımlanmış, nasıl koşuyor, arayüzü nasıl); (2) `Docs/35-BOTS-lokma-bots.md` mevcut lokma bot kontratı. Hedef: sağlam, referanslı, ayrı-chat'li bot mimarisi.
- **Touched (plan):** hermes-agent skill incelemesi → mevcut bot paneli envanteri → yeni bot mimarisi (tanım + koşucu + ayrı sohbet UI).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile bot seçip ayrı sohbette konuşma + bütçe/kişilik ayrımı kanıtlanır, bundle match.
