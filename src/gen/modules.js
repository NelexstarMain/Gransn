// ─────────────────────────────────────────────────────────────────────────────
//  BIBLIOTEKA MODUŁÓW — 21 segmentów, z których składa się całe miasto.
//  Każdy moduł to funkcja (b, W, H, D, p) piszącą w "kostce" komórki:
//    x ∈ [0,W] wzdłuż lica, y ∈ [0,H] w górę, z = głębokość (z<0 na zewnątrz).
//  Moduł nie wie, jak naprawdę wygląda komórka — Cage dopasuje go do trapezu,
//  skosu narożnika, innej wysokości piętra itd. W/H/D służą tylko po to,
//  żeby detale (ramy, parapety) zachowały wymiary w metrach.
// ─────────────────────────────────────────────────────────────────────────────
import { atlasUV } from './atlas.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ── wspólne helpery ─────────────────────────────────────────────────────────
function glassFrame(b, x0, y0, x1, y1, z, p, frameMat = 'wood') {
  const ft = 0.065, h = ft / 2;
  const fo = { tint: p.frameTint };
  b.rect('glass', x0, y0, x1, y1, z + 0.03, { tint: p.glassTint, noLean: false });
  b.rect(frameMat, x0, y0, x0 + ft, y1, z, fo);
  b.rect(frameMat, x1 - ft, y0, x1, y1, z, fo);
  b.rect(frameMat, x0 + ft, y0, x1 - ft, y0 + ft, z, fo);
  b.rect(frameMat, x0 + ft, y1 - ft, x1 - ft, y1, z, fo);
  const ty = y0 + (y1 - y0) * 0.72, cx = (x0 + x1) / 2;
  b.rect(frameMat, cx - h, y0 + ft, cx + h, ty - h, z, fo);
  b.rect(frameMat, x0 + ft, ty - h, x1 - ft, ty + h, z, fo);
  if (x1 - x0 > 1.0) b.rect(frameMat, cx - h * 0.7, ty + h, cx + h * 0.7, y1 - ft, z, fo);
}

function plinth(b, segs, mat = 'stone') {
  for (const [a, c] of segs) if (c - a > 0.02) b.box(mat, a, 0, -0.06, c, 0.5, 0, 'Yz', { shade: 0.8 });
}

function windowCore(b, W, H, p) {
  const ow = clamp(W * 0.4, 0.8, 1.45);
  const oh = clamp(H * 0.5, 1.2, 2.0);
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
    const sy0 = y1 + 0.18, sy1 = Math.min(H - 0.15, y1 + 0.78);
    b.box('metal', x0 - 0.1, sy0, -0.12, x1 + 0.1, sy1, 0, 'xXyYz', { tint: p.signTint });
    if (p.sign) {
      const uv = atlasUV(p.sign);
      const m = 0.18, sw = x1 - x0 - 2 * m, sh = sy1 - sy0 - 0.12;
      const tw = Math.min(sw, sh * 5.12), cx = (x0 + x1) / 2;
      posterQuad(b, cx - tw / 2, sy0 + 0.06, cx + tw / 2, sy0 + 0.06 + sh, -0.125, uv);
    }
    plinth(b, [[0, x0], [x1, W]]);
  },

  // 10. Gzyms międzykondygnacyjny (kordonowy)
  string(b, W, H, D, p) {
    b.box('stone', 0, 0, -0.13, W, 0.24, 0, 'yYz');
    b.box('stone', 0, 0.24, -0.06, W, 0.32, 0, 'Yz');
  },

  // 11. Gzyms wieńczący — schodkowy profil, opcjonalne kroksztyny
  cornice(b, W, H, D, p) {
    const m = p.mat || 'stone';
    if (p.style === 'modern') {
      b.box(m, 0, 0, -0.35, W, H, 0, 'yYz');
      return;
    }
    b.box(m, 0, 0, -0.1, W, 0.2, 0, 'yz');
    b.box(m, 0, 0.2, -0.26, W, 0.36, 0, 'yz');
    b.box(m, 0, 0.36, -0.56, W, H, 0, 'yYz');
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
      b.poly(p.wallMat, [[0, 0, 0], [0, H, zr], [0, 0, D]], [-1, 0, 0]);
      b.poly(p.wallMat, [[W, 0, 0], [W, 0, D], [W, H, zr]], [1, 0, 0]);
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
    b.gridX('brick', x, 0, 0, D, H, Math.max(1, Math.round(D / 3)), Math.max(1, Math.round(H / 3)), dir, { tint: p.tint });
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
    b.gridY('cobble', 0, 0, 0, W, D, Math.max(1, Math.round(W / s)), Math.max(1, Math.round(D / s)), p.o);
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

export function gateWidth(W) {
  return clamp(W * 0.8, 2.6, 3.3);
}

export const MODULE_NAMES = Object.keys(M);
