# REQ-110 — Obsidian tarzı memory graph (mevcut vault grafiğini pariteye getir)

- **Status:** pending
- **Asked:** 2026-09-10 — "memory graph sistemi ekle, memory graph gibi gözüksün. Obsidian vault'taki graph sistemi gibi."
- **Teşhis (koddan):** grafik altyapısı CANLI: `GET /api/vault/graph` (`buildGraph`, wikilink BFS) + Vault panesinde 2D SVG + 3D canvas star-map + note açma (`vault-pane.tsx`, `vault-graph-3d.tsx`, served bundle'da). EKSİK (Obsidian paritesi): node sürükleme, tekerlek zoom/pan, tıklanan node'un komşularını vurgulama (local graph), klasöre göre renklendirme/filtre, arama-kutusundan seed'leme. 'yap'ta mevcut grafiğe bunlar eklenir (sıfırdan graph YOK — aynısı ikinci kez yazılmaz).
- **Touched:** (yok — write-only; 'yap' denmeden kod YOK)
- **Verify:** canlıda Vault → Graph: sürükle/zoom/tıkla-komşu/filtre çalışır; 500+ node'da akıcı; note tıklayınca açılır.
