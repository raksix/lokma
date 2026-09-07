# REQ-003 — New Session butonuna renk ekle

- **Status:** done (commit `887b574`, live 2026-09-07)
- **Asked:** 2026-09-07 — "new session butouna renk ekle".
- **Interpretation:** The sidebar "New Session" CTA gets the terracotta brand color (`bg-terracotta`, hover `bg-terracotta-hover`, white text — dark-mode guarded in `index.css`) so it stands out as the primary action. `cn`+twMerge drops the conflicting `bg-primary` automatically.
- **Touched:** `components/sessions/sessions-sidebar.tsx` (button classes only).
- **Proof:** live crop — burnt-orange button, white text; root+web `tsc` 0, web build green, live bundle match.
