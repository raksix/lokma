# REQ-142 — normal görünümde gruplama yok, sadece gün var

**Status:** done
**Tarih:** 2026-09-14
**Kapsam:** `packages/lokma-web/web/src/components/sessions/*`

## İstek (verbatim)

> bu normal moddayken hiçbirini gruplandırma şu proje ya da home gibi hepsini sadece gün olarak grupla.
> today / yesterday / last week / last month / bir de daha eski işte
> o şekilde gruplandır. proje modunda şu anki hali gibi olcak

Görsel: sidebar üstündeki mod satırı `Today / Yesterday / Earlier · 24 ▾`.

## Önce ne oluyordu

Sidebar'da iki ayrı liste vardı ve ikisi aynı anda çiziliyordu:

1. **Projects bölümü** — koşulsuz render (REQ-138'den beri), ilk satır sanal
   **Home** grubu, ardından proje grupları.
2. **Zaman listesi** — `filterSessions(inProjects, query)`; yani **yalnızca bir
   projeye bağlı** oturumlar, üç kovada: `Today / Yesterday / Earlier`.

Sonuç: normal görünümde Home oturumları *hiç* gün kovasına girmiyordu (iki yerde
birden görünmesin diye), projeliler ise hem Projects hem gün listesinde
durmuyordu — kullanıcı "normal modda gruplama olmasın, her şey gün olsun" dedi.

## Şimdi ne oluyor

Gruplama artık **görünümün fonksiyonu**:

| Görünüm | Liste | Gruplar |
| --- | --- | --- |
| normal (`time`) | **tüm** oturumlar (`filterSessions(sessions, query)`) | `Today` · `Yesterday` · `Last week` · `Last month` · `Older` |
| proje (`project`) | projeye bağlı oturumlar | **değişmedi** — Projects bölümü + Home ilk satır + proje grupları |

- Boş kovalar çizilmez; sıra her zaman `Today → Older` (`DAY_GROUP_ORDER`,
  `Object.keys` sırasına güvenilmez).
- Proje görünümünde Home/Projects eskisi gibi kalır — kullanıcı "proje modunda
  şu anki hali gibi olacak" dedi.
- Mod satırı artık `By day` yazar; `title` ipucu beş kovayı listeler
  (`Today / Yesterday / Last week / Last month / Older`).

### Kova sınırları

| Kova | Takvim günü farkı |
| --- | --- |
| `Today` | 0 (veya gelecek/geçersiz saat) |
| `Yesterday` | 1 |
| `Last week` | 2–7 |
| `Last month` | 8–30 |
| `Older` | 30+ · **timestamp'i olmayan oturumlar** |

Sınırlar takvim günü başlangıcına göre (`startOfDay`) hesaplanır; "23 saat önce"
dün sayılır, "5 gün önce" bugünkü saatten bağımsız olarak `Last week`'e düşer.

## Görünüm seçimi de kalıcı

REQ-141'in katlanma kaydıyla aynı ruh: `localStorage['lokma-sidebar-groupby']`.

- Kayıt yok / bozuk / bilinmeyen değer → `time` (normal görünüm).
- Storage fırlatırsa (private mode, quota) → yine `time`, hiç patlamaz.
- F5 sonrası görünüm aynı kalır; probu `probe-day-groups.cjs` bunu ölçüyor.

## Kanıt

| Ne | Sonuç |
| --- | --- |
| `sessions.test.ts` | **51 passed, 0 failed** (yeni kovalar + `Last month` sıralaması) |
| `group-storage.test.ts` | PASS (mod okuma/yazma + bozuk kayıt + fırlatan storage) |
| `bun x tsc --noEmit` | 0 hata |
| `bun run build` | yeşil |
| `scripts/probe-day-groups.cjs` (canlı) | **15 / 15 PASS** |
| `probe-sidebar-persistence.cjs` (canlı) | PASS (proje görünümüne geçip katlıyor) |
| `probe-home-project.cjs` (canlı) | PASS (önce proje görünümüne geçiyor) |

Canlı sayılar (lokma.fermag.com.tr): normal görünümde kova sayıları toplamı
**249 = 249** mod satırındaki oturum sayısı; çizilen kovalar
`Today, Yesterday, Last week, Last month` (30 günden eski oturum yok, `Older`
bu yüzden görünmüyor).

## Ölçüm notu (prob yazarken çıkan iki tuzak)

1. Mod butonunun `aria-label`'ı **gidilecek** modu söyler (`Group by project`),
   ekrandaki modu değil — ilk koşuda ters okundu, ölçüm düzeltildi.
2. Kova başlıkları `div[class*="uppercase"]` içinde; `innerText` başlık + sayaç
   rozetini birlikte verir, bu yüzden metin eşleşmesi **own text node** üzerinden
   yapılmalı (`innerText === 'Today'` her zaman false).

## Dosyalar

- `grouping.ts` — `DayGroup` = 5 kova, `DAY_GROUP_ORDER`, `dayGroup()`,
  `groupSessions()` sıralı bucket doldurma.
- `group-storage.ts` — `GROUP_MODE_KEY`, `readGroupBy()`, `writeGroupBy()`.
- `sessions-sidebar.tsx` — `allFiltered` (tüm oturumlar), `listed` (görünüme göre
  sayaç/boş durum/"Show all"), Projects bölümü sadece proje görünümünde,
  `toggleGroupMode`, mod satırı `By day`.
- `scripts/probe-day-groups.cjs` — 15 kontrollük canlı prob.

## Commit'ler

- `49dcff9` feat(web): group the normal sidebar view by day only
- `02a2775` test(web): cover the new day buckets and the persisted view
- `76fca15` test(scripts): probe the day-only normal view
- `a1c1f5c` test(scripts): aim the Home/sidebar probes at the project view
