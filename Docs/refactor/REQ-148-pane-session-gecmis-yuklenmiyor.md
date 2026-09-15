# REQ-148 — Pane'de session değiştirince mesaj geçmişi otomatik yüklenmiyor

**Status:** pending
**Tarih:** 2026-09-15
**Kapsam (öngörü):** `packages/lokma-web/web/src/components/chat/index.tsx` (`ChatWithSocket`/`Chat`),
`components/panes/pane.tsx` (session tab), `stores/session.ts` (`loadTranscript`)

## İstek (verbatim)

> bu arada bi sessiona pane açınca ben session değiştirince mesaj geçmişleri oto
> yüklenmiyor.

## Teşhis notları (canlı, bu oturum)

- Oturum pane olarak açıldığında sohbet `ChatWithSocket` ile kendi WS'ini kurar
  (`/ws/<sessionId>`) ve transcript'i `loadTranscript(sessionId)` ile çeker.
- `loadTranscript` iki durumda **ağa çıkmadan** boş döner:
  1. `transcripts[id]` zaten var ve `stale[id]` değilse (önbellek taze),
  2. `listLoaded && !sessions.some(s => s.id === id)` ise → **boş transcript
     yazılır** ("sunucunun bilmediği yerel id" varsayımı).
- `GET /api/sessions` cwd-scoped olduğu için, başka bir projeye ait (ya da liste
  yenilenmeden önce açılmış) bir oturum bu koşula takılırsa ekranda **kalıcı boş
  geçmiş** görünür ve hiç istek atılmaz — kullanıcının tarif ettiği tablo.

## Kabul kriterleri (öngörü)

1. Pane'de session değiştirildiğinde yeni oturumun geçmişi **otomatik** yüklenir;
   kullanıcı sayfayı yenilemek zorunda kalmaz.
2. Liste önbelleği oturumu tanımasa bile görünür pane için tek bir doğrulama
   isteği atılır (`loadTranscript(id, force)` benzeri) — gerçekten yoksa boş
   durum gösterilir, "sessiz boş" değil.
3. Önbellekte taze transcript varsa gereksiz istek atılmaz (mevcut davranış korunur).
4. Oturum değişiminde canlı trace/stream kalıntısı yeni oturuma taşınmaz.

## Verify planı (öngörü)

- Prob: A pane'de açık → B'ye geç (farklı proje dahil) → pane B'nin satırlarını
  gösteriyor mu; istek sayısı ve `transcripts` doluluğu ölçülür.
- Ağ ölçümü: görünür pane için en az 1 `GET /api/sessions/<id>` çıkmalı (şu an 0).

## Notlar

- REQ-144'te aynı sınıf hata (4 sn'lik listede kimlik çalkantısı) düzeltildi; bu
  istek **önbellek-boş-dönüş** yolunu hedefliyor, farklı bir kök neden.
