// ---------------------------------------------------------------------------
// VENDORED — Agent Office renderer core (the pixel office drawing code).
//
// Upstream:  https://github.com/isisever/agent-office  (MIT)
// Source:    plugin/viewer/core.mjs @ commit 47c3c733e384 (2026-10-12)
// Fetched:   2026-10-18 · body sha256 b211956a4a86b4720ac8f7121897e4a89a117beb1356737041f1a3a90985f2e6
// License:   MIT — Copyright (c) 2026 isisever. Full text: ./agent-office-LICENSE.txt
//            (the notice must ship with every copy — do not delete this header)
//
// Changes:   NONE. Everything below the END marker is byte-identical to
//            upstream; Lokma drives it from a browser host
//            (../office-canvas.tsx) and never edits the drawing code. To
//            re-sync: replace the body, re-hash, update this header.
// ---------------------------------------------------------------------------
// --- END OF LOKMA VENDOR HEADER — upstream body below is unmodified ---
// Agent Office renderer core: the ONLY drawing code of the pixel office.
// This is the source (plugin/viewer/core.mjs). The plugin's viewer (viewer/office.mjs) imports it from here;
// the app (app/src/office/core.mjs) uses an exact copy: app/scripts/sync-core.mjs copies it,
// app/test/office.test.mjs checks they are identical. Edit here, then run `node app/scripts/sync-core.mjs`.
// Pure ES module (no Node APIs); runs both in the Electron renderer and in Node.

const SPEED = 40 / 1000 // logical pixels / ms
const HANDOFF_MS = 1500
const SETTLE_MS = 500
const SIT = 4
let PARTY_MS = 10 * 60 * 1000 // time spent on the dance floor (setPartyMinutes)
const RECALL_MS = 4000 // when new work is this fresh, someone is called off the dance floor
export const FRAME_MS = 110

// time on the dance floor, in minutes; the viewer ties it to the plugin's forget time (forgetMinutes)
export function setPartyMinutes(minutes) {
  const m = Number(minutes)
  PARTY_MS = Number.isFinite(m) && m > 0 ? m * 60 * 1000 : 10 * 60 * 1000
}

// ---------- language ----------
// Text inside the office (same as the plugin's viewer); the app picks it with setLanguage, Turkish by default.
const STRINGS = {
  tr: {
    office: 'OFİS', boss: 'MÜDÜR', working: 'ÇALIŞIYOR', waiting: 'BEKLİYOR', agents: 'AJANLARI BEKLİYOR', asking: 'ONAY BEKLİYOR', thinking: 'DÜŞÜNÜYOR',
    today: 'BUGÜN', delivered: n => `${n} TESLİM`, demoProject: 'gösteri',
    types: { 'general-purpose': 'GENEL', Explore: 'KEŞİF', Plan: 'PLAN', 'claude-code-guide': 'REHBER' },
  },
  en: {
    office: 'OFFICE', boss: 'BOSS', working: 'WORKING', waiting: 'WAITING', agents: 'WAITING ON AGENTS', asking: 'NEEDS YOU', thinking: 'THINKING',
    today: 'TODAY', delivered: n => `${n} DONE`, demoProject: 'demo',
    types: { 'general-purpose': 'GENERAL', Explore: 'EXPLORE', Plan: 'PLAN', 'claude-code-guide': 'GUIDE' },
  },
}
let LANG = 'tr'
let T = STRINGS.tr
export function setLanguage(lang) {
  LANG = lang === 'en' ? 'en' : 'tr'
  T = STRINGS[LANG]
}
const DESIGN_W = 330
const DESIGN_H = 200

// ---------- colours ----------
const C = {
  frame: 0x2b1d1a, ol: 0x3a2a22, wallTop: 0x6e4b3a, wallTopHi: 0x84604a,
  brick: 0xb5654a, brickDark: 0x9c4f3a, mortar: 0xc98b6e,
  cream: 0xf0e2c2, creamStripe: 0xe6d4ae, sage: 0x9cb38f, sageStripe: 0x93aa86,
  panel: 0x7a8090, panelDark: 0x6a7080, wainscot: 0xb58553, wainscotDark: 0x9a6c40,
  checkA: 0xf1e3c6, checkB: 0xdcc59c, woodA: 0xc79a64, woodB: 0xbb8d58, woodSeam: 0x9c7244,
  serverA: 0x5b6170, serverB: 0x525866, carpetA: 0xd9c9a3, carpetB: 0xd1c09a,
  rugRed: 0xa8434f, rugRedIn: 0x8a3340, rugGold: 0xe0b45a, rugCream: 0xe9dcc0, rugBlue: 0x5e7fa8, rugBlueIn: 0x4d6a90,
  book: [0xc0504d, 0x4f81bd, 0x9bbb59, 0xf2c14e, 0x8064a2, 0x3fb6a8, 0x3f8f8a],
  shelf: 0x7a4f30, shelfDark: 0x5a3820, leaf: 0x4fa65a, leafDark: 0x3a8046, leafHi: 0x7cc47f, pot: 0xc0663f, potDark: 0x9a4e2e,
  lampShade: 0xf3d9a0, lampShadeDark: 0xd9b874, lampPole: 0x4a3a30, glow: 0xfff1c4,
  sky: 0x8fd0f2, skyLow: 0xb5e2f7, dusk: 0xf0a35e, duskLow: 0xf7c98a, night: 0x1b2140, nightLow: 0x262d55,
  cloud: 0xffffff, star: 0xfff6c8, moon: 0xf3eccb, glass: 0xe8f4fa,
  deskTop: 0xd8a56a, deskEdge: 0xe9bd85, deskFront: 0xa8743f, deskLeg: 0x6a4425, plate: 0xf3d9b0,
  chair: 0x3b4252, chairHi: 0x535c70, bossChair: 0x6a2c36, bossChairHi: 0x8a4450,
  lid: 0xd6d8de, lidDark: 0xa9adb8, logo: 0x3fb6a8, logoOn: 0xa8f0e6, mug: 0xf4efe6, coffee: 0x6b4226,
  body: 0x3fb6a8, bodyHi: 0x6fd6c9, shade: 0x2b8a7f, eye: 0x1a1a1a, tie: 0x2a3a6a, tieKnot: 0x1d2a50,
  paper: 0xf7f6f0, ink: 0x9a9a9a, bad: 0xe05050, good: 0x3fae55,
  white: 0xffffff, dark: 0x1d1a24, yellow: 0xf2c14e, accent: 0x3fb6a8, dim: 0xb8b0a4,
  chairCream: 0xebdcbc, chairCreamDark: 0xcdb990, chairCushion: 0xa87a52,
  table: 0x8a5a36, tableTop: 0xa8703f, machine: 0x3a3d45, machineHi: 0x5a5e68, red: 0xe5483f, green: 0x5fd068, blue: 0x5aa7e8,
  rack: 0x2a2e38, rackHi: 0x3b404c, cabinet: 0x9aa0aa, cabinetDark: 0x7d838e,
  signGreen: 0x2f5d46, signGreenDark: 0x234736, gold: 0xe8c35a,
  board: 0xf7f7f2, boardFrame: 0xb0b4bc, marker: 0x3b6fd1,
  cooler: 0xdfe8ee, water: 0x7cc3ea, mat: 0x8a6a4a, matDark: 0x6e5238,
  cat: 0x8a8f99, catDark: 0x6c717b, basket: 0xb88a52, basketDark: 0x936a3a, pillow: 0xd98a8a,
  windowFrame: 0xffffff, statusBg: 0x231815, statusText: 0xf3ead8,
  // party area
  neonPink: 0xff4fa8, neonCyan: 0x3fe0e8, neonPurple: 0x9b5cff, floorDark: 0x2a2340, floorDarkHi: 0x3a3257, floorGrout: 0x17131f,
  ballA: 0xd4d8e2, ballB: 0x9aa0ae, ballDark: 0x6c7280,
}

// ---------- themes ----------
// The theme is picked by project name (working directory); with no match, classic (red and wood).
// Themes can be added or overridden in ~/.claude/agent-office/themes.json:
//   { "acme": { "match": "acme", "title": "ACME HQ", "sign": "ACME", "colors": { "accent": "#ff8800" } } }
const BASE = { ...C }
const THEMES = {
  classic: { sign: 'AGENT', colors: {} },
  // sample built-in theme: projects with "forest" in their name work in a green office
  forest: {
    match: 'forest',
    sign: 'FOREST',
    colors: {
      frame: 0x0f2318, ol: 0x1b3a2a, wallTop: 0x2e6b4a, wallTopHi: 0x3f8a60,
      brick: 0x4f9a6e, brickDark: 0x3f7f5a, mortar: 0x8cc7a2,
      rugRed: 0x2f8a57, rugRedIn: 0x23704a, bossChair: 0x1f5a3c, bossChairHi: 0x2f7a52,
      accent: 0x34c77b, logo: 0x34c77b, logoOn: 0x9ff0c2, dim: 0xa9c4b4,
      windowFrame: 0xc9f2d8, statusBg: 0x133024, statusText: 0xe3f7ea,
    },
  },
}
const BUILTIN = Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, { ...t, colors: { ...t.colors } }]))

// merges the contents of themes.json (hex string colours) over the built-in themes
export function setThemes(userThemes) {
  for (const k of Object.keys(THEMES)) delete THEMES[k]
  for (const [k, t] of Object.entries(BUILTIN)) THEMES[k] = { ...t, colors: { ...t.colors } }
  for (const [name, t] of Object.entries(userThemes ?? {})) {
    if (!t || typeof t !== 'object') continue
    const colors = Object.fromEntries(
      Object.entries(t.colors ?? {}).map(([k, v]) => [k, typeof v === 'string' ? parseInt(v.replace('#', ''), 16) : v]),
    )
    THEMES[name] = { ...THEMES[name], ...t, colors: { ...THEMES[name]?.colors, ...colors } }
  }
  // apply the new colours on the next frame
  themeName = ''
  backgroundKey = ''
}

let THEME = THEMES.classic
let themeName = ''

const slugOf = p => String(p ?? '').replace(/[^\w.-]/g, '_')
let forcedTheme = ''

// picks the theme regardless of the project (like --theme); empty means pick by project
export function setTheme(name) {
  forcedTheme = name ? String(name) : ''
}

function themeFor(project) {
  const forced = forcedTheme
  if (forced && THEMES[forced]) return forced
  const name = String(project ?? '').toLowerCase()
  for (const [key, t] of Object.entries(THEMES)) if (t.match && name.includes(String(t.match).toLowerCase())) return key
  return name ? `auto:${project}` : 'classic'
}

function hsl(h, s, l) {
  const k = n => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
  return (f(0) << 16) | (f(8) << 8) | f(4)
}

// with no matching theme, generates one from the project name: the name's hue drives wall, carpet, frame, accent
function projectTheme(project) {
  const hue = strHash(String(project).toLowerCase()) % 360
  // wall sign: the project folder's full name (my-app → MY-APP); given a path (slashes or Windows backslashes), its last segment
  const label = String(project).split(/[\\/]/).filter(Boolean).pop() || 'AGENT'
  return {
    sign: label,
    colors: {
      frame: hsl(hue, 0.35, 0.1), ol: hsl(hue, 0.3, 0.16), wallTop: hsl(hue, 0.35, 0.32), wallTopHi: hsl(hue, 0.35, 0.4),
      brick: hsl(hue, 0.4, 0.48), brickDark: hsl(hue, 0.4, 0.4), mortar: hsl(hue, 0.35, 0.68),
      rugRed: hsl(hue, 0.45, 0.42), rugRedIn: hsl(hue, 0.45, 0.34), bossChair: hsl(hue, 0.4, 0.28), bossChairHi: hsl(hue, 0.4, 0.38),
      accent: hsl(hue, 0.6, 0.55), logo: hsl(hue, 0.6, 0.55), logoOn: hsl(hue, 0.8, 0.8), dim: hsl(hue, 0.15, 0.72),
      signGreen: hsl(hue, 0.35, 0.25), signGreenDark: hsl(hue, 0.35, 0.18),
      windowFrame: hsl(hue, 0.5, 0.88), statusBg: hsl(hue, 0.35, 0.14), statusText: hsl(hue, 0.3, 0.92),
    },
  }
}

// loads the colours when the theme changed; true means the background must be redrawn
function useTheme(name) {
  if (name === themeName) return false
  themeName = name
  if (name.startsWith('auto:') && !THEMES[name]) THEMES[name] = projectTheme(name.slice(5))
  THEME = THEMES[name]
  Object.assign(C, BASE, THEME.colors, botColors ?? {})
  return true
}

// bot colour (user choice, '#rrggbb'); body, bright top and shadow derive from it. null = the theme's colour
let botColors = null
export function setBotColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''))
  if (!m) {
    botColors = null
    for (const k of ['body', 'bodyHi', 'shade']) C[k] = THEME.colors?.[k] ?? BASE[k]
    return
  }
  const body = parseInt(m[1], 16)
  botColors = { body, bodyHi: mix(body, 0xffffff, 0.35), shade: mix(body, 0x000000, 0.28) }
  Object.assign(C, botColors)
}


// ---------- 3x5 pixel font ----------
const FONT = {
  A: '.#.#.####.##.#', B: '##.#.###.#.###.', C: '.###..#..#...##', D: '##.#.##.##.###.', E: '####..##.#..###',
}
const ROWS = {
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..', G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.', P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ##. .##', R: '##. #.# ##. #.# #.#', S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###',
  0: '### #.# #.# #.# ###', 1: '.#. ##. .#. .#. ###', 2: '##. ..# .#. #.. ###', 3: '##. ..# .#. ..# ##.',
  4: '#.# #.# ### ..# ..#', 5: '### #.. ##. ..# ##.', 6: '.## #.. ### #.# ###', 7: '### ..# .#. .#. .#.',
  8: '### #.# ### #.# ###', 9: '### #.# ### ..# ##.',
  '.': '... ... ... ... .#.', ':': '... .#. ... .#. ...', '-': '... ... ### ... ...', '/': '..# ..# .#. #.. #..',
  '!': '.#. .#. .#. ... .#.', '?': '##. ..# .#. ... .#.', '(': '.#. #.. #.. #.. .#.', ')': '.#. ..# ..# ..# .#.',
  '_': '... ... ... ... ###', ',': '... ... ... .#. #..', '+': '... .#. ### .#. ...', '>': '#.. .#. ..# .#. #..',
  "'": '.#. .#. ... ... ...', ' ': '... ... ... ... ...',
  '#': '#.# ### #.# ### #.#', '=': '... ### ... ### ...', '<': '..# .#. #.. .#. ..#', '*': '... #.# .#. #.# ...',
  '%': '#.# ..# .#. #.. #.#', '&': '.#. #.# .#. #.# .##', '@': '### #.# ### #.. .##', '"': '#.# #.# ... ... ...',
  ';': '... .#. ... .#. #..', '[': '##. #.. #.. #.. ##.', ']': '.## ..# ..# ..# .##',
}
for (const k of Object.keys(FONT)) delete FONT[k]
for (const [k, v] of Object.entries(ROWS)) FONT[k] = v.replace(/ /g, '')
const MARKS = {
  Ç: ['C', null, '.#.'], Ş: ['S', null, '.#.'], Ğ: ['G', '###', null], Ü: ['U', '#.#', null],
  Ö: ['O', '#.#', null], İ: ['I', '.#.', null],
}

// upper-cases: in Turkish i→İ, ı→I; in English plain toUpperCase (same as the plugin)
function normalize(str) {
  if (LANG === 'tr') return String(str).replace(/i/g, 'İ').replace(/ı/g, 'I').toLocaleUpperCase('tr-TR')
  return String(str).toUpperCase()
}

// letter missing from the font: drop its accent (É→E); still missing → '?'
function glyphOf(ch) {
  return FONT[ch] ?? FONT[ch.normalize('NFD')[0]] ?? FONT['?']
}

function textWidth(str) {
  return Math.max(0, [...normalize(str)].length * 4 - 1)
}

function text(str, x, y, color, shadow = null) {
  let cx = Math.round(x)
  for (const ch of normalize(str)) {
    const mark = MARKS[ch]
    const glyph = glyphOf(mark ? mark[0] : ch)
    const paint = (dx, dy) => {
      if (shadow !== null) px(cx + dx + 1, y + dy + 1, shadow)
      px(cx + dx, y + dy, color)
    }
    for (let i = 0; i < 15; i++) if (glyph[i] === '#') paint(i % 3, Math.floor(i / 3))
    if (mark?.[1]) for (let i = 0; i < 3; i++) if (mark[1][i] === '#') paint(i, -2)
    if (mark?.[2]) for (let i = 0; i < 3; i++) if (mark[2][i] === '#') paint(i, 5)
    cx += 4
  }
}

function fit(str, max) {
  const s = [...String(str)]
  return s.length <= max ? s.join('') : s.slice(0, max - 1).join('') + '.'
}

// ---------- frame buffer ----------
let LW = DESIGN_W
let LH = DESIGN_H
let S = 4
let fb = new Uint32Array(LW * LH)

function px(x, y, c) {
  x |= 0
  y |= 0
  if (x < 0 || y < 0 || x >= LW || y >= LH) return
  fb[y * LW + x] = c
}

function rect(x, y, w, h, c) {
  x = Math.round(x)
  y = Math.round(y)
  const x0 = Math.max(0, x)
  const y0 = Math.max(0, y)
  const x1 = Math.min(LW, x + Math.round(w))
  const y1 = Math.min(LH, y + Math.round(h))
  for (let j = y0; j < y1; j++) fb.fill(c, j * LW + x0, j * LW + x1)
}

// outlined rectangle: the dark contour look of the reference
function box(x, y, w, h, c) {
  rect(x - 1, y - 1, w + 2, h + 2, C.ol)
  rect(x, y, w, h, c)
}

function shade(x, y, w, h, f = 0.82) {
  for (let j = Math.max(0, y); j < Math.min(LH, y + h); j++)
    for (let i = Math.max(0, x); i < Math.min(LW, x + w); i++) {
      const c = fb[j * LW + i]
      fb[j * LW + i] = (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f)
    }
}

function line(x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let i = 0; i <= n; i++) px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c)
}

function hash(n) {
  let h = n | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}

function strHash(s) {
  let h = 7
  for (let i = 0; i < s.length; i++) h = Math.imul(h, 31) + s.charCodeAt(i)
  return hash(h)
}

// ---------- layout ----------
let L

function computeLayout() {
  const B = 4
  const wallFaceBottom = 26 // back wall of the top rooms
  const dividerY = 90 // wall between the rooms and the work hall
  const hallFaceTop = 95
  const hallFloorY = 113
  const bossX1 = B + 112
  const serverX0 = LW - B - 96
  const loungeX0 = bossX1 + 4
  const loungeX1 = serverX0 - 4
  const corridorX = 16
  const aisle0 = hallFloorY + 9
  const firstSeat = hallFloorY + 35 // keep the first row's labels off the whiteboard
  const pitchY = 38
  const rows = Math.max(1, Math.min(4, 1 + Math.floor((LH - B - 16 - firstSeat) / pitchY)))
  const pitchX = 40
  const x0 = 34
  const x1 = LW - B - 30
  const cols = Math.max(1, Math.floor((x1 - x0) / pitchX))
  const offX = x0 + (x1 - x0 - cols * pitchX) / 2 + pitchX / 2
  const desks = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) desks.push({ cx: Math.round(offX + c * pitchX), by: firstSeat + r * pitchY, row: r })
  const aisles = []
  for (let r = 0; r < rows; r++) aisles.push(r === 0 ? aisle0 : firstSeat + (r - 1) * pitchY + 19)
  const bottomAisle = LH - B - 4
  const bossDoorX = bossX1 - 22
  const loungeDoorX = Math.round((loungeX0 + loungeX1) / 2)
  const serverDoorX = serverX0 + 22
  const boss = { cx: B + 54, by: 58 }
  return {
    B, wallFaceBottom, dividerY, hallFaceTop, hallFloorY, bossX1, serverX0, loungeX0, loungeX1, corridorX,
    aisles, desks, bottomAisle, bossDoorX, loungeDoorX, serverDoorX,
    boss: { ...boss, seat: [boss.cx - 4, boss.by], stand: [boss.cx + 2, 84] },
    door: [-10, bottomAisle],
    lounge: { slots: Math.max(4, Math.floor((loungeX1 - loungeX0 - 30) / 18) * 2) },
    party: partyLayout(loungeX0, loungeX1, B),
  }
}

// party area: dance floor, disco ball, DJ booth, dance spots
function partyLayout(x0, x1, B) {
  const w = x1 - x0
  const hasDj = w >= 150
  const ax0 = x0 + (w > 90 ? 20 : 16)
  const ax1 = hasDj ? x1 - 45 : x1 - 6
  const cols = Math.max(2, Math.floor((ax1 - ax0 - 1) / 8))
  const rows = 5
  const fw = cols * 8 + 1
  const fh = rows * 6 + 1
  const fx0 = Math.round(ax0 + (ax1 - ax0 - fw) / 2)
  const fy0 = 52
  const n = Math.max(1, Math.min(4, Math.floor(fw / 18)))
  const spots = []
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < n; c++)
      spots.push([Math.round(fx0 + (fw * (c + 0.5 + (r ? 0.2 : -0.15))) / n), fy0 + 14 + r * 14])
  // disco ball: between the coffee counter and the wall sign; none if there is no room
  const counterRight = x0 + 6 + Math.min(46, w - 44) + 1
  const signLeft = w > 130 ? x0 + 84 : x0 + 30
  const signRight = w > 110 ? x1 - 30 : x1
  const sw = textWidth(fit(normalize(THEME.sign), 14)) + 10
  const sx = Math.round((signLeft + signRight) / 2 - sw / 2) - 1
  const ball = sx - counterRight >= 16 ? { x: Math.round((counterRight + sx) / 2), y: B + 11 } : null
  return { fx0, fy0, fw, fh, cols, rows, spots, ball, dj: hasDj ? { x: x1 - 41, y: 48 } : null }
}

// ---------- paths ----------
function seatInfo(slot) {
  if (slot < L.desks.length) {
    const d = L.desks[slot]
    return { seat: [d.cx - 5, d.by], aisle: L.aisles[d.row], row: d.row, kind: 'desk' }
  }
  const k = (slot - L.desks.length) % L.lounge.slots
  const perRow = L.lounge.slots / 2
  const x = L.loungeX0 + 18 + (k % perRow) * 18
  const y = 70 + Math.floor(k / perRow) * 14
  return { seat: [x, y], aisle: y, row: -1, kind: 'lounge' }
}

function toHallTop(info) {
  if (info.kind === 'lounge') return [[L.loungeDoorX, info.aisle], [L.loungeDoorX, L.aisles[0]]]
  if (info.row === 0) return []
  return [[L.corridorX, info.aisle], [L.corridorX, L.aisles[0]]]
}

function pathIn(slot) {
  const info = seatInfo(slot)
  const { seat, aisle } = info
  const start = [L.door, [L.corridorX, L.bottomAisle]]
  if (info.kind === 'lounge') return [...start, [L.corridorX, L.aisles[0]], [L.loungeDoorX, L.aisles[0]], [L.loungeDoorX, aisle], seat]
  return [...start, [L.corridorX, aisle], [seat[0], aisle], seat]
}

function pathToBoss(slot) {
  const info = seatInfo(slot)
  const head = info.kind === 'desk' ? [info.seat, [info.seat[0], info.aisle]] : [info.seat]
  const st = L.boss.stand
  return [...head, ...toHallTop(info), [L.bossDoorX, L.aisles[0]], [L.bossDoorX, st[1]], st]
}

function pathOut() {
  const st = L.boss.stand
  return [st, [L.bossDoorX, st[1]], [L.bossDoorX, L.aisles[0]], [L.corridorX, L.aisles[0]], [L.corridorX, L.bottomAisle], L.door]
}

function pathLength(path) {
  let n = 0
  for (let i = 1; i < path.length; i++)
    n += Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1])
  return n
}

function along(path, dist) {
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1]
    const [bx, by] = path[i]
    const seg = Math.abs(bx - ax) + Math.abs(by - ay)
    if (dist <= seg) {
      const t = seg === 0 ? 1 : dist / seg
      return { x: Math.round(ax + (bx - ax) * t), y: Math.round(ay + (by - ay) * t), look: Math.sign(bx - ax) }
    }
    dist -= seg
  }
  const [x, y] = path[path.length - 1]
  return { x, y, look: 0 }
}

// dance floor to desk: through the hall door to the corridor, then to the desk
function pathFromParty(spot, slot) {
  const info = seatInfo(slot)
  const head = [spot, [L.loungeDoorX, spot[1]]]
  if (info.kind === 'lounge') return [...head, [L.loungeDoorX, info.aisle], info.seat]
  const via = info.row === 0 ? [] : [[L.corridorX, L.aisles[0]], [L.corridorX, info.aisle]]
  return [...head, [L.loungeDoorX, L.aisles[0]], ...via, [info.seat[0], info.aisle], info.seat]
}

// boss to dance floor
function pathToParty(spot) {
  const st = L.boss.stand
  return [st, [L.bossDoorX, st[1]], [L.bossDoorX, L.aisles[0]], [L.loungeDoorX, L.aisles[0]], [L.loungeDoorX, spot[1]], spot]
}

// dance floor to the outer door
function pathPartyOut(spot) {
  return [spot, [L.loungeDoorX, spot[1]], [L.loungeDoorX, L.aisles[0]], [L.corridorX, L.aisles[0]], [L.corridorX, L.bottomAisle], L.door]
}

function poseOf(w, now, slot) {
  const from = entries.get(w.id)
  const pin = from ? pathFromParty(from, slot) : pathIn(slot)
  const inMs = pathLength(pin) / SPEED
  const t = now - w.spawnAt
  const ready = w.spawnAt + inMs + SETTLE_MS
  if (w.doneAt == null || now < Math.max(w.doneAt, ready)) {
    if (t < inMs) return { phase: 'in', ...along(pin, Math.max(0, t) * SPEED) }
    const [x, y] = seatInfo(slot).seat
    return { phase: 'work', x, y, look: 0 }
  }
  const d = now - Math.max(w.doneAt, ready)
  const pb = pathToBoss(slot)
  const bossMs = pathLength(pb) / SPEED
  if (d < bossMs) return { phase: 'carry', ...along(pb, d * SPEED) }
  if (d < bossMs + HANDOFF_MS) return { phase: 'hand', x: L.boss.stand[0], y: L.boss.stand[1], look: 0 }
  const e = d - bossMs - HANDOFF_MS
  const handEnd = now - e
  const po = pathOut()
  if (e < pathLength(po) / SPEED) return { phase: 'out', ...along(po, e * SPEED), handEnd }
  return { phase: 'gone', x: 0, y: 0, look: 0, handEnd }
}

// ---------- party ----------
// bots that delivered live here independently of the data (the plugin deletes the job after 90 s)
const party = new Map() // id → { spot, startAt, seed }
const fates = new Map() // worker id → 'party' | 'out'
const entries = new Map() // worker id → the spot it was called from on the dance floor
const seen = new Set()

function partyPose(g, now) {
  const spot = L.party.spots[g.spot]
  const pin = pathToParty(spot)
  const inMs = pathLength(pin) / SPEED
  const t = now - g.startAt
  if (t < inMs) return { phase: 'walk', ...along(pin, Math.max(0, t) * SPEED) }
  const leaveAt = g.startAt + inMs + PARTY_MS
  if (now < leaveAt) return { phase: 'dance', x: spot[0], y: spot[1], look: 0 }
  const po = pathPartyOut(spot)
  const e = now - leaveAt
  if (e < pathLength(po) / SPEED) return { phase: 'walk', ...along(po, e * SPEED) }
  return { phase: 'gone', x: 0, y: 0, look: 0 }
}

function joinParty(id, startAt, now) {
  if (party.has(id)) return true
  if (party.size >= L.party.spots.length || now - startAt > PARTY_MS) return false
  const used = new Set([...party.values()].map(g => g.spot))
  let spot = 0
  while (used.has(spot)) spot++
  party.set(id, { spot, startAt, seed: strHash(id) })
  return true
}

// takes the longest dancer off the dance floor, returns their spot
function recallDancer(now) {
  let best = null
  for (const [id, g] of party) {
    if (partyPose(g, now).phase !== 'dance') continue
    if (!best || g.startAt < best[1].startAt) best = [id, g]
  }
  if (!best) return null
  party.delete(best[0])
  return [...L.party.spots[best[1].spot]]
}

function updateParty(workers, now) {
  const live = new Set(workers.map(w => w.id))
  for (const m of [fates, entries]) for (const id of [...m.keys()]) if (!live.has(id)) m.delete(id)
  for (const id of [...seen]) if (!live.has(id)) seen.delete(id)
  for (const w of workers) {
    if (w.doneAt == null || fates.has(w.id)) continue
    const p = poseOf(w, now, slots.get(w.id))
    if (p.phase === 'out' || p.phase === 'gone') fates.set(w.id, joinParty(w.id, /** @type {any} */ (p).handEnd, now) ? 'party' : 'out')
  }
  for (const w of workers) {
    if (seen.has(w.id)) continue
    seen.add(w.id)
    if (w.doneAt != null || now - w.spawnAt > RECALL_MS) continue
    const spot = recallDancer(now)
    if (spot) entries.set(w.id, spot)
  }
}

const slots = new Map()

function assignSlots(workers, now) {
  const live = new Set(workers.map(w => w.id))
  for (const id of slots.keys()) if (!live.has(id)) slots.delete(id)
  for (const w of workers) {
    if (slots.has(w.id)) continue
    const taken = new Set()
    for (const v of workers) {
      const s = slots.get(v.id)
      if (s === undefined) continue
      const phase = poseOf(v, now, s).phase
      if (phase === 'in' || phase === 'work') taken.add(s)
    }
    let s = 0
    while (taken.has(s)) s++
    slots.set(w.id, s)
  }
}

// ---------- picking ----------
// bots drawn in the last frame (in drawing order) and their labels: { id, x, y, w, h } in logical pixels
export const BOSS_ID = '@boss'
// whiteboard: clicking it shows the day's deliveries (contract v2.9)
export const TODAY_ID = '@today'
const HIT_SLACK = 3
let hits = []
let canvasW = DESIGN_W * 4
let canvasH = DESIGN_H * 4

// same box as bot()/dancer(): body + arms + legs + contour; up = headroom for a hat/jump
function hitBot(id, cx, by, up = 0) {
  hits.push({ id, x: cx - 9, y: by - 13 - up, w: 18, h: 15 + up })
}

// accent-coloured corner marks and a bobbing arrow above the selected bot (at a desk, walking, at the boss, dancing)
function selectionMarker(id, now) {
  const own = hits.filter(b => b.id === id)
  const body = own.find(b => !b.isTag)
  if (!body) return
  const { x, y, w, h } = body
  const c = C.accent
  const arms = []
  for (const [cx, cy, dx, dy] of [[x - 1, y - 1, 1, 1], [x + w, y - 1, -1, 1], [x - 1, y + h, 1, -1], [x + w, y + h, -1, -1]])
    arms.push([Math.min(cx, cx + dx * 3), cy, 4, 1], [cx, Math.min(cy, cy + dy * 3), 1, 4])
  for (const [rx, ry, rw, rh] of arms) rect(rx - 1, ry - 1, rw + 2, rh + 2, C.ol)
  for (const [rx, ry, rw, rh] of arms) rect(rx, ry, rw, rh, c)
  const top = body.markTop ?? Math.min(...own.map(b => b.y))
  const bob = Math.floor(now / 220) % 2
  const ax = x + Math.floor(w / 2)
  const ay = top - 3 - bob
  // downward arrow: shaft + triangle, first a contour one pixel wider
  const parts = [[ax - 1, ay - 7, 3, 4], ...[0, 1, 2, 3].map(i => [ax - 3 + i, ay - 3 + i, 7 - i * 2, 1])]
  for (const [rx, ry, rw, rh] of parts) rect(rx - 1, ry - 1, rw + 2, rh + 2, C.ol)
  for (const [rx, ry, rw, rh] of parts) rect(rx, ry, rw, rh, c)
}

// ---------- character ----------
function bot(cx, by, { pose = 'stand', frame = 0, isBoss = false, look = 0, isBlink = false, hasMug = false, hat = null } = {}) {
  const bob = pose === 'walk' && frame === 1 ? 1 : 0
  const x0 = cx - 8
  const top = by - 12 - bob
  const armY = pose === 'type' ? [top + 5 + frame, top + 6 - frame] : [top + 5, top + 5]
  const legs = [4, 6, 9, 11].map((lx, i) => [x0 + lx, top + 9, 1, pose === 'walk' && i % 2 === frame ? 2 : 3 + bob])
  const parts = [[x0 + 3, top, 10, 9], [x0, armY[0], 3, 2], [x0 + 13, armY[1], 3, 2], ...legs]
  for (const [x, y, w, h] of parts) rect(x - 1, y - 1, w + 2, h + 2, C.ol)
  for (const [x, y, w, h] of parts) rect(x, y, w, h, C.body)
  rect(x0 + 4, top, 8, 1, C.bodyHi)
  rect(x0 + 3, top + 8, 10, 1, C.shade)
  const ex = look > 0 ? 1 : look < 0 ? -1 : 0
  const eyeH = isBlink ? 1 : 2
  rect(x0 + 5 + ex, top + 4 - eyeH, 1, eyeH, C.eye)
  rect(x0 + 10 + ex, top + 4 - eyeH, 1, eyeH, C.eye)
  if (isBoss) {
    // boss: necktie
    rect(x0 + 7, top + 8, 2, 1, C.tie)
  }
  if (hasMug) {
    box(x0 + 14, armY[1] - 2, 3, 3, C.mug)
    px(x0 + 15, armY[1] - 2, C.coffee)
  }
  if (hat !== null) partyHat(x0, top, hat)
}

// pointed party hat: striped cone with a pompom on top
function partyHat(x0, top, c) {
  const rows = [[x0 + 5, top - 1, 6], [x0 + 6, top - 2, 4], [x0 + 6, top - 3, 4], [x0 + 7, top - 4, 2], [x0 + 7, top - 5, 2]]
  for (const [x, y, w] of rows) rect(x - 1, y - 1, w + 2, 3, C.ol)
  rows.forEach(([x, y, w], i) => rect(x, y, w, 1, i % 2 ? C.yellow : c))
  rect(x0 + 6, top - 8, 4, 3, C.ol)
  rect(x0 + 7, top - 7, 2, 2, C.white)
}

// party horn: n = unrolled length (0 rolled up), dir = direction
function partyHorn(x0, top, dir, n, c) {
  const y = top + 5
  const x = dir > 0 ? x0 + 13 : x0 + 2
  if (n === 0) {
    rect(dir > 0 ? x : x - 1, y - 1, 2, 2, c)
    return
  }
  for (let i = 0; i < n; i++) px(x + dir * i, y, Math.floor(i / 2) % 2 ? C.white : c)
  px(x + dir * n, y - 1, c)
}

// dancing bot: 0 both arms up + jump, 1 left arm, 2 right arm; isBack faces away
function dancer(cx, by, { frame = 0, look = 0, isBack = false, isBlink = false, hat = null, horn = null } = {}) {
  const jump = frame === 0 ? 2 : 0
  const x0 = cx - 8
  const top = by - 12 - jump
  const up = x => [x, top - 3, 2, 5]
  const left = frame === 2 ? [x0, top + 5, 3, 2] : up(x0 + 1)
  const right = frame === 1 ? [x0 + 13, top + 5, 3, 2] : up(x0 + 13)
  const legs = [4, 6, 9, 11].map(lx => [x0 + lx, top + 9, 1, 3])
  const parts = [[x0 + 3, top, 10, 9], left, right, ...legs]
  if (jump) shade(x0 + 4, by, 9, 1, 0.6)
  for (const [x, y, w, h] of parts) rect(x - 1, y - 1, w + 2, h + 2, C.ol)
  for (const [x, y, w, h] of parts) rect(x, y, w, h, C.body)
  rect(x0 + 4, top, 8, 1, C.bodyHi)
  rect(x0 + 3, top + 8, 10, 1, C.shade)
  if (isBack) {
    rect(x0 + 4, top + 2, 8, 1, C.shade)
    if (hat !== null) partyHat(x0, top, hat)
    return
  }
  const ex = look > 0 ? 1 : look < 0 ? -1 : 0
  const eyeH = isBlink ? 1 : 2
  rect(x0 + 5 + ex, top + 4 - eyeH, 1, eyeH, C.eye)
  rect(x0 + 10 + ex, top + 4 - eyeH, 1, eyeH, C.eye)
  if (hat !== null) partyHat(x0, top, hat)
  if (horn) partyHorn(x0, top, horn.dir, horn.n, horn.c)
}

function paper(x, y, isOk) {
  box(x, y, 6, 7, C.paper)
  const ink = isOk ? C.ink : C.bad
  rect(x + 1, y + 1, 4, 1, ink)
  rect(x + 1, y + 3, 4, 1, ink)
  rect(x + 1, y + 5, 2, 1, ink)
}

// ---------- floors and walls ----------
function checker(x0, y0, x1, y1, size, a, b) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) px(x, y, (Math.floor(x / size) + Math.floor(y / size)) % 2 ? a : b)
}

function wood(x0, y0, x1, y1) {
  for (let y = y0; y < y1; y++) {
    const row = Math.floor((y - y0) / 5)
    for (let x = x0; x < x1; x++) {
      const isSeam = (y - y0) % 5 === 4 || (x + (row % 3) * 13) % 26 === 0
      px(x, y, isSeam ? C.woodSeam : row % 2 ? C.woodA : C.woodB)
    }
  }
}

function brickFace(x0, y0, x1, y1) {
  rect(x0, y0, x1 - x0, y1 - y0, C.mortar)
  for (let y = y0; y < y1; y += 4) {
    const off = ((y - y0) / 4) % 2 ? 4 : 0
    for (let x = x0 - 8 + off; x < x1; x += 8) {
      const bx = Math.max(x0, x)
      const bw = Math.min(x1, x + 7) - bx
      if (bw > 0) rect(bx, y, bw, Math.min(3, y1 - y), (hash(x * 7 + y) % 5 === 0) ? C.brickDark : C.brick)
    }
  }
}

function stripedFace(x0, y0, x1, y1, base, stripe) {
  rect(x0, y0, x1 - x0, y1 - y0, base)
  for (let x = x0 + 2; x < x1; x += 6) rect(x, y0, 2, y1 - y0, stripe)
}

function wainscot(x0, y1, h = 7) {
  return (x1) => {
    rect(x0, y1 - h, x1 - x0, h, C.wainscot)
    rect(x0, y1 - h, x1 - x0, 1, C.wainscotDark)
    for (let x = x0 + 5; x < x1; x += 10) rect(x, y1 - h + 2, 1, h - 3, C.wainscotDark)
  }
}

function wallFace(x0, y0, x1, y1, kind) {
  if (kind === 'brick') brickFace(x0, y0, x1, y1)
  if (kind === 'cream') stripedFace(x0, y0, x1, y1, C.cream, C.creamStripe)
  if (kind === 'sage') stripedFace(x0, y0, x1, y1, C.sage, C.sageStripe)
  if (kind === 'panel') {
    rect(x0, y0, x1 - x0, y1 - y0, C.panel)
    for (let x = x0 + 12; x < x1; x += 14) rect(x, y0, 1, y1 - y0, C.panelDark)
  }
  if (kind !== 'panel') wainscot(x0, y1)(x1)
  rect(x0, y1 - 1, x1 - x0, 1, C.ol)
  shade(x0, y1, x1 - x0, 2, 0.8)
}

// ---------- furniture ----------
function bookshelf(x, y, w, h) {
  box(x, y, w, h, C.shelf)
  rect(x, y, w, 2, C.shelfDark)
  const shelves = Math.max(2, Math.floor((h - 3) / 9))
  for (let s = 0; s < shelves; s++) {
    const sy = y + 3 + s * 9
    rect(x + 1, sy + 7, w - 2, 1, C.shelfDark)
    for (let bx = x + 2; bx < x + w - 2; bx += 3) {
      const hh = hash(bx * 13 + sy)
      if (hh % 7 === 0) continue
      rect(bx, sy + (hh % 3), 2, 7 - (hh % 3), C.book[hh % C.book.length])
    }
  }
  shade(x, y + h + 1, w, 2, 0.75)
}

function plant(x, y, big = false) {
  const w = big ? 10 : 8
  box(x + 1, y + 8, w - 2, 6, C.pot)
  rect(x + 1, y + 12, w - 2, 2, C.potDark)
  const leaves = big
    ? [[x + 3, y - 4, 4, 5], [x - 1, y, 5, 4], [x + 6, y - 1, 5, 4], [x + 1, y + 3, 4, 4], [x + 5, y + 3, 4, 4]]
    : [[x + 2, y - 2, 4, 5], [x - 1, y + 1, 4, 4], [x + 5, y + 1, 4, 4], [x + 2, y + 4, 4, 3]]
  for (const [lx, ly, lw, lh] of leaves) rect(lx - 1, ly - 1, lw + 2, lh + 2, C.ol)
  leaves.forEach(([lx, ly, lw, lh], i) => {
    rect(lx, ly, lw, lh, i % 2 ? C.leafDark : C.leaf)
    px(lx + 1, ly, C.leafHi)
  })
  shade(x, y + 15, w, 2, 0.75)
}

function lamp(x, y, isNight) {
  if (isNight) {
    for (let r = 10; r > 0; r -= 3) shade(x - r + 3, y + 26 - Math.floor(r / 3), r * 2, Math.max(1, Math.floor(r / 2)), 1.06)
  }
  rect(x + 3, y + 8, 2, 18, C.lampPole)
  box(x + 1, y + 26, 6, 2, C.lampPole)
  box(x, y, 8, 8, isNight ? C.glow : C.lampShade)
  rect(x, y + 6, 8, 2, isNight ? C.lampShade : C.lampShadeDark)
}

function rug(x, y, w, h, outer, inner, accent) {
  box(x, y, w, h, outer)
  rect(x + 3, y + 3, w - 6, h - 6, inner)
  for (let i = x + 5; i < x + w - 5; i += 4) {
    px(i, y + 1, accent)
    px(i, y + h - 2, accent)
  }
  rect(x + 5, y + 5, w - 10, 1, accent)
  rect(x + 5, y + h - 6, w - 10, 1, accent)
}

function windowPane(x, y, w, h, now) {
  const date = new Date(now)
  const hour = date.getHours() + date.getMinutes() / 60
  const isNight = hour < 6.5 || hour >= 20
  const isDusk = !isNight && hour >= 17.5
  box(x, y, w, h, C.windowFrame)
  const sky = isNight ? C.night : isDusk ? C.dusk : C.sky
  const low = isNight ? C.nightLow : isDusk ? C.duskLow : C.skyLow
  rect(x + 1, y + 1, w - 2, h - 2, sky)
  rect(x + 1, y + Math.floor(h / 2), w - 2, Math.ceil(h / 2) - 1, low)
  if (isNight) {
    for (let s = 0; s < 4; s++) {
      const hh = hash(x * 31 + s)
      px(x + 2 + (hh % (w - 4)), y + 2 + ((hh >> 5) % (h - 4)), C.star)
    }
  } else {
    const cx = x + 1 + (Math.floor(now / 1100 + x) % (w + 8)) - 6
    for (const [dx, dy, cw] of [[1, 0, 3], [0, 1, 6]])
      for (let k = 0; k < cw; k++) if (cx + dx + k > x && cx + dx + k < x + w - 1) px(cx + dx + k, y + 3 + dy, C.cloud)
  }
  rect(x + Math.floor(w / 2), y + 1, 1, h - 2, C.windowFrame)
  rect(x + 1, y + Math.floor(h / 2) - 1, w - 2, 1, C.windowFrame)
  return isNight
}

function picture(x, y) {
  box(x, y, 16, 12, C.gold)
  rect(x + 1, y + 1, 14, 10, C.rugBlueIn)
  rect(x + 4, y + 3, 8, 6, C.body)
  rect(x + 6, y + 5, 1, 2, C.eye)
  rect(x + 9, y + 5, 1, 2, C.eye)
  rect(x + 2, y + 6, 2, 1, C.body)
  rect(x + 12, y + 6, 2, 1, C.body)
}

function clock(x, y, now) {
  const d = new Date(now)
  box(x, y, 11, 11, C.white)
  const cx = x + 5
  const cy = y + 5
  const ma = (d.getMinutes() / 60) * Math.PI * 2
  const ha = ((d.getHours() % 12) / 12 + d.getMinutes() / 720) * Math.PI * 2
  line(cx, cy, cx + Math.round(Math.sin(ma) * 4), cy - Math.round(Math.cos(ma) * 4), C.ol)
  line(cx, cy, cx + Math.round(Math.sin(ha) * 2.5), cy - Math.round(Math.cos(ha) * 2.5), C.accent)
}

function counter(x, y, w, now, isBusy) {
  box(x, y, w, 7, C.deskEdge)
  box(x, y + 7, w, 10, C.wainscot)
  for (let i = x + 8; i < x + w; i += 9) rect(i, y + 9, 1, 7, C.wainscotDark)
  // coffee machine
  box(x + 3, y - 12, 12, 13, C.machine)
  rect(x + 4, y - 11, 10, 2, C.machineHi)
  px(x + 12, y - 8, isBusy && Math.floor(now / 300) % 2 ? C.green : C.red)
  box(x + 6, y - 3, 5, 3, C.mug)
  // mugs
  box(x + w - 10, y + 1, 3, 3, C.mug)
  box(x + w - 6, y + 1, 3, 3, C.rugRed)
}

function rack(x, y, now, isBusy, seed) {
  box(x, y, 16, 34, C.rack)
  for (let r = 0; r < 7; r++) {
    rect(x + 1, y + 2 + r * 4, 14, 3, C.rackHi)
    for (let l = 0; l < 3; l++) {
      const h = hash(seed * 97 + r * 7 + l + Math.floor(now / (isBusy ? 180 : 900)))
      px(x + 9 + l * 2, y + 3 + r * 4, h % 3 === 0 ? C.rack : [C.green, C.blue, C.green, C.yellow][h % 4])
    }
  }
  shade(x, y + 35, 16, 2, 0.7)
}

// ---------- background shells: rack slots in the server room ----------
// SLOTS_PER_RACK slots per rack; slots fill across the racks first (top row), then downward
const SLOTS_PER_RACK = 3
const SHELL_PREFIX = 'shell:'
const SKIP_WORDS = new Set(['sudo', 'env', 'nohup', 'time', 'exec', 'command', 'nice'])

// short name of the command: first real word of the last '&&'/';' part (VAR=x, sudo… skipped), no path, 3 letters
export function shellLabel(command) {
  const parts = String(command ?? '').split(/&&|\|\||;|\|/).map(p => p.trim()).filter(Boolean)
  const seg = parts.find(p => !/^cd\s/.test(p) && p !== 'cd') ?? parts[0] ?? ''
  const word = seg.split(/\s+/).find(t => t && !/^\w+=/.test(t) && !SKIP_WORDS.has(t) && !/^[('"]+$/.test(t)) ?? ''
  const base = word.replace(/^[('"]+|['")]+$/g, '').split('/').filter(Boolean).pop() ?? ''
  const ascii = base.toUpperCase().replace(/[^A-Z0-9.\-_+]/g, '')
  return ascii.slice(0, 3) || '?'
}

const shellDone = sh => sh.endAt != null || (sh.status != null && sh.status !== 'running')
const shellOk = sh => (sh.status === 'completed' || sh.status == null || sh.status === 'running') && (sh.exitCode == null || sh.exitCode === 0)

// running ones first (in start order), then finished ones
function orderShells(shells) {
  const valid = shells.filter(sh => sh && typeof sh === 'object' && sh.id != null)
  const by = (a, b) => (a.startAt ?? 0) - (b.startAt ?? 0)
  return [...valid.filter(sh => !shellDone(sh)).sort(by), ...valid.filter(shellDone).sort(by)]
}

// rack slots: lamps (running: accent colour, blinking at a per-shell rate; finished: steady green/red)
// and the command's first letters. Overflow becomes "+n" in the last slot (clicking it picks the first hidden shell).
function shellSlots(shells, now, projOf) {
  if (!shells.length) return
  const { serverX0, B } = L
  const racks = Math.floor((LW - B - serverX0 - 24) / 20)
  const total = racks * SLOTS_PER_RACK
  if (total <= 0) return
  const list = orderShells(shells)
  const shown = list.length > total ? list.slice(0, total - 1) : list
  const place = i => {
    const r = i % racks
    const k = Math.floor(i / racks)
    return { x: serverX0 + 10 + r * 20 + 1, y: 10 + 2 + k * 10, top: 10 }
  }
  shown.forEach((sh, i) => {
    const { x, y, top } = place(i)
    const seed = strHash(String(sh.id))
    const done = shellDone(sh)
    const ok = shellOk(sh)
    rect(x, y, 14, 9, C.dark)
    const pr = projOf(sh.project)
    if (pr) rect(x, y, 1, 9, pr.color)
    const period = 170 + (seed % 140)
    const tick = Math.floor((now + (seed % 997)) / period)
    for (let j = 0; j < 3; j++) {
      let c
      if (done) c = ok ? C.green : C.red
      else c = hash(seed + j * 131 + tick * 7) % 3 === 0 ? mix(C.dark, C.accent, 0.3) : C.accent
      rect(x + 2 + j * 4, y + 1, 2, 1, c)
    }
    text(shellLabel(sh.command), x + 2, y + 3, done ? (ok ? C.dim : C.red) : C.white)
    hits.push({ id: SHELL_PREFIX + sh.id, x, y, w: 14, h: 9, markTop: top })
  })
  if (shown.length < list.length) {
    const { x, y, top } = place(total - 1)
    const extra = list.length - shown.length
    rect(x, y, 14, 9, C.dark)
    for (let j = 0; j < 3; j++) rect(x + 2 + j * 4, y + 1, 2, 1, mix(C.dark, C.yellow, 0.5))
    const label = `+${Math.min(99, extra)}`
    text(label, x + Math.round((14 - textWidth(label)) / 2), y + 3, C.yellow)
    hits.push({ id: SHELL_PREFIX + list[shown.length].id, x, y, w: 14, h: 9, markTop: top })
  }
}

function cabinet(x, y) {
  box(x, y, 14, 22, C.cabinet)
  for (let i = 0; i < 3; i++) {
    rect(x + 1, y + 2 + i * 7, 12, 6, C.cabinetDark)
    rect(x + 5, y + 4 + i * 7, 4, 1, C.white)
  }
  shade(x, y + 23, 14, 2, 0.7)
}

function sign(x, y, label) {
  const w = textWidth(label) + 10
  box(x, y, w, 12, C.signGreen)
  rect(x + 1, y + 1, w - 2, 1, C.signGreenDark)
  rect(x + 1, y + 10, w - 2, 1, C.signGreenDark)
  text(label, x + 5, y + 4, C.gold)
}

function whiteboard(x, y, w, data) {
  box(x, y, w, 15, C.boardFrame)
  rect(x + 1, y + 1, w - 2, 13, C.board)
  text(T.today, x + 3, y + 3, C.marker)
  text(T.delivered(data.delivered), x + 3, y + 9 - 1 + 1, C.accent)
  for (let i = 0; i < 6; i++) {
    const h = 2 + (hash(i + 99) % 7)
    rect(x + w - 16 + i * 2, y + 13 - h, 1, h, C.marker)
  }
}

// ---------- projects ----------
// the boss oversees every project: each project has a hue derived from its name (same hue as the auto theme)
const hueOf = name => strHash(String(name ?? '').toLowerCase()) % 360
const projColor = name => hsl(hueOf(name), 0.6, 0.62) // plate, edge, dot on a dark ground
const projInk = name => hsl(hueOf(name), 0.7, 0.36) // text on the whiteboard

const words = name => String(name ?? '').replace(/[-_.\s]+/g, ' ').trim().split(' ').filter(Boolean)
const head = (s, n) => [...normalize(s)].slice(0, n).join('')

// short names (at most 6 letters, fit on the plate); if first words clash, built from the first + last word
function shortNames(names) {
  const out = new Map()
  const first = n => head(words(n)[0] ?? n, 6) || '?'
  const counts = new Map()
  for (const n of names) counts.set(first(n), (counts.get(first(n)) ?? 0) + 1)
  const used = new Set()
  for (const n of names) {
    let s = first(n)
    if (counts.get(s) > 1) {
      const w = words(n)
      s = w.length > 1 ? head(w[0], 3) + head(w[w.length - 1], 3) : head(n, 6)
    }
    for (let k = 2; used.has(s); k++) s = head(s, 5) + (k % 10)
    used.add(s)
    out.set(n, s)
  }
  return out
}

// projects seen in the data: data.projects first (in order), then those known only from workers
function projectsOf(data) {
  const out = []
  const known = new Set()
  const add = p => {
    const key = slugOf(p.name)
    if (known.has(key)) return
    known.add(key)
    out.push(p)
  }
  if (Array.isArray(data.projects))
    for (const p of data.projects)
      if (p && p.name != null && p.name !== '')
        add({
          name: String(p.name), delivered: Number(p.delivered) || 0, working: Number(p.working) || 0, isBossBusy: Boolean(p.isBossBusy), waiting: p.waiting ?? null,
          // the boss works in this project's folder from another project's session (app contract v3.5)
          isBossHere: Boolean(p.isBossBusy || p.remote?.isBossBusy),
        })
  for (const w of data.workers) if (w?.project) add({ name: String(w.project), delivered: 0, working: 0, isBossBusy: false })
  return out
}

// multi-project board: today's total on the left, then one column per project (name + delivered today);
// a blinking dot beside the count when the boss works on that project. What does not fit is "+n". Returns the width.
function projectBoard(x, y, maxW, projs, short, data, now) {
  const headW = Math.max(textWidth(T.today), textWidth(String(data.delivered))) + 6
  const colW = 28
  let n = Math.min(projs.length, Math.floor((maxW - headW - 2) / colW))
  let more = projs.length - n
  if (more > 0) {
    n = Math.max(0, Math.floor((maxW - headW - 2 - textWidth(`+${projs.length}`) - 4) / colW))
    more = projs.length - n
  }
  const moreW = more > 0 ? textWidth(`+${more}`) + 4 : 0
  const w = headW + n * colW + moreW + 2
  box(x, y, w, 15, C.boardFrame)
  rect(x + 1, y + 1, w - 2, 13, C.board)
  text(T.today, x + 3, y + 3, C.marker)
  text(String(data.delivered), x + 3, y + 9, C.accent)
  const blink = Math.floor(now / 500) % 2
  for (let i = 0; i < n; i++) {
    const p = projs[i]
    const cx = x + headW + i * colW + 2
    rect(cx - 2, y + 2, 1, 11, C.boardFrame)
    text(short.get(p.name), cx, y + 3, projInk(p.name))
    const count = String(p.delivered)
    text(count, cx, y + 9, C.dark)
    if (p.isBossHere ?? p.isBossBusy) rect(cx + textWidth(count) + 2, y + 10, 2, 2, blink ? projColor(p.name) : projInk(p.name))
  }
  if (more > 0) {
    const cx = x + headW + n * colW + 2
    rect(cx - 2, y + 2, 1, 11, C.boardFrame)
    text(`+${more}`, cx, y + 6, C.ink)
  }
  return w
}

// desks of the focused project: floor lightly tinted with the project colour, a thin frame
function deskGlow(d, c) {
  const x0 = d.cx - 18
  const y0 = d.by - 25
  const w = 36
  const h = 37
  for (let j = y0; j < y0 + h; j++)
    for (let i = x0; i < x0 + w; i++) {
      if (i < 0 || j < 0 || i >= LW || j >= LH) continue
      const edge = i === x0 || i === x0 + w - 1 || j === y0 || j === y0 + h - 1
      fb[j * LW + i] = mix(fb[j * LW + i], c, edge ? 0.55 : 0.18)
    }
}

function cooler(x, y) {
  box(x, y, 9, 8, C.water)
  rect(x + 2, y + 1, 2, 5, C.glass)
  box(x - 1, y + 8, 11, 13, C.cooler)
  rect(x + 3, y + 12, 3, 2, C.red)
  shade(x - 1, y + 22, 11, 2, 0.75)
}

function catBasket(x, y, now) {
  box(x, y + 4, 22, 9, C.basket)
  rect(x, y + 10, 22, 3, C.basketDark)
  rect(x + 2, y + 3, 18, 5, C.pillow)
  const breath = Math.floor(now / 900) % 2
  box(x + 5, y + 1 - breath, 12, 7 + breath, C.cat)
  rect(x + 6, y + 5, 10, 2, C.catDark)
  box(x + 14, y - 1 - breath, 5, 5, C.cat)
  px(x + 14, y - 3 - breath, C.cat)
  px(x + 18, y - 3 - breath, C.cat)
  rect(x + 15, y + 1 - breath, 3, 1, C.catDark)
  if (Math.floor(now / 1800) % 2) text('Z', x + 20, y - 8 - breath, C.white)
}

function mat(x, y) {
  box(x, y, 12, 18, C.mat)
  for (let i = 0; i < 4; i++) rect(x + 2, y + 2 + i * 4, 8, 2, C.matDark)
}

function chair(cx, by, isBoss) {
  const w = isBoss ? 18 : 14
  box(cx - w / 2, by - 17 - SIT, w, 12, isBoss ? C.bossChair : C.chair)
  rect(cx - w / 2 + 1, by - 16 - SIT, w - 2, 1, isBoss ? C.bossChairHi : C.chairHi)
}

function laptop(x, y, isBusy, now) {
  box(x, y, 11, 8, C.lid)
  rect(x, y + 6, 11, 2, C.lidDark)
  const on = isBusy && Math.floor(now / 350) % 2
  rect(x + 4, y + 2, 3, 3, isBusy ? (on ? C.logoOn : C.logo) : C.lidDark)
}

// given proj: { short, color }, the plate shows the project's short name instead of the desk number
function desk(d, n, isBusy, now, proj = null) {
  const { cx, by } = d
  box(cx - 14, by - 5, 28, 5, C.deskTop)
  rect(cx - 14, by - 5, 28, 1, C.deskEdge)
  box(cx - 14, by, 28, 7, C.deskFront)
  rect(cx - 13, by + 8, 2, 2, C.deskLeg)
  rect(cx + 11, by + 8, 2, 2, C.deskLeg)
  const label = proj ? proj.short : String(n)
  const pw = textWidth(label) + 4
  box(cx - Math.floor(pw / 2), by, pw, 7, proj ? proj.color : C.plate)
  text(label, cx - Math.floor(pw / 2) + 2, by + 1, proj ? C.dark : C.deskLeg)
  laptop(cx + 1, by - 12, isBusy, now)
  box(cx - 12, by - 8, 3, 3, C.mug)
  shade(cx - 14, by + 8, 28, 2, 0.75)
}

function bossDesk(now, isBusy, stack, lastOk) {
  const { cx, by } = L.boss
  box(cx - 26, by - 6, 52, 6, C.deskTop)
  rect(cx - 26, by - 6, 52, 1, C.deskEdge)
  box(cx - 26, by, 52, 9, C.deskFront)
  for (let i = cx - 22; i < cx + 24; i += 12) rect(i, by + 2, 1, 6, C.wainscotDark)
  box(cx - 10, by + 2, 20, 5, C.gold)
  text(T.boss, cx - Math.floor(textWidth(T.boss) / 2), by + 2, C.deskLeg)
  // big monitor
  box(cx + 6, by - 19, 16, 11, C.lid)
  rect(cx + 7, by - 18, 14, 8, isBusy ? 0x1b2a38 : C.lidDark)
  if (isBusy) {
    for (let r = 0; r < 3; r++) {
      const h = hash(r + Math.floor(now / 300))
      rect(cx + 8, by - 17 + r * 3, 3 + (h % 10), 1, [C.green, C.blue, C.yellow, C.logoOn][h % 4])
    }
  }
  rect(cx + 13, by - 8, 2, 2, C.lidDark)
  // paper tray
  box(cx - 24, by - 9, 11, 3, C.cabinetDark)
  const n = Math.min(stack, 10)
  for (let i = 0; i < n; i++) rect(cx - 23, by - 10 - i, 9, 1, i === n - 1 && !lastOk ? C.bad : i % 2 ? C.paper : 0xe6e6de)
  shade(cx - 26, by + 10, 52, 2, 0.75)
}

function bubbleCheck(x, y, isOk) {
  box(x, y, 11, 8, C.white)
  px(x + 2, y + 9, C.ol)
  px(x + 2, y + 8, C.white)
  const c = isOk ? C.good : C.bad
  if (isOk) {
    line(x + 2, y + 4, x + 4, y + 6, c)
    line(x + 4, y + 6, x + 8, y + 2, c)
  } else {
    line(x + 3, y + 2, x + 7, y + 6, c)
    line(x + 7, y + 2, x + 3, y + 6, c)
  }
}

// edge: edge colour (with several projects, the worker's project colour)
function tag(lines, cx, bottom, edge = C.ol) {
  const w = Math.max(...lines.map(([s]) => textWidth(s))) + 5
  const h = lines.length * 7 + 2
  const x = Math.round(cx - w / 2)
  const y = bottom - h
  rect(x - 1, y - 1, w + 2, h + 2, edge)
  rect(x, y, w, h, C.dark)
  lines.forEach(([s, c], i) => text(s, x + Math.round((w - textWidth(s)) / 2), y + 2 + i * 7, c))
  return { x: x - 1, y: y - 1, w: w + 2, h: h + 2, isTag: true }
}

// ---------- party area ----------
function mix(a, b, t) {
  const m = s => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
  return (m(16) << 16) | (m(8) << 8) | m(0)
}

// tints an existing pixel toward a colour (light specks)
function tint(x, y, c, t, clip) {
  x |= 0
  y |= 0
  if (x < clip[0] || y < clip[1] || x >= clip[2] || y >= clip[3] || x < 0 || y < 0 || x >= LW || y >= LH) return
  fb[y * LW + x] = mix(fb[y * LW + x], c, t)
}

const neon = () => [C.neonPink, C.neonCyan, C.neonPurple, C.accent]

function partyBackground() {
  const P = L.party
  const { B, loungeX0, loungeX1 } = L
  // string-light wire
  rect(loungeX0, B, loungeX1 - loungeX0, 1, C.ol)
  // dance floor: grout and frame; tiles are painted every frame
  box(P.fx0, P.fy0, P.fw, P.fh, C.floorGrout)
  shade(P.fx0 - 1, P.fy0 + P.fh + 1, P.fw + 2, 2, 0.75)
  if (P.ball) {
    rect(P.ball.x, B + 1, 1, P.ball.y - 6 - B, C.ol)
    rect(P.ball.x - 1, P.ball.y - 7, 3, 1, C.lampPole)
  }
  if (P.dj) {
    const { x, y } = P.dj
    box(x + 10, y, 19, 10, C.machine)
    rect(x + 10, y, 19, 1, C.machineHi)
    rect(x + 10, y + 6, 19, 4, C.rack)
    for (let i = x + 12; i < x + 28; i += 4) rect(i, y + 7, 2, 2, C.rackHi)
    shade(x, y + 13, 38, 2, 0.7)
  }
}

function danceFloor(now, hot) {
  const P = L.party
  const pal = [...neon(), C.yellow]
  const step = Math.floor(now / (hot ? 230 : 420))
  const pattern = Math.floor(step / 12) % 3
  for (let j = 0; j < P.rows; j++)
    for (let i = 0; i < P.cols; i++) {
      const h = hash(i * 31 + j * 977 + step * 7919)
      let c
      if (pattern === 0) c = pal[(i + j + step) % pal.length]
      else if (pattern === 1) c = (i + j + step) % 2 ? pal[Math.floor(step / 2) % pal.length] : null
      else c = h % 3 === 0 ? null : pal[h % pal.length]
      if (c !== null && !hot && h % 4 === 0) c = null
      const x = P.fx0 + 1 + i * 8
      const y = P.fy0 + 1 + j * 6
      rect(x, y, 7, 5, c === null ? C.floorDark : c)
      rect(x, y, 7, 1, c === null ? C.floorDarkHi : mix(c, C.white, 0.45))
      if (c !== null) rect(x, y + 4, 7, 1, mix(c, C.dark, 0.25))
    }
}

function discoSpecks(now, hot) {
  const P = L.party
  const pal = neon()
  const n = hot ? 12 : 7
  const cx = P.fx0 + P.fw / 2
  const cy = P.fy0 + P.fh / 2 - 6
  const clip = [L.loungeX0, L.B + 3, L.loungeX1, L.dividerY]
  const a0 = now * (hot ? 0.0011 : 0.0006)
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * Math.PI * 2) / n + (i % 2) * 0.4
    const rr = 0.45 + ((hash(i + 7) % 100) / 100) * 0.55
    const x = Math.round(cx + Math.cos(a) * (P.fw / 2 + 14) * rr)
    const y = Math.round(cy + Math.sin(a) * (P.fh / 2 + 16) * rr)
    const c = pal[i % pal.length]
    for (const [dx, dy, t] of [[0, 0, 0.8], [1, 0, 0.8], [2, 0, 0.8], [0, 1, 0.8], [1, 1, 0.8], [2, 1, 0.8], [-1, 0, 0.35], [3, 1, 0.35], [1, -1, 0.35], [1, 2, 0.35]])
      tint(x + dx, y + dy, c, t, clip)
  }
}

function discoBall(now, hot) {
  const b = L.party.ball
  if (!b) return
  const r = 5
  const rot = Math.floor(now / (hot ? 120 : 240)) % 1000
  for (let dy = -r - 1; dy <= r + 1; dy++)
    for (let dx = -r - 1; dx <= r + 1; dx++) if (dx * dx + dy * dy <= (r + 1.4) ** 2) px(b.x + dx, b.y + dy, C.ol)
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > (r + 0.4) ** 2) continue
      const facet = ((dx + r + rot) >> 1) + ((dy + r) >> 1) * 5
      let c = (((dx + r + rot) >> 1) + ((dy + r) >> 1)) % 2 ? C.ballA : C.ballB
      if (dx + dy > 3) c = mix(c, C.ballDark, 0.5)
      if (hash(facet * 13 + rot) % 7 === 0) c = C.white
      px(b.x + dx, b.y + dy, c)
    }
  px(b.x - 2, b.y - 3, C.white)
}

function neonChain(now, hot) {
  const { B, loungeX0, loungeX1 } = L
  const pal = neon()
  const step = Math.floor(now / (hot ? 220 : 480))
  const clip = [loungeX0, B, loungeX1, L.dividerY]
  for (let i = 0, x = loungeX0 + 3; x < loungeX1 - 3; x += 6, i++) {
    const c = pal[i % pal.length]
    const on = (i + step) % (hot ? 3 : 4) !== 0
    rect(x, B, 2, 2, on ? c : mix(c, C.dark, 0.65))
    if (on) for (let k = -1; k < 3; k++) tint(x + k, B + 2, c, 0.35, clip)
  }
}

function speaker(x, y, pump) {
  const yy = y - pump
  box(x, yy, 8, 13 + pump, C.rack)
  rect(x + 3, yy + 2, 2, 2, C.machineHi)
  if (pump) {
    rect(x + 1, yy + 5, 6, 6, C.machineHi)
    rect(x + 2, yy + 6, 4, 4, C.dark)
  } else {
    rect(x + 2, yy + 6, 4, 4, C.machineHi)
    rect(x + 3, yy + 7, 2, 2, C.dark)
  }
}

function djBooth(now, hot) {
  const dj = L.party.dj
  if (!dj) return
  const beatMs = hot ? 230 : 320
  const beat = Math.floor(now / beatMs)
  speaker(dj.x, dj.y - 1, beat % 2 === 0 ? 1 : 0)
  speaker(dj.x + 30, dj.y - 1, beat % 2 === 0 ? 1 : 0)
  // turntables
  for (const [k, tx] of [[0, dj.x + 11], [1, dj.x + 22]]) {
    rect(tx, dj.y + 1, 6, 4, C.dark)
    const a = (Math.floor(now / 90) + k * 2) % 4
    px(tx + [1, 4, 4, 1][a], dj.y + [1, 1, 4, 4][a], C.white)
    px(tx + 2, dj.y + 2, C.red)
  }
  // mixer lights
  const pal = neon()
  for (let i = 0; i < 2; i++) {
    const h = 1 + (hash(beat * 3 + i) % 4)
    rect(dj.x + 18 + i * 2, dj.y + 5 - h, 1, h, pal[(beat + i) % pal.length])
  }
  // rising notes
  for (let k = 0; k < 2; k++) {
    const t = (Math.floor(now / 110) + k * 9) % 18
    if (t > 11) continue
    const x = dj.x + (k ? 20 : 10) + Math.round(Math.sin(t / 2) * 1.5)
    const y = dj.y - 6 - t
    const c = pal[(k + Math.floor(now / 2000)) % pal.length]
    rect(x + 2, y, 1, 4, c)
    px(x + 3, y + 1, c)
    rect(x, y + 3, 2, 2, c)
  }
}

// balloons tied with strings at the dance floor corners, swaying gently
function balloons(now) {
  const P = L.party
  const pal = [...neon(), C.yellow]
  const anchors = [[P.fx0 - 1, -3, 0], [P.fx0 + 4, 2, 1], [P.fx0 + P.fw, 3, 2], [P.fx0 + P.fw - 5, -2, 3]]
  for (const [ax, dx, k] of anchors) {
    const sway = Math.round(Math.sin(now / 700 + k * 1.7) * 1.2)
    const bx = ax + dx + sway
    const by = P.fy0 - 13 + (k % 2) * 3 + Math.round(Math.sin(now / 900 + k))
    for (let y = by + 6; y < P.fy0; y++) px(Math.round(bx + ((ax - bx) * (y - by - 6)) / (P.fy0 - by - 6)), y, C.dim)
    const c = pal[k % pal.length]
    rect(bx - 2, by - 1, 5, 8, C.ol)
    rect(bx - 3, by, 7, 6, C.ol)
    rect(bx - 1, by, 3, 6, c)
    rect(bx - 2, by + 1, 5, 4, c)
    px(bx - 1, by + 1, mix(c, C.white, 0.6))
    px(bx, by + 6, mix(c, C.dark, 0.3))
  }
}

// confetti falling on the hall; only while someone dances on the floor
function confetti(now, hot) {
  const { B, loungeX0, loungeX1 } = L
  const P = L.party
  const pal = [...neon(), C.yellow, C.green]
  const top = B + 3
  const span = P.fy0 + P.fh - top
  const n = hot ? 28 : 16
  for (let i = 0; i < n; i++) {
    const h = hash(i * 97 + 11)
    const speed = 10 + (h >>> 8) % 12
    const y = top + Math.floor((now * speed) / 1000 + ((h >>> 4) % span)) % span
    const x = loungeX0 + 3 + (h % (loungeX1 - loungeX0 - 6)) + Math.round(Math.sin(now / 320 + i) * 1.5)
    const c = pal[(h >>> 3) % pal.length]
    if ((Math.floor(now / 180) + i) % 2) rect(x, y, 2, 1, c)
    else rect(x, y, 1, 2, c)
  }
}

// ---------- background ----------
let background = null
let backgroundKey = ''
let layoutKey = ''

function drawBackground() {
  const { B, wallFaceBottom, dividerY, hallFaceTop, hallFloorY, bossX1, serverX0, loungeX0, loungeX1 } = L
  rect(0, 0, LW, LH, C.frame)
  // floors
  wood(B, wallFaceBottom, bossX1, dividerY)
  checker(loungeX0, wallFaceBottom, loungeX1, dividerY, 8, C.checkA, C.checkB)
  checker(serverX0 + 4, wallFaceBottom, LW - B, dividerY, 10, C.serverA, C.serverB)
  checker(B, hallFloorY, LW - B, LH - B, 12, C.carpetA, C.carpetB)
  // back wall faces
  wallFace(B, B, bossX1, wallFaceBottom, 'brick')
  wallFace(loungeX0, B, loungeX1, wallFaceBottom, 'cream')
  wallFace(serverX0 + 4, B, LW - B, wallFaceBottom, 'panel')
  wallFace(B, hallFaceTop, LW - B, hallFloorY, 'sage')
  // walls and doors between rooms
  rect(B, dividerY, LW - 2 * B, hallFaceTop - dividerY, C.wallTop)
  rect(B, dividerY, LW - 2 * B, 1, C.wallTopHi)
  rect(B, hallFaceTop - 1, LW - 2 * B, 1, C.ol)
  for (const dx of [L.bossDoorX, L.loungeDoorX, L.serverDoorX]) {
    wood(dx - 10, dividerY, dx + 10, hallFloorY)
    if (dx === L.loungeDoorX) checker(dx - 10, dividerY, dx + 10, hallFloorY, 8, C.checkA, C.checkB)
    if (dx === L.serverDoorX) checker(dx - 10, dividerY, dx + 10, hallFloorY, 10, C.serverA, C.serverB)
    rect(dx - 12, dividerY, 2, hallFloorY - dividerY, C.ol)
    rect(dx + 10, dividerY, 2, hallFloorY - dividerY, C.ol)
  }
  // vertical walls (top-down view)
  for (const wx of [bossX1, serverX0]) {
    rect(wx, B, 4, hallFaceTop - B, C.wallTop)
    rect(wx, B, 1, hallFaceTop - B, C.wallTopHi)
    rect(wx + 3, B, 1, hallFaceTop - B, C.ol)
  }
  // outer frame and entrance door
  rect(0, 0, LW, B, C.frame)
  rect(0, LH - B, LW, B, C.frame)
  rect(0, 0, B, LH, C.frame)
  rect(LW - B, 0, B, LH, C.frame)
  rect(0, L.bottomAisle - 17, B, 19, C.carpetB)
  mat(B + 1, L.bottomAisle - 17)

  // boss's office
  rug(B + 14, 38, 84, 48, C.rugRed, C.rugRedIn, C.rugGold)
  bookshelf(B + 4, 8, 22, 34)
  picture(B + 64, 8)
  plant(B + 98, 26, true)
  catBasket(B + 6, 66, 0)
  // lounge (kitchen)
  const signLeft = loungeX1 - loungeX0 > 130 ? loungeX0 + 84 : loungeX0 + 30
  const signRight = loungeX1 - loungeX0 > 110 ? loungeX1 - 30 : loungeX1
  const signLabel = fit(normalize(THEME.sign), 14)
  sign(Math.round((signLeft + signRight) / 2 - (textWidth(signLabel) + 10) / 2), 7, signLabel)
  counter(loungeX0 + 6, 28, Math.min(46, loungeX1 - loungeX0 - 44), 0, false)
  partyBackground()
  plant(loungeX1 - 12, 24)
  // server room
  for (let i = 0; i < Math.floor((LW - B - serverX0 - 24) / 20); i++) rack(serverX0 + 10 + i * 20, 10, 0, false, i)
  cabinet(LW - B - 18, 62)
  // work hall
  whiteboard(40, hallFaceTop + 2, 58, { delivered: 0 })
  plant(LW - B - 14, hallFloorY + 4, true)
  cooler(LW - B - 16, LH - B - 26)
  plant(B + 2, hallFloorY + 3)
  L.desks.forEach(d => chair(d.cx - 5, d.by, false))
  chair(L.boss.seat[0], L.boss.by, true)
}

// ---------- frame ----------
function shortType(type) {
  return fit(T.types[type] ?? String(type).split(':').pop(), 8)
}

// focus: name of the focused project; the theme is picked from it, with several projects its desks are highlighted
function renderFrame(now, data, focus = '', selected = null) {
  hits = []
  useTheme(themeFor(focus || data.project))
  const key = `${LW}x${LH}:${themeName}`
  if (backgroundKey !== key) {
    fb = new Uint32Array(LW * LH)
    L = computeLayout()
    // seats reset only when the size changes: a focus/theme change must not shuffle the desks
    if (layoutKey !== `${LW}x${LH}`) {
      layoutKey = `${LW}x${LH}`
      slots.clear()
    }
    for (const [id, g] of party) if (g.spot >= L.party.spots.length) party.delete(id)
    drawBackground()
    background = fb.slice()
    backgroundKey = key
  }
  fb.set(background)

  const workers = [...data.workers].sort((a, b) => a.spawnAt - b.spawnAt)
  assignSlots(workers, now)
  updateParty(workers, now)
  const poses = workers
    .map(w => {
      const p = poseOf(w, now, slots.get(w.id))
      // those going to the dance floor are drawn by the party list
      if (fates.get(w.id) === 'party' && (p.phase === 'out' || p.phase === 'gone')) p.phase = 'party'
      return { w, slot: slots.get(w.id), p }
    })
    .filter(({ p }) => p.phase !== 'gone')
  const handed = poses.filter(({ p }) => p.phase === 'hand' || p.phase === 'out' || p.phase === 'party')
  const pendingDone = workers.filter(w => w.doneAt != null).length - handed.length
  const stack = Math.max(0, data.delivered - Math.max(0, pendingDone))
  const lastOk = handed[handed.length - 1]?.w.isOk ?? true
  const busySlots = new Set(poses.filter(({ p }) => p.phase === 'work').map(({ slot }) => slot))
  const isBusy = busySlots.size > 0 || data.isBossBusy
  const typeFrame = Math.floor(now / 200) % 2
  const walkFrame = Math.floor(now / 150) % 2
  // several projects: the boss oversees all; with one project the view is as before
  const projs = projectsOf(data)
  const isMulti = projs.length > 1
  const short = shortNames(projs.map(p => p.name))
  const projOf = name => {
    if (!isMulti || !name) return null
    const p = projs.find(q => slugOf(q.name) === slugOf(name))
    return p ? { name: p.name, short: short.get(p.name), color: projColor(p.name) } : null
  }
  // desk → project of the worker sitting there (or coming to sit)
  const deskProj = new Map()
  for (const { w, slot, p } of poses)
    if (slot < L.desks.length && (p.phase === 'in' || p.phase === 'work')) deskProj.set(slot, projOf(w.project))

  // live decor
  const { B, bossX1, serverX0, loungeX0, loungeX1, hallFaceTop } = L
  const isNight = windowPane(B + 34, 7, 24, 15, now)
  windowPane(loungeX0 + 8, 7, 20, 15, now)
  if (loungeX1 - loungeX0 > 110) windowPane(loungeX1 - 28, 7, 20, 15, now)
  lamp(bossX1 - 14, 30, isNight)
  lamp(loungeX0 + 6, 52, isNight)
  if (isMulti) {
    // wide board: from the start of the wall to the hall door; the clock to its right if it fits
    const x = 24
    const room = L.loungeDoorX - 14 - x
    const bw = projectBoard(x, hallFaceTop + 2, room, projs, short, data, now)
    if (bw + 17 <= room) clock(x + bw + 5, hallFaceTop + 3, now)
    hits.push({ id: TODAY_ID, x, y: hallFaceTop + 2, w: bw, h: 15 })
  } else {
    clock(108, hallFaceTop + 3, now)
    whiteboard(40, hallFaceTop + 2, 58, data)
    hits.push({ id: TODAY_ID, x: 40, y: hallFaceTop + 2, w: 58, h: 15 })
  }
  catBasket(B + 6, 66, now)
  counter(loungeX0 + 6, 28, Math.min(46, loungeX1 - loungeX0 - 44), now, isBusy)
  // party: at its liveliest when nobody works and the boss is idle
  const hot = !isBusy
  danceFloor(now, hot)
  discoSpecks(now, hot)
  neonChain(now, hot)
  discoBall(now, hot)
  djBooth(now, hot)
  if (party.size > 0) balloons(now)
  for (let i = 0; i < Math.floor((LW - B - serverX0 - 24) / 20); i++) rack(serverX0 + 10 + i * 20, 10, now, isBusy, i)
  shellSlots(Array.isArray(data.shells) ? data.shells : [], now, projOf)
  if (isBusy) {
    const on = Math.floor(now / 400) % 2
    box(serverX0 + 12, 60, 6, 5, on ? C.red : 0x8a2a24)
  } else box(serverX0 + 12, 60, 6, 5, 0x5a3a36)

  // desks of the focused project
  const focusKey = isMulti && focus ? slugOf(focus) : null
  if (focusKey !== null)
    for (const [slot, pr] of deskProj) if (pr && slugOf(pr.name) === focusKey) deskGlow(L.desks[slot], projColor(pr.name))

  const drawables = []
  L.desks.forEach((d, i) => drawables.push({ y: d.by + 0.5, draw: () => desk(d, i + 1, busySlots.has(i), now, deskProj.get(i) ?? null) }))
  drawables.push({ y: L.boss.by + 0.5, draw: () => bossDesk(now, data.isBossBusy, stack, lastOk) })
  drawables.push({
    y: L.boss.by,
    draw: () => {
      bot(L.boss.seat[0], L.boss.by - SIT, {
        pose: data.isBossBusy ? 'type' : 'stand',
        frame: typeFrame,
        isBoss: true,
        isBlink: now % 4100 < 130,
      })
      hitBot(BOSS_ID, L.boss.seat[0], L.boss.by - SIT)
    },
  })
  const beatMs = hot ? 230 : 320
  for (const [id, g] of party) {
    const p = partyPose(g, now)
    if (p.phase === 'gone') {
      party.delete(id)
      continue
    }
    const isBlink = (now + g.seed) % 3700 < 120
    drawables.push({
      y: p.y,
      draw: () => {
        const hat = neon()[g.seed % 4]
        hitBot(id, p.x, p.y, p.phase === 'walk' ? 7 : 9)
        if (p.phase === 'walk') return bot(p.x, p.y, { pose: 'walk', frame: walkFrame, look: p.look, isBlink, hat })
        // per-dancer phase offset; now and then one spins around
        const frame = Math.floor((now + (g.seed % 997)) / beatMs) % 3
        const cyc = (now + g.seed * 7) % 5200
        const spin = cyc < 640 ? Math.floor(cyc / 160) : -1
        // now and then blows a party horn: unrolls, holds, rolls back
        const blow = (now + g.seed * 3) % 3400
        const n = blow < 900 ? Math.min(6, Math.floor(blow / 60), Math.floor((900 - blow) / 60)) : -1
        dancer(p.x, p.y, {
          frame: spin >= 0 ? 1 : frame,
          look: spin === 0 ? -1 : spin === 2 ? 1 : 0,
          isBack: spin === 1,
          isBlink,
          hat,
          horn: spin < 0 && n >= 0 ? { dir: g.seed % 2 ? 1 : -1, n, c: neon()[(g.seed + 1) % 4] } : null,
        })
      },
    })
  }
  for (const { w, slot, p } of poses) {
    if (p.phase === 'party') continue
    const seed = strHash(w.id)
    const isBlink = (now + seed) % 3700 < 120
    const isOk = w.isOk ?? true
    drawables.push({
      y: p.y,
      draw: () => {
        if (p.phase === 'work') {
          const atDesk = seatInfo(slot).kind === 'desk'
          hitBot(w.id, p.x, p.y - (atDesk ? SIT : 0))
          bot(p.x, p.y - (atDesk ? SIT : 0), {
            pose: atDesk ? 'type' : 'stand',
            frame: (typeFrame + seed) % 2,
            isBlink,
            hasMug: !atDesk,
          })
        } else if (p.phase === 'hand') {
          hitBot(w.id, p.x, p.y, 9)
          bot(p.x, p.y, { isBlink })
          paper(p.x - 3, p.y - 20, isOk)
        } else {
          hitBot(w.id, p.x, p.y)
          bot(p.x, p.y, { pose: 'walk', frame: walkFrame, look: p.look, isBlink })
          if (p.phase === 'carry') paper(p.x + 6, p.y - 9, isOk)
        }
      },
    })
  }
  drawables.sort((a, b) => a.y - b.y).forEach(d => d.draw())
  if ([...party.values()].some(g => partyPose(g, now).phase === 'dance')) confetti(now, hot)

  // labels on top
  for (const { w, slot, p } of poses) {
    if (p.phase !== 'work') continue
    const info = seatInfo(slot)
    const tool = w.tool ? String(w.tool).replace(/^mcp__.*__/, '') : T.thinking
    const cx = info.kind === 'desk' ? L.desks[slot].cx : p.x
    const top = p.y - (info.kind === 'desk' ? 18 : 14)
    const pr = projOf(w.project)
    // with several projects the label edge is the project's colour (those in the hall have no plate; this tells them apart too)
    const tb = tag([[shortType(w.type), C.white], [fit(tool, 8), C.yellow]], cx, top, pr ? pr.color : C.ol)
    hits.push({ id: w.id, ...tb })
  }
  // the sign, in order: a permission dialog is open (contract v2.6: blinks and says which project) → the boss works →
  // its turn ended but agents still run (it waits for them, not for the user) → it waits for the user
  const isAsking = Boolean(data.isBossAsking)
  const running = new Set(data.workers.filter(w => w && w.doneAt == null).map(w => slugOf(w.project ?? '')))
  const hasAgents = p => p.working > 0 || running.has(slugOf(p.name))
  const isAgents = !isAsking && !data.isBossBusy && running.size > 0
  const status = isAsking
    ? [T.asking, Math.floor(now / 500) % 2 ? C.yellow : C.white]
    : [data.isBossBusy ? T.working : isAgents ? T.agents : T.waiting, C.dim]
  const bossLines = [[T.boss, C.accent], status]
  if (isMulti && (isAsking || data.isBossBusy || isAgents)) {
    // projects waiting for approval, working or with agents working: at most two names, the rest +n
    const busy = projs.filter(p => (isAsking ? p.waiting : data.isBossBusy ? p.isBossHere ?? p.isBossBusy : hasAgents(p)))
    busy.slice(0, 2).forEach(p => bossLines.push([short.get(p.name), projColor(p.name)]))
    if (busy.length > 2) bossLines.push([`+${busy.length - 2}`, C.dim])
  }
  const bt = tag(bossLines, L.boss.seat[0], L.boss.by - 19)
  hits.push({ id: BOSS_ID, ...bt })
  // bubble to the right of the sign: must not cover a wide sign (NEEDS YOU, ONAY BEKLİYOR)
  if (poses.some(({ p }) => p.phase === 'hand')) bubbleCheck(Math.max(L.boss.seat[0] + 14, bt.x + bt.w + 1), L.boss.by - 36, lastOk)
  if (selected) selectionMarker(selected, now)
}

const DEMO_TYPES = ['Explore', 'Plan', 'general-purpose', 'code-reviewer', 'Explore', 'general-purpose']
const DEMO_TOOLS = ['Grep', 'Read', 'Bash', 'Edit', 'Glob', 'WebSearch', 'Write', 'WebFetch']
const DEMO_PERIOD = 2300

function demoOffice(now) {
  const workers = []
  const first = Math.floor((now - 50000) / DEMO_PERIOD)
  let done = 0
  for (let k = first; k * DEMO_PERIOD <= now; k++) {
    const spawnAt = k * DEMO_PERIOD
    const h = hash(k)
    const doneAt = spawnAt + 10000 + (h % 14000)
    const isDone = doneAt <= now
    if (isDone) done++
    workers.push({
      id: `demo-${k}`,
      type: DEMO_TYPES[h % DEMO_TYPES.length],
      spawnAt,
      doneAt: isDone ? doneAt : undefined,
      isOk: h % 9 !== 0,
      tool: DEMO_TOOLS[Math.floor((now - spawnAt) / 3000 + (h >>> 5)) % DEMO_TOOLS.length],
    })
  }
  return { workers, delivered: 14 + done, isBossBusy: true, project: T.demoProject, sessionId: '', isDemo: true }
}

// screen pixels → scale and logical canvas
export function setGeometry(pxW, pxH) {
  canvasW = pxW
  canvasH = pxH
  S = Math.max(2, Math.round(Math.min(pxW / DESIGN_W, pxH / DESIGN_H)))
  while (S > 2 && (Math.floor(pxW / S) < 300 || Math.floor(pxH / S) < 190)) S--
  LW = Math.floor(pxW / S)
  LH = Math.floor(pxH / S)
  return { LW, LH, S }
}

// ---------- public interface ----------
const EMPTY = { workers: [], delivered: 0, isBossBusy: false, project: '', sessionId: '' }

// when opts.project is given, it is used for the theme instead of the data's project (like --project)
// resets party and seat state (tests, session change)
export function resetOffice() {
  slots.clear()
  party.clear()
  fates.clear()
  entries.clear()
  seen.clear()
  backgroundKey = ''
  layoutKey = ''
}

// for tests/diagnostics: number of bots on the dance floor
export function partyCount() {
  return party.size
}

export function render(now, data, opts = {}) {
  const d = { ...EMPTY, ...(data ?? {}) }
  if (!Array.isArray(d.workers)) d.workers = []
  if (opts.theme !== undefined) setTheme(opts.theme)
  if (opts.project) d.project = opts.project
  renderFrame(now, d, opts.focus ? String(opts.focus) : '', opts.selected ? String(opts.selected) : null)
  return { fb, LW, LH, S }
}

// canvas pixel (office-view's drawImage space) → id of the topmost bot drawn there in the last frame,
// or null. The frame is centred on the canvas; a few logical pixels of slack are allowed.
export function hitTest(pxX, pxY) {
  if (!Number.isFinite(pxX) || !Number.isFinite(pxY)) return null
  const lx = (pxX - Math.floor((canvasW - LW * S) / 2)) / S
  const ly = (pxY - Math.floor((canvasH - LH * S) / 2)) / S
  if (lx < 0 || ly < 0 || lx >= LW || ly >= LH) return null
  for (const slack of [0, HIT_SLACK]) {
    for (let i = hits.length - 1; i >= 0; i--) {
      const b = hits[i]
      if (lx >= b.x - slack && lx < b.x + b.w + slack && ly >= b.y - slack && ly < b.y + b.h + slack) return b.id
    }
  }
  return null
}

// for tests/diagnostics: bot boxes recorded in the last frame (logical pixels)
export function hitBoxes() {
  return hits.map(b => ({ ...b }))
}

const hex = c => '#' + (c >>> 0 & 0xffffff).toString(16).padStart(6, '0')

// the theme's current colours (0xrrggbb); for the viewer's terminal lines
export function themeColors() {
  return { ...C }
}

export function themeInfo() {
  return {
    name: themeName || 'classic',
    title: THEME.title ?? `${normalize(THEME.sign)} ${T.office}`,
    frame: hex(C.frame),
    accent: hex(C.accent),
    statusBg: hex(C.statusBg),
    statusText: hex(C.statusText),
  }
}

export { demoOffice, themeFor }
