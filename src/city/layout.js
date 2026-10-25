// Układ miasta — czyste dane (bez geometrii). Generowany deterministycznie
// z seeda zarówno w wątku głównym (kolizje, minimapa), jak i w workerach.
//
// Siatka ulic 14×14 kwartałów po ~90 m z losowo przesuniętymi węzłami
// (≈1.26 × 1.26 km ≈ 1.6 km²). Każdy kwartał to nieregularny czworokąt —
// pierzeja kamienic dookoła i podwórze-studnia w środku. Dzięki cage
// deformation te same moduły pasują do każdego kąta i długości.
import { Rng, hash } from '../core/rng.js';
import { gateWidth } from '../gen/modules.js';

export const N = 14;
export const S = 90;
export const HALF = (N * S) / 2;
export const PLAZA = { i0: 6, i1: 8, j0: 6, j1: 8 };

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Odsunięcie czworokąta do środka o różne odległości na każdej krawędzi.
export function offsetQuad(q, d) {
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
  const cz = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  const lines = [];
  for (let k = 0; k < 4; k++) {
    const a = q[k], b = q[(k + 1) % 4];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    let nx = -dz / l, nz = dx / l;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if ((cx - mx) * nx + (cz - mz) * nz < 0) { nx = -nx; nz = -nz; }
    lines.push({ p: [a[0] + nx * d[k], a[1] + nz * d[k]], d: [dx / l, dz / l] });
  }
  const out = [];
  for (let k = 0; k < 4; k++) {
    const L1 = lines[(k + 3) % 4], L2 = lines[k];
    const den = L1.d[0] * L2.d[1] - L1.d[1] * L2.d[0];
    const t = ((L2.p[0] - L1.p[0]) * L2.d[1] - (L2.p[1] - L1.p[1]) * L2.d[0]) / den;
    out.push([L1.p[0] + L1.d[0] * t, L1.p[1] + L1.d[1] * t]);
  }
  return out;
}

export function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const PALETTE = [
  [0.74, 0.72, 0.66], [0.70, 0.66, 0.56], [0.62, 0.62, 0.58], [0.72, 0.64, 0.52],
  [0.66, 0.68, 0.62], [0.58, 0.56, 0.52], [0.76, 0.70, 0.62], [0.64, 0.58, 0.52],
  [0.55, 0.58, 0.56], [0.70, 0.60, 0.55],
];

function streetSpec(k) {
  // główne aleje: linie 3, 11 oraz obie linie wokół placu Ministerstwa
  const avenue = k === 3 || k === 11 || k === PLAZA.i0 || k === PLAZA.i1;
  return avenue ? { road: 7.5, walk: 4.5, avenue: true } : { road: 4.0, walk: 3.0, avenue: false };
}

export function generateCity(seed = 1984) {
  const rng = new Rng(seed);
  const nodes = [];
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      let x = -HALF + i * S, z = -HALF + j * S;
      if (i > 0 && j > 0 && i < N && j < N) { x += rng.float(-13, 13); z += rng.float(-13, 13); }
      nodes.push([x, z]);
    }
  const node = (i, j) => nodes[j * (N + 1) + i];
  // krawędzie placu muszą być proste
  const { i0, i1, j0, j1 } = PLAZA;
  for (let i = i0 + 1; i < i1; i++) {
    nodes[j0 * (N + 1) + i] = lerp2(node(i0, j0), node(i1, j0), (i - i0) / (i1 - i0));
    nodes[j1 * (N + 1) + i] = lerp2(node(i0, j1), node(i1, j1), (i - i0) / (i1 - i0));
  }
  for (let j = j0 + 1; j < j1; j++) {
    nodes[j * (N + 1) + i0] = lerp2(node(i0, j0), node(i0, j1), (j - j0) / (j1 - j0));
    nodes[j * (N + 1) + i1] = lerp2(node(i1, j0), node(i1, j1), (j - j0) / (j1 - j0));
  }

  const V = [], Hs = [];
  for (let k = 0; k <= N; k++) { V.push(streetSpec(k)); Hs.push(streetSpec(k)); }

  const blocks = [];
  const mkBlock = (quad, specs, kind, gi, gj) => {
    const id = blocks.length;
    const curb = offsetQuad(quad, specs.map((s) => s.road));
    const curbIn = offsetQuad(quad, specs.map((s) => s.road + 0.3));
    const bline = offsetQuad(quad, specs.map((s) => s.road + s.walk));
    const c = [0, 0];
    for (const p of quad) { c[0] += p[0] / 4; c[1] += p[1] / 4; }
    let r = 0;
    for (const p of curb) r = Math.max(r, dist(p, c));
    const blk = { id, kind, gi, gj, quad, specs, curb, curbIn, bline, center: c, radius: r, lots: [], lamps: [], screens: [] };
    blocks.push(blk);
    return blk;
  };

  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      if (i >= i0 && i < i1 && j >= j0 && j < j1) continue;
      const quad = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)];
      const specs = [Hs[j], V[i + 1], Hs[j + 1], V[i]];
      const blk = mkBlock(quad, specs, 'block', i, j);
      fillBlock(blk, new Rng(hash(seed, i, j)));
    }
  const plazaQuad = [node(i0, j0), node(i1, j0), node(i1, j1), node(i0, j1)];
  const plaza = mkBlock(plazaQuad, [Hs[j0], V[i1], Hs[j1], V[i0]], 'plaza', i0, j0);
  fillPlaza(plaza);

  // start: zachodnia krawędź placu, twarzą do Ministerstwa
  const pc = plaza.curbIn;
  const west = lerp2(pc[3], pc[0], 0.5);
  const toC = [plaza.center[0] - west[0], plaza.center[1] - west[1]];
  const tl = Math.hypot(toC[0], toC[1]);
  // po drugiej stronie alei, na chodniku — Ministerstwo wyłania się z mgły
  const sx = west[0] - (toC[0] / tl) * 17.5, sz = west[1] - (toC[1] / tl) * 17.5 + 22;
  const spawn = { x: sx, z: sz, yaw: Math.atan2(-(plaza.center[0] - sx), -(plaza.center[1] - sz)) };

  const screens = blocks.flatMap((b) => b.screens);
  return { seed, blocks, nodes, spawn, screens, size: N * S, half: HALF };
}

// ── działki (kamienice) w kwartale ──────────────────────────────────────────
function fillBlock(blk, rng) {
  const depth = rng.float(11.5, 14);
  blk.court = offsetQuad(blk.bline, [0, 1, 2, 3].map((k) => depth + (blk.specs[k].avenue ? 1.5 : 0)));
  const B = blk.bline, C = blk.court;

  for (let k = 0; k < 4; k++) {
    const avenue = blk.specs[k].avenue;
    const L = dist(B[k], B[(k + 1) % 4]);
    let t = 0;
    while (t < 1 - 1e-6) {
      let w = rng.float(11, 19) / L;
      if (1 - t - w < 9 / L) w = 1 - t;
      blk.lots.push(makeLot(blk, k, t, t + w, avenue, rng));
      t += w;
    }
  }
  // każdy kwartał ma przynajmniej jedną bramę na podwórze
  const lots = blk.lots;
  const eligible = lots.filter((l) => l.bays >= 3);
  for (const l of eligible) if (rng.chance(0.3)) l.gateBay = 1 + Math.floor(rng.next() * (l.bays - 2));
  if (!lots.some((l) => l.gateBay >= 0) && eligible.length) {
    const l = eligible[Math.floor(rng.next() * eligible.length)];
    l.gateBay = 1 + Math.floor(rng.next() * (l.bays - 2));
  }
  for (const l of lots) {
    do l.doorBay = Math.floor(rng.next() * l.bays);
    while (l.bays > 1 && l.doorBay === l.gateBay);
    if (l.doorBay === l.gateBay) l.doorBay = -1;
  }
  lots.forEach((l, idx) => { l.idx = idx; });

  // otwory bram (do kolizji)
  blk.gates = [];
  for (const l of lots) {
    if (l.gateBay < 0) continue;
    const t0 = l.gateBay / l.bays, t1 = (l.gateBay + 1) / l.bays;
    const Fa = lerp2(l.f0, l.f1, t0), Fb = lerp2(l.f0, l.f1, t1);
    const Ba = lerp2(l.b0, l.b1, t0), Bb = lerp2(l.b0, l.b1, t1);
    const W = dist(Fa, Fb), gw = gateWidth(W) - 0.5;
    const ua = 0.5 - gw / (2 * W), ub = 0.5 + gw / (2 * W);
    const ext = (a, b, s) => [a[0] + (a[0] - b[0]) * s, a[1] + (a[1] - b[1]) * s];
    const fA = lerp2(Fa, Fb, ua), fB = lerp2(Fa, Fb, ub), bA = lerp2(Ba, Bb, ua), bB = lerp2(Ba, Bb, ub);
    blk.gates.push([ext(fA, bA, 0.05), ext(fB, bB, 0.05), ext(bB, fB, 0.05), ext(bA, fA, 0.05)]);
  }

  // teleekrany na boniowanych przęsłach parteru
  for (const l of lots) {
    if (!rng.chance(0.18) || l.bays < 2) continue;
    let bay = Math.floor(rng.next() * l.bays);
    if (bay === l.gateBay || bay === l.doorBay) bay = (bay + 1) % l.bays;
    if (bay === l.gateBay || bay === l.doorBay) continue;
    l.screenBay = bay;
    const t = (bay + 0.5) / l.bays;
    const f = lerp2(l.f0, l.f1, t), bk = lerp2(l.b0, l.b1, t);
    const n = [f[0] - bk[0], f[1] - bk[1]], nl = Math.hypot(n[0], n[1]);
    blk.screens.push({ x: f[0] + (n[0] / nl) * 0.3, z: f[1] + (n[1] / nl) * 0.3, y: 2.7 });
  }

  // latarnie wzdłuż krawężnika
  for (let k = 0; k < 4; k++) {
    const a = blk.curbIn[k], b = blk.curbIn[(k + 1) % 4], L = dist(a, b);
    const n = Math.max(1, Math.round(L / 27));
    const e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const inward = inwardNormal(blk.curbIn, k);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = lerp2(a, b, t);
      blk.lamps.push({ p: [p[0] + inward[0] * 0.45, p[1] + inward[1] * 0.45], e, n: inward });
    }
  }
}

function inwardNormal(q, k) {
  const a = q[k], b = q[(k + 1) % 4];
  const c = [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
  let nx = -dz / l, nz = dx / l;
  if ((c[0] - (a[0] + b[0]) / 2) * nx + (c[1] - (a[1] + b[1]) / 2) * nz < 0) { nx = -nx; nz = -nz; }
  return [nx, nz];
}

function makeLot(blk, k, t0, t1, avenue, rng) {
  const B = blk.bline, C = blk.court;
  const f0 = lerp2(B[k], B[(k + 1) % 4], t0), f1 = lerp2(B[k], B[(k + 1) % 4], t1);
  const b0 = lerp2(C[k], C[(k + 1) % 4], t0), b1 = lerp2(C[k], C[(k + 1) % 4], t1);
  const width = dist(f0, f1);
  const style = rng.weighted([['classic', 4], ['ornate', 3], ['plain', 3], ['brick', 2], ['modern', avenue ? 1.2 : 0.4]]);
  const upper = avenue ? rng.int(4, 6) : rng.int(3, 5);
  const gH = rng.float(4.1, 4.6), fH = style === 'modern' ? 3.2 : rng.float(3.15, 3.55);
  const top = gH + upper * fH;
  const base = PALETTE[Math.floor(rng.next() * PALETTE.length)];
  const j = () => rng.float(-0.04, 0.04);
  const tint = [base[0] + j(), base[1] + j(), base[2] + j()];
  const roof = style === 'modern' ? 'flat' : rng.weighted([['pitch', 5], ['mansard', 3], ['flat', 1.2]]);
  return {
    k, t0, t1, f0, f1, b0, b1, width,
    bays: Math.max(2, Math.round(width / 3.7)),
    upper, gH, fH, top, style, tint,
    wallMat: style === 'brick' ? 'brick' : 'plaster',
    roof, roofH: roof === 'flat' ? 0.9 : roof === 'mansard' ? rng.float(4.0, 4.8) : rng.float(3.0, 4.6),
    shops: rng.chance(avenue ? 0.85 : 0.35),
    balcony: rng.chance(0.45),
    gateBay: -1, doorBay: 0, screenBay: -1,
    seed: rng.int(0, 1e9),
  };
}

// ── plac Ministerstwa Prawdy ────────────────────────────────────────────────
export const MINISTRY = { tiers: [52, 41, 31, 22], tierH: 26 };

function fillPlaza(blk) {
  blk.court = null;
  blk.gates = [];
  for (let k = 0; k < 4; k++) {
    const a = blk.curbIn[k], b = blk.curbIn[(k + 1) % 4], L = dist(a, b);
    const n = Math.max(1, Math.round(L / 24));
    const e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const inward = inwardNormal(blk.curbIn, k);
    for (let i = 0; i < n; i++) {
      const p = lerp2(a, b, (i + 0.5) / n);
      blk.lamps.push({ p: [p[0] + inward[0] * 0.45, p[1] + inward[1] * 0.45], e, n: inward });
    }
  }
  const [cx, cz] = blk.center;
  const h = MINISTRY.tiers[0] + 0.3;
  for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) blk.screens.push({ x: cx + dx * h, z: cz + dz * h, y: 4 });
}
