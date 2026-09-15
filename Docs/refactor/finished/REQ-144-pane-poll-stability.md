# REQ-144 — paneller kendi kendini yenilemeyi bıraktı (Files "F5" sorunu)

**Status:** done
**Tarih:** 2026-09-15
**Kapsam:** `packages/lokma-web/web/src/stores/session.ts` (+ `stores/index.ts`),
`components/files/file-browser.tsx`, `components/browser/browser-pane.tsx`,
`components/git/git-pane.tsx`, `stores/stores.test.ts`, `scripts/probe-pane-stability.cjs`

## İstek (verbatim)

> abi files kısmı sürekli kendini f5liyor

Ekran görüntüsü: Files gezgini (`.agents`, `.claude`, `.verify`, `index.html`,
`lunapark_muse.html` … + "Search files (Ctrl+P)").

## Kök neden

Kenar çubuğu oturum listesini **4 saniyede bir** tazeliyor
(`sessions-sidebar.tsx:706` → `refreshSessionsQuiet`). Her tur sunucudan gelen
liste baştan `JSON.parse` edilip store'a yazılıyor, yani **değişmeyen satırlar
bile yeni obje kimliği** alıyor. `useKnownSession` store'daki objeyi olduğu gibi
döndürdüğü için, `[known]` bağımlılığıyla yazılmış her `useEffect` her turda
yeniden koşuyordu:

- **Files gezgini** (`file-browser.tsx:148`) her 4 saniyede `nodes`/`expanded`/
  `selected`/`view`/`query` state'ini sıfırlayıp kök dizini yeniden çekiyordu →
  ağaç kapanıyor, seçim ve önizleme siliniyor, istek tekrarlanıyordu (kullanıcının
  gördüğü "F5").
- Aynı sınıf hata **Browser** panelinde (sekmeler sıfırlanıp liste yeniden
  çekiliyordu) ve **Git** panelinde (her 4 saniyede `git status`) vardı.
- `chat/index.tsx` ve `terminal-pane.tsx` de aynı objeye bağlıydı; onlar
  ref/guard'larla kurtuluyordu ama gereksiz koşuyordu.

REQ-137'de aynı hata `pane.tsx` içinde (dosya önizlemesi) düzeltilmişti;
bu tur kalan tüm çağrı yerlerini kapatıyor.

## Ne değişti

1. **Kimlik sabitleme (tek merkez).** `knownSessionKey(state)` +
   `rememberKnown(prev, state)` saf yardımcıları eklendi; `useKnownSession` artık
   değerleri değişmeyen özet için **önceki objeyi** döndürüyor (JSON değer anahtarı
   karşılaştırması). Değer gerçekten değişirse yeni obje geçiyor — başlık/model
   güncellemesi gibi gerçek değişiklikler kaybolmuyor.
2. **Panel tarafında primitive bağımlılık.** Yeni `useKnownCwd(id)` kancası
   workspace yolunu tek bir string olarak veriyor: `'loading'` (liste gelmedi),
   `'missing'` (sunucu bu id'yi bilmiyor), ya da cwd (`''` = henüz workspace yok).
   Files, Browser ve Git panelleri artık bu string'i dep olarak kullanıyor; obje
   kimliği çalkalansa bile efekt yeniden koşmuyor. REQ-137'nin `pane.tsx`'te
   kullandığı desenin aynısı.
3. Terminal paneli bilinçli ref-guard'larıyla bırakıldı (merkezî düzeltme onu da
   gereksiz koşudan kurtarıyor).

## Kanıt

`scripts/probe-pane-stability.cjs` — gerçek oturumda Files panelini açar, klasör
açar, dosya seçer, sonra **12.5 saniye** (3 poll turu) bekler:

| kontrol | önce | sonra |
| --- | --- | --- |
| `the tree does not refetch while you read it` | **3** ekstra `GET /api/files?` | **0** |
| `the expanded folder stays open across the session poll` | `.agents-` (kapandı) | `.agents+` (açık) |
| `the file preview survives the session poll` | seçim yok | `selected rows=1, inline preview=true` |

- Canlı koşu (lokma.fermag.com.tr): **7 passed, 0 failed** — `no failed requests` dahil.
- `stores.test.ts` REQ-144 kontrolleri: "an unchanged poll keeps the previous
  known-session object", "loading and missing keep distinct keys", "a real change
  still hands out the new summary" → `bun src/stores/stores.test.ts` ALL PASS.
- `bun x tsc --noEmit` exit 0, `bun run build` yeşil, canlı bundle
  `index-BnpxXhOZ.js` (570.66 kB).

## Notlar

- Probun ölçtüğü şey "istek sayısı" ve "DOM durumu"; ikisi birlikte kanıt sayılıyor
  çünkü tek başına istek sayısı, state sıfırlansa bile önbellekten dönebilir.
- `useKnownCwd` üç sihirli değeri (`'loading'` / `'missing'`) gerçek yollarla
  çakışamayacak şekilde seçiyor; cwd her zaman mutlak yol.
- Gelecekte yeni bir panel yazarken kural: `[known]` objesini dependency array'e
  koyma — ya `useKnownCwd`, ya da ihtiyaç duyduğun alanı primitive olarak çıkar.
