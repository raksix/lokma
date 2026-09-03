import type { ArchifyEdge, ArchifyIR, ArchifyNode } from './ir.js';
import { layoutColumns } from './ir.js';

/**
 * Deterministic SVG renderer — same IR always yields the same pixels.
 * No Mermaid, no external renderer: column layout (BFS from roots) +
 * elbow edges + per-preset styling + finite trace animation.
 */

const NODE_W = 168;
const NODE_H = 54;
const COL_GAP = 96;
const ROW_GAP = 22;
const PAD = 40;

/** XML-escape labels (IR comes from agents — never inject raw). */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type PresetStyle = {
  edge: string;
  edgeDash: string;
  nodeFill: (kind: string) => string;
  nodeStroke: (kind: string) => string;
  labelFill: string;
  subFill: string;
  grid: string | null;
};

const KIND_ACCENT: Record<string, string> = {
  service: '#C96442',
  db: '#6C5CE7',
  queue: '#D97706',
  gateway: '#0EA5E9',
  step: '#C96442',
  actor: '#0EA5E9',
  state: '#6C5CE7',
  source: '#059669',
  transform: '#D97706',
  sink: '#6C5CE7',
};

function kindAccent(kind: string | undefined): string {
  return KIND_ACCENT[(kind ?? '').toLowerCase()] ?? '#C96442';
}

function presetStyle(preset: ArchifyIR['preset'], theme: ArchifyIR['theme']): PresetStyle {
  const dark = theme === 'dark';
  switch (preset) {
    case 'blueprint':
      return {
        edge: dark ? '#7DD3FC' : '#2563EB',
        edgeDash: '',
        nodeFill: () => (dark ? '#10233B' : '#EFF6FF'),
        nodeStroke: () => (dark ? '#3B82F6' : '#93C5FD'),
        labelFill: dark ? '#F0F9FF' : '#1E3A8A',
        subFill: dark ? '#7DD3FC' : '#3B82F6',
        grid: dark ? '#1E3A5F' : '#DBEAFE',
      };
    case 'classic':
      return {
        edge: dark ? '#A1A1AA' : '#52525B',
        edgeDash: '',
        nodeFill: () => (dark ? '#1E1E21' : '#FFFFFF'),
        nodeStroke: () => (dark ? '#3F3F46' : '#D4D4D8'),
        labelFill: dark ? '#FAFAF9' : '#262624',
        subFill: dark ? '#A1A1AA' : '#71717A',
        grid: null,
      };
    case 'minimal':
      return {
        edge: dark ? '#71717A' : '#A1A1AA',
        edgeDash: '4 3',
        nodeFill: () => 'none',
        nodeStroke: () => (dark ? '#52525B' : '#D4D4D8'),
        labelFill: dark ? '#E4E4E7' : '#3F3F46',
        subFill: dark ? '#71717A' : '#A1A1AA',
        grid: null,
      };
    case 'signal-flow':
    default:
      return {
        edge: 'url(#archify-flow)',
        edgeDash: '',
        nodeFill: (kind) => (dark ? '#1E1E21' : '#FFFFFF'),
        nodeStroke: (kind) =>
          kindAccent(kind) === '#C96442' && !dark ? '#F2D5C2' : dark ? '#3F3F46' : '#E8E4DE',
        labelFill: dark ? '#FAFAF9' : '#262624',
        subFill: dark ? '#A1A1AA' : '#999999',
        grid: null,
      };
  }
}

export type PlacedNode = ArchifyNode & { x: number; y: number; col: number; row: number };

/** Deterministic placement — node order in the IR decides row order. */
export function placeNodes(ir: ArchifyIR): PlacedNode[] {
  const cols = layoutColumns(ir.nodes, ir.edges);
  const perCol = new Map<number, ArchifyNode[]>();
  for (const n of ir.nodes) {
    const c = cols.get(n.id) ?? 0;
    if (!perCol.has(c)) perCol.set(c, []);
    (perCol.get(c) as ArchifyNode[]).push(n);
  }
  const placed: PlacedNode[] = [];
  for (const [col, list] of [...perCol.entries()].sort((a, b) => a[0] - b[0])) {
    list.forEach((n, row) => {
      placed.push({ ...n, x: PAD + col * (NODE_W + COL_GAP), y: PAD + row * (NODE_H + ROW_GAP), col, row });
    });
  }
  return placed;
}

export function canvasSize(placed: PlacedNode[]): { w: number; h: number } {
  if (placed.length === 0) return { w: 400, h: 200 };
  const w = Math.max(...placed.map((p) => p.x)) + NODE_W + PAD;
  const h = Math.max(...placed.map((p) => p.y)) + NODE_H + PAD;
  return { w, h };
}

function edgePath(from: PlacedNode, to: PlacedNode): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const mid = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
}

/**
 * Build the diagram SVG (pure string — the pane previews it, the HTML file
 * embeds it, the export endpoint serves it as a file).
 */
export function buildSvg(ir: ArchifyIR): string {
  const placed = placeNodes(ir);
  const { w, h } = canvasSize(placed);
  const st = presetStyle(ir.preset, ir.theme);
  const byId = new Map(placed.map((p) => [p.id, p]));
  const traceSet = new Set(ir.trace ?? []);

  const grid = st.grid
    ? `<defs><pattern id="archify-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0 H0 V24" fill="none" stroke="${st.grid}" stroke-width="0.5" opacity="0.5"/></pattern></defs><rect x="0" y="0" width="${w}" height="${h}" fill="url(#archify-grid)"/>`
    : '';

  const edges = ir.edges
    .map((e: ArchifyEdge, i: number) => {
      const from = byId.get(e.from);
      const to = byId.get(e.to);
      if (!from || !to) return '';
      const onTrace =
        traceSet.size > 0 && traceSet.has(e.from) && traceSet.has(e.to);
      const label = e.label ? `<text x="${(from.x + NODE_W + to.x) / 2}" y="${(from.y + to.y) / 2 + NODE_H / 2 - 4}" text-anchor="middle" font-size="9" fill="${onTrace ? '#C96442' : st.subFill}" font-weight="${onTrace ? '700' : '400'}">${esc(e.label)}</text>` : '';
      const dash = st.edgeDash ? ` stroke-dasharray="${st.edgeDash}"` : '';
      return `<path d="${edgePath(from, to)}" fill="none" stroke="${st.edge}" stroke-width="${onTrace ? 2 : 1.4}"${dash} marker-end="url(#archify-arr)"/><circle cx="${from.x + NODE_W}" cy="${from.y + NODE_H / 2}" r="2" fill="#C96442" opacity="0"><animate attributeName="opacity" values="0;0.9;0" dur="2s" begin="${(i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></circle>${label}`;
    })
    .join('');

  const nodes = placed
    .map((p) => {
      const accent = kindAccent(p.kind);
      const sub = (p.kind ?? ir.type).slice(0, 24);
      return `<g data-node="${esc(p.id)}" data-kind="${esc((p.kind ?? '').toLowerCase())}"><rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="10" fill="${st.nodeFill(p.kind ?? '')}" stroke="${st.nodeStroke(p.kind ?? '')}" stroke-width="1.2"/><rect x="${p.x}" y="${p.y}" width="3" height="${NODE_H}" rx="1.5" fill="${accent}"/><text x="${p.x + NODE_W / 2 + 2}" y="${p.y + 24}" text-anchor="middle" font-size="11" font-weight="700" fill="${st.labelFill}">${esc(p.label.slice(0, 28))}</text><text x="${p.x + NODE_W / 2 + 2}" y="${p.y + 40}" text-anchor="middle" font-size="9" fill="${st.subFill}">${esc(sub)}</text></g>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(ir.title)}" style="width:100%;height:100%"><defs><linearGradient id="archify-flow" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#C96442" stop-opacity="0.9"/><stop offset="100%" stop-color="#6C5CE7" stop-opacity="0.9"/></linearGradient><marker id="archify-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#C96442"/></marker></defs>${grid}${edges}${nodes}</svg>`;
}

/**
 * Build the self-contained viewer HTML (no external JS/CSS — Docs/31 §5).
 * Real viewer contract subset: `?` help, `R` trace, `L` lens, `F` focus,
 * `/` search, `+/-/0` zoom, `#focus/#route/#lens` deep links.
 */
export function buildStandaloneHtml(ir: ArchifyIR): string {
  const svg = buildSvg(ir);
  const bg = ir.theme === 'dark' ? '#0F0F11' : '#FAF9F5';
  const fg = ir.theme === 'dark' ? '#FAFAF9' : '#262624';
  const panel = ir.theme === 'dark' ? '#1E1E21' : '#FFFFFF';
  const data = JSON.stringify(ir).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ir.title)} — archify</title><style>html,body{margin:0;height:100%;background:${bg};color:${fg};font:13px/1.5 Inter,system-ui,sans-serif}#bar{position:fixed;top:10px;right:10px;display:flex;gap:6px;z-index:5}#bar button{background:${panel};color:${fg};border:1px solid #ccc;border-radius:6px;padding:3px 9px;font-size:11px;cursor:pointer}#stage{position:fixed;inset:0;padding:14px}#stage svg{width:100%;height:100%}#help{position:fixed;inset:0;display:none;place-items:center;background:rgba(0,0,0,.45);z-index:9}#help div{background:${panel};color:${fg};border-radius:10px;padding:18px 22px;max-width:340px}#help kbd{background:#eee;border:1px solid #ccc;border-radius:4px;padding:0 6px;font:11px monospace}.hl{outline:2px solid #C96442;outline-offset:2px}.dim{opacity:.18}#trace-dot{fill:#C96442}</style></head><body><div id="bar"><button data-k="?" title="help">?</button><button data-k="r" title="trace (R)">trace &#9654;</button><button data-k="l" title="lens (L)">lens</button><button data-k="+" title="zoom in">+</button><button data-k="-" title="zoom out">-</button><button data-k="0" title="reset">0</button></div><div id="stage">${svg}</div><div id="help"><div><b>viewer keys</b><br><kbd>?</kbd> help &middot; <kbd>R</kbd> trace &middot; <kbd>L</kbd> lens &middot; <kbd>F</kbd> focus &middot; <kbd>/</kbd> search &middot; <kbd>+</kbd><kbd>-</kbd><kbd>0</kbd> zoom<br><br>deep links: <kbd>#focus=&lt;id&gt;</kbd> <kbd>#route=a~b</kbd> <kbd>#lens=&lt;kind&gt;</kbd></div></div><script>const IR=${data};const stage=document.getElementById('stage'),help=document.getElementById('help');let zoom=1;const nodes=[...document.querySelectorAll('[data-node]')];function applyHash(){const h=location.hash.slice(1);nodes.forEach(n=>n.classList.remove('hl','dim'));if(!h)return;const p=Object.fromEntries(h.split('&').map(s=>s.split('=')));if(p.focus){const t=nodes.find(n=>n.dataset.node===p.focus);if(t)t.classList.add('hl');nodes.forEach(n=>{if(n!==t)n.classList.add('dim')});}if(p.lens){nodes.forEach(n=>{if(n.dataset.kind!==p.lens)n.classList.add('dim');else n.classList.add('hl')});}if(p.route){const[a,b]=String(p.route).split('~');nodes.forEach(n=>{if(n.dataset.node!==a&&n.dataset.node!==b)n.classList.add('dim');else n.classList.add('hl')});}}function trace(){const t=IR.trace||[];if(!t.length)return;document.querySelectorAll('#trace-dot').forEach(d=>d.remove());const svgEl=stage.querySelector('svg');let i=0;const step=()=>{if(i>=t.length)return;const g=nodes.find(n=>n.dataset.node===t[i]);if(g){const r=g.querySelector('rect');const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('id','trace-dot');c.setAttribute('r','5');c.setAttribute('cx',+r.getAttribute('x')+8);c.setAttribute('cy',+r.getAttribute('y')+8);svgEl.appendChild(c);g.classList.add('hl');setTimeout(()=>{c.remove();g.classList.remove('hl');i++;step();},700);}else{i++;step();}};step();}function key(k){if(k==='?')help.style.display=help.style.display==='grid'?'none':'grid';else if(k==='r')trace();else if(k==='l'){const kind=prompt('lens kind (service, db, ...):','service');if(kind)location.hash='#lens='+kind;}else if(k==='f'){const id=prompt('focus node id:','');if(id)location.hash='#focus='+id;}else if(k==='/'){const q=prompt('search label:','');if(q){const t=nodes.find(n=>n.textContent.toLowerCase().includes(q.toLowerCase()));if(t){nodes.forEach(n=>n.classList.add('dim'));t.classList.remove('dim');t.classList.add('hl');}}}else if(k==='+'){zoom=Math.min(3,zoom+0.2);stage.style.transform='scale('+zoom+')';}else if(k==='-'){zoom=Math.max(0.4,zoom-0.2);stage.style.transform='scale('+zoom+')';}else if(k==='0'){zoom=1;stage.style.transform='';nodes.forEach(n=>n.classList.remove('hl','dim'));}}document.addEventListener('keydown',e=>key(e.key));document.querySelectorAll('#bar button').forEach(b=>b.onclick=()=>key(b.dataset.k));help.onclick=()=>help.style.display='none';addEventListener('hashchange',applyHash);applyHash();</script></body></html>`;
}

/** 1200x630 share card SVG (route/reach deep-link cards, Docs/31 §6.6). */
export function buildShareCard(ir: ArchifyIR): string {
  const route = (ir.trace ?? []).join(' → ') || ir.nodes.map((n) => n.label).slice(0, 4).join(' → ');
  return `<svg viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="share card ${esc(ir.title)}"><defs><linearGradient id="card-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${ir.theme === 'dark' ? '#1E1E21' : '#FDFCFB'}"/><stop offset="100%" stop-color="${ir.theme === 'dark' ? '#0F0F11' : '#F2EDE4'}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#card-bg)"/><rect x="60" y="120" width="72" height="72" rx="14" fill="#C96442"/><text x="96" y="166" text-anchor="middle" font-size="30" font-weight="800" fill="#fff">${esc(ir.type.slice(0, 2).toUpperCase())}</text><text x="60" y="260" font-size="52" font-weight="800" fill="${ir.theme === 'dark' ? '#FAFAF9' : '#262624'}">${esc(ir.title.slice(0, 42))}</text><text x="60" y="310" font-size="24" fill="#C96442">${esc(ir.type)} · ${esc(ir.preset)} · ${esc(ir.theme)}</text><text x="60" y="380" font-size="26" fill="${ir.theme === 'dark' ? '#D4D4D8' : '#52525B'}">${esc(route.slice(0, 90))}</text><text x="60" y="560" font-size="20" fill="#999">${ir.nodes.length} nodes · ${ir.edges.length} edges · lokma archify</text><rect x="60" y="520" width="1080" height="2" fill="#C96442" opacity="0.5"/></svg>`;
}
