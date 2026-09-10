# REQ-105 — Explorer editörde de highlight yok (düzelt)

- **Status:** done (canlıda — 2026-09-10)
- **Asked:** 2026-09-10 — "edit kısmında syntax highlighting yok onu da düzelt."
- **Teşhis:** pane tarafı CANLI (served bundle'da highlight renkleri var). Ama Explorer (`file-browser.tsx:551-558`) hâlâ düz `<textarea>` + renksiz `<pre>` kullanıyor — kullanıcı oradan düzenliyorsa highlight göremez. Fix: aynı `CodeEditor`/`CodeView` buraya da bağlanır (sabit yükseklikli kap içinde; browser paneli flex değil).
- **Touched:** `packages/lokma-web/web/src/components/files/file-browser.tsx`.
- **Verify:** typecheck 0 + build green + canlı: Explorer'da dosya düzenlerken renkli kod + satır no; pane editörü değişmez; served bundle hash.
- **Proof:** typecheck 0 + build green; served `index-DFaV8-Ox.js` disk ile aynı; Explorer textarea/pre kalktı, CodeEditor/CodeView bağlı (h-56 kap içinde).
