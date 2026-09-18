# REQ-157 — Uzun metin (tool çıktısı / yol / JSON) sohbette taşıyordu

**Status:** done
**Tarih:** 2026-09-18
**Kapsam:** `components/chat/lokma-message.tsx`, `components/chat/single-chat-view.tsx`,
`scripts/probe-chat-overflow.cjs`

## İstek (verbatim)

> abi bunlarda taşma falan var olmasın düzelt

Ekran görüntüsü: `send_file - {"path":".lokma/browser-shots/tab_…` satırı,
satır sonunda kesilmiş/taşmış.

## Teşhis

Canlı tarama (yeni prob, 1280px + 420px) taşmanın üç ayrı yerden geldiğini
gösterdi:

1. **Tool satırının başlığı.** `ToolCallRow` başlığı `inline-flex` bir span'dı ve
   içindeki `truncate` çocuk **hiçbir zaman daralamıyordu** — `min-w-0` zinciri
   eksik olduğu için `overflow:hidden` + ellipsis devreye girmiyor, uzun
   `{"url":"…"}` / dosya yolu satırı **+71…310px** taşıyor ve paneli genişletiyordu
   (dar ekranda `div.min-w-0` +272px, tüm chat kolonu +92px).
2. **Mesaj gövdeleri.** `whitespace-pre-wrap` tek başına uzun kesintisiz dizileri
   (URL, hash, yol) kıramıyor → `break-words` eklendi.
3. **JSON blokları.** `<pre>` içinde `whitespace-pre-wrap` uzun token'ları
   sarmıyordu (yatay kaydırma gerekiyordu) → `break-all` eklendi; tool
   sonuç/çağrı blokları artık yatay kaydırma istemiyor.

Tasarım gereği kırpılanlar (`.sr-only` atlama linki, `truncate` ile "…" gösteren
satırlar) **bug değil** — prob bunları ayırt eder.

## Çözüm

- `lokma-message.tsx`: başlık sarmalayıcı `flex min-w-0 items-center`, başlık
  metni `min-w-0 flex-1 truncate`; `<pre>` blokları `break-all`, asistan gövdesi
  `break-words`.
- `single-chat-view.tsx`: kullanıcı mesajı ve iyimser satır gövdeleri
  `break-words` (uzun metin sarmalar, satırı itmez).

## Kanıt (canlı)

`scripts/probe-chat-overflow.cjs` — chat kaydırıcısındaki her elemanı ölçer,
sessiz kesmeleri "…" ile kırpılanlardan ayırır:

```
PASS  the chat scroller is found
PASS  nothing is clipped horizontally in the chat
PASS  the page itself never scrolls sideways — -5px
   inner horizontal scroll containers: 0
PASS  nothing is clipped horizontally on a narrow viewport (420px)
PASS  a narrow viewport still never scrolls page sideways — -5px
probe-chat-overflow: no horizontal overflow — all checks passed.
```

Önce/sonra: düzeltme öncesi ilk koşu `div.flex +100px 'open_browser · {"url":"https://www.mojee…'`
ve dar ekranda `div.min-w-0 +272px` veriyordu; son koşu **0 taşma**.
Canlı bundle `index-JrGEHX6A.js`.

## Commit'ler

`7d99e70` sarma düzeltmesi · `32060a5` canlı prob.
