# REQ-006 — Sidebar left/right rozetleri kaldır

- **Status:** in-progress
- **Asked:** 2026-09-07 — "sol sağ da left rigyt yazmasına gerek yok amk".
- **Interpretation:** Drop the `left`/`right` Badge from the `Sidebar` header — title alone ("Explorer"/"Inspector").
- **Touched:** `components/sidebar.tsx` (remove Badge).
- **Verify:** root+web `tsc` 0 (same build as REQ-005), live bundle match.
