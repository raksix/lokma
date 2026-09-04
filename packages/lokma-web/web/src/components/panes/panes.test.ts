/**
 * Probe for the W7-27 pane-system helpers (pure logic only, no DOM).
 * Run: `bun src/components/panes/panes.test.ts` from packages/lokma-web/web.
 */
import {
  INSPECTOR_TABS,
  PANE_TAB_MIME,
  SESSION_DRAG_MIME,
  TILING_BAR_TABS,
  appendLayoutPane,
  closeLayoutPane,
  collectPaneIds,
  countPanes,
  dropZoneFor,
  encodeTabMove,
  inspectorLabel,
  isInspectorTabId,
  isPaneTab,
  isValidRelPath,
  isValidSessionId,
  makeFileTab,
  makeInspectorTab,
  makePaneId,
  makeSessionTab,
  makeTabId,
  parseFileDrop,
  parseSessionDrop,
  parseTabMove,
  parseTabStates,
  resizeLayoutNode,
  serializeTabStates,
  splitForZone,
  splitLayout,
} from "./panes";
import type { LayoutNode } from "@/stores/layout";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}
function stubData(getters: Record<string, string>): { getData: (t: string) => string } {
  return { getData: (t: string) => getters[t] ?? "" };
}
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/* 1 — tab factories carry real payloads, never placeholders. */
const s = makeSessionTab("sess_abc123");
check("session tab kind", s.kind === "session" && s.sessionId === "sess_abc123");
check("session tab id unique", makeSessionTab("sess_abc123").id !== s.id);
check("session tab default title mentions id", s.title.includes("abc123"));
check("session tab custom title", makeSessionTab("sess_1", "My chat").title === "My chat");

const g = makeInspectorTab("terminal");
check("inspector tab label", g.title === "Terminal" && g.inspectorId === "terminal");

const f = makeFileTab("src/index.ts", "sess_abc123");
check("file tab carries path+session", f.filePath === "src/index.ts" && f.sessionId === "sess_abc123");
check("file tab title is basename", f.title === "index.ts");

check("tab id prefix", makeTabId("tab-x").startsWith("tab-x-"));
check("pane id prefix unique", makePaneId().startsWith("p-") && makePaneId() !== makePaneId());

/* 2 — registry mirrors the right Inspector (23 tabs); tiling bar keeps the 20 open actions. */
check("registry has 23 entries", INSPECTOR_TABS.length === 23);
check("registry has browser", INSPECTOR_TABS.some((t) => t.id === "browser"));
check("registry has orchestration+agents pair", INSPECTOR_TABS.some((t) => t.id === "orchestration") && INSPECTOR_TABS.some((t) => t.id === "agents"));
check("registry has memory", INSPECTOR_TABS.some((t) => t.id === "memory"));
check("tiling bar has 20 entries", TILING_BAR_TABS.length === 20);
check("tiling bar all in registry", TILING_BAR_TABS.every(isInspectorTabId));
check("inspectorLabel known", inspectorLabel("git") === "Git");
check("isInspectorTabId rejects unknown", !isInspectorTabId("nope"));

/* 3 — id validation mirrors the server shape guards. */
check("valid session id", isValidSessionId("sess_abc123"));
check("reject empty session id", !isValidSessionId(""));
check("reject session id with slash", !isValidSessionId("a/b"));
check("reject session id with dotdot", !isValidSessionId(".."));
check("reject session id with space", !isValidSessionId("a b"));
check("valid rel path", isValidRelPath("src/app.ts"));
check("reject absolute path", !isValidRelPath("/etc/passwd"));
check("reject dotdot path", !isValidRelPath("../secret"));
check("reject backslash path", !isValidRelPath("a\\b"));
check("reject empty segment", !isValidRelPath("a//b"));

/* 4 — drop parsing: typed MIME first, invalid rejected, never faked. */
const FILE_MIME = "application/x-lokma-file";
check("parse session mime", parseSessionDrop(stubData({ [SESSION_DRAG_MIME]: "sess_1" })) === "sess_1");
check("parse session trims", parseSessionDrop(stubData({ [SESSION_DRAG_MIME]: "  sess_1 " })) === "sess_1");
check("parse session rejects bad id", parseSessionDrop(stubData({ [SESSION_DRAG_MIME]: "../x" })) === null);
check("parse session ignores empty", parseSessionDrop(stubData({})) === null);
check("parse session ignores title text", parseSessionDrop(stubData({ "text/plain": "My chat title" })) === null);
check("parse file mime", parseFileDrop(stubData({ [FILE_MIME]: "src/a.ts" }), FILE_MIME) === "src/a.ts");
check("parse file at-path fallback", parseFileDrop(stubData({ "text/plain": "@src/a.ts" }), FILE_MIME) === "src/a.ts");
check("parse file rejects absolute", parseFileDrop(stubData({ [FILE_MIME]: "/etc/x" }), FILE_MIME) === null);
check("parse file ignores empty", parseFileDrop(stubData({}), FILE_MIME) === null);

/* 5 — tab-move payload round-trips through HTML5 drag. */
const moved = makeSessionTab("sess_9");
const payload = encodeTabMove("a", moved);
const parsed = parseTabMove(stubData({ [PANE_TAB_MIME]: payload }));
check("tab move parses", parsed?.fromPane === "a" && parsed?.tab.sessionId === "sess_9");
check("tab move rejects garbage", parseTabMove(stubData({ [PANE_TAB_MIME]: "{bad" })) === null);
check("tab move rejects wrong kind", parseTabMove(stubData({ [PANE_TAB_MIME]: JSON.stringify({ fromPane: "a", tab: { kind: "mock" } }) })) === null);
check("tab move ignores empty", parseTabMove(stubData({})) === null);
check("isPaneTab guards shape", isPaneTab(moved) && !isPaneTab(null) && !isPaneTab({ kind: "session" }));

/* 6 — five-zone hit-testing (24% edge rule). */
check("zone center", dropZoneFor(400, 300, 200, 150) === "center");
check("zone left", dropZoneFor(400, 300, 10, 150) === "left");
check("zone right", dropZoneFor(400, 300, 390, 150) === "right");
check("zone top", dropZoneFor(400, 300, 200, 5) === "top");
check("zone bottom", dropZoneFor(400, 300, 200, 295) === "bottom");
check("split for left", JSON.stringify(splitForZone("left")) === JSON.stringify({ dir: "row", pos: "before" }));
check("split for bottom", JSON.stringify(splitForZone("bottom")) === JSON.stringify({ dir: "col", pos: "after" }));
check("split for center is null", splitForZone("center") === null);

/* 7 — layout tree ops on the real LayoutNode shape. */
const root: LayoutNode = {
  type: "split",
  id: "root",
  dir: "row",
  sizes: [50, 50],
  children: [
    { type: "pane", id: "a" },
    { type: "pane", id: "b" },
  ],
};
check("collect panes", JSON.stringify(collectPaneIds(root)) === JSON.stringify(["a", "b"]));
check("count panes", countPanes(root) === 2);
check("count single pane", countPanes({ type: "pane", id: "solo" }) === 1);

const split = splitLayout(root, "b", "col", "after", "c");
check("split keeps target", collectPaneIds(split).includes("b"));
check("split adds pane", collectPaneIds(split).includes("c"));
check("split keeps sibling", collectPaneIds(split).includes("a"));
check("split unknown target untouched", sameJson(splitLayout(root, "zzz", "row", "after", "c"), root));

const nested: LayoutNode = {
  type: "split",
  id: "root",
  dir: "row",
  sizes: [50, 50],
  children: [
    { type: "pane", id: "solo" },
    {
      type: "split",
      id: "sub",
      dir: "col",
      sizes: [50, 50],
      children: [
        { type: "pane", id: "x" },
        { type: "pane", id: "y" },
      ],
    },
  ],
};
const closed = closeLayoutPane(nested, "x");
check("close collapses single-child branch", closed !== null && JSON.stringify(collectPaneIds(closed)) === JSON.stringify(["solo", "y"]));
check("close last pane returns null", closeLayoutPane({ type: "pane", id: "only" }, "only") === null);
check("close unknown keeps tree", sameJson(closeLayoutPane(root, "zzz") ?? null, root));

const resized = resizeLayoutNode(root, "root", [30, 70]);
check("resize applies sizes", resized.type === "split" && resized.sizes[0] === 30 && resized.sizes[1] === 70);
check("resize untouched on unknown id", sameJson(resizeLayoutNode(root, "zzz", [30, 70]), root));

const appended = appendLayoutPane(root, "d");
check("append adds pane", collectPaneIds(appended).includes("d") && countPanes(appended) === 3);

/* 8 — tab snapshot round-trips; corrupt rows drop. */
const states = {
  a: { tabs: [makeSessionTab("sess_1", "One"), makeInspectorTab("git")], active: "nope" },
  b: { tabs: [{ kind: "mock" }], active: null },
};
const round = parseTabStates(serializeTabStates(states as never));
check("snapshot keeps good pane", Array.isArray(round.a?.tabs) && round.a.tabs.length === 2);
check("snapshot fixes bad active", round.a?.active === round.a?.tabs[0].id);
check("snapshot drops corrupt pane", !("b" in round));
check("snapshot rejects garbage", Object.keys(parseTabStates("{bad")).length === 0);
check("snapshot rejects null", Object.keys(parseTabStates(null)).length === 0);

console.log(`panes: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
