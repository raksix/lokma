# REQ-069 — Asistan mesajları markdown render etsin (sıfır bağımlılık, ham HTML yok)

- **Status:** done (recovery — 2026-09-08 tick'i ağaçta commit'siz iş buldu: `lokma-message.tsx` içinde `REQ-069` etiketli eksiksiz markdown renderer, kökte REQ dosyası yoktu; doğrulandı + commitlendi)
- **Asked:** 2026-09-08 (kökte REQ dosyası yoktu — kodun kendi yorumu `REQ-069` diyor; önceki tick kesintiye uğramış)
- **Gap:** `AssistantBody` metin segmentlerini düz `whitespace-pre-wrap` div olarak basıyordu — modelin ürettiği başlık/liste/alıntı/link/bold/italic/kod/strike biçimleri kayboluyordu.
- **Fix:** sıfır bağımlılıklı iki katmanlı renderer (`lokma-message.tsx` içinde):
  - Blok: `parseMarkdownBlocks` — `#`–`####` başlıklar (h1/h2→h2/h3, h3/h4→h4), `>` alıntı, `---` çizgi, `-`/`*`/`+` sırasız + `1.`/`1)` sıralı listeler (ardışık satırlar tek listede birleşir), diğerleri paragraf.
  - Satır-içi: `renderInline` — `[etiket](url)` (şema beyaz listesi `sanitizeMdUrl`: http/https/mailto/#//-relative, `javascript:` düz metin kalır), `**bold**`, `*italic*`/`_italic_`, `` `code` ``, `~~strike~~`; en-soldaki eşleşme kazanır.
  - Ham HTML asla basılmaz — çıktı React elementidir (`dangerouslySetInnerHTML` yok). Kod blokları mevcut `CodeBlock` yolunda kalır (önce `splitCodeFences`, sonra metin segmentleri markdown'dan geçer).
  - Stil: tam-literal Tailwind sınıfları (`border-terracotta/60`, `list-disc`, `list-decimal`, `text-terracotta`, `border-line`, `bg-muted`), lucide dışı ikon yok.
- **Touched:** `packages/lokma-web/web/src/components/chat/lokma-message.tsx` (yeni `MdBlock` + `parseMarkdownBlocks` + `sanitizeMdUrl` + `renderInline` + `renderMdBlock`; `AssistantBody` metin dalı).
- **Proof:** root tsc 0, web tsc 0, web build green `index-DgC6pRuj.js`, single-proc `lokma-web` restart online, served bundle == disk dist (BUNDLE-MATCH).
- **Live follow-up (2026-09-08):** `lokma-message.test.ts` §7'ye 12 markdown/sanitize case'i eklendi (32/32 pass); headless mimo probu: `#lokma-chat` içinde `h:1, strong:1` render doğrulandı (liste satırını model tek satır yazdığı için `ul:0` — parser gruplama testte kanıtlı).
