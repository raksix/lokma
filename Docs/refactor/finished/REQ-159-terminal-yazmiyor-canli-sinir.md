# REQ-159 — Terminal "yazmıyor": canlı terminal sınırı kilitleniyordu

**Status:** done
**Tarih:** 2026-09-18
**Kapsam:** `packages/lokma-core/src/terminal/terminal.ts` (+ testi),
`packages/lokma-web/web/src/components/terminal/terminal-pane.tsx`
**Bağlantı:** REQ-158'in devamı — orada yazılan satırın tekrarı ve sahte `$`
simgesi kapatılmıştı; burada panelin "hiç yazmıyor" halinin kök nedeni çözüldü.

## Belirti
Kullanıcı: *"terminalde … o bash logundan yazmıyor"*. Panel açılıyor, imleç
bekliyor, yazılan hiçbir yere gitmiyor. Headless probda `no-bytes-arrived`
olarak ölçüldü (toplam 0-2 `terminal/data` frame'i, prompt yok).

## Kök neden
Sunucu, spawn isteğini `TERMINAL_MAX_LIVE = 10` sınırında reddediyor:

```
HTTP 429 {"code":"terminal_limit","message":"Too many live terminals (max 10) — kill one first"}
```

Sınırı düşüren hiçbir mekanizma yoktu: **bir kez açılan kabuk, kullanıcı sekmeyi
kapatsa/oturumu bıraksa da sonsuza kadar "running" sayılıyordu.** Eski
oturumlardan kalan 10 kabuk dolunca yeni kabuk açılamıyor; panel yalnızca bir
toast gösterdiği için kullanıcı tarafında "terminal bozuk / yazmıyor" görünüyor.

## Düzeltme
1. **Boşta kalan kullanıcı kabukları geri verilir.** Her canlı terminal artık
   `lastActivityAt` taşır (çıktı, girdi ve terminal boyutu değişimi günceller).
   `TerminalManager.freeIdle(idleMs)` dokunulmamış kabukları öldürür.
2. **Spawn anında devir:** sınır doluysa yeni kabuk açılmadan önce 10 dakikadır
   dokunulmayan kullanıcı kabukları geri verilir; ancak ondan sonra hâlâ
   doluysa 429 döner (mesaj korunur).
3. **Saatlik süpürme:** 5 dakikada bir çalışan `unref`'li zamanlayıcı, 60
   dakikadır dokunulmayan kabukları toplar.
4. **Ajan kabukları asla toplanmaz** (`agentId !== null`): uzun bir derleme
   çıktı üretmeden çalışıyor olabilir — bu yüzden toplama yalnızca kullanıcı
   kabuklarına uygulanır.
5. **Tıklama niyeti korunur (istemci):** oturumun `cwd`'si henüz yüklenmemişken
   pane'e tıklamak sessiz bir no-op idi; tıklama hatırlanır ve `cwd` gelir
   gelmez kabuk başlar, kullanıcıya da toast ile durum söylenir.

## Kanıt
- `packages/lokma-core/src/terminal/terminal.test.ts` — **10/10 PASS**:
  boştaki kullanıcı kabuğu geri verilir, ajan kabuğu yaşar, taze kullanılan
  kabuk süpürmeden sağ çıkar, hepsi ajan kabuğuyla doluyken sınır dürüstçe 429
  verir.
- Canlı: `pm2 restart lokma-server` sonrası arka arkaya 3 spawn → hepsi
  `{"ok":true, ..., "shell":"/usr/bin/bash","status":"running"}`.
- Canlı sınır provası: `scripts/probe-terminal-idle-reap.sh` — 10+ kabuk açıp
  boşta bırakır, 10 dk 40 sn bekler, sonra iki spawn daha yapar; ikincisi de
  başarılıysa devir canlıda kanıtlanmış olur.
- `bun x tsc --noEmit` (core + web) 0 hata; web `bun run build` temiz.

## Commit'ler
`ddd5c6e` (istemci: tıklama niyeti) · `53b6c7e` (çekirdek: boşta devir + süpürme)
