// ─────────────────────────────────────────────────────────────────────────────
//  FRAGMENTY FASADY — panel to ściana z otworami i ozdobami o wymiarach w
//  metrach, a nie jedno okno wciśnięte w komórkę. Układ (które fragmenty, gdzie
//  i jak duże) liczy gen/facade.js; tu tylko je rysujemy.
//
//  spec = lista fragmentów w lokalnych metrach panelu (x wzdłuż lica):
//    win     { x, w, y, h, frame, arch, panes, shut, flow, bars }  okno (x = środek)
//    door    { x, w, arch }                                         drzwi z portalem (łukowym)
//    bay     { x, w, out, from, to }                                wykusz (okno narożne w rzucie trapezu)
//    balc    { x, w, h, rail, slab }                                drzwi balkonowe + balkon
//    jul     { x, w, h }                                            okno-drzwi z balustradą
//    quoin   { at: 'm'|'c', w }                                     boniowanie narożne
//    lizena  { at: 'm'|'c' }                                        pas na styku kamienic
// ─────────────────────────────────────────────────────────────────────────────
import { M, glassFrame, plinth, surround, windowParts, doorParts, balconyParts } from './modules.js';

const HOLE = { win: 0.24, door: 0.42, balc: 0.24, jul: 0.24 };

function holeOf(f, H) {
  const hw = f.w / 2;
  if (f.k === 'win') return { x0: f.x - hw, x1: f.x + hw, y0: f.y, y1: f.y + f.h, rev: HOLE.win, arch: !!f.arch };
  if (f.k === 'door') return { x0: f.x - hw, x1: f.x + hw, y0: 0.3, y1: Math.min(3.1, H - 0.7), rev: HOLE.door, arch: !!f.arch };
  if (f.k === 'balc') return { x0: f.x - hw, x1: f.x + hw, y0: 0.05, y1: f.h, rev: HOLE.balc, arch: false };
  if (f.k === 'jul') return { x0: f.x - hw, x1: f.x + hw, y0: 0.05, y1: f.h, rev: HOLE.jul, arch: false };
  return null;
}

// punkty łuku półkolistego od lewej do prawej (środek cx, wysokość sprężenia ys)
function arc(cx, ys, r, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    out.push([cx + Math.cos(a) * r, ys + Math.sin(a) * r]);
  }
  return out;
}
const ARC_N = 8;

// Ściana z dowolną liczbą prostokątnych (lub łukowych) otworów: pionowe plastry
// między krawędziami otworów, a w każdym plastrze ściana omija otwory.
function wallHoles(b, mat, W, H, holes) {
  const xs = [0, W];
  for (const h of holes) xs.push(h.x0, h.x1);
  xs.sort((a, c) => a - c);
  const strip = (xa, xb, ya, yb) => {
    if (yb - ya < 1e-3) return;
    b.grid(mat, xa, ya, xb, yb, 0, Math.max(1, Math.round((xb - xa) / 2.5)), Math.max(1, Math.round((yb - ya) / 2)));
  };
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1];
    if (xb - xa < 1e-3) continue;
    const here = holes.filter((h) => h.x0 <= xa + 1e-4 && h.x1 >= xb - 1e-4).sort((p, q) => p.y0 - q.y0);
    let y = 0;
    for (const h of here) { strip(xa, xb, y, h.y0); y = h.y1; }
    strip(xa, xb, y, H);
  }
  const ro = { shade: 0.8 };
  for (const h of holes) {
    const { x0, x1, y0, y1, rev } = h;
    if (h.arch) {
      // łuk nad otworem: pas ściany między łukiem a górną krawędzią prostokąta
      const r = (x1 - x0) / 2, ys = y1 - r, pts = arc((x0 + x1) / 2, ys, r, ARC_N);
      for (let i = 0; i < ARC_N; i++) {
        const a = pts[i], c = pts[i + 1];
        b.poly(mat, [[a[0], a[1], 0], [c[0], c[1], 0], [c[0], y1, 0], [a[0], y1, 0]], [0, 0, -1]);
        const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
        b.poly(mat, [[a[0], a[1], 0], [c[0], c[1], 0], [c[0], c[1], rev], [a[0], a[1], rev]], [(x0 + x1) / 2 - mx, ys - my, 0], { shade: 0.65 });
      }
      b.rectX(mat, x0, 0, y0, rev, ys, 1, ro);
      b.rectX(mat, x1, 0, y0, rev, ys, -1, ro);
      if (y0 > 1e-3) b.rectY(mat, y0, x0, 0, x1, rev, 1, ro);
      continue;
    }
    b.rectX(mat, x0, 0, y0, rev, y1, 1, ro);
    b.rectX(mat, x1, 0, y0, rev, y1, -1, ro);
    if (y0 > 1e-3) b.rectY(mat, y0, x0, 0, x1, rev, 1, ro);
    b.rectY(mat, y1, x0, 0, x1, rev, -1, { shade: 0.6 });
  }
}

// Okno z łukiem półkolistym: dolna część jak zwykłe okno, górna to półkole z szybą,
// ramą, archiwoltą i zwornikiem.
function archWindow(b, f, H, p) {
  const x0 = f.x - f.w / 2, x1 = f.x + f.w / 2, r = f.w / 2, ys = f.y + f.h - r, cx = f.x;
  glassFrame(b, x0, f.y, x1, ys, 0.18, { ...p, panes: f.panes ?? 2 });
  const pts = arc(cx, ys, r, ARC_N), fo = { tint: p.frameTint };
  const ring = arc(cx, ys, r - 0.07, ARC_N);
  for (let i = 0; i < ARC_N; i++) {
    const a = pts[i], c = pts[i + 1], d = ring[i], e = ring[i + 1];
    b.poly('glass', [[d[0], d[1], 0.215], [e[0], e[1], 0.215], [e[0], ys, 0.215], [d[0], ys, 0.215]], [0, 0, -1], { tint: p.glassTint });
    b.poly('wood', [[a[0], a[1], 0.15], [c[0], c[1], 0.15], [e[0], e[1], 0.15], [d[0], d[1], 0.15]], [0, 0, -1], fo);
  }
  b.box('wood', cx - 0.025, ys, 0.14, cx + 0.025, ys + r - 0.05, 0.16, 'xXz', fo);
  b.box('stone', x0 - 0.07, f.y - 0.07, -0.08, x1 + 0.07, f.y, 0, 'xXyYz');
  if (p.simple) return;
  // archiwolta i opaska ościeżowa
  const R = r + 0.2, outer = arc(cx, ys, R, ARC_N);
  for (let i = 0; i < ARC_N; i++) {
    const a = pts[i], c = pts[i + 1], d = outer[i], e = outer[i + 1];
    b.poly('stone', [[a[0], a[1], -0.045], [c[0], c[1], -0.045], [e[0], e[1], -0.045], [d[0], d[1], -0.045]], [0, 0, -1]);
    b.poly('stone', [[d[0], d[1], -0.045], [e[0], e[1], -0.045], [e[0], e[1], 0], [d[0], d[1], 0]], [(d[0] + e[0]) / 2 - cx, (d[1] + e[1]) / 2 - ys, 0]);
  }
  b.box('stone', x0 - 0.2, f.y, -0.045, x0, ys, 0, 'xXz');
  b.box('stone', x1, f.y, -0.045, x1 + 0.2, ys, 0, 'xXz');
  b.box('stone', cx - 0.13, ys + R - 0.12, -0.1, cx + 0.13, Math.min(ys + R + 0.1, H - 0.02), 0, 'xXyYz');
}


// Drzwi z łukiem półkolistym: skrzydło z płycinami, naświetle w łuku, kamienny portal.
function archDoor(b, f, W, H, p) {
  const x0 = f.x - f.w / 2, x1 = f.x + f.w / 2, r = f.w / 2, y0 = 0.3, y1 = Math.min(3.1, H - 0.7), ys = y1 - r, cx = f.x;
  const wo = { tint: p.doorTint };
  b.rect('wood', x0, y0, x1, ys, 0.4, wo);
  b.rect('wood', cx - 0.02, y0, cx + 0.02, ys, 0.385, { tint: p.doorTint, shade: 0.6 });
  for (const [a, c] of [[x0 + 0.12, cx - 0.1], [cx + 0.1, x1 - 0.12]]) {
    b.box('wood', a, y0 + 0.25, 0.36, c, y0 + 0.95, 0.4, 'xXyYz', wo);
    b.box('wood', a, y0 + 1.15, 0.36, c, ys - 0.18, 0.4, 'xXyYz', wo);
  }
  const pts = arc(cx, ys, r, ARC_N), ring = arc(cx, ys, r - 0.06, ARC_N), outer = arc(cx, ys, r + 0.34, ARC_N);
  for (let i = 0; i < ARC_N; i++) {
    const d = ring[i], e = ring[i + 1], a = pts[i], c = pts[i + 1], o0 = outer[i], o1 = outer[i + 1];
    b.poly('glass', [[d[0], d[1], 0.38], [e[0], e[1], 0.38], [e[0], ys, 0.38], [d[0], ys, 0.38]], [0, 0, -1], { tint: p.glassTint });
    b.poly('wood', [[a[0], a[1], 0.37], [c[0], c[1], 0.37], [e[0], e[1], 0.37], [d[0], d[1], 0.37]], [0, 0, -1], wo);
    b.poly('stone', [[a[0], a[1], -0.1], [c[0], c[1], -0.1], [o1[0], o1[1], -0.1], [o0[0], o0[1], -0.1]], [0, 0, -1]);
    b.poly('stone', [[o0[0], o0[1], -0.1], [o1[0], o1[1], -0.1], [o1[0], o1[1], 0], [o0[0], o0[1], 0]], [(o0[0] + o1[0]) / 2 - cx, (o0[1] + o1[1]) / 2 - ys, 0]);
  }
  b.rect('wood', cx - 0.02, ys, cx + 0.02, ys + r - 0.06, 0.375, wo);
  b.box('stone', x0 - 0.34, 0.3, -0.1, x0, ys, 0, 'xXz');
  b.box('stone', x1, 0.3, -0.1, x1 + 0.34, ys, 0, 'xXz');
  b.box('stone', cx - 0.16, ys + r + 0.1, -0.16, cx + 0.16, ys + r + 0.42, 0, 'xXyYz');
  b.box('stone', x0 - 0.25, 0, -0.5, x1 + 0.25, 0.3, 0.42, 'xXYz', { shade: 0.9 });
}

// Wykusz: ścięty prostopadłościan wysunięty przed lico; każda kondygnacja rysuje swój
// kawałek, więc stos wykuszy jest ciągły. from = parter wykusza (kroksztyn), to = zwieńczenie.
function bay(b, f, W, H, p) {
  const x0 = f.x - f.w / 2, x1 = f.x + f.w / 2, o = f.out, c = Math.min(0.4, f.w * 0.22);
  const fx0 = x0 + c, fx1 = x1 - c, wy0 = 0.8, wy1 = H - 0.45, pier = 0.1;
  const wm = p.wallMat, fo = { tint: p.frameTint };
  // powierzchnia pionowa od (xa,za) do (xb,zb): parapet, filary i nadproże ze ściany, okno ze szkła
  const face = (xa, za, xb, zb, glass) => {
    const dx = xb - xa, dz = zb - za, hint = [dz, 0, -dx], len = Math.hypot(dx, dz);
    const P = (t, y, l) => [xa + dx * t + (dz / len) * l, y, za + dz * t - (dx / len) * l];
    const quad = (t0, y0, t1, y1, mat, o2, l = 0) => b.poly(mat, [P(t0, y0, l), P(t1, y0, l), P(t1, y1, l), P(t0, y1, l)], hint, o2);
    const e = pier / Math.hypot(dx, dz);
    quad(0, 0, 1, wy0, wm); quad(0, wy1, 1, H, wm);
    quad(0, wy0, e, wy1, wm); quad(1 - e, wy0, 1, wy1, wm);
    quad(e, wy0, 1 - e, wy1, 'wood', fo);
    quad(e + 0.03, wy0 + 0.05, 1 - e - 0.03, wy1 - 0.05, 'glass', { tint: glass }, 0.012);
    quad(0.5 - 0.01, wy0 + 0.05, 0.5 + 0.01, wy1 - 0.05, 'wood', { tint: p.frameTint, shade: 0.7 }, 0.02);
  };
  face(fx0, -o, fx1, -o, p.glassTint);
  face(x0, 0, fx0, -o, p.glassTint);
  face(fx1, -o, x1, 0, p.glassTint);
  // spód i kroksztyn na dole wykusza, daszek na górze
  if (f.from) {
    b.poly('stone', [[x0, 0, 0], [fx0, 0, -o], [fx1, 0, -o], [x1, 0, 0]], [0, -1, 0]);
    b.box('stone', fx0 + 0.15, -0.45, -o + 0.1, fx1 - 0.15, 0, -0.1, 'xXyYz', { shade: 0.9 });
  }
  if (f.to) {
    b.poly('stone', [[x0 - 0.05, H, 0.0], [fx0 - 0.05, H, -o - 0.08], [fx1 + 0.05, H, -o - 0.08], [x1 + 0.05, H, 0.0]], [0, 1, 0]);
    b.poly('roof', [[x0, H, 0], [fx0, H + 0.45, -o * 0.8], [fx1, H + 0.45, -o * 0.8], [x1, H, 0]], [0, 1, -0.5], { tint: p.roofTint });
  } else {
    b.box('stone', fx0 - 0.04, H - 0.07, -o - 0.05, fx1 + 0.04, H, -o + 0.02, 'xXyYz', { shade: 0.95 });
  }
}

const DRAW = {
  win(b, f, W, H, p) {
    const x0 = f.x - f.w / 2, x1 = f.x + f.w / 2, y1 = f.y + f.h;
    const fp = { ...p, frame: f.frame, panes: f.panes, shutters: f.shut ?? false, flowers: f.flow || null, bars: f.bars || false };
    if (f.arch) archWindow(b, f, H, fp);
    else windowParts(b, x0, f.y, x1, y1, H, fp);
    // parapet podokienny: płycina pod oknem
    if (f.under) b.box('stone', x0 - 0.02, Math.max(0.12, f.y - 0.62), -0.03, x1 + 0.02, f.y - 0.1, 0, 'xXyYz', { shade: 0.95 });
  },
  door(b, f, W, H, p) {
    if (f.arch) archDoor(b, f, W, H, p);
    else doorParts(b, f.x - f.w / 2, f.x + f.w / 2, 0.3, Math.min(3.1, H - 0.7), W, p);
  },
  bay(b, f, W, H, p) { bay(b, f, W, H, p); },
  balc(b, f, W, H, p) {
    const x0 = f.x - f.w / 2, x1 = f.x + f.w / 2;
    balconyParts(b, x0, x1, 0.05, f.h, W, { ...p, rail: f.rail, slab: f.slab });
  },
  jul(b, f, W, H, p) {
    // okno sięgające podłogi z lekką balustradą tuż przed szybą (francuski balkon)
    const x0 = f.x - f.w / 2, x1 = f.x + f.w / 2, y0 = 0.05, y1 = f.h, mo = { tint: p.metalTint };
    glassFrame(b, x0, y0, x1, y1, 0.18, { ...p, panes: 2 });
    if (!p.simple) surround(b, 'lintel', x0, y0, x1, y1, H);
    b.box('stone', x0 - 0.1, -0.14, -0.2, x1 + 0.1, 0.02, 0, 'xXyYz');
    b.box('metal', x0 - 0.06, 0.96, -0.2, x1 + 0.06, 1.0, -0.15, 'xXyYzZ', mo);
    for (let x = x0; x < x1 + 0.04; x += 0.14) b.box('metal', x, 0.02, -0.19, x + 0.02, 0.96, -0.17, 'xXzZ', mo);
  },
  // boniowanie narożne: naprzemienne długie i krótkie bloki na końcu panelu
  quoin(b, f, W, H, p) {
    const y0 = p.ground ? 0.5 : 0, bh = 0.8, n = Math.max(1, Math.round((H - y0) / bh)), h = (H - y0) / n;
    const at = f.at === 'm' ? 0 : W;
    for (let i = 0; i < n; i++) {
      const w = i % 2 ? f.w * 0.72 : f.w;
      const xa = f.at === 'm' ? at : at - w, xb = f.at === 'm' ? at + w : at;
      b.box('stone', xa, y0 + i * h + 0.02, -0.05, xb, y0 + (i + 1) * h - 0.02, 0, f.at === 'm' ? 'xYz' : 'XYz', { shade: i % 2 ? 0.92 : 1 });
    }
  },
  // lizena: pionowy pas na styku dwóch kamienic
  lizena(b, f, W, H, p) {
    const w = 0.34;
    b.box('stone', f.at === 'm' ? 0 : W - w, 0, -0.07, f.at === 'm' ? w : W, H, 0, 'xXz');
  },
};

export function panel(b, W, H, D, p) {
  const spec = p.spec || [];
  const holes = [];
  for (const f of spec) { const h = holeOf(f, H); if (h) holes.push(h); }
  wallHoles(b, p.ground ? p.groundMat : p.wallMat, W, H, holes);
  if (p.ground) {
    // cokół przerwany tylko w drzwiach
    const cuts = holes.filter((h) => h.y0 < 0.5).sort((a, c) => a.x0 - c.x0);
    const segs = [];
    let x = 0;
    for (const c of cuts) { segs.push([x, c.x0 - 0.38]); x = c.x1 + 0.38; }
    segs.push([x, W]);
    plinth(b, segs.filter(([a, c]) => c > a), 'stone');
  }
  for (const f of spec) DRAW[f.k]?.(b, f, W, H, p);
}

// Lukarna na połaci dachu: okienko w ścianie czołowej i dach dwuspadowy. Policzki
// schodzą pod połać (zasłania je dach), a grzbiet wchodzi w dach z tyłu.
// Rysowana w komórce oriented: z<0 na zewnątrz, y = 0 na połaci przy ścianie czołowej.
function dormer(b, W, H, D, p) {
  const hf = H - 0.6, wx0 = 0.28, wx1 = W - 0.28, wy0 = 0.18, wy1 = hf - 0.12;
  b.wallHole(p.wallMat, W, hf, wx0, wy0, wx1, wy1, 0.2);
  glassFrame(b, wx0, wy0, wx1, wy1, 0.14, { ...p, panes: 2 });
  b.box('stone', wx0 - 0.07, wy0 - 0.07, -0.07, wx1 + 0.07, wy0, 0, 'xXyYz');
  b.poly(p.wallMat, [[0, hf, 0], [W, hf, 0], [W / 2, H, 0]], [0, 0, -1]);
  b.poly(p.wallMat, [[0, -0.6, 0], [0, hf, 0], [0, hf, D], [0, -0.6, D]], [-1, 0, 0]);
  b.poly(p.wallMat, [[W, -0.6, 0], [W, -0.6, D], [W, hf, D], [W, hf, 0]], [1, 0, 0]);
  const rm = p.roofMat || 'roof', ro = { tint: p.roofTint };
  b.poly(rm, [[-0.1, hf - 0.02, -0.12], [W / 2, H, -0.12], [W / 2, H, D], [-0.1, hf - 0.02, D]], [-1, 1, 0], ro);
  b.poly(rm, [[W / 2, H, -0.12], [W + 0.1, hf - 0.02, -0.12], [W + 0.1, hf - 0.02, D], [W / 2, H, D]], [1, 1, 0], ro);
}

M.panel = panel;
M.dormer = dormer;
