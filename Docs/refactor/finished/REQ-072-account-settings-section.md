# REQ-072 — Account rail icon opens Settings Account section

Status: done (2026-09-09, recovery commit — recorded straight into finished/, REQ-069/REQ-071 precedent: tick opened on a dirty tree with complete uncommitted changes tagged REQ-072 and no root REQ file, previous tick cut off pre-record)
Asked: account rail icon should reach profile/admin/users/projects management.
Interpretation: those live in the Auth pane, which was a standalone Inspector tab — move Auth INTO the Settings modal as a new `account` section; the activity-bar account icon opens the modal directly on Account (never an Inspector tab), the gear still lands on General.
Touched:
- `packages/lokma-web/web/src/components/settings/settings.ts` (`SETTINGS_SECTIONS` gains `{ id: 'account', label: 'Account' }`; `SettingsSectionId`/`isSettingsSection` derive it automatically)
- `packages/lokma-web/web/src/components/settings/settings-modal.tsx` (new `initialSection` prop + `CircleUserRound` icon + `account` renders `LazyAuthPane`; open-effect lands on the requested section)
- `packages/lokma-web/web/src/components/app-shell.tsx` (`settingsSection` state; activity `settings` → modal on `general`, activity `account` → modal on `account`; both `SettingsModal` mounts take `initialSection`)
- `packages/lokma-web/web/src/components/shell/activity-bar.tsx` (`activityInspectorTab('account')` → `null`, keeps the drag fallback on sessions)
- `packages/lokma-web/web/src/components/shell/activity-bar.test.ts` (account asserts `null` + drag fallback `sessions`)
- `packages/lokma-web/web/src/components/providers/inspector-panel.tsx` (`'auth'` dropped from `InspectorTab` + render branch removed)
- `packages/lokma-web/web/src/components/shell/inspector-rail.tsx` + `inspector-rail.test.ts` (Auth rail item + `Shield` import removed, coverage list updated)
Proof: web tsc 0, activity-bar probe 17/17, inspector-rail probe 9/9, web build green index-CvnJ9Via.js, single-proc lokma-web restart online, served index chunk == disk dist (BUNDLE-MATCH). Also deleted stray untracked `smallproof.html` (unrelated real-estate page, not lokma).
Live E2E (2026-09-09): settings nav shows Account; Account section renders the Auth pane (login form when logged out, page errors 0); main shell has no Auth text node (rail item gone); gate ON throughout (brief OFF windows for probes, `/api/auth/me` 401 after).
