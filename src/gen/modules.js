// ─────────────────────────────────────────────────────────────────────────────
//  BIBLIOTEKA MODUŁÓW — 21 segmentów, z których składa się całe miasto.
//  Każdy moduł to funkcja (b, W, H, D, p) piszącą w "kostce" komórki:
//    x ∈ [0,W] wzdłuż lica, y ∈ [0,H] w górę, z = głębokość (z<0 na zewnątrz).
//  Moduł nie wie, jak naprawdę wygląda komórka — Cage dopasuje go do trapezu,
//  skosu narożnika, innej wysokości piętra itd. W/H/D służą tylko po to,
//  żeby detale (ramy, parapety) zachowały wymiary w metrach.
// ─────────────────────────────────────────────────────────────────────────────
import { atlasUV, atlasAspect } from './atlas.js';
import { Rng } from '../core/rng.js';
import { vehicleModules } from './vehicles.js';
import { installProps } from './propmods.js';


const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ── wspólne helpery ─────────────────────────────────────────────────────────
// Okno: rama z głębią, podział szyb zależny od stylu, firanki/zasłony.
// Szkło ma lustrzane odbicia (mapa otoczenia), więc dostaje jasny odcień.
function glassFrame(b, x0, y0, x1, y1, z, p, frameMat = 'wood') {
  const ft = 0.07, h = 0.022;
  const fo = { tint: p.frameTint };
  b.rect('glass', x0, y0, x1, y1, z + 0.035, { tint: p.glassTint });
  // firanki (jasne, u góry) albo zasłony (kolorowe, po bokach) — za ramą, przed szybą
  const seedish = Math.abs(Math.sin((x0 + z) * 91.7 + y0 * 13.1));
  if (seedish < 0.35) b.rect('wood', x0 + ft, y1 - (y1 - y0) * 0.35, x1 - ft, y1 - ft, z + 0.03, { tint: [0.93, 0.91, 0.86], shade: 0.95 });
  else if (seedish < 0.55) {
    const cw = (x1 - x0) * 0.22, ct = p.curtain || [0.55, 0.18, 0.15];
    b.rect('wood', x0 + ft, y0 + ft, x0 + ft + cw, y1 - ft, z + 0.03, { tint: ct });
    b.rect('wood', x1 - ft - cw, y0 + ft, x1 - ft, y1 - ft, z + 0.03, { tint: ct });
  }
  // ościeżnica z głębią
  b.box(frameMat, x0, y0, z - 0.03, x0 + ft, y1, z + 0.03, 'xXz', fo);
  b.box(frameMat, x1 - ft, y0, z - 0.03, x1, y1, z + 0.03, 'xXz', fo);
  b.box(frameMat, x0 + ft, y0, z - 0.03, x1 - ft, y0 + ft, z + 0.03, 'Yz', fo);
  b.box(frameMat, x0 + ft, y1 - ft, z - 0.03, x1 - ft, y1, z + 0.03, 'yz', fo);
  // szprosy: kamienice 6 pól, domy 4, modernizm 2
  const cx = (x0 + x1) / 2, ty = y0 + (y1 - y0) * 0.68;
  const panes = p.style === 'modern' ? 1 : p.style === 'house' || p.ground ? 2 : 3;
  b.box(frameMat, cx - h * 1.4, y0 + ft, z - 0.02, cx + h * 1.4, y1 - ft, z + 0.02, 'xXz', fo);
  b.box(frameMat, x0 + ft, ty - h, z - 0.02, x1 - ft, ty + h, z + 0.02, 'yYz', fo);
  if (panes >= 2) {
    for (const xx of [(x0 + cx) / 2, (cx + x1) / 2]) b.box(frameMat, xx - h * 0.6, ty + h, z - 0.01, xx + h * 0.6, y1 - ft, z + 0.015, 'z', fo);
  }
  if (panes >= 3) {
    const my = (y0 + ty) / 2;
    b.box(frameMat, x0 + ft, my - h * 0.6, z - 0.01, x1 - ft, my + h * 0.6, z + 0.015, 'z', fo);
  }
}

function plinth(b, segs, mat = 'stone') {
  for (const [a, c] of segs) if (c - a > 0.02) b.box(mat, a, 0, -0.06, c, 0.5, 0, 'Yz', { shade: 0.8 });
}

function windowCore(b, W, H, p) {
  const ow = clamp(W * (p.winW || 0.4), 0.7, 1.6);
  const oh = clamp(H * (p.winH || 0.5), 1.1, 2.15);
  const x0 = (W - ow) / 2, x1 = x0 + ow;
  const y0 = p.ground ? Math.max(1.25, H - oh - 0.9) : clamp(H * 0.27, 0.75, 1.0);
  const y1 = Math.min(y0 + oh, H - 0.32);
  const wm = p.ground ? p.groundMat : p.wallMat;
  b.wallHole(wm, W, H, x0, y0, x1, y1, 0.24);
  glassFrame(b, x0, y0, x1, y1, 0.18, p);
  b.box('stone', x0 - 0.07, y0 - 0.07, -0.08, x1 + 0.07, y0, 0.0, 'xXyYz');
  if (!p.simple) {
    const s = 0.14;
    b.box('stone', x0 - s, y0, -0.035, x0, y1, 0, 'xXz');
    b.box('stone', x1, y0, -0.035, x1 + s, y1, 0, 'xXz');
    b.box('stone', x0 - s, y1, -0.035, x1 + s, y1 + s, 0, 'xXyYz');
  }
  if (p.shutters) {
    const sw = (x1 - x0) / 2, so = { tint: p.shutterTint };
    b.box('wood', x0 - sw - 0.02, y0, -0.06, x0 - 0.02, y1, -0.02, 'xXyYz', so);
    b.box('wood', x1 + 0.02, y0, -0.06, x1 + sw + 0.02, y1, -0.02, 'xXyYz', so);
    for (const x of [x0 - sw / 2 - 0.02, x1 + sw / 2 + 0.02])
      for (let y = y0 + 0.12; y < y1 - 0.1; y += 0.16) b.rect('wood', x - sw * 0.38, y, x + sw * 0.38, y + 0.03, -0.061, { tint: p.shutterTint, shade: 0.6 });
  }
  if (p.flowers) {
    b.box('wood', x0 - 0.05, y0 - 0.02, -0.32, x1 + 0.05, y0 + 0.2, -0.08, 'xXyYz', { tint: [0.4, 0.28, 0.2] });
    const fo = { tint: p.flowers };
    for (let x = x0; x < x1 - 0.1; x += 0.22) b.box('wood', x, y0 + 0.2, -0.3, x + 0.2, y0 + 0.38, -0.1, 'xXYz', fo);
  }
  if (p.ground) {
    plinth(b, [[0, W]], 'stone');
    if (p.bars) {
      for (let x = x0 + 0.12; x < x1 - 0.06; x += 0.14) b.box('metal', x - 0.012, y0, 0.05, x + 0.012, y1, 0.074, 'xXz');
      b.box('metal', x0, y0 + 0.25, 0.05, x1, y0 + 0.28, 0.074, 'yYz');
      b.box('metal', x0, y1 - 0.28, 0.05, x1, y1 - 0.25, 0.074, 'yYz');
    }
  }
  return { x0, x1, y0, y1 };
}

export const M = {
  // 1. Gładka ściana (tynk albo cegła)
  wall(b, W, H, D, p) {
    b.grid(p.ground ? p.groundMat : p.wallMat, 0, 0, W, H, 0, Math.max(1, Math.round(W / 2)), Math.max(1, Math.round(H / 2)));
    if (p.ground) plinth(b, [[0, W]]);
  },

  // 2. Boniowanie parteru — poziome pasy z fugami
  rustic(b, W, H, D, p) {
    const rows = Math.max(3, Math.round((H - 0.5) / 0.55));
    const rh = (H - 0.5) / rows, gm = p.groundMat;
    for (let r = 0; r < rows; r++) {
      const ya = 0.5 + r * rh, yb = ya + rh - 0.04;
      b.rect(gm, 0, ya, W, yb, -0.035);
      b.rectY(gm, yb, 0, -0.035, W, 0, 1, { shade: 1.05 });
      b.rectY(gm, ya, 0, -0.035, W, 0, -1, { shade: 0.6 });
      b.rect(gm, 0, yb, W, ya + rh, 0, { shade: 0.55 });
    }
    b.rectX(gm, 0, -0.035, 0.5, 0, H, -1, { shade: 0.8 });
    b.rectX(gm, W, -0.035, 0.5, 0, H, 1, { shade: 0.8 });
    plinth(b, [[0, W]]);
  },

  // 3. Okno (ościeża, rama ze szprosami, parapet, opaska)
  window(b, W, H, D, p) {
    windowCore(b, W, H, p);
  },

  // 4. Okno ozdobne — naczółek trójkątny lub gzyms nadokienny + płycina
  ornate(b, W, H, D, p) {
    const { x0, x1, y0, y1 } = windowCore(b, W, H, p);
    const cx = (x0 + x1) / 2;
    if (p.variant === 0) {
      const base = y1 + 0.16, bx0 = x0 - 0.26, bx1 = x1 + 0.26;
      const apex = Math.min(base + 0.42, H - 0.04), z = -0.12;
      b.poly('stone', [[bx0, base, z], [bx1, base, z], [cx, apex, z]], [0, 0, -1]);
      b.poly('stone', [[bx0, base, z], [cx, apex, z], [cx, apex, 0], [bx0, base, 0]], [-(apex - base), cx - bx0, 0]);
      b.poly('stone', [[cx, apex, z], [bx1, base, z], [bx1, base, 0], [cx, apex, 0]], [apex - base, bx1 - cx, 0]);
      b.rectY('stone', base, bx0, z, bx1, 0, -1, { shade: 0.7 });
    } else {
      const hy = Math.min(y1 + 0.32, H - 0.02);
      b.box('stone', x0 - 0.3, y1 + 0.14, -0.17, x1 + 0.3, hy, 0, 'xXyYz');
      b.box('stone', x0 - 0.27, y1 - 0.22, -0.12, x0 - 0.14, y1 + 0.14, 0, 'xXyz');
      b.box('stone', x1 + 0.14, y1 - 0.22, -0.12, x1 + 0.27, y1 + 0.14, 0, 'xXyz');
    }
    if (y0 > 0.75) b.box('stone', x0, Math.max(0.1, y0 - 0.62), -0.03, x1, y0 - 0.12, 0, 'xXyYz');
    b.box('stone', cx - 0.11, y1 - 0.02, -0.07, cx + 0.11, y1 + 0.2, 0, 'xXYz');
  },

  // 5. Balkon — drzwi balkonowe, płyta, wsporniki, balustrada
  balcony(b, W, H, D, p) {
    const ow = clamp(W * 0.36, 0.9, 1.3);
    const x0 = (W - ow) / 2, x1 = x0 + ow, y0 = 0.05, y1 = Math.min(H - 0.35, 2.55);
    b.wallHole(p.wallMat, W, H, x0, y0, x1, y1, 0.24);
    b.rect('wood', x0, y0, x1, y0 + 0.9, 0.21, { tint: p.frameTint });
    glassFrame(b, x0, y0 + 0.9, x1, y1, 0.18, p);
    const sx0 = Math.max(0.05, x0 - 0.75), sx1 = Math.min(W - 0.05, x1 + 0.75), sz = -1.05;
    b.box('stone', sx0, -0.18, sz, sx1, 0.02, 0, 'xXyYz');
    for (const x of [sx0 + 0.15, sx1 - 0.3]) b.box('stone', x, -0.6, -0.75, x + 0.15, -0.18, 0, 'xXyz', { shade: 0.85 });
    const rt = 1.0, mo = { tint: p.metalTint };
    b.box('metal', sx0, rt - 0.04, sz, sx1, rt, sz + 0.05, 'xXyYzZ', mo);
    b.box('metal', sx0, rt - 0.04, sz, sx0 + 0.05, rt, 0, 'xXYz', mo);
    b.box('metal', sx1 - 0.05, rt - 0.04, sz, sx1, rt, 0, 'xXYz', mo);
    b.box('metal', sx0, 0.1, sz, sx1, 0.13, sz + 0.03, 'yYzZ', mo);
    for (let x = sx0 + 0.1; x < sx1 - 0.05; x += 0.15) b.box('metal', x, 0.02, sz + 0.01, x + 0.018, rt - 0.04, sz + 0.03, 'xXzZ', mo);
    for (let z = sz + 0.15; z < -0.05; z += 0.15) {
      b.box('metal', sx0 + 0.01, 0.02, z, sx0 + 0.03, rt - 0.04, z + 0.018, 'xXzZ', mo);
      b.box('metal', sx1 - 0.03, 0.02, z, sx1 - 0.01, rt - 0.04, z + 0.018, 'xXzZ', mo);
    }
  },

  // 6. Okno modernistyczne/brutalistyczne — pas szkła, żebra (Ministerstwo)
  modern(b, W, H, D, p) {
    const x0 = 0.2, x1 = W - 0.2, y0 = Math.min(0.95, H * 0.3), y1 = H - 0.45;
    b.wallHole(p.wallMat, W, H, x0, y0, x1, y1, 0.16);
    b.rect('glass', x0, y0, x1, y1, 0.16, { tint: p.glassTint });
    const n = Math.max(1, Math.round((x1 - x0) / 1.25));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      b.rect('metal', x - 0.035, y0, x + 0.035, y1, 0.14, { tint: p.metalTint });
    }
    b.rect('metal', x0, y0 + (y1 - y0) * 0.75 - 0.03, x1, y0 + (y1 - y0) * 0.75 + 0.03, 0.14, { tint: p.metalTint });
    b.box(p.wallMat, 0, 0, -0.32, 0.14, H, 0, 'xXz');
  },

  // 7. Drzwi wejściowe z portalem i schodkiem
  door(b, W, H, D, p) {
    const ow = Math.min(1.55, W * 0.5), x0 = (W - ow) / 2, x1 = x0 + ow, y0 = 0.3;
    const y1 = Math.min(3.1, H - 0.7), gm = p.groundMat;
    // latarenka obok drzwi
    if (x1 + 0.7 < W) {
      b.box('metal', x1 + 0.45, y1 - 0.35, -0.3, x1 + 0.5, y1 - 0.3, 0, 'yYzZ', { tint: [0.12, 0.12, 0.12] });
      b.box('light', x1 + 0.38, y1 - 0.8, -0.38, x1 + 0.58, y1 - 0.4, -0.18, 'xXyYzZ', { tint: [1, 0.85, 0.55] });
      b.box('metal', x1 + 0.35, y1 - 0.4, -0.41, x1 + 0.61, y1 - 0.34, -0.15, 'xXyYzZ', { tint: [0.12, 0.12, 0.12] });
    }
    b.wallHole(gm, W, H, x0, y0, x1, y1, 0.42);
    b.rect(gm, x0, 0, x1, y0, -0.0);
    const dy = y0 + (y1 - y0) * 0.74, wo = { tint: p.doorTint };
    b.rect('wood', x0, y0, x1, dy, 0.4, wo);
    const cx = (x0 + x1) / 2;
    b.rect('wood', cx - 0.02, y0, cx + 0.02, dy, 0.385, { tint: p.doorTint, shade: 0.6 });
    for (const [a, c] of [[x0 + 0.12, cx - 0.1], [cx + 0.1, x1 - 0.12]]) {
      b.box('wood', a, y0 + 0.25, 0.36, c, y0 + 0.95, 0.4, 'xXyYz', wo);
      b.box('wood', a, y0 + 1.15, 0.36, c, dy - 0.18, 0.4, 'xXyYz', wo);
    }
    glassFrame(b, x0, dy, x1, y1, 0.38, p);
    b.box('stone', x0 - 0.38, 0.3, -0.1, x0, y1 + 0.05, 0, 'xXz');
    b.box('stone', x1, 0.3, -0.1, x1 + 0.38, y1 + 0.05, 0, 'xXz');
    b.box('stone', x0 - 0.52, y1 + 0.05, -0.17, x1 + 0.52, y1 + 0.42, 0, 'xXyYz');
    b.box('stone', x0 - 0.25, 0, -0.5, x1 + 0.25, 0.3, 0.42, 'xXYz', { shade: 0.9 });
    plinth(b, [[0, x0 - 0.38], [x1 + 0.38, W]]);
  },

  // 8. Brama przejazdowa — łuk, tunel przez cały trakt do podwórza
  gate(b, W, H, D, p) {
    const ow = gateWidth(W), r = ow / 2, cx = W / 2;
    const x0 = cx - r, x1 = cx + r;
    const spring = Math.min(2.6, H - 0.3 - r);
    const N = 10, gm = p.groundMat;
    const arc = [];
    for (let i = 0; i <= N; i++) {
      const a = Math.PI - (i / N) * Math.PI;
      arc.push([cx + Math.cos(a) * r, spring + Math.sin(a) * r]);
    }
    for (const [z, face] of [[0, -1], [D, 1]]) {
      const hint = [0, 0, face];
      b.poly(gm, [[0, 0, z], [x0, 0, z], [x0, H, z], [0, H, z]], hint);
      b.poly(gm, [[x1, 0, z], [W, 0, z], [W, H, z], [x1, H, z]], hint);
      for (let i = 0; i < N; i++) {
        const a = arc[i], c = arc[i + 1];
        b.poly(gm, [[a[0], a[1], z], [c[0], c[1], z], [c[0], H, z], [a[0], H, z]], hint);
      }
    }
    const io = { shade: 0.45 };
    b.rectX(gm, x0, 0, 0, D, spring, 1, io);
    b.rectX(gm, x1, 0, 0, D, spring, -1, io);
    for (let i = 0; i < N; i++) {
      const a = arc[i], c = arc[i + 1];
      const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
      b.poly(gm, [[a[0], a[1], 0], [c[0], c[1], 0], [c[0], c[1], D], [a[0], a[1], D]], [cx - mx, spring - my, 0], { shade: 0.35 });
    }
    b.gridY('cobble', 0.1, x0, 0, x1, D, 2, Math.max(1, Math.round(D / 3)), { shade: 0.6, flat: 1 });
    // archiwolta
    const R = r + 0.3;
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI - (i / N) * Math.PI, a1 = Math.PI - ((i + 1) / N) * Math.PI;
      const P = (a, rr) => [cx + Math.cos(a) * rr, spring + Math.sin(a) * rr];
      const p0 = P(a0, r), p1 = P(a1, r), q1 = P(a1, R), q0 = P(a0, R);
      b.poly('stone', [[p0[0], p0[1], -0.06], [p1[0], p1[1], -0.06], [q1[0], q1[1], -0.06], [q0[0], q0[1], -0.06]], [0, 0, -1]);
      b.poly('stone', [[q0[0], q0[1], -0.06], [q1[0], q1[1], -0.06], [q1[0], q1[1], 0], [q0[0], q0[1], 0]], [Math.cos(a0), Math.sin(a0), 0]);
    }
    b.box('stone', cx - 0.16, spring + r - 0.1, -0.12, cx + 0.16, spring + R + 0.08, 0, 'xXyYz');
    b.box('stone', x0 - 0.3, 0, -0.06, x0, spring, 0, 'xXz');
    b.box('stone', x1, 0, -0.06, x1 + 0.3, spring, 0, 'xXz');
    // otwarte skrzydła bramy
    const wo = { tint: p.doorTint, shade: 0.7 };
    b.rectX('wood', x0 + 0.06, 0.5, 0.1, 0.5 + r * 0.95, spring + 0.6, 1, wo);
    b.rectX('wood', x1 - 0.06, 0.5, 0.1, 0.5 + r * 0.95, spring + 0.6, -1, wo);
    plinth(b, [[0, x0 - 0.3], [x1 + 0.3, W]]);
  },

  // 9. Witryna sklepowa — szyba, ciemne wnętrze, szyld
  shop(b, W, H, D, p) {
    const x0 = Math.min(0.35, W * 0.1), x1 = W - x0, y0 = 0.45, y1 = Math.min(H - 1.05, 3.2);
    const gm = p.groundMat, dz = 1.8;
    b.wallHole(gm, W, H, x0, y0, x1, y1, 0.16);
    const io = { shade: 0.5 };
    b.rect('dark', x0, y0, x1, y1, dz, io);
    b.rectX('dark', x0 + 0.001, 0.16, y0, dz, y1, 1, io);
    b.rectX('dark', x1 - 0.001, 0.16, y0, dz, y1, -1, io);
    b.rectY('dark', y0 + 0.001, x0, 0.16, x1, dz, 1, io);
    b.rect('glass', x0, y0, x1, y1, 0.2, { tint: p.shopGlass });
    const n = Math.max(1, Math.round((x1 - x0) / 1.3));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      b.rect('metal', Math.max(x0, x - 0.04), y0, Math.min(x1, x + 0.04), y1, 0.18, { tint: p.metalTint });
    }
    b.rect('metal', x0, y0, x1, y0 + 0.1, 0.18, { tint: p.metalTint });
    // markiza w pasy nad witryną
    if (p.awning) {
      const ay = y1 + 0.12, n = Math.max(2, Math.round((x1 - x0) / 0.45));
      for (let i = 0; i < n; i++) {
        const xa = x0 - 0.1 + ((x1 - x0 + 0.2) * i) / n, xb = x0 - 0.1 + ((x1 - x0 + 0.2) * (i + 1)) / n;
        const ao = { tint: i % 2 ? [0.95, 0.93, 0.88] : p.awning };
        b.poly('paint', [[xa, ay, 0], [xb, ay, 0], [xb, ay - 0.55, -1.25], [xa, ay - 0.55, -1.25]], [0, 1, -0.5], ao);
        b.poly('paint', [[xb, ay, 0], [xa, ay, 0], [xa, ay - 0.55, -1.25], [xb, ay - 0.55, -1.25]], [0, -1, 0.5], { ...ao, shade: 0.6 });
        b.rect('paint', xa, ay - 0.8, xb, ay - 0.55, -1.25, ao);
      }
    }
    const sy0 = y1 + 0.18, sy1 = Math.min(H - 0.15, y1 + 0.78);
    b.box('metal', x0 - 0.1, sy0, -0.12, x1 + 0.1, sy1, 0, 'xXyYz', { tint: p.signTint });
    if (p.sign) {
      const uv = atlasUV(p.sign);
      const m = 0.18, sw = x1 - x0 - 2 * m, sh = sy1 - sy0 - 0.12;
      const tw = Math.min(sw, sh * atlasAspect(p.sign)), cx = (x0 + x1) / 2;
      posterQuad(b, cx - tw / 2, sy0 + 0.06, cx + tw / 2, sy0 + 0.06 + sh, -0.125, uv);
    }
    plinth(b, [[0, x0], [x1, W]]);
  },

  // 10. Gzyms międzykondygnacyjny (kordonowy). Końce zamknięte denkami, początek lekko
  //     wydłużony (zakrywa załamanie ściany w połowie krawędzi czworokąta), wypukły narożnik
  //     dostaje klocek w rogu.
  string(b, W, H, D, p) {
    const x0 = -0.25;
    b.box('stone', x0, 0, -0.13, W, 0.24, 0, 'xXyYz');
    b.box('stone', x0, 0.24, -0.06, W, 0.32, 0, 'xXYz');
    if (p.endKind === 'convex' && p.cornerOwner) {
      b.box('stone', W, 0, -0.13, W + 0.13, 0.24, 0, 'XyYz');
      b.box('stone', W, 0.24, -0.06, W + 0.06, 0.32, 0, 'XYz');
    }
  },

  // 11. Gzyms wieńczący — schodkowy profil, opcjonalne kroksztyny. Denka na końcach i klocek
  //     w wypukłym narożniku (wcześniej gzyms kończył się w powietrzu i było widać przez niego),
  //     rynna skręca w narożniku zamiast urywać się.
  cornice(b, W, H, D, p) {
    const m = p.mat || 'stone', x0 = -0.25, convex = p.endKind === 'convex' && p.cornerOwner;
    if (p.style === 'modern') {
      b.box(m, x0, 0, -0.35, W, H, 0, 'xXyYz');
      if (convex) b.box(m, W, 0, -0.35, W + 0.35, H, 0, 'XyYz');
      return;
    }
    const layers = [[0.1, 0, 0.2], [0.26, 0.2, 0.36], [0.56, 0.36, H]];
    for (const [d, y0, y1] of layers) {
      b.box(m, x0, y0, -d, W, y1, 0, y1 === H ? 'xXyYz' : 'xXyz');
      if (convex) b.box(m, W, y0, -d, W + d, y1, 0, y1 === H ? 'XyYz' : 'Xyz');
    }
    const g = { tint: [0.45, 0.47, 0.48] };
    const tx1 = p.endKind === 'concave' ? W - 0.62 : W;
    b.tube('metal', [x0, H - 0.05, -0.62], [tx1, H - 0.05, -0.62], 0.07, 0.07, 6, g);
    if (convex) {
      b.tube('metal', [W, H - 0.05, -0.62], [W + 0.62, H - 0.05, -0.62], 0.07, 0.07, 6, g);
      b.tube('metal', [W + 0.62, H - 0.05, -0.62], [W + 0.62, H - 0.05, 0], 0.07, 0.07, 6, g);
    }
    if (p.consoles) {
      const n = Math.max(2, Math.round(W / 0.7));
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) * W) / n;
        b.box(m, x - 0.06, 0.05, -0.5, x + 0.06, 0.36, -0.1, 'xXyz', { shade: 0.85 });
      }
    }
  },

  // 12. Lizena / pilaster — pionowy pas na granicy kamienic
  pilaster(b, W, H, D, p) {
    const w = 0.42;
    const [a, c] = p.side === 'R' ? [W - w, W] : [0, w];
    b.box(p.mat || p.wallMat, a, 0, -0.08, c, H, 0, 'xXz');
  },

  // 13. Dach — dwuspadowy / mansardowy / płaski z attyką; szczyty po bokach
  roof(b, W, H, D, p) {
    const rm = 'roof', ro = { tint: p.roofTint };
    const zr = D / 2;
    if (p.type === 'flat') {
      b.gridY('roof', 0.02, 0, 0, W, D, Math.max(1, Math.round(W / 4)), Math.max(1, Math.round(D / 4)), ro);
      const pm = p.wallMat;
      b.box(pm, 0, 0, -0.02, W, 0.9, 0.3, 'yYzZ');
      b.box(pm, 0, 0, D - 0.3, W, 0.9, D + 0.02, 'yYzZ');
      return;
    }
    const ov = 0.6, ey = -0.3;
    if (p.type === 'mansard') {
      const hm = H * 0.62, zm = Math.min(D * 0.14, 2.2);
      b.poly(rm, [[0, ey, -ov], [W, ey, -ov], [W, hm, zm], [0, hm, zm]], [0, 1, -1], ro);
      b.poly(rm, [[0, hm, zm], [W, hm, zm], [W, H, zr], [0, H, zr]], [0, 1, -0.3], ro);
      b.poly(rm, [[W, ey, D + ov], [0, ey, D + ov], [0, hm, D - zm], [W, hm, D - zm]], [0, 1, 1], ro);
      b.poly(rm, [[W, hm, D - zm], [0, hm, D - zm], [0, H, zr], [W, H, zr]], [0, 1, 0.3], ro);
      for (const [x, dir] of [[0, -1], [W, 1]]) {
        if ((dir < 0 && p.gL === false) || (dir > 0 && p.gR === false)) continue;
        const h = [dir, 0, 0];
        b.poly(p.wallMat, [[x, 0, 0], [x, hm, zm], [x, hm, D - zm], [x, 0, D]], h);
        b.poly(p.wallMat, [[x, hm, zm], [x, H, zr], [x, hm, D - zm]], h);
      }
      // lukarny-świetliki na stromej połaci
      const n = Math.max(1, Math.round(W / 3.6));
      for (let i = 0; i < n; i++) {
        const cx = ((i + 0.5) * W) / n, hw = Math.min(0.45, W / n / 3);
        const ya = ey + (hm - ey) * 0.3, yb = ey + (hm - ey) * 0.75;
        const za = -ov + (zm + ov) * 0.3 - 0.02, zb = -ov + (zm + ov) * 0.75 - 0.02;
        b.poly('glass', [[cx - hw, ya, za], [cx + hw, ya, za], [cx + hw, yb, zb], [cx - hw, yb, zb]], [0, 1, -1], { tint: p.glassTint });
        b.poly('wood', [[cx - hw - 0.07, ya - 0.07, za - 0.01], [cx + hw + 0.07, ya - 0.07, za - 0.01], [cx + hw + 0.07, ya, za - 0.005], [cx - hw - 0.07, ya, za - 0.005]], [0, 1, -1], { tint: p.frameTint });
      }
    } else {
      b.poly(rm, [[0, ey, -ov], [W, ey, -ov], [W, H, zr], [0, H, zr]], [0, 1, -1], ro);
      b.poly(rm, [[W, ey, D + ov], [0, ey, D + ov], [0, H, zr], [W, H, zr]], [0, 1, 1], ro);
      if (p.gL !== false) b.poly(p.wallMat, [[0, 0, 0], [0, H, zr], [0, 0, D]], [-1, 0, 0]);
      if (p.gR !== false) b.poly(p.wallMat, [[W, 0, 0], [W, 0, D], [W, H, zr]], [1, 0, 0]);
    }
    if (p.chimneys) {
      for (const [x, z] of p.chimneys) M.chimney(b, x * W, z * D, H * 0.55, H + 1.3, p);
    }
  },

  // 14. Komin (wywoływany przez dach, ale to osobny segment)
  chimney(b, x, z, y0, y1, p) {
    const hx = 0.42, hz = 0.32;
    b.box('brick', x - hx, y0, z - hz, x + hx, y1, z + hz, 'xXzZ', { tint: p.chimneyTint });
    b.box('stone', x - hx - 0.06, y1, z - hz - 0.06, x + hx + 0.06, y1 + 0.12, z + hz + 0.06, 'xXyYzZ', { shade: 0.7 });
    b.rectY('dark', y1 + 0.121, x - hx + 0.1, z - hz + 0.1, x + hx - 0.1, z + hz - 0.1, 1);
  },

  // 15. Ściana szczytowa (ogniowa) — odsłonięty mur nad niższym sąsiadem
  firewall(b, W, H, D, p) {
    const x = p.side === 'R' ? W : 0, dir = p.side === 'R' ? 1 : -1;
    b.gridX(p.mat || 'brick', x, 0, 0, D, H, Math.max(1, Math.round(D / 3)), Math.max(1, Math.round(H / 3)), dir, { tint: p.tint });
    if (p.poster && H > 7 && D > 6) {
      const pw = Math.min(D * 0.55, 6), ph = pw * 1.9;
      const zc = D * 0.45, y0 = Math.max(0.5, H - ph - 1.2);
      const z0 = zc - pw / 2, z1 = zc + pw / 2;
      const uv = atlasUV(p.posterName || 'bb0');
      // kolejność narożników tak, by obraz nie był lustrzany (patrząc z zewnątrz)
      const za = dir < 0 ? z1 : z0, zb = dir < 0 ? z0 : z1;
      const xp = x + dir * 0.02;
      const mirror = b.cage.sign > 0;
      const u = mirror ? [uv[1], uv[0], uv[3], uv[2]] : uv;
      b.poly('poster', [[xp, y0, za], [xp, y0, zb], [xp, y0 + ph, zb], [xp, y0 + ph, za]], [dir, 0, 0], { uv: u });
    }
  },

  // 16. Chodnik — płyty betonowe
  sidewalk(b, W, H, D, p) {
    b.gridY(p.mat || 'slab', H, 0, 0, W, D, Math.max(1, Math.round(W / 2.5)), Math.max(1, Math.round(D / 2.5)), p.o);
  },

  // 17. Krawężnik granitowy z fazą
  curb(b, W, H, D, p) {
    const n = Math.max(1, Math.round(W / 3));
    for (let i = 0; i < n; i++) {
      const a = (i * W) / n, c = ((i + 1) * W) / n;
      b.rectY('curb', H, a, 0.04, c, D, 1);
      b.poly('curb', [[a, H - 0.04, 0], [c, H - 0.04, 0], [c, H, 0.04], [a, H, 0.04]], [0, 1, -1]);
      b.rect('curb', a, -0.05, c, H - 0.04, 0, { shade: 0.85 });
      b.rect('dark', c - 0.006, -0.05, c + 0.006, H, -0.002, { shade: 0.5 });
    }
  },

  // 18. Bruk (kocie łby) — nawierzchnia jezdni
  cobble(b, W, H, D, p) {
    const s = p.step || 4;
    b.gridY(p.mat || 'cobble', 0, 0, 0, W, D, Math.max(1, Math.round(W / s)), Math.max(1, Math.round(D / s)), p.o);
  },

  // 19. Latarnia uliczna (ramię w stronę jezdni = -z)
  lamp(b, W, H, D, p) {
    const cx = W / 2, cz = D / 2, mo = { tint: p.metalTint };
    b.cyl('metal', cx, cz, 0, 0.55, 0.17, 0.12, 8, mo);
    b.cyl('metal', cx, cz, 0.55, 0.65, 0.12, 0.08, 8, mo);
    b.cyl('metal', cx, cz, 0.65, 5.5, 0.075, 0.05, 8, mo);
    b.cyl('metal', cx, cz, 5.5, 5.62, 0.07, 0.0, 8, mo);
    b.box('metal', cx - 0.03, 5.32, cz - 1.15, cx + 0.03, 5.38, cz, 'xXyYzZ', mo);
    b.box('metal', cx - 0.02, 5.0, cz - 0.35, cx + 0.02, 5.33, cz - 0.3, 'xXzZ', mo);
    const lz = cz - 1.1;
    b.cyl('metal', cx, lz, 5.05, 5.32, 0.3, 0.05, 10, mo, 'y');
    b.cyl('light', cx, lz, 4.95, 5.06, 0.1, 0.13, 8, {}, 'y');
  },

  // 20. Teleekran — zawsze patrzy
  telescreen(b, W, H, D, p) {
    const sw = Math.min(1.9, W * 0.58), sh = sw * 0.62;
    const cx = W / 2, cy = p.y ?? Math.min(H - sh / 2 - 0.4, 2.7);
    const x0 = cx - sw / 2, x1 = cx + sw / 2, y0 = cy - sh / 2, y1 = cy + sh / 2;
    b.box('metal', x0 - 0.09, y0 - 0.09, -0.16, x1 + 0.09, y1 + 0.09, 0, 'xXyYz', { tint: [0.16, 0.17, 0.17] });
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const mirror = b.cage.sign > 0;
    b.rect('screen', x0, y0, x1, y1, -0.165, { uv: mirror ? [uv[1], uv[0], uv[3], uv[2]] : uv });
  },

  // 21. Plakat (Wielki Brat, hasła Partii)
  poster(b, W, H, D, p) {
    const uv = atlasUV(p.name || 'bb0');
    const pw = p.w ?? Math.min(W * 0.6, 1.2), ph = p.h ?? pw * 1.95;
    const cx = W / 2, y0 = p.y ?? 0.9;
    posterQuad(b, cx - pw / 2, y0, cx + pw / 2, y0 + ph, p.z ?? -0.012, uv);
  },
};

function posterQuad(b, x0, y0, x1, y1, z, uv) {
  const mirror = b.cage.sign > 0;
  b.rect('poster', x0, y0, x1, y1, z, { uv: mirror ? [uv[1], uv[0], uv[3], uv[2]] : uv });
}

// ── miasteczko: mosty, nabrzeża, zieleń ─────────────────────────────────────
Object.assign(M, {
  // 22. Segment mostu 5 m (x = wzdłuż mostu, z = w poprzek). Każdy segment ma własny łuk
  //     z półfilarami po 0,5 m przy krawędziach, więc dwa segmenty stykają się w pełnym
  //     filarze; ciągła jezdnia, chodniki, gzyms, balustrada bez szwów na styku.
  //     p.solid = oparcie na lądzie (bez łuku), p.first/p.last = słupy końcowe,
  //     p.sw = szerokość chodnika (m).
  bridgeseg(b, W, H, D, p) {
    const so = { tint: [0.72, 0.7, 0.66] }, ao = { tint: [0.62, 0.6, 0.56] };
    const cx = W / 2, rx = Math.min(2.0, W / 2 - 0.5), ys = H * 0.2, ry = Math.min(H * 0.62, 2.35), N = 10;
    const arc = [];
    for (let i = 0; i <= N; i++) {
      const a = Math.PI - (i / N) * Math.PI;
      arc.push([cx + Math.cos(a) * rx, ys + Math.sin(a) * ry]);
    }
    for (const [z, f] of [[0, -1], [D, 1]]) {
      const h = [0, 0, f];
      if (p.solid) {
        const ny = Math.max(1, Math.round(H / 1.2));
        for (let j = 0; j < ny; j++) (f < 0 ? b.rect : b.rectBack).call(b, 'stone', 0, (H * j) / ny, W, (H * (j + 1)) / ny, z, so);
        continue;
      }
      b.poly('stone', [[0, 0, z], [cx - rx, 0, z], [cx - rx, H, z], [0, H, z]], h, so);
      b.poly('stone', [[cx + rx, 0, z], [W, 0, z], [W, H, z], [cx + rx, H, z]], h, so);
      for (let i = 0; i < N; i++) {
        const a = arc[i], c = arc[i + 1];
        b.poly('stone', [[a[0], a[1], z], [c[0], c[1], z], [c[0], H, z], [a[0], H, z]], h, so);
      }
      // archiwolta z klińcami
      for (let i = 0; i < N; i++) {
        const a0 = Math.PI - (i / N) * Math.PI, a1 = Math.PI - ((i + 1) / N) * Math.PI;
        const P = (a, k) => [cx + Math.cos(a) * rx * k, ys + Math.sin(a) * ry * k];
        const p0 = P(a0, 1), p1 = P(a1, 1), q1 = P(a1, 1.14), q0 = P(a0, 1.14), zz = z + f * 0.08;
        b.poly('stone', [[p0[0], p0[1], zz], [p1[0], p1[1], zz], [q1[0], q1[1], zz], [q0[0], q0[1], zz]], h, { tint: i % 2 ? [0.6, 0.58, 0.54] : [0.66, 0.64, 0.6] });
      }
    }
    // gzyms pod balustradą (ciągły, przez cały segment)
    b.box('stone', 0, H - 0.35, -0.25, W, H - 0.1, 0, 'yYz', so);
    b.box('stone', 0, H - 0.35, D, W, H - 0.1, D + 0.25, 'yYZ', so);
    if (!p.solid) {
      b.rectX('stone', cx - rx, 0, 0, D, ys, 1, { ...so, shade: 0.5 });
      b.rectX('stone', cx + rx, 0, 0, D, ys, -1, { ...so, shade: 0.5 });
      for (let i = 0; i < N; i++) {
        const a = arc[i], c = arc[i + 1], mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
        b.poly('stone', [[a[0], a[1], 0], [c[0], c[1], 0], [c[0], c[1], D], [a[0], a[1], D]], [cx - mx, ys - my, 0], { ...so, shade: 0.4 });
      }
    }
    if (p.rail) {
      // most kolejowy: podsypka, podkłady, szyny na poziomie toru (jak moduł rail) i dźwigary z blachy
      const c = D / 2, gv = { tint: [0.62, 0.6, 0.58] }, tie = { tint: [0.32, 0.25, 0.2] }, steel = { tint: [0.3, 0.32, 0.31] };
      b.box('stone', 0, H - 0.12, 0, W, H, D, 'yY', so);
      b.poly('gravel', [[0, H + 0.35, c - 1.5], [W, H + 0.35, c - 1.5], [W, H + 0.35, c + 1.5], [0, H + 0.35, c + 1.5]], [0, 1, 0], gv);
      b.poly('gravel', [[0, H, c - 2.1], [W, H, c - 2.1], [W, H + 0.35, c - 1.5], [0, H + 0.35, c - 1.5]], [0, 1, -1], gv);
      b.poly('gravel', [[W, H, c + 2.1], [0, H, c + 2.1], [0, H + 0.35, c + 1.5], [W, H + 0.35, c + 1.5]], [0, 1, 1], gv);
      const nt = Math.max(1, Math.round(W / 0.65));
      for (let i = 0; i < nt; i++) { const x = ((i + 0.5) * W) / nt; b.box('wood', x - 0.12, H + 0.35, c - 1.25, x + 0.12, H + 0.5, c + 1.25, 'xXYzZ', tie); }
      for (const z of [c - 0.72, c + 0.72]) b.box('metal', 0, H + 0.5, z - 0.035, W, H + 0.66, z + 0.035, 'YzZ', { tint: [0.55, 0.52, 0.5] });
      for (const [za, zb, f] of [[0, 0.22, -1], [D - 0.22, D, 1]]) {
        b.box('metal', 0, H - 0.3, za, W, H + 1.1, zb, 'xXYzZ', steel);
        b.box('metal', 0, H + 1.1, za - 0.08, W, H + 1.2, zb + 0.08, 'xXyYzZ', steel);
        for (let i = 0; i < 6; i++) { const x = ((i + 0.5) * W) / 6; b.rect('dark', x - 0.18, H + 0.15, x + 0.18, H + 0.85, f < 0 ? za - 0.01 : zb + 0.01, { shade: 0.5 }); }
        if (p.first) b.box('metal', 0, H - 0.3, za - 0.04, 0.3, H + 1.3, zb + 0.04, 'xXYzZ', steel);
        if (p.last) b.box('metal', W - 0.3, H - 0.3, za - 0.04, W, H + 1.3, zb + 0.04, 'xXYzZ', steel);
      }
      return;
    }
    // nawierzchnia: jezdnia z brukiem, po bokach chodniki z krawężnikiem
    const sw = p.sw ?? Math.min(2.5, D * 0.22), pw = 0.45;
    b.gridY('cobble', H, 0, sw, W, D - sw, 2, Math.max(1, Math.round((D - 2 * sw) / 2.5)), { flat: 1 });
    for (const [za, zb, fz] of [[pw, sw, 1], [D - sw, D - pw, -1]]) {
      b.rectY('slab', H + 0.15, 0, za, W, zb, 1, { flat: 1 });
      const zc = fz > 0 ? zb : za;
      b.rectX('curb', 0, zc, H, zc, H + 0.15, 1);
      b.poly('curb', [[0, H, zc], [W, H, zc], [W, H + 0.15, zc], [0, H + 0.15, zc]], [0, 0, fz]);
    }
    // balustrada ciągła od końca do końca mostu: cokół, tralki o stałej podziałce (zgranej z
    // długością segmentu, więc na styku nie ma szwu) i pochwyt; słupy tylko na samych końcach
    for (const [za, zb] of [[0, pw], [D - pw, D]]) {
      b.box('stone', 0, H, za, W, H + 0.3, zb, 'yYzZ', so);
      b.box('stone', 0, H + 0.95, za - 0.04, W, H + 1.12, zb + 0.04, 'yYzZ', so);
      const nb = 16;
      for (let i = 0; i < nb; i++) {
        const x = ((i + 0.5) * W) / nb;
        if ((p.first && x < 0.5) || (p.last && x > W - 0.5)) continue;
        b.cyl('stone', x, (za + zb) / 2, H + 0.3, H + 0.95, 0.09, 0.07, 6, so);
      }
      if (p.first) b.box('stone', 0, H, za - 0.1, 0.5, H + 1.3, zb + 0.1, 'xXYzZ', so);
      if (p.last) b.box('stone', W - 0.5, H, za - 0.1, W, H + 1.3, zb + 0.1, 'xXYzZ', so);
    }
  },

  // 23. Nabrzeże — kamienny mur oporowy, kapinos (poręcz to osobny moduł quayrail)
  quay(b, W, H, D, p) {
    const so = { tint: [0.6, 0.6, 0.57] };
    const rows = Math.max(3, Math.round(H / 0.6));
    for (let r = 0; r < rows; r++) {
      const ya = (r * (H - 0.3)) / rows, yb = ((r + 1) * (H - 0.3)) / rows;
      b.rect('stone', 0, ya, W, yb - 0.03, 0, { ...so, shade: 0.75 + 0.2 * (r / rows) });
      b.rect('stone', 0, yb - 0.03, W, yb, 0.02, { ...so, shade: 0.45 });
    }
    b.box('stone', 0, H - 0.3, -0.3, W, H + 0.02, 0.6, 'yYz', so);
  },

  // 23b. Poręcz nabrzeża: jeden przęsło ~2 m, słupki z nasadkami na obu końcach.
  //      Stawiana tylko tam, gdzie nic nie stoi (jezdnia, most, tory) — wcześniej płot
  //      przechodził przez jezdnię i wchodził w balustrady mostów.
  quayrail(b, W, H, D, p) {
    const mo = { tint: [0.15, 0.17, 0.16] };
    for (const x of [0.05, W - 0.05]) {
      b.box('metal', x - 0.045, 0, 0.1, x + 0.045, 1.05, 0.19, 'xXzZ', mo);
      b.box('metal', x - 0.06, 1.05, 0.085, x + 0.06, 1.1, 0.205, 'xXyYzZ', mo);
    }
    b.box('metal', 0, 0.98, 0.08, W, 1.05, 0.2, 'yYzZ', mo);
    b.box('metal', 0, 0.5, 0.12, W, 0.53, 0.16, 'yYzZ', mo);
    const n = Math.max(2, Math.round(W / 0.22));
    for (let i = 1; i < n; i++) {
      const x = (i * W) / n;
      b.box('metal', x - 0.012, 0.53, 0.125, x + 0.012, 0.98, 0.155, 'xXzZ', mo);
    }
  },

  // 25. Płot sztachetowy (front ogródka)
  fence(b, W, H, D, p) {
    const fo = { tint: p.tint };
    const n = Math.max(1, Math.round(W / 2));
    for (let i = 0; i <= n; i++) {
      const x = (i * W) / n;
      b.box('wood', x - 0.05, 0, -0.05, x + 0.05, 1.15, 0.05, 'xXYzZ', fo);
    }
    for (const y of [0.3, 0.8]) b.box('wood', 0, y, 0.05, W, y + 0.07, 0.08, 'yYzZ', fo);
    for (let x = 0.08; x < W - 0.05; x += 0.15) {
      b.rect('wood', x, 0.1, x + 0.08, 0.95, 0.08, fo);
      b.poly('wood', [[x, 0.95, 0.08], [x + 0.08, 0.95, 0.08], [x + 0.04, 1.02, 0.08]], [0, 0, -1], fo);
      b.poly('wood', [[x, 0.1, 0.1], [x + 0.08, 0.1, 0.1], [x + 0.08, 0.95, 0.1], [x, 0.95, 0.1]], [0, 0, 1], { ...fo, shade: 0.8 });
    }
  },

  // 26. Ławka parkowa
  bench(b, W, H, D, p) {
    const wo = { tint: [0.45, 0.3, 0.18] }, mo = { tint: [0.15, 0.16, 0.15] };
    for (const x of [0.15, W - 0.2]) {
      b.box('metal', x, 0, 0.05, x + 0.05, 0.45, 0.5, 'xXzZ', mo);
      b.box('metal', x, 0.45, 0.45, x + 0.05, 0.9, 0.52, 'xXzZ', mo);
    }
    for (let i = 0; i < 4; i++) b.box('wood', 0, 0.42, 0.04 + i * 0.12, W, 0.47, 0.13 + i * 0.12, 'xXyYzZ', wo);
    for (let i = 0; i < 3; i++) b.box('wood', 0, 0.55 + i * 0.12, 0.5, W, 0.64 + i * 0.12, 0.54, 'xXyYzZ', wo);
  },

  // 27. Pomnik — cokół z plakatami i obelisk (jedna zdeformowana kostka)
  monument(b, W, H, D, p) {
    const so = { tint: [0.8, 0.79, 0.76] };
    b.box('stone', 0, 0, 0, W, 0.5, D, 'xXYzZ', so);
    b.box('stone', W * 0.15, 0.5, D * 0.15, W * 0.85, 3, D * 0.85, 'xXYzZ', so);
    const a = W * 0.3, c = W * 0.7, za = D * 0.3, zc = D * 0.7, t = 0.12;
    const top = H - 2;
    b.poly('stone', [[a, 3, za], [c, 3, za], [W / 2 + t, top, D / 2 - t], [W / 2 - t, top, D / 2 - t]], [0, 0.1, -1], so);
    b.poly('stone', [[c, 3, za], [c, 3, zc], [W / 2 + t, top, D / 2 + t], [W / 2 + t, top, D / 2 - t]], [1, 0.1, 0], so);
    b.poly('stone', [[c, 3, zc], [a, 3, zc], [W / 2 - t, top, D / 2 + t], [W / 2 + t, top, D / 2 + t]], [0, 0.1, 1], so);
    b.poly('stone', [[a, 3, zc], [a, 3, za], [W / 2 - t, top, D / 2 - t], [W / 2 - t, top, D / 2 + t]], [-1, 0.1, 0], so);
    b.cyl('light', W / 2, D / 2, top, H, t * 1.2, 0, 4);
    const uv = atlasUV(p.poster || 'bb4');
    const pw = W * 0.5, ph = Math.min(2.2, pw / atlasAspect(p.poster || 'bb4'));
    const x0 = (W - pw) / 2, y0 = 0.6;
    const fl = (q) => (b.cage.sign > 0 ? [q[1], q[0], q[3], q[2]] : q);
    b.rect('poster', x0, y0, x0 + pw, y0 + ph, D * 0.15 - 0.02, { uv: fl(uv) });
    b.rectBack('poster', x0, y0, x0 + pw, y0 + ph, D * 0.85 + 0.02, { uv: fl([uv[1], uv[0], uv[3], uv[2]]) });
  },
});

Object.assign(M, {
  // 28. Okap domu — deska czołowa + wysunięty pas dachu. W wypukłym narożniku dwa pasy
  //     schodzą się w „czapkę”: dwa trójkąty połaci, dwa podsufitki i narożny słupek deski
  //     (wcześniej tam była dziura i było widać przez okap). Rynna skręca o 90°.
  eave(b, W, H, D, p) {
    const ro = { tint: p.roofTint }, x0 = -0.25, wood = { tint: [0.5, 0.4, 0.3], shade: 0.6 };
    const convex = p.endKind === 'convex' && p.cornerOwner;
    b.box('wood', x0, 0, -0.05, W, H, 0, 'xXyz', { tint: [0.85, 0.82, 0.76] });
    b.poly('roof', [[x0, H, 0.3], [W, H, 0.3], [W, H - 0.32, -0.55], [x0, H - 0.32, -0.55]], [0, 1, -0.4], ro);
    b.poly('wood', [[x0, H - 0.34, -0.55], [W, H - 0.34, -0.55], [W, H - 0.02, 0.3], [x0, H - 0.02, 0.3]], [0, -1, 0.4], wood);
    const g = { tint: [0.45, 0.47, 0.48] };
    const tx1 = p.endKind === 'concave' ? W - 0.62 : W;
    b.tube('metal', [x0, H - 0.4, -0.62], [tx1, H - 0.4, -0.62], 0.075, 0.075, 6, g);
    if (convex) {
      // połać: y = H − 0,3765·(0,3 − z) wzdłuż ściany A i y = H − 0,3765·(0,3 + x − W) wzdłuż B
      const yw = H - 0.113, yo = H - 0.32;
      const P0 = [W, yw, 0], P1 = [W + 0.55, yo, 0], P2 = [W + 0.55, yo, -0.55], P3 = [W, yo, -0.55];
      b.poly('roof', [P0, P1, P2], [0.4, 1, 0], ro);
      b.poly('roof', [P0, P2, P3], [0, 1, -0.4], ro);
      const dn = (q) => [q[0], q[1] - 0.02, q[2]];
      b.poly('wood', [dn(P0), dn(P1), dn(P2)], [0, -1, 0], wood);
      b.poly('wood', [dn(P0), dn(P2), dn(P3)], [0, -1, 0], wood);
      b.box('wood', W, 0, -0.05, W + 0.05, H, 0, 'XYz', { tint: [0.85, 0.82, 0.76] });
      b.tube('metal', [W, H - 0.4, -0.62], [W + 0.62, H - 0.4, -0.62], 0.075, 0.075, 6, g);
      b.tube('metal', [W + 0.62, H - 0.4, -0.62], [W + 0.62, H - 0.4, 0], 0.075, 0.075, 6, g);
    }
  },

  // 29. Billboard Partii — rama, plakat z dwóch stron, słupy
  billboard(b, W, H, D, p) {
    const mo = { tint: [0.14, 0.15, 0.14] };
    const y0 = p.posts ? 3.2 : 0.6, y1 = H;
    if (p.posts) for (const x of [W * 0.2, W * 0.8]) b.box('metal', x - 0.15, 0, D / 2 - 0.15, x + 0.15, y0, D / 2 + 0.15, 'xXzZ', mo);
    else b.box('metal', 0, 0, D / 2 - 0.3, W, y0, D / 2 + 0.3, 'xXYzZ', mo);
    b.box('metal', -0.15, y0 - 0.15, D / 2 - 0.12, W + 0.15, y1 + 0.15, D / 2 + 0.12, 'xXyYzZ', mo);
    const uv = atlasUV(p.name);
    const fl = (q) => [q[1], q[0], q[3], q[2]];
    const m = b.cage.sign > 0;
    b.rect('poster', 0, y0, W, y1, D / 2 - 0.13, { uv: m ? fl(uv) : uv });
    b.rectBack('poster', 0, y0, W, y1, D / 2 + 0.13, { uv: m ? uv : fl(uv) });
  },
});

// ── natura i miasto: drzewa, auta, ludzie, mała architektura, tory, estakada ─
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

Object.assign(M, {
  // 24. Drzewo generowane rekurencyjnie (L-system: pień → gałęzie → kępy liści).
  //     Gatunki: dąb (szeroka, gęsta korona), brzoza (biały pień, jasna owalna korona),
  //     topola (kolumnowa), sosna (piętra gałęzi). Każde drzewo z własnego seeda.
  tree(b, W, H, D, p) {
    const r = new Rng(p.seed || 7);
    const sp = p.species || 'oak';
    const cx = W / 2, cz = D / 2;
    const bark = { tint: sp === 'birch' ? [0.88, 0.86, 0.8] : sp === 'pine' ? [0.42, 0.3, 0.22] : [0.4, 0.33, 0.26] };
    const leafT = p.leaf;
    const clump = (c, R, sq = r.float(0.75, 0.95)) => cubeSphere(b, 'leaf', c, [R, R * sq, R], 2, { tint: leafT.map((x) => x * r.float(0.86, 1.14)) });
    if (sp === 'pine') {
      b.tube('bark', [cx, 0, cz], [cx, H * 0.95, cz], 0.022 * H, 0.008 * H, 7, bark);
      const layers = r.int(4, 6);
      for (let i = 0; i < layers; i++) {
        const y0 = H * (0.22 + (0.7 * i) / layers), rr = W * 0.42 * (1 - i / (layers + 0.6)) * r.float(0.85, 1.1);
        b.cyl('leaf', cx + r.float(-0.2, 0.2), cz + r.float(-0.2, 0.2), y0, y0 + H * 0.28, rr, 0.05, 9, { tint: leafT }, 'y');
      }
      return;
    }
    if (sp === 'poplar') {
      // krótki pień i wąska kolumnowa korona z kilkunastu kęp ułożonych w pionie
      const lx = r.float(-0.15, 0.15), lz = r.float(-0.15, 0.15);
      b.tube('bark', [cx, -0.2, cz], [cx + lx, H * 0.3, cz + lz], 0.032 * H, 0.02 * H, 7, bark);
      const n = 14;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), rad = W * 0.36 * (0.5 + 0.5 * Math.sin(Math.PI * Math.pow(t, 0.75)));
        const a = r.float(0, Math.PI * 2);
        clump([cx + lx * t + Math.cos(a) * rad * 0.4, H * (0.2 + 0.78 * t), cz + lz * t + Math.sin(a) * rad * 0.4], Math.max(0.5, rad * 0.9), r.float(1.0, 1.3));
      }
      return;
    }
    const spreadK = sp === 'birch' ? 0.85 : 1.15;
    const tips = [];
    const branch = (p0, dir, len, rad, depth) => {
      // lekko krzywy odcinek z dwóch kawałków
      const mid = [p0[0] + dir[0] * len * 0.5 + r.float(-0.08, 0.08) * len, p0[1] + dir[1] * len * 0.5, p0[2] + dir[2] * len * 0.5 + r.float(-0.08, 0.08) * len];
      const p1 = [p0[0] + dir[0] * len, p0[1] + dir[1] * len, p0[2] + dir[2] * len];
      b.tube('bark', p0, mid, rad, rad * 0.85, depth > 1 ? 7 : 5, bark);
      b.tube('bark', mid, p1, rad * 0.85, rad * 0.68, depth > 1 ? 7 : 5, bark);
      if (depth === 0 || len < 0.9) {
        const R = Math.max(0.8, len * spreadK) * r.float(0.9, 1.3);
        clump(p1, R);
        tips.push([p1, R]);
        // kępa-towarzyszka dopełnia koronę (dąb gęstszy, brzoza lżejsza)
        if (sp === 'oak' && r.chance(0.55)) clump([p1[0] + r.float(-0.7, 0.7) * R, p1[1] + R * 0.3, p1[2] + r.float(-0.7, 0.7) * R], R * 0.78);
        return;
      }
      const n = r.int(2, 3);
      const spread = sp === 'birch' ? 0.5 : 0.95;
      const ph = r.float(0, Math.PI * 2);
      for (let i = 0; i < n; i++) {
        const a = ph + (i / n) * Math.PI * 2 + r.float(-0.4, 0.4);
        const d = norm3([dir[0] + Math.cos(a) * spread, dir[1] + (sp === 'birch' ? r.float(0.45, 1.0) : r.float(0.2, 0.65)), dir[2] + Math.sin(a) * spread]);
        branch(p1, d, len * r.float(0.62, 0.8), rad * 0.62, depth - 1);
      }
      if (r.chance(0.4)) branch(p1, norm3([dir[0] * 0.3, 1, dir[2] * 0.3]), len * 0.7, rad * 0.6, depth - 1);
    };
    const trunk = H * (sp === 'birch' ? 0.27 : 0.27);
    const lean = [r.float(-0.12, 0.12), 1, r.float(-0.12, 0.12)];
    branch([cx, -0.2, cz], norm3(lean), trunk, H * (sp === 'birch' ? 0.018 : 0.03), 3);
    // wypełnienie środka korony — bez prześwitów, przez które widać gołe gałęzie
    if (tips.length > 2) {
      const m = [0, 0, 0];
      let avg = 0;
      for (const [q, R] of tips) { m[0] += q[0] / tips.length; m[1] += q[1] / tips.length; m[2] += q[2] / tips.length; avg += R / tips.length; }
      const fill = sp === 'oak' ? 4 : 2;
      for (let k = 0; k < fill; k++) {
        const [q] = tips[r.int(0, tips.length - 1)], t = r.float(0.3, 0.7);
        clump([q[0] + (m[0] - q[0]) * t, q[1] + (m[1] - q[1]) * t, q[2] + (m[2] - q[2]) * t], avg * 0.85);
      }
    }
  },

  // 30. Krzak — kilka nadmuchanych kęp + szum; kwiaty rozsiane po koronie
  bush(b, W, H, D, p) {
    const r = new Rng(p.seed || 5);
    const n = 3;
    const clumps = [];
    for (let i = 0; i < n; i++) {
      const a = r.float(0, Math.PI * 2), d = i === 0 ? 0 : W * 0.26 * r.float(0.6, 1);
      const R = W * (i === 0 ? 0.42 : 0.3) * r.float(0.9, 1.1);
      const c = [W / 2 + Math.cos(a) * d, H * (i === 0 ? 0.46 : 0.38), D / 2 + Math.sin(a) * d], rad = [R, Math.min(R * 0.9, H * 0.46), R];
      clumps.push([c, rad]);
      cubeSphere(b, 'leaf', c, rad, 2, { tint: p.leaf.map((x) => x * r.float(0.9, 1.1)) });
    }
    if (p.flowers) {
      const [c, rad] = clumps[0];
      for (let i = 0; i < 12; i++) {
        const a = r.float(0, Math.PI * 2), e = r.float(0.1, 1.05), x = Math.cos(a) * Math.cos(e), z = Math.sin(a) * Math.cos(e), y = Math.sin(e);
        const fx = c[0] + x * rad[0] * 0.8, fy = c[1] + y * rad[1] * 0.62, fz = c[2] + z * rad[2] * 0.8;
        b.box('paint', fx - 0.055, fy - 0.055, fz - 0.055, fx + 0.055, fy + 0.055, fz + 0.055, 'xXyYzZ', { tint: p.flowers });
      }
    }
  },

  // 31. Samochód (x = długość, przód przy x = W); p.taxi = taksówka
  car(b, W, H, D, p) {
    const po = { tint: p.color }, mo = { tint: [0.6, 0.6, 0.62] }, go = { tint: [0.25, 0.3, 0.33] };
    b.box('paint', 0.05, 0.32, 0.06, W - 0.05, 0.62, D - 0.06, 'xXyYzZ', po);
    b.box('paint', 0.0, 0.62, 0.04, W, 0.9, D - 0.04, 'xXYzZ', po);
    const c0 = W * 0.3, c1 = W * 0.68, top = 1.42;
    b.box('paint', c0 + 0.12, top - 0.05, 0.2, c1 - 0.1, top, D - 0.2, 'xXYzZ', po);
    // kabina: okna boczne, przednia i tylna szyba (pochyłe)
    b.poly('glass', [[c0, 0.9, 0.12], [c1, 0.9, 0.12], [c1 - 0.1, top - 0.05, 0.2], [c0 + 0.12, top - 0.05, 0.2]], [0, 0.2, -1], go);
    b.poly('glass', [[c1, 0.9, D - 0.12], [c0, 0.9, D - 0.12], [c0 + 0.12, top - 0.05, D - 0.2], [c1 - 0.1, top - 0.05, D - 0.2]], [0, 0.2, 1], go);
    b.poly('glass', [[c1 - 0.1, top - 0.05, 0.2], [c1 - 0.1, top - 0.05, D - 0.2], [c1 + 0.45, 0.9, D - 0.12], [c1 + 0.45, 0.9, 0.12]], [1, 0.8, 0], go);
    b.poly('glass', [[c0 - 0.4, 0.9, D - 0.12], [c0 - 0.4, 0.9, 0.12], [c0 + 0.12, top - 0.05, 0.2], [c0 + 0.12, top - 0.05, D - 0.2]], [-1, 0.8, 0], go);
    // zderzaki i światła
    b.box('metal', W - 0.02, 0.3, 0.1, W + 0.06, 0.42, D - 0.1, 'xXyYzZ', mo);
    b.box('metal', -0.06, 0.3, 0.1, 0.02, 0.42, D - 0.1, 'xXyYzZ', mo);
    b.box('light', W - 0.01, 0.62, 0.18, W + 0.02, 0.76, 0.45, 'X');
    b.box('light', W - 0.01, 0.62, D - 0.45, W + 0.02, 0.76, D - 0.18, 'X');
    b.box('paint', -0.02, 0.62, 0.15, 0.01, 0.74, 0.4, 'x', { tint: [0.8, 0.1, 0.08] });
    b.box('paint', -0.02, 0.62, D - 0.4, 0.01, 0.74, D - 0.15, 'x', { tint: [0.8, 0.1, 0.08] });
    // koła
    for (const x of [W * 0.2, W * 0.8])
      for (const z of [0.12, D - 0.12]) {
        const zo = z < D / 2 ? -0.02 : 0.02;
        b.tube('dark', [x, 0.33, z - 0.13 + zo], [x, 0.33, z + 0.13 + zo], 0.33, 0.33, 10, { tint: [0.1, 0.1, 0.1], caps: 1 });
      }
    if (p.taxi) {
      b.box('light', W * 0.44, top, D * 0.35, W * 0.58, top + 0.22, D * 0.65, 'xXYzZ', { tint: [1, 0.85, 0.3] });
      for (let i = 0; i < 8; i++) {
        const x0 = 0.4 + i * ((W - 0.8) / 8);
        if (i % 2) continue;
        b.rect('dark', x0, 0.66, x0 + (W - 0.8) / 8, 0.76, 0.035, { tint: [0.08, 0.08, 0.08] });
        b.rectBack('dark', x0, 0.66, x0 + (W - 0.8) / 8, 0.76, D - 0.035, { tint: [0.08, 0.08, 0.08] });
      }
    }
  },

  // 32. Człowiek (pasażer / przechodzień) — przód to +z. Buty, nogawki, marynarka z
  //     rękawami i dłońmi, szyja, głowa z nosem, oczami i włosami, opcjonalnie melonik.
  person(b, W, H, D, p) {
    const cx = W / 2, cz = D / 2;
    const pants = { tint: p.pants }, coat = { tint: p.shirt }, skin = { tint: p.skin }, dark = { tint: [0.07, 0.06, 0.06] };
    const hair = { tint: p.hair || [0.16, 0.1, 0.07] };
    for (const s of [-1, 1]) {
      const x = cx + s * 0.095;
      b.box('paint', x - 0.07, 0, cz - 0.09, x + 0.07, 0.09, cz + 0.2, 'xXyYzZ', dark);
      b.tube('paint', [x, 0.08, cz], [x, 0.9, cz], 0.07, 0.095, 8, pants);
    }
    b.box('paint', cx - 0.2, 0.86, cz - 0.11, cx + 0.2, 1.22, cz + 0.11, 'xXyYzZ', pants);
    b.box('paint', cx - 0.205, 0.9, cz - 0.115, cx + 0.205, 0.95, cz + 0.115, 'xXyYzZ', dark);
    b.box('paint', cx - 0.215, 0.95, cz - 0.125, cx + 0.215, 1.28, cz + 0.125, 'xXyYzZ', coat);
    b.box('paint', cx - 0.235, 1.28, cz - 0.12, cx + 0.235, 1.46, cz + 0.12, 'xXYzZ', coat);
    b.box('paint', cx - 0.05, 1.0, cz + 0.124, cx + 0.05, 1.46, cz + 0.13, 'xXyYzZ', { tint: [0.9, 0.88, 0.8] }); // koszula pod klapami
    for (const s of [-1, 1]) {
      const sw = s > 0 ? 0.1 : -0.06;
      b.tube('paint', [cx + s * 0.255, 1.4, cz], [cx + s * 0.27, 0.9, cz + sw], 0.055, 0.045, 7, coat);
      cubeSphere(b, 'paint', [cx + s * 0.27, 0.84, cz + sw], [0.05, 0.06, 0.05], 1, skin);
    }
    b.tube('paint', [cx, 1.44, cz], [cx, 1.56, cz], 0.055, 0.05, 7, skin);
    cubeSphere(b, 'paint', [cx, 1.66, cz], [0.115, 0.14, 0.125], 2, skin);
    b.box('paint', cx - 0.016, 1.62, cz + 0.12, cx + 0.016, 1.67, cz + 0.152, 'xXyYzZ', skin);
    for (const s of [-1, 1]) b.box('paint', cx + s * 0.05 - 0.016, 1.69, cz + 0.115, cx + s * 0.05 + 0.016, 1.71, cz + 0.13, 'xXyYzZ', dark);
    b.box('paint', cx - 0.03, 1.6, cz + 0.115, cx + 0.03, 1.612, cz + 0.128, 'xXyYzZ', { tint: [0.45, 0.2, 0.18] });
    cubeSphere(b, 'paint', [cx, 1.72, cz - 0.025], [0.122, 0.1, 0.125], 2, hair);
    if (p.hat) {
      b.cyl('paint', cx, cz, 1.77, 1.8, 0.2, 0.2, 12, { tint: p.hat }, 'Y');
      b.cyl('paint', cx, cz, 1.79, 1.92, 0.135, 0.1, 12, { tint: p.hat }, 'Y');
    }
  },

  // 33. Kiosk z gazetami: ściany, lada z towarem, pas z szyldem, czterospadowy dach
  kiosk(b, W, H, D, p) {
    const po = { tint: p.color || [0.3, 0.45, 0.35] }, wo = { tint: [0.5, 0.4, 0.3] };
    b.box('paint', 0, 0, 0, W, 2.2, D, 'xXYzZ', po);
    b.box('stone', -0.05, 0, -0.05, W + 0.05, 0.25, D + 0.05, 'xXyYzZ', { shade: 0.8 });
    // okno wystawowe z ramą i ladą
    b.box('wood', 0.2, 0.92, -0.04, W - 0.2, 1.97, 0.02, 'xXyYz', wo);
    b.rect('dark', 0.28, 1.0, W - 0.28, 1.9, -0.045, { shade: 0.6 });
    b.rect('glass', 0.28, 1.0, W - 0.28, 1.9, -0.05, { tint: [0.6, 0.62, 0.55] });
    b.box('wood', 0.15, 0.9, -0.42, W - 0.15, 0.97, 0, 'xXyYz', wo);
    // gazety i czasopisma na ladzie (kolorowe prostokąty za szybą)
    const mags = [[0.85, 0.8, 0.65], [0.7, 0.2, 0.18], [0.25, 0.4, 0.6], [0.9, 0.75, 0.25], [0.45, 0.6, 0.4]];
    const mw = (W - 0.6) / mags.length;
    mags.forEach((c, i) => b.rect('paint', 0.3 + i * mw + 0.03, 1.02, 0.3 + (i + 1) * mw - 0.03, 1.55 + (i % 2) * 0.12, -0.056, { tint: c }));
    // pas z szyldem
    b.box('wood', -0.12, 2.2, -0.16, W + 0.12, 2.8, D + 0.12, 'xXyYzZ', { tint: [0.28, 0.2, 0.15] });
    const uv = atlasUV(p.sign || 'gin'), m = b.cage.sign > 0;
    const sw = W - 0.3, sh = Math.min(0.5, sw / atlasAspect(p.sign || 'gin'));
    b.rect('poster', 0.15, 2.25, W - 0.15, 2.25 + sh, -0.165, { uv: m ? [uv[1], uv[0], uv[3], uv[2]] : uv });
    // dach czterospadowy z okapem
    const ro = { tint: [0.42, 0.18, 0.14] }, ox = 0.3, hy = 3.5;
    const A = [-ox, 2.8, -ox - 0.1], Bq = [W + ox, 2.8, -ox - 0.1], C = [W + ox, 2.8, D + ox], Dq = [-ox, 2.8, D + ox], T = [W / 2, hy, D / 2];
    b.poly('tile', [A, Bq, T], [0, 0.8, -1], ro);
    b.poly('tile', [Bq, C, T], [1, 0.8, 0], ro);
    b.poly('tile', [C, Dq, T], [0, 0.8, 1], ro);
    b.poly('tile', [Dq, A, T], [-1, 0.8, 0], ro);
    b.cyl('metal', W / 2, D / 2, hy, hy + 0.35, 0.05, 0.0, 6, { tint: [0.2, 0.2, 0.2] });
  },

  // 34. Budka telefoniczna: czerwony szkielet, okna ze szprosami, świecący szyld, kopułka
  booth(b, W, H, D, p) {
    const fo = { tint: p.color || [0.75, 0.12, 0.1] }, gl = { tint: [0.72, 0.78, 0.78] };
    const y0 = 0.32, y1 = 2.12, bar = 0.016;
    b.box('paint', -0.02, 0, -0.02, W + 0.02, 0.3, D + 0.02, 'xXyYzZ', fo);
    for (const [x, z] of [[0, 0], [W - 0.08, 0], [0, D - 0.08], [W - 0.08, D - 0.08]]) b.box('paint', x, 0.3, z, x + 0.08, 2.3, z + 0.08, 'xXzZ', fo);
    // szyby z krzyżem szprosów: 3 kolumny × 6 rzędów
    const cols = [W / 3, (2 * W) / 3], rows = [];
    for (let i = 1; i < 6; i++) rows.push(y0 + ((y1 - y0) * i) / 6);
    for (const z of [0.04, D - 0.04]) {
      b.rect('glass', 0.08, y0, W - 0.08, y1, z, { tint: gl.tint });
      b.rectBack('glass', 0.08, y0, W - 0.08, y1, z, { tint: gl.tint });
      for (const x of cols) b.box('paint', x - bar, y0, z - bar, x + bar, y1, z + bar, 'xXzZ', fo);
      for (const y of rows) b.box('paint', 0.08, y - bar, z - bar, W - 0.08, y + bar, z + bar, 'yYzZ', fo);
      b.box('paint', 0.08, y0 - 0.03, z - 0.03, W - 0.08, y0 + 0.03, z + 0.03, 'yYzZ', fo);
      b.box('paint', 0.08, y1 - 0.03, z - 0.03, W - 0.08, y1 + 0.03, z + 0.03, 'yYzZ', fo);
    }
    for (const x of [0.04, W - 0.04]) {
      b.rectX('glass', x, 0.08, y0, D - 0.08, y1, x < W / 2 ? 1 : -1, { tint: gl.tint });
      b.rectX('glass', x, 0.08, y0, D - 0.08, y1, x < W / 2 ? -1 : 1, { tint: gl.tint });
      for (const z of [D / 3, (2 * D) / 3]) b.box('paint', x - bar, y0, z - bar, x + bar, y1, z + bar, 'xXzZ', fo);
      for (const y of rows) b.box('paint', x - bar, y - bar, 0.08, x + bar, y + bar, D - 0.08, 'xXyY', fo);
    }
    // świecący szyld i dach dwustopniowy z kopułką
    b.rect('light', 0.12, 2.14, W - 0.12, 2.28, -0.03, { tint: [1, 0.95, 0.78] });
    b.rectBack('light', 0.12, 2.14, W - 0.12, 2.28, D + 0.03, { tint: [1, 0.95, 0.78] });
    b.box('paint', -0.06, 2.3, -0.06, W + 0.06, 2.46, D + 0.06, 'xXyYzZ', fo);
    b.box('paint', 0.04, 2.46, 0.04, W - 0.04, 2.58, D - 0.04, 'xXyYzZ', fo);
    b.cyl('paint', W / 2, D / 2, 2.58, 2.74, W * 0.32, W * 0.12, 10, fo, 'Y');
    // aparat w środku
    b.box('metal', 0.2, 1.1, D - 0.28, W - 0.2, 1.5, D - 0.12, 'xXyYz', { tint: [0.15, 0.15, 0.15] });
  },

  // 35. Przystanek z wiatą: dach ze spadkiem i rynną, szyby z ramami, ławka, słup z tablicą
  busstop(b, W, H, D, p) {
    const mo = { tint: [0.22, 0.26, 0.28] }, gl = { tint: [0.6, 0.7, 0.72] };
    for (const x of [0.05, W - 0.13]) b.box('metal', x, 0, D - 0.16, x + 0.08, 2.4, D - 0.08, 'xXzZ', mo);
    for (const x of [0.05, W / 2 - 0.04, W - 0.13]) b.box('metal', x, 0.05, D - 0.14, x + 0.08, 2.4, D - 0.1, 'xXzZ', mo);
    b.poly('roof', [[-0.15, 2.45, -0.05], [W + 0.15, 2.45, -0.05], [W + 0.15, 2.62, D], [-0.15, 2.62, D]], [0, 1, 0], { tint: [0.28, 0.32, 0.34] });
    b.box('metal', -0.15, 2.38, -0.08, W + 0.15, 2.46, 0.02, 'xXyYzZ', mo);
    // trzy szyby tylne
    const gw = (W - 0.3) / 3;
    for (let i = 0; i < 3; i++) {
      const x0 = 0.15 + i * gw + 0.02, x1 = 0.15 + (i + 1) * gw - 0.02;
      b.rectBack('glass', x0, 0.3, x1, 2.3, D - 0.12, gl);
      b.rect('glass', x0, 0.3, x1, 2.3, D - 0.13, gl);
      b.box('metal', x0 - 0.02, 0.28, D - 0.14, x1 + 0.02, 0.33, D - 0.1, 'xXyYzZ', mo);
    }
    // ławka z oparciem
    b.box('wood', 0.3, 0.45, D - 0.6, W - 0.3, 0.5, D - 0.2, 'xXyYzZ', { tint: [0.5, 0.36, 0.22] });
    b.box('wood', 0.3, 0.55, D - 0.22, W - 0.3, 0.9, D - 0.18, 'xXyYzZ', { tint: [0.5, 0.36, 0.22] });
    for (const x of [0.4, W - 0.4]) b.box('metal', x - 0.03, 0, D - 0.55, x + 0.03, 0.45, D - 0.25, 'xXzZ', mo);
    // słup z tablicą rozkładu i tarczą
    b.box('metal', W + 0.3, 0, 0.2, W + 0.38, 2.7, 0.28, 'xXzZ', mo);
    b.tube('paint', [W + 0.34, 2.9, 0.18], [W + 0.34, 2.9, 0.32], 0.38, 0.38, 14, { tint: [0.95, 0.8, 0.15], caps: 1 });
    b.rect('dark', W + 0.2, 1.4, W + 0.48, 1.9, 0.17, { shade: 0.6 });
  },

  // 36. Kosz na śmieci: zwężający się korpus, żebra, obręcz, otwór
  bin(b, W, H, D, p) {
    const g = { tint: [0.2, 0.32, 0.22] }, dk = { tint: [0.1, 0.13, 0.11] };
    b.cyl('metal', W / 2, D / 2, 0, 0.07, 0.2, 0.2, 10, dk, 'y');
    b.cyl('metal', W / 2, D / 2, 0.07, 0.85, 0.22, 0.27, 12, g);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      b.box('metal', W / 2 + c * 0.255 - 0.012, 0.12, D / 2 + s * 0.255 - 0.012, W / 2 + c * 0.255 + 0.012, 0.8, D / 2 + s * 0.255 + 0.012, 'xXzZ', dk);
    }
    b.cyl('metal', W / 2, D / 2, 0.42, 0.47, 0.262, 0.262, 12, dk);
    b.cyl('metal', W / 2, D / 2, 0.85, 0.92, 0.3, 0.3, 12, dk, 'Y');
    b.cyl('dark', W / 2, D / 2, 0.915, 0.92, 0.25, 0.25, 12, {}, 'Y');
  },

  // 37. Fontanna
  fountain(b, W, H, D, p) {
    const so = { tint: [0.78, 0.76, 0.72] }, cx = W / 2, cz = D / 2, R = W / 2;
    b.cyl('stone', cx, cz, 0, 0.6, R, R, 20, so);
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const P = (a, r, y) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
      b.poly('stone', [P(a0, R, 0.6), P(a1, R, 0.6), P(a1, R - 0.35, 0.6), P(a0, R - 0.35, 0.6)], [0, 1, 0], so);
      b.poly('stone', [P(a0, R - 0.35, 0.6), P(a1, R - 0.35, 0.6), P(a1, R - 0.35, 0.3), P(a0, R - 0.35, 0.3)], [-Math.cos(a0), 0, -Math.sin(a0)], so);
    }
    b.cyl('water', cx, cz, 0.3, 0.45, R - 0.36, R - 0.36, 20, {}, 'Y');
    b.cyl('stone', cx, cz, 0.45, 2.2, 0.35, 0.25, 10, so);
    b.cyl('stone', cx, cz, 2.2, 2.5, 0.3, 1.3, 14, so, 'Y');
    b.cyl('water', cx, cz, 2.5, 2.52, 1.2, 1.2, 14, {}, 'Y');
    b.cyl('stone', cx, cz, 2.5, 3.6, 0.15, 0.08, 8, so, 'Y');
  },

  // 38. Tory: podsypka, podkłady, szyny; p.bridge = kratownica i filar
  rail(b, W, H, D, p) {
    const c = D / 2;
    if (p.crossing) {
      // przejazd: deski równo z jezdnią (y = 0,45 w kostce), szyny lekko wystają
      b.gridY('wood', 0.47, 0, c - 1.6, W, c + 1.6, Math.max(1, Math.round(W / 0.4)), 1, { tint: [0.36, 0.28, 0.2] });
      for (const z of [c - 0.72, c + 0.72]) b.box('metal', 0, 0.47, z - 0.035, W, 0.5, z + 0.035, 'YzZ', { tint: [0.55, 0.52, 0.5] });
      return;
    }
    b.poly('gravel', [[0, 0.35, c - 1.6], [W, 0.35, c - 1.6], [W, 0.35, c + 1.6], [0, 0.35, c + 1.6]], [0, 1, 0]);
    b.poly('gravel', [[0, -0.5, c - 2.5], [W, -0.5, c - 2.5], [W, 0.35, c - 1.6], [0, 0.35, c - 1.6]], [0, 1, -1]);
    b.poly('gravel', [[W, -0.5, c + 2.5], [0, -0.5, c + 2.5], [0, 0.35, c + 1.6], [W, 0.35, c + 1.6]], [0, 1, 1]);
    const n = Math.max(1, Math.round(W / 0.65));
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * W) / n;
      b.box('wood', x - 0.12, 0.35, c - 1.25, x + 0.12, 0.5, c + 1.25, 'xXYzZ', { tint: [0.32, 0.25, 0.2] });
    }
    for (const z of [c - 0.72, c + 0.72]) {
      b.box('metal', 0, 0.5, z - 0.035, W, 0.66, z + 0.035, 'YzZ', { tint: [0.55, 0.52, 0.5] });
    }
    if (p.bridge) {
      const mo = { tint: [0.3, 0.32, 0.3] };
      for (const z of [c - 2.4, c + 2.2]) {
        b.box('metal', 0, -1.2, z, W, -0.5, z + 0.2, 'yYzZ', mo);
        b.box('metal', 0, 1.6, z, W, 1.8, z + 0.2, 'yYzZ', mo);
        for (let x = 0; x <= W; x += W / 2) b.box('metal', x - 0.1, -0.5, z, x + 0.1, 1.6, z + 0.2, 'xXzZ', mo);
        b.poly('metal', [[0, -0.5, z], [W / 2, 1.6, z], [W / 2 + 0.25, 1.6, z], [0.25, -0.5, z]], [0, 0, -1], mo);
      }
      if (p.pier) b.box('stone', W / 2 - 1, -7, c - 2.6, W / 2 + 1, -1.2, c + 2.6, 'xXzZ', { tint: [0.6, 0.58, 0.55] });
    }
  },

  // 39. Estakada autostrady: płyta, asfalt z pasami, bariery, filary
  viaduct(b, W, H, D, p) {
    const co = { tint: [0.72, 0.71, 0.68] };
    b.box('stone', 0, 0, 0, W, H, D, 'yzZ', co);
    const s0 = p.s0 || 0;
    b.poly('asphalt', [[0, H, 0.6], [W, H, 0.6], [W, H, D - 0.6], [0, H, D - 0.6]], [0, 1, 0], { uv: [[s0 / 12, 0], [(s0 + W) / 12, 0], [(s0 + W) / 12, 1], [s0 / 12, 1]] });
    for (const [za, zb] of [[0, 0.6], [D - 0.6, D]]) {
      b.box('stone', 0, H, za, W, H + 0.95, zb, 'yYzZ', co);
    }
    if (p.pillar) {
      for (const z of [D * 0.3, D * 0.7]) b.cyl('stone', W / 2, z, -p.drop, 0, 0.9, 0.9, 12, co);
      b.box('stone', W / 2 - 1.2, -1.2, 1, W / 2 + 1.2, 0, D - 1, 'xXyzZ', co);
    }
  },

  // 40. Latarnia morska na skale
  lighthouse(b, W, H, D, p) {
    const cx = W / 2, cz = D / 2;
    cubeSphere(b, 'stone', [cx, 0.5, cz], [W * 0.5, 2.5, D * 0.5], 3, { tint: [0.5, 0.48, 0.45] });
    const bands = 6, h0 = 2.5, h1 = H - 6;
    for (let i = 0; i < bands; i++) {
      const y0 = h0 + ((h1 - h0) * i) / bands, y1 = h0 + ((h1 - h0) * (i + 1)) / bands;
      const r0 = 2.6 - 1.0 * (i / bands), r1 = 2.6 - 1.0 * ((i + 1) / bands);
      b.cyl('paint', cx, cz, y0, y1, r0, r1, 16, { tint: i % 2 ? [0.75, 0.12, 0.1] : [0.95, 0.94, 0.9] });
    }
    b.cyl('metal', cx, cz, h1, h1 + 0.3, 2.3, 2.3, 16, { tint: [0.15, 0.15, 0.15] }, 'yY');
    b.cyl('glass', cx, cz, h1 + 0.3, h1 + 3, 1.4, 1.4, 12, { tint: [0.8, 0.85, 0.8] });
    b.cyl('light', cx, cz, h1 + 0.8, h1 + 2.4, 0.6, 0.6, 8);
    b.cyl('paint', cx, cz, h1 + 3, H, 1.6, 0.1, 12, { tint: [0.75, 0.12, 0.1] });
  },

  // 41. Molo na palach (x = w głąb morza)
  pier(b, W, H, D, p) {
    const wo = { tint: [0.5, 0.4, 0.3] };
    const n = Math.max(1, Math.round(W / 0.5));
    for (let i = 0; i < n; i++) b.box('wood', (i * W) / n + 0.02, H - 0.1, 0, ((i + 1) * W) / n - 0.02, H, D, 'xXyYzZ', { tint: [0.52 + (i % 3) * 0.03, 0.42, 0.32] });
    for (let x = 1; x < W; x += 4)
      for (const z of [0.2, D - 0.2]) {
        b.cyl('wood', x, z, 0, H - 0.1, 0.16, 0.16, 6, wo);
        b.box('wood', x - 0.05, H, z - 0.05, x + 0.05, H + 1.0, z + 0.05, 'xXzZ', wo);
      }
    for (const z of [0.2, D - 0.2]) b.box('wood', 0, H + 0.95, z - 0.06, W, H + 1.05, z + 0.06, 'yYzZ', wo);
  },
});

// ── ratusz: wieża z zegarami, latarnią dzwonną i miedzianym hełmem ───────────
Object.assign(M, {
  // 42. Wieża ratusza (kostka W×H×W stoi na dachu ratusza; dolne p.hide m chowa połać dachu)
  townhall(b, W, H, D, p) {
    const hide = p.hide ?? 3.6, cx = W / 2, cz = D / 2;
    const so = { tint: [0.92, 0.88, 0.78] }, ko = { tint: [0.84, 0.8, 0.7], shade: 0.9 }, dk = { tint: [0.08, 0.07, 0.07] };
    const shaftTop = hide + (H - hide) * 0.5, lantTop = shaftTop + (H - hide) * 0.25, roofTop = H - 1.6;
    // cztery ściany drobną siatką: szum materiału liczony jest w wierzchołkach, więc jeden duży
    // prostokąt rozmijał się z zegarami i otworami tuż przed nim (wystawały spod ściany)
    const walls = (x0, y0, z0, x1, y1, z1, o) => {
      const nx = Math.max(1, Math.round((x1 - x0) / 0.8)), nz = Math.max(1, Math.round((z1 - z0) / 0.8)), ny = Math.max(1, Math.round((y1 - y0) / 0.8));
      b.grid('stone', x0, y0, x1, y1, z0, nx, ny, o);
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) b.rectBack('stone', x0 + ((x1 - x0) * i) / nx, y0 + ((y1 - y0) * j) / ny, x0 + ((x1 - x0) * (i + 1)) / nx, y0 + ((y1 - y0) * (j + 1)) / ny, z1, o);
      b.gridX('stone', x0, z0, y0, z1, y1, nz, ny, -1, o);
      b.gridX('stone', x1, z0, y0, z1, y1, nz, ny, 1, o);
    };
    // trzon z narożnymi lizenami
    walls(0.4, 0, 0.4, W - 0.4, shaftTop, D - 0.4, so);
    for (const [x, z] of [[0.28, 0.28], [W - 0.62, 0.28], [0.28, D - 0.62], [W - 0.62, D - 0.62]]) b.box('stone', x, 0, z, x + 0.34, shaftTop, z + 0.34, 'xXyYzZ', ko);
    // ściana wieży (indeks 0–3) → punkt (u w prawo, v w górę, o przed ścianę) i normalna na zewnątrz
    const NRM = [[0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
    const onWall = (f, ins) => (u, v, o) => (f === 0 ? [cx + u, v, ins - o] : f === 1 ? [cx - u, v, D - ins + o] : f === 2 ? [ins - o, v, cz - u] : [W - ins + o, v, cz + u]);
    // zegary: tarcza, obwódka, kreski godzin, wskazówki (inne na każdej ścianie)
    for (let f = 0; f < 4; f++) {
      const F = onWall(f, 0.4), y = hide + (shaftTop - hide) * 0.52, R = Math.min(1.25, W * 0.2), n = 20, off = 0.03, hint = NRM[f];
      const at = (a, r, o) => F(Math.cos(a) * r, y + Math.sin(a) * r, o);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        b.poly('stone', [at(a0, R * 1.22, off * 0.4), at(a1, R * 1.22, off * 0.4), at(a1, R, off * 0.4), at(a0, R, off * 0.4)], hint, { tint: [0.55, 0.5, 0.42] });
        b.poly('paint', [F(0, y, off), at(a0, R, off), at(a1, R, off)], hint, { tint: [0.97, 0.95, 0.88] });
      }
      const bar = (a, r0, r1, w, o) => {
        const q = (r, t) => F(Math.cos(a) * r - Math.sin(a) * t, y + Math.sin(a) * r + Math.cos(a) * t, o);
        b.poly('dark', [q(r0, -w), q(r0, w), q(r1, w), q(r1, -w)], hint, dk);
      };
      for (let h = 0; h < 12; h++) bar((h / 12) * Math.PI * 2, R * (h % 3 === 0 ? 0.74 : 0.84), R * 0.94, h % 3 === 0 ? 0.045 : 0.025, off * 2);
      bar(1.1 + f * 0.4, -R * 0.1, R * 0.52, 0.06, off * 3);
      bar(4.2 + f * 0.9, -R * 0.1, R * 0.8, 0.04, off * 3);
    }
    // gzyms nad trzonem
    b.box('stone', 0.05, shaftTop - 0.05, 0.05, W - 0.05, shaftTop + 0.3, D - 0.05, 'xXyYzZ', ko);
    // latarnia dzwonna: łukowe otwory z ciemnym wnętrzem i ościeżami
    const lw = 0.9;
    walls(lw, shaftTop + 0.3, lw, W - lw, lantTop, D - lw, so);
    const oy0 = shaftTop + 0.8, ow = (W - 2 * lw) * 0.5, oy1 = lantTop - 0.3 - ow * 0.3 - 0.2;
    for (let f = 0; f < 4; f++) {
      const F = onWall(f, lw), hint = NRM[f], e = 0.03;
      const x0 = -ow / 2, x1 = ow / 2;
      b.poly('dark', [F(x0, oy0, e), F(x1, oy0, e), F(x1, oy1, e), F(x0, oy1, e)], hint, dk);
      for (let i = 0; i < 8; i++) {
        const a0 = Math.PI - (i / 8) * Math.PI, a1 = Math.PI - ((i + 1) / 8) * Math.PI;
        b.poly('dark', [F(0, oy1, e), F(Math.cos(a0) * ow / 2, oy1 + Math.sin(a0) * ow * 0.3, e), F(Math.cos(a1) * ow / 2, oy1 + Math.sin(a1) * ow * 0.3, e)], hint, dk);
        b.poly('stone', [F(Math.cos(a0) * ow / 2, oy1 + Math.sin(a0) * ow * 0.3, e * 0.5), F(Math.cos(a1) * ow / 2, oy1 + Math.sin(a1) * ow * 0.3, e * 0.5), F(Math.cos(a1) * (ow / 2 + 0.14), oy1 + Math.sin(a1) * (ow * 0.3 + 0.14), e * 0.5), F(Math.cos(a0) * (ow / 2 + 0.14), oy1 + Math.sin(a0) * (ow * 0.3 + 0.14), e * 0.5)], hint, ko);
      }
      b.poly('stone', [F(x0 - 0.14, oy0, e * 0.5), F(x0, oy0, e * 0.5), F(x0, oy1, e * 0.5), F(x0 - 0.14, oy1, e * 0.5)], hint, ko);
      b.poly('stone', [F(x1, oy0, e * 0.5), F(x1 + 0.14, oy0, e * 0.5), F(x1 + 0.14, oy1, e * 0.5), F(x1, oy1, e * 0.5)], hint, ko);
    }
    b.box('stone', lw - 0.25, lantTop - 0.05, lw - 0.25, W - lw + 0.25, lantTop + 0.28, D - lw + 0.25, 'xXyYzZ', ko);
    // miedziany hełm: czworoboczna piramida z lekkim wybrzuszeniem + iglica z kulą
    const cu = { tint: [0.4, 0.66, 0.56] }, r0 = lw - 0.15, ry = lantTop + 0.28;
    const mid = ry + (roofTop - ry) * 0.42;
    const ring = (y, k) => { const hx = (W / 2 - r0) * k, hz = (D / 2 - r0) * k; return [[cx - hx, y, cz - hz], [cx + hx, y, cz - hz], [cx + hx, y, cz + hz], [cx - hx, y, cz + hz]]; };
    const rA = ring(ry, 1), rB = ring(mid, 0.7), rC = ring(roofTop, 0.05);
    for (const [lo, hi] of [[rA, rB], [rB, rC]])
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        b.poly('roof', [lo[i], lo[j], hi[j], hi[i]], [(lo[i][0] + lo[j][0]) / 2 - cx, 0.8, (lo[i][2] + lo[j][2]) / 2 - cz], cu);
      }
    b.cyl('metal', cx, cz, roofTop - 0.1, H - 0.4, 0.07, 0.04, 6, { tint: [0.85, 0.65, 0.25] });
    cubeSphere(b, 'metal', [cx, H - 0.55, cz], [0.28, 0.28, 0.28], 1, { tint: [0.9, 0.7, 0.28] });
    b.cyl('metal', cx, cz, H - 0.35, H, 0.04, 0.0, 5, { tint: [0.85, 0.65, 0.25] });
  },
});

// sześcian dzielony na siatkę i "nadmuchany" w stronę kuli — reszta kształtu
// pochodzi z szumu materiału 'leaf' (wob), więc każda korona jest inna
function cubeSphere(b, mat, c, R, n, o) {
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const P = (N, U, V, s, t) => {
    const x = N[0] + U[0] * s + V[0] * t, y = N[1] + U[1] * s + V[1] * t, z = N[2] + U[2] * s + V[2] * t;
    const l = Math.hypot(x, y, z), k = 0.35 + 0.65 / l;
    return { p: [c[0] + x * k * R[0], c[1] + y * k * R[1], c[2] + z * k * R[2]], n: [x / l, y / l, z / l] };
  };
  for (const [N, U, V] of faces)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const s0 = -1 + (2 * i) / n, s1 = -1 + (2 * (i + 1)) / n, t0 = -1 + (2 * j) / n, t1 = -1 + (2 * (j + 1)) / n;
        const q = [P(N, U, V, s0, t0), P(N, U, V, s1, t0), P(N, U, V, s1, t1), P(N, U, V, s0, t1)];
        b.poly(mat, q.map((v) => v.p), null, { ...o, nrm: q.map((v) => v.n) });
      }
}

installProps(M, { cubeSphere }); // ~40 nowych rekwizytów (propmods.js)

export function gateWidth(W) {
  return clamp(W * 0.8, 2.6, 3.3);
}

// wozy (oldcar, carwheel) — osobny plik; nadpisują ewentualne stare wersje
Object.assign(M, vehicleModules);

export const MODULE_NAMES = Object.keys(M);
