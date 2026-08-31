# Docs — Lokma Dokümantasyonu

Bu klasör Lokma projesinin **tek gerçek kaynağı**. Hermes her işe başlamadan önce burayı okur.

## Dosya Yapısı

| Dosya | Ne İçin | Durum |
|-------|---------|-------|
| `00-LOKMA-KONTEKST.md` | **ANA DOSYA** — her prompt'ta okunur & güncellenir | ✅ |
| `01-PROJE-TANIMI.md` | Lokma tanımı (Claude Code klonu, CLI+Web) | ⏳ Doldurulacak |
| `02-TEKNIK-KARARLAR.md` | Stack, mimari kararları | ⏳ |
| `03-YOL-HARITASI.md` | Roadmap (Faz 0-4) | ⏳ |
| `10-ARASTIRMA-claude-code-birebir-analiz.md` | Claude Code birebir analiz (sentez, 18KB) | ✅ |
| `11-ARASTIRMA-omp-temalar-ve-tasarim.md` | OMP tema & tasarım analizi (7.6KB) | ✅ |
| `12-HARNESS-MIMARI-cli-web-nasil-kurulur.md` | CLI+Web harness mimarisi (17KB) | ✅ |
| `13-ARASTIRMA-ozet-ve-sonraki-adimlar.md` | Özet + Faz 0 planı | ✅ |
| `raw/10-claude-code-ham-arastirma.md` | Ham: Claude Code 957 satır, 53KB | ✅ |
| `raw/11-omp-ham-arastirma.md` | Ham: OMP 360 satır, 30KB | ✅ |
| `raw/12-harness-ham-arastirma.md` | Ham: Harness 753 satır, 41KB | ✅ |
| `99-NOTLAR.md` | Hızlı notlar | ✅ |

**Toplam:** 11 doküman + 3 ham, ~3340 satır, ~167KB

## Nasıl Çalışır

1. Furkan bir şey der → Hermes önce `00-LOKMA-KONTEKST.md` okur
2. İş yapar → ilgili dosyayı `Docs/` içine yazar/günceller
3. `00-LOKMA-KONTEKST.md`'yi de günceller (kronoloji + son durum)
4. Commit + push (İngilizce mesaj)
5. memory.fermag.com.tr'ye sync

## Durum

- **Oluşturulma:** 2026-08-31
- **Araştırma:** ✅ Tamamlandı (2026-08-31 01:24, commit 5fe6bf1 + ham veriler eklenecek)
- **Sıradaki:** Faz 0 scaffold (monorepo + iskelet)
