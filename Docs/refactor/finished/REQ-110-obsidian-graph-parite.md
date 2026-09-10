# REQ-110 — Obsidian tarzı memory graph (mevcut vault grafiğini pariteye getir)

- **Status:** done (2026-09-10)
- **Asked:** 2026-09-10 — "memory graph sistemi ekle, memory graph gibi gözüksün. Obsidian vault'taki graph sistemi gibi."
- **Teşhis (koddan):** grafik altyapısı CANLI: `GET /api/vault/graph` (`buildGraph`, wikilink BFS) + Vault panesinde 2D SVG + 3D canvas star-map + note açma (`vault-pane.tsx`, `vault-graph-3d.tsx`, served bundle'da). EKSİK (Obsidian paritesi): node sürükleme, tekerlek zoom/pan, tıklanan node'un komşularını vurgulama (local graph), klasöre göre renklendirme/filtre, arama-kutusundan seed'leme. 'yap'ta mevcut grafiğe bunlar eklenir (sıfırdan graph YOK — aynısı ikinci kez yazılmaz).
- **Touched:** `packages/lokma-web/web/src/components/vault/vault.ts` (+`folderOf`/`folderList`/`clampZoom`/`neighborIds` pure helpers), `vault-pane.tsx` (2D SVG: node drag, cursor-anchored wheel zoom + zoom buttons, background pan, click local-graph isolate + background-click clear, folder legend/filter chips, seed/local header badges, `data-path` nodes, footer hints), `vault.test.ts` (11 new checks, 66/66 PASS)
- **Verify:** tsc 0 errors, web build green (vault-pane-CYT7IxOb.js has data-path/Reset graph view/isolates neighbors/seed strings), pm2 lokma-web restarted, served index-D9BAlTWv.js == disk MATCH
