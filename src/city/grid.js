// ─────────────────────────────────────────────────────────────────────────────
//  NIEREGULARNA SIATKA CZWOROKĄTÓW (metoda Oskara Stålberga, Townscaper)
//
//  1. Siatka trójkątów (sieć heksagonalna).
//  2. Losowe łączenie par trójkątów w czworokąty.
//  3. Podział: każdy wielokąt → czworokąty (wierzchołek, środek krawędzi,
//     środek ściany, środek krawędzi) — wszystko jest czworokątem.
//  4. Relaksacja "do kwadratu": każdy czworokąt ciągnie narożniki w stronę
//     najlepiej dopasowanego kwadratu → organiczna, ale regularna siatka.
//
//  Potem: każdy PUNKT siatki to słupek (liczba pięter). Każdy CZWOROKĄT
//  dzieli się na 4 ćwiartki — każda należy do jednego narożnika. Ściana
//  powstaje tam, gdzie pełna ćwiartka styka się z pustą; dach — z wysokości
//  punktów dookoła (marching squares). Moduł zawsze pasuje do 4 punktów.
// ─────────────────────────────────────────────────────────────────────────────
import { Rng, hash } from '../core/rng.js';
import { noise3 } from '../core/noise.js';
import { polyDist } from './routes.js';

export const LEVEL0 = 3.8, LEVEL = 3.2;
export const levelY = (L) => (L <= 0 ? 0 : LEVEL0 + (L - 1) * LEVEL);

export const T_STREET = 0, T_BLD = 1, T_COURT = 2, T_PARK = 3, T_PLAZA = 4, T_GARDEN = 5, T_RAIL = 6, T_BEACH = 7, T_WATER = 8;
export const Z_HOUSES = 0, Z_TENEMENT = 1, Z_MINISTRY = 2, Z_NATURE = 3; // Z_MINISTRY = ratusz na rynku

export function makeQuadGrid(seed, half, s = 10.5) {
  const rng = new Rng(hash(seed, 31337));
  const X = half + 2 * s, h3 = (Math.sqrt(3) / 2) * s;
  const rN = Math.ceil(X / h3);
  const px = [], pz = [], fixed = [];
  const idx = new Map();
  const key = (q, r) => (q + 4000) * 8000 + (r + 4000);
  for (let r = -rN; r <= rN; r++) {
    const q0 = Math.ceil(-X / s - r / 2), q1 = Math.floor(X / s - r / 2);
    for (let q = q0; q <= q1; q++) {
      idx.set(key(q, r), px.length);
      // drgania siatki startowej → większa różnorodność kątów po relaksacji
      px.push((q + r / 2) * s + rng.float(-0.2, 0.2) * s);
      pz.push(r * h3 + rng.float(-0.2, 0.2) * s);
      fixed.push(0);
    }
  }
  const get = (q, r) => idx.get(key(q, r));
  const tris = [];
  for (const [k, i] of idx) {
    const q = Math.floor(k / 8000) - 4000, r = (k % 8000) - 4000;
    const a = get(q + 1, r), b = get(q, r + 1), c = get(q + 1, r + 1);
    if (a !== undefined && b !== undefined) tris.push([i, a, b]);
    if (a !== undefined && b !== undefined && c !== undefined) tris.push([a, c, b]);
  }
  // krawędzie → trójkąty
  const N0 = px.length;
  const ek = (a, b) => (a < b ? a * N0 + b : b * N0 + a);
  const edgeT = new Map();
  tris.forEach((t, ti) => {
    for (let e = 0; e < 3; e++) {
      const k = ek(t[e], t[(e + 1) % 3]);
      if (!edgeT.has(k)) edgeT.set(k, []);
      edgeT.get(k).push(ti);
    }
  });
  // łączenie trójkątów w czworokąty
  const merged = new Uint8Array(tris.length);
  const order = tris.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const polys = [];
  for (const ti of order) {
    if (merged[ti]) continue;
    const t = tris[ti], cand = [];
    for (let e = 0; e < 3; e++) {
      for (const o of edgeT.get(ek(t[e], t[(e + 1) % 3]))) if (o !== ti && !merged[o]) cand.push([o, e]);
    }
    merged[ti] = 1;
    if (!cand.length || rng.chance(0.12)) { polys.push(t); continue; }
    const [o, e] = cand[Math.floor(rng.next() * cand.length)];
    merged[o] = 1;
    const ot = tris[o], a = t[e], b = t[(e + 1) % 3];
    const opp = ot.find((v) => v !== a && v !== b);
    polys.push([a, opp, b, t[(e + 2) % 3]]);
  }
  // krawędzie brzegowe (tylko jeden wielokąt)
  const edgeCount = new Map();
  for (const p of polys) for (let i = 0; i < p.length; i++) { const k = ek(p[i], p[(i + 1) % p.length]); edgeCount.set(k, (edgeCount.get(k) || 0) + 1); }
  for (const [k, c] of edgeCount) if (c === 1) { fixed[Math.floor(k / N0)] = 1; fixed[k % N0] = 1; }
  // podział na czworokąty
  const mid = new Map();
  const midpoint = (a, b) => {
    const k = ek(a, b);
    let m = mid.get(k);
    if (m === undefined) {
      m = px.length;
      px.push((px[a] + px[b]) / 2);
      pz.push((pz[a] + pz[b]) / 2);
      fixed.push(edgeCount.get(k) === 1 ? 1 : 0);
      mid.set(k, m);
    }
    return m;
  };
  const quads = [];
  for (const p of polys) {
    const n = p.length;
    let cx = 0, cz = 0;
    for (const v of p) { cx += px[v] / n; cz += pz[v] / n; }
    const c = px.length;
    px.push(cx); pz.push(cz); fixed.push(0);
    for (let i = 0; i < n; i++) quads.push(p[i], midpoint(p[i], p[(i + 1) % n]), c, midpoint(p[(i + n - 1) % n], p[i]));
  }
  // relaksacja do kwadratów
  const N = px.length, Q = quads.length / 4;
  const ax = new Float64Array(N), az = new Float64Array(N), cnt = new Float64Array(N);
  for (let it = 0; it < 6; it++) {
    ax.fill(0); az.fill(0); cnt.fill(0);
    for (let q = 0; q < Q; q++) {
      const v = [quads[q * 4], quads[q * 4 + 1], quads[q * 4 + 2], quads[q * 4 + 3]];
      let cx = 0, cz = 0;
      for (const i of v) { cx += px[i] / 4; cz += pz[i] / 4; }
      let sx = 0, sz = 0;
      for (let i = 0; i < 4; i++) {
        let dx = px[v[i]] - cx, dz = pz[v[i]] - cz;
        for (let k = 0; k < i; k++) [dx, dz] = [dz, -dx]; // obrót o -90°
        sx += dx / 4; sz += dz / 4;
      }
      for (let i = 0; i < 4; i++) {
        let tx = sx, tz = sz;
        for (let k = 0; k < i; k++) [tx, tz] = [-tz, tx]; // obrót o +90°
        ax[v[i]] += cx + tx - px[v[i]];
        az[v[i]] += cz + tz - pz[v[i]];
        cnt[v[i]]++;
      }
    }
    for (let i = 0; i < N; i++) if (!fixed[i] && cnt[i]) { px[i] += (ax[i] / cnt[i]) * 0.42; pz[i] += (az[i] / cnt[i]) * 0.42; }
  }
  // zostawiamy czworokąty w obrębie mapy
  const keep = [];
  for (let q = 0; q < Q; q++) {
    let cx = 0, cz = 0;
    for (let i = 0; i < 4; i++) { cx += px[quads[q * 4 + i]] / 4; cz += pz[quads[q * 4 + i]] / 4; }
    if (Math.abs(cx) < half && Math.abs(cz) < half) keep.push(quads[q * 4], quads[q * 4 + 1], quads[q * 4 + 2], quads[q * 4 + 3]);
  }
  return { X: Float64Array.from(px), Z: Float64Array.from(pz), quads: Int32Array.from(keep), N };
}

// ── klasyfikacja punktów: ulica / budynek (ile pięter) / podwórze / park ... ─
const segDist = (x, z, s) => {
  const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
  const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - s.a[0] - dx * t, z - s.a[1] - dz * t);
};

function bucketize(items, size, bbox) {
  const m = new Map();
  for (const it of items) {
    const [x0, z0, x1, z1] = bbox(it);
    for (let gx = Math.floor(x0 / size); gx <= Math.floor(x1 / size); gx++)
      for (let gz = Math.floor(z0 / size); gz <= Math.floor(z1 / size); gz++) {
        const k = gx * 10000 + gz;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(it);
      }
  }
  return (x, z) => m.get(Math.floor(x / size) * 10000 + Math.floor(z / size)) || [];
}

// ── kolory: paleta historycznych barw elewacji, spójna w obrębie dzielnicy ──────
function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
// Barwy ułożone wg odcienia: sąsiednie wpisy są do siebie podobne, więc dzielnica o danej
// „pozycji” w palecie ma spójny charakter (ciepłe żółcienie, różowe ceglaste, chłodne szarości).
const WALLS = [
  [40, 0.1, 0.9], [44, 0.38, 0.84], [48, 0.55, 0.76], [38, 0.5, 0.66], [32, 0.32, 0.64], [16, 0.48, 0.66], [12, 0.42, 0.78],
  [350, 0.25, 0.76], [95, 0.2, 0.7], [150, 0.16, 0.74], [180, 0.22, 0.74], [205, 0.28, 0.76], [215, 0.22, 0.62], [260, 0.12, 0.74],
];
const ROOFS = [[[0.66, 0.3, 0.2], 3], [[0.55, 0.24, 0.18], 2], [[0.3, 0.32, 0.36], 1.5], [[0.28, 0.48, 0.4], 0.4], [[0.36, 0.26, 0.2], 1], [[0.36, 0.42, 0.52], 1], [[0.16, 0.16, 0.18], 0.7], [[0.72, 0.42, 0.24], 1]];
const BRICKS = [[0.98, 0.92, 0.88], [1, 0.88, 0.78], [0.82, 0.72, 0.68], [1, 0.97, 0.8], [0.9, 0.84, 0.82]];
const FRAMES = [[[0.94, 0.92, 0.86], 4], [[0.92, 0.88, 0.76], 1.5], [[0.2, 0.32, 0.24], 1], [[0.4, 0.15, 0.13], 0.8], [[0.2, 0.24, 0.34], 0.8], [[0.32, 0.22, 0.14], 1.2]];
const DOORS = [[140, 0.35, 0.22], [25, 0.45, 0.2], [355, 0.45, 0.25], [215, 0.4, 0.25], [30, 0.5, 0.3], [160, 0.3, 0.2]];
const SHUTTERS = [[130, 0.25, 0.38], [25, 0.35, 0.3], [210, 0.35, 0.38], [5, 0.4, 0.35], [45, 0.1, 0.85], [150, 0.3, 0.3]];
const AWNINGS = [[140, 0.45, 0.28], [355, 0.5, 0.3], [215, 0.45, 0.3], [42, 0.6, 0.45], [20, 0.5, 0.35]];

// środek działki (siatka 11 m, patrz classifyGrid) z identyfikatora działki
const LS = 11;
export const lotCenter = (bid) => [(Math.floor(bid / 4096) - 2048 + 0.5) * LS, ((bid % 4096) - 2048 + 0.5) * LS];

// ── generator budynku: typ bryły (gramatyka kształtu) + kolory + detale ─────
export function buildingInfo(seed, bid, zone) {
  const r = new Rng(hash(seed, bid, 717));
  if (zone === Z_MINISTRY) return { zone, style: 'ornate', shape: 'block', tint: [0.86, 0.74, 0.56], trim: [0.95, 0.92, 0.84], wallMat: 'plaster', groundMat: 'stone', roofTint: [0.32, 0.5, 0.42], frameTint: [0.92, 0.9, 0.85], doorTint: [0.36, 0.24, 0.14], ce: 0.5, ridge: 3.2, garden: false, variant: 0, winW: 0.42, winH: 0.55, roofMat: 'roof', curtain: [0.6, 0.15, 0.12], r };
  const tenement = zone === Z_TENEMENT;
  const [cx, cz] = lotCenter(bid), dc = Math.hypot(cx, cz);
  // dzielnica: wolnozmienny szum → pozycja w palecie; budynek odchyla się od niej o ±2 wpisy
  const dn = Math.max(0, Math.min(1, 0.5 + 0.75 * noise3(cx / 170 + 7.7, 0.5, cz / 170 - 3.1) + 0.3 * noise3(cx / 60, 1.5, cz / 60)));
  const pos = dn * (WALLS.length - 1) + r.float(-2.1, 2.1);
  const [wh, ws, wl] = WALLS[Math.max(0, Math.min(WALLS.length - 1, Math.round(pos)))];
  const hue = (wh + r.float(-5, 5) + 360) % 360;
  const tint = hsl(hue, Math.max(0.04, ws + r.float(-0.05, 0.05)), Math.min(0.94, wl + r.float(-0.04, 0.04)));
  const trim = hsl(hue, 0.14, r.chance(0.8) ? 0.88 : 0.42);
  const style = tenement
    ? r.weighted([['classic', 4], ['ornate', 3], ['plain', 3], ['brick', 2], ['modern', 0.6]])
    : r.weighted([['house', 6], ['ornate', 1.2], ['brick', 1.2]]);
  const shape = tenement
    ? r.weighted([['block', 3.4], ['stepped', 1.8], ['tower', 0.45], ['crenel', 1.4], ['arcade', 1]])
    : r.weighted([['block', 3], ['villa', 2], ['tower', 0.4], ['L', 2]]);
  const roofTint = r.weighted(ROOFS).map((c) => Math.min(1, c * r.float(0.88, 1.12)));
  // wysokość maleje od rynku ku obrzeżom, sąsiednie działki różnią się najwyżej o jedno piętro
  const base = 6.3 - 3.3 * Math.min(1, dc / 320);
  return {
    zone, style, shape, tint, trim, roofTint,
    levels: tenement ? Math.max(3, Math.min(7, Math.round(base + r.float(-1.1, 1.1)))) : r.weighted([[1, 2], [2, 5], [3, 2]]),
    wallMat: style === 'brick' ? 'brick' : 'plaster',
    groundMat: style === 'brick' ? 'brick' : tenement && r.chance(0.5) ? 'stone' : 'plaster',
    frameTint: r.weighted(FRAMES), doorTint: hsl(...r.pick(DOORS)),
    shutters: !tenement && r.chance(0.7), shutterTint: hsl(...r.pick(SHUTTERS)),
    flowers: r.chance(tenement ? 0.15 : 0.55) ? hsl(r.pick([0, 30, 50, 300, 340]), 0.75, 0.55) : null,
    ce: 0.5,
    ridge: style === 'modern' ? 0 : tenement ? r.float(1.8, 3.4) : r.float(2.4, 4.4),
    winW: r.float(0.32, 0.5), winH: r.float(0.44, 0.6),
    bars: tenement && r.chance(0.3), shops: tenement ? r.chance(0.6) : r.chance(0.08),
    garden: !tenement && r.chance(0.24), variant: r.int(0, 1),
    roofMat: !tenement || r.chance(0.45) ? 'tile' : 'roof',
    curtain: hsl(r.float(0, 360), r.float(0.25, 0.5), r.float(0.35, 0.6)),
    awning: r.chance(0.7) ? hsl(...r.pick(AWNINGS)) : null,
    towerExtra: r.int(1, 2), stepDir: r.chance(0.5) ? 1 : -1, ang: r.float(0, Math.PI * 2), r,
    // odcień cegły: czerwona, pomarańczowa, brunatna, żółtawa (osobny hasz — nie rusza reszty losowań)
    brickTint: BRICKS[hash(seed, bid, 41) % BRICKS.length],
  };
}

export function classifyGrid(city) {
  const { grid, terrain: T, seed, roads } = city;
  const { X, Z, N, quads } = grid;
  const H = new Uint8Array(N), TY = new Uint8Array(N), ZN = new Uint8Array(N), ARCH = new Uint8Array(N);
  const BID = new Int32Array(N), CL = new Float32Array(N);
  const seedAt = bucketize(city.seedList, 70, (s) => [s.x - 140, s.z - 140, s.x + 140, s.z + 140]);
  const plaza = city.blocks.find((b) => b.kind === 'plaza');
  const tiers = plaza.ministry.tiers;
  const lots = new Map();
  for (let v = 0; v < N; v++) {
    const x = X[v], z = Z[v];
    const inl = T.inland(x, z);
    CL[v] = roads.clearance(x, z);
    let ns = null, nd = 1e18;
    for (const s of seedAt(x, z)) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < nd) { nd = d; ns = s; } }
    const kind = ns ? ns.kind : 'houses';
    ZN[v] = kind === 'tenement' ? Z_TENEMENT : kind === 'nature' ? Z_NATURE : Z_HOUSES;
    if (inl < 0 || Math.abs(x) > city.half - 4 || Math.abs(z) > city.half - 4) { TY[v] = T_WATER; continue; }
    if (inl < 34) { TY[v] = T_BEACH; continue; } // plaża przed rzeką: ujście rzeki to też brzeg
    if (T.river(x, z).d < T.hw + 6) continue;
    // jezdnia + pas, w którym nie wolno stawiać budynków (przejazd ≥ 6 m, ściany ≥ 0,8 m od krawędzi)
    if (CL[v] < 5.2) continue;
    if (polyDist(city.routes.rail, x, z) < 5.5) { TY[v] = T_RAIL; continue; }
    if (city.extras.some((ex) => Math.hypot(ex.p[0] - x, ex.p[1] - z) < ex.clear)) continue;
    let onBridge = false;
    for (const b of city.bridges) {
      const dx = x - b.p[0], dz = z - b.p[1];
      if (Math.abs(dx * b.axis[0] + dz * b.axis[1]) < b.L + 20 && Math.abs(dx * b.perp[0] + dz * b.perp[1]) < b.width / 2 + 1) onBridge = true;
    }
    if (onBridge) continue;
    if (kind === 'plaza') {
      const dc = Math.max(Math.abs(x - T.plaza.x), Math.abs(z - T.plaza.z));
      if (dc < tiers[0] * 0.32) { TY[v] = T_BLD; ZN[v] = Z_MINISTRY; BID[v] = -1; H[v] = dc < 5.5 ? 11 : 3; }
      else TY[v] = T_PLAZA;
      continue;
    }
    if (kind === 'park' || kind === 'nature') { TY[v] = T_PARK; continue; }
    const zone = ZN[v];
    if (CL[v] > (zone === Z_TENEMENT ? 18 : 13)) { TY[v] = T_COURT; continue; }
    // działka = najbliższy punkt rozedrganej siatki co 11 m
    const gx = Math.floor(x / LS), gz = Math.floor(z / LS);
    let best = 1e18, bid = 0;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const hh = hash(seed, gx + i, gz + j, 3);
        const cx = (gx + i + 0.15 + ((hh & 1023) / 1023) * 0.7) * LS, cz = (gz + j + 0.15 + (((hh >> 10) & 1023) / 1023) * 0.7) * LS;
        const d = (cx - x) ** 2 + (cz - z) ** 2;
        if (d < best) { best = d; bid = (gx + i + 2048) * 4096 + (gz + j + 2048); }
      }
    BID[v] = bid;
    TY[v] = T_BLD;
    if (!lots.has(bid)) lots.set(bid, { zone, verts: [] });
    lots.get(bid).verts.push(v);
  }

  // ── gramatyka kształtu: każda działka dostaje bryłę wg swojego typu ──────
  for (const [bid, lot] of lots) {
    const info = buildingInfo(seed, bid, lot.zone);
    const vs = lot.verts;
    if (info.garden) { for (const v of vs) TY[v] = T_GARDEN; continue; }
    let cx = 0, cz = 0, minCL = 1e9;
    for (const v of vs) { cx += X[v] / vs.length; cz += Z[v] / vs.length; minCL = Math.min(minCL, CL[v]); }
    const dir = [Math.cos(info.ang), Math.sin(info.ang)];
    // wieża: punkt najbardziej "narożny" (najbliżej ulicy, najdalej od środka działki)
    let towerV = -1, tb = -1e9;
    for (const v of vs) { const sc = -CL[v] * 0.6 + Math.hypot(X[v] - cx, Z[v] - cz); if (sc > tb) { tb = sc; towerV = v; } }
    for (const v of vs) {
      const front = CL[v] - minCL;
      let h = info.levels;
      switch (info.shape) {
        case 'stepped': h -= info.stepDir > 0 ? Math.floor(front / 4.5) : front < 3 ? 1 : 0; break;
        case 'tower': if (v === towerV) h += info.towerExtra; break;
        case 'crenel': if (front < 3 && hash(seed, v, 21) & 1) h += 1; break;
        case 'villa': if (Math.hypot(X[v] - cx, Z[v] - cz) < 4.5) h += 1; break;
        case 'L': if ((X[v] - cx) * dir[0] + (Z[v] - cz) * dir[1] > 1) h -= 1; break;
        case 'arcade': if (front < 2.6 && info.levels >= 3) ARCH[v] = 2; break;
      }
      if ((hash(seed, v, 11) / 4294967296) < 0.03) h += 1;
      H[v] = Math.max(1, Math.min(14, h));
    }
  }
  // prześwity bramne: w kamienicach "promień" od ulicy do podwórza bez parteru
  const vAt = bucketize(Array.from({ length: N }, (_, i) => i), 16, (i) => [X[i], Z[i], X[i], Z[i]]);
  grid.vAt = vAt;
  for (const blk of city.blocks) {
    if (blk.kind !== 'tenement') continue;
    const r = new Rng(hash(seed, blk.id, 55));
    const P = blk.poly, n = P.length;
    const edges = P.map((p, k) => [p, P[(k + 1) % n]]).filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 25);
    for (let g = 0; g < Math.min(edges.length, r.int(1, 2)); g++) {
      const [a, b] = edges[Math.floor(r.next() * edges.length)];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const d = [blk.bc[0] - m[0], blk.bc[1] - m[1]], l = Math.hypot(d[0], d[1]);
      const s = { a: m, b: [m[0] + (d[0] / l) * Math.min(l, 40), m[1] + (d[1] / l) * Math.min(l, 40)] };
      for (let t = 0; t <= 40; t += 4) {
        const px = m[0] + (d[0] / l) * t, pz = m[1] + (d[1] / l) * t;
        for (const v of vAt(px, pz)) if (TY[v] === T_BLD && segDist(X[v], Z[v], s) < 3.2) { if (H[v] >= 2) ARCH[v] = 1; else TY[v] = T_STREET, H[v] = 0; }
      }
    }
  }
  // Margines 5,2 m sprawdza tylko punkt siatki, a ćwiartka sięga dalej (środek czworokąta
  // bywa o kilka metrów od narożnika): ściana nie może stanąć na jezdni, więc taki punkt
  // przestaje być budynkiem. Usuwanie punktów nie tworzy nowych ścian, jeden przebieg wystarcza.
  for (let q = 0; q < quads.length / 4; q++) {
    const G = quadGeom({ X, Z, quads }, q);
    for (let i = 0; i < 4; i++) {
      const a = G.v[i];
      if (TY[a] !== T_BLD || H[a] < 1) continue;
      for (const p of [G.m[i], G.c, G.m[(i + 3) % 4]]) if (roads.clearance(p[0], p[1]) < 0.5) { TY[a] = T_STREET; H[a] = 0; break; }
    }
  }
  grid.H = H; grid.TY = TY; grid.ZN = ZN; grid.BID = BID; grid.ARCH = ARCH; grid.CL = CL;
  // ratusz: najwyższe punkty to wieża — dostaje hełm z zegarami (M.townhall)
  let hTop = 0;
  const tower = new Set();
  for (let v = 0; v < N; v++) if (TY[v] === T_BLD && ZN[v] === Z_MINISTRY) hTop = Math.max(hTop, H[v]);
  for (let v = 0; v < N; v++) if (TY[v] === T_BLD && ZN[v] === Z_MINISTRY && H[v] === hTop) tower.add(v);
  if (hTop > 3) {
    let cx = 0, cz = 0;
    for (const v of tower) { cx += X[v] / tower.size; cz += Z[v] / tower.size; }
    let rin = 1e9;
    for (let q = 0; q < quads.length / 4; q++)
      for (let i = 0; i < 4; i++) {
        const a = quads[q * 4 + i], b = quads[q * 4 + ((i + 1) % 4)];
        if (tower.has(a) !== tower.has(b)) rin = Math.min(rin, Math.hypot((X[a] + X[b]) / 2 - cx, (Z[a] + Z[b]) / 2 - cz));
      }
    city.extras.push({ kind: 'townhall', p: [cx, cz], clear: 0, top: hTop, w: Math.max(3.5, Math.min(7, rin * 1.7)) });
  }
  // sąsiedztwo krawędzi → czworokąty
  const Q = quads.length / 4, edgeQ = new Map();
  const nearBld = new Uint8Array(N);
  for (let q = 0; q < Q; q++) {
    let anyB = false;
    for (let i = 0; i < 4; i++) {
      const a = quads[q * 4 + i], b = quads[q * 4 + ((i + 1) % 4)];
      if (TY[a] === T_BLD) anyB = true;
      const k = a < b ? a * N + b : b * N + a;
      const e = edgeQ.get(k);
      if (e === undefined) edgeQ.set(k, q);
      else edgeQ.set(k, [e, q]);
    }
    if (anyB) for (let i = 0; i < 4; i++) nearBld[quads[q * 4 + i]] = 1;
  }
  grid.nearBld = nearBld;
  grid.across = (q, a, b) => {
    const e = edgeQ.get(a < b ? a * N + b : b * N + a);
    if (Array.isArray(e)) return e[0] === q ? e[1] : e[0];
    return -1;
  };
}

// czy powierzchnia przy punkcie jest "miejska" (podniesiony chodnik/trawnik na +0,15 m)
export function raised(city, v) {
  const g = city.grid, t = g.TY[v];
  if (t === T_WATER || t === T_BEACH || t === T_RAIL) return false;
  if (t === T_BLD) return !!g.ARCH[v];
  if (g.ZN[v] === Z_NATURE) return false;
  return true;
}

// otwarta przestrzeń przy ulicy bez budynków obok (skwer, pas zieleni) → trawnik,
// a nie pole płyt chodnikowych; chodniki pod ścianami i bulwary zostają z płyt
export function lawn(city, v) {
  const g = city.grid, T = city.terrain;
  return g.TY[v] === T_STREET && !g.nearBld[v] && g.CL[v] > 1.2 && g.ZN[v] !== Z_NATURE && T.river(g.X[v], g.Z[v]).d > T.hw + 10;
}

// czy punkt zajmuje poziom L (prześwit bramny: parter pusty)
export function filled(grid, v, L) {
  return grid.TY[v] === T_BLD && grid.H[v] > L && !(L === 0 && grid.ARCH[v]);
}

export function quadMixed0(grid, q) {
  const Qd = grid.quads;
  let f = 0;
  for (let i = 0; i < 4; i++) if (filled(grid, Qd[q * 4 + i], 0)) f++;
  return f > 0 && f < 4;
}

// geometria czworokąta: narożniki, środki krawędzi, środek
export function quadGeom(grid, q) {
  const { X, Z, quads } = grid;
  const v = [quads[q * 4], quads[q * 4 + 1], quads[q * 4 + 2], quads[q * 4 + 3]];
  const p = v.map((i) => [X[i], Z[i]]);
  const m = p.map((a, i) => [(a[0] + p[(i + 1) % 4][0]) / 2, (a[1] + p[(i + 1) % 4][1]) / 2]); // m[i] między i a i+1
  const c = [(p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4, (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4];
  return { v, p, m, c };
}

// Plan ściany parteru/piętra — wspólny dla geometrii i HUD (teleekrany)
export function wallPlan(city, a, b, q, side, L) {
  const g = city.grid, h = hash(city.seed, a, b, q * 2 + side, L) / 4294967296;
  const zone = g.ZN[a];
  const facesStreet = g.TY[b] === T_STREET || g.TY[b] === T_PLAZA || (g.TY[b] === T_BLD && L === 0);
  if (zone === Z_MINISTRY) return L === 0 ? { mod: h < 0.25 ? 'door' : 'window' } : { mod: null };
  if (L === 0) {
    const info = buildingInfo(city.seed, g.BID[a], zone);
    if (zone === Z_TENEMENT) {
      if (facesStreet && info.shops && h < 0.5) return { mod: 'shop' };
      if (facesStreet && h > 0.88) return { mod: 'door' };
      if (h > 0.76) return { mod: 'rustic', poster: h > 0.83 };
      return { mod: 'window' };
    }
    if (h < 0.18) return { mod: 'door' };
    if (info.shops && facesStreet && h < 0.4) return { mod: 'shop' };
    return { mod: h > 0.95 ? 'wall' : 'window', poster: h > 0.95 };
  }
  return { mod: null, balcony: h < 0.08 && L <= 2 };
}

// ── rekwizyty: JEDEN obiekt na punkt siatki (kafelek ~5×5 m) ───────────────
//  Każdy kandydat musi zmieścić się w swoim kafelku: odstęp od jezdni,
//  od ścian budynków i od innych obiektów — nic się nie nakłada.
const PROP_R = { lamp: 0.35, bin: 0.4, bench: 1.0, booth: 0.7, kiosk: 1.6, busstop: 1.7, bush: 1.1, car: 1.9, column: 0.4 };

export function decorate(city) {
  const g = city.grid, { X, Z, TY, H } = g, seed = city.seed, roads = city.roads;
  const lamps = [], trees = [], benches = [], props = [];
  const used = new Uint8Array(g.N);
  const taken = [];
  const takenAt = new Map();
  const tkey = (x, z) => Math.floor(x / 8) * 100003 + Math.floor(z / 8);
  const free = (p, r) => {
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const t of takenAt.get((Math.floor(p[0] / 8) + i) * 100003 + Math.floor(p[1] / 8) + j) || [])
          if (Math.hypot(t.p[0] - p[0], t.p[1] - p[1]) < t.r + r + 0.4) return false;
    return true;
  };
  const take = (p, r) => {
    const k = tkey(p[0], p[1]);
    if (!takenAt.has(k)) takenAt.set(k, []);
    takenAt.get(k).push({ p, r });
    taken.push({ p, r });
  };
  // odległość od najbliższego punktu budynku (ściany są ~2,7 m od niego)
  const bldDist = (x, z) => {
    let d = 1e9;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const v of g.vAt(x + i * 16, z + j * 16)) if (TY[v] === T_BLD && !(g.ARCH[v] === 2)) d = Math.min(d, Math.hypot(X[v] - x, Z[v] - z));
    return d - 3.0;
  };
  const fits = (p, r, roadGap = 0.5) => roads.clearance(p[0], p[1]) >= r + roadGap && bldDist(p[0], p[1]) >= r && free(p, r) && city.terrain.river(p[0], p[1]).d > city.terrain.hw + 2;

  // pomniki, fontanny, billboardy, obiekty specjalne mają pierwszeństwo
  city.monuments = city.monuments.filter((m) => {
    const r = m.kind === 'fountain' ? 4.6 : 2.6;
    if (!fits(m.p, r, 0.8)) return false;
    take(m.p, r);
    return true;
  });
  city.billboards = city.billboards.filter((bb) => {
    const r = bb.size[0] / 2 + 0.3;
    if (!fits(bb.p, r, 0.8)) return false;
    take(bb.p, r);
    return true;
  });
  for (const ex of city.extras) take(ex.p, Math.min(ex.clear, 10));

  // kolumny podcieni (prześwity typu "arcade")
  for (let v = 0; v < g.N; v++) if (TY[v] === T_BLD && g.ARCH[v] === 2) { const p = [X[v], Z[v]]; props.push({ kind: 'column', p, e: [1, 0], n: [0, 1], h: levelY(1), y: 0.15 }); take(p, 0.4); used[v] = 1; }

  for (let v = 0; v < g.N; v++) {
    const t = TY[v];
    if (used[v] || t === T_BLD || t === T_WATER || t === T_RAIL) continue;
    const p = [X[v], Z[v]];
    if (Math.abs(p[0]) > city.half - 6 || Math.abs(p[1]) > city.half - 6) continue;
    const hv = hash(seed, v, 9) / 4294967296;
    const near = roads.nearest(p[0], p[1]);
    const cl = near ? near.c : 1e9;
    let n = [0, 1];
    if (near) { const dx = p[0] - near.qx, dz = p[1] - near.qz, l = Math.hypot(dx, dz) || 1; n = [dx / l, dz / l]; }
    const e = [-n[1], n[0]];
    const wild = g.ZN[v] === Z_NATURE || t === T_BEACH;
    const town = !wild;
    const y = raised(city, v) ? 0.15 : 0;
    let choice = null;
    if (t === T_STREET && town && g.nearBld[v] && cl < 4) {
      // chodnik przy ulicy: latarnie, kosze, ławki, budki, kioski, przystanki
      choice = hv < 0.16 ? 'lamp' : hv < 0.21 ? 'bin' : hv < 0.25 ? 'bench' : hv < 0.27 ? 'booth' : hv < 0.29 ? 'kiosk' : hv < 0.31 ? 'busstop' : hv < 0.34 ? 'bush' : hv < 0.4 && cl > 1.3 ? 'tree' : null; // drzewa przyuliczne
    } else if (t === T_PLAZA) {
      choice = hv < 0.08 ? 'lamp' : hv < 0.14 ? 'bench' : hv < 0.2 ? 'tree' : null;
    } else if (t === T_PARK && town) {
      choice = hv < 0.34 ? 'tree' : hv < 0.42 ? 'bench' : hv < 0.54 ? 'bush' : hv < 0.57 ? 'lamp' : null;
    } else if (wild && t !== T_BEACH) {
      choice = hv < 0.45 ? 'tree' : hv < 0.62 ? 'bush' : null;
    } else if (t === T_BEACH) {
      choice = hv < 0.04 ? 'tree' : hv < 0.06 ? 'bench' : null;
    } else if (t === T_COURT) {
      choice = hv < 0.12 ? 'tree' : hv < 0.2 ? 'bush' : hv < 0.24 ? 'bench' : hv < 0.27 ? 'car' : null;
    } else if (t === T_GARDEN) {
      choice = hv < 0.36 ? 'tree' : hv < 0.58 ? 'bush' : hv < 0.62 ? 'car' : null;
    } else if (t === T_STREET && town && lawn(city, v)) {
      choice = hv < 0.12 ? 'tree' : hv < 0.19 ? 'bush' : hv < 0.21 ? 'bench' : hv < 0.23 && cl < 3 ? 'lamp' : null;
    } else if (t === T_STREET && town && cl > 2.5) {
      choice = hv < 0.08 ? 'tree' : hv < 0.12 ? 'bush' : null;
    }
    if (!choice) continue;
    if (choice === 'tree') {
      const sp = hash(seed, v, 13) / 4294967296;
      const species = t === T_BEACH || (wild && sp < 0.45) ? 'pine' : sp < 0.6 ? 'oak' : sp < 0.8 ? 'birch' : 'poplar';
      let sc = 0.75 + (hash(seed, v, 10) / 4294967296) * (wild ? 0.6 : 0.4);
      // korona mieści się między jezdnią a ścianami (zmniejszamy drzewo, a nie wpychamy go w dom)
      const room = Math.min(roads.clearance(p[0], p[1]) + 1.5, bldDist(p[0], p[1]) + 0.5);
      const crownR = (species === 'poplar' ? 2 : species === 'pine' ? 2.5 : 3.5) * sc;
      if (room < 1.2 || roads.clearance(p[0], p[1]) < 1.0) continue; // pień zawsze poza jezdnią
      // żadnych drzew w rzece ani pod wodą (punkty przy brzegu mają typ „ulica”, choć leżą w korycie)
      if (city.terrain.river(p[0], p[1]).d < city.terrain.hw + 2 || city.terrain.height(p[0], p[1]) < city.terrain.seaY + 0.3) continue;
      if (crownR > room) sc *= room / crownR;
      if (!free(p, 1.0)) continue;
      trees.push({ p, s: sc, species, seed: hash(seed, v, 15), y });
      take(p, 1.0);
      used[v] = 1;
      continue;
    }
    const r = PROP_R[choice];
    const gap = choice === 'lamp' ? 0.35 : 0.6;
    if (!fits(p, r, gap)) continue;
    used[v] = 1;
    take(p, r);
    if (choice === 'lamp') lamps.push({ p, n, e, y });
    else if (choice === 'bench') benches.push({ p, e, n, y });
    else if (choice === 'bush') props.push({ kind: 'bush', p, s: 0.6 + (hash(seed, v, 16) / 4294967296) * 0.5, n: [0, 1], e: [1, 0], y });
    else if (choice === 'car') { const a = hv * 40; props.push({ kind: 'car', p, e: [Math.cos(a), Math.sin(a)], n: [-Math.sin(a), Math.cos(a)], y }); }
    else props.push({ kind: choice, p, n, e, y });
  }
  Object.assign(city, { lamps, trees, benches, screens: [], props });
}

// podział na fragmenty do strumieniowania
export function makeChunks(city, size = 80) {
  const g = city.grid, { X, Z, quads } = g, n = Math.ceil((2 * city.half) / size);
  const chunks = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const cx = -city.half + (i + 0.5) * size, cz = -city.half + (j + 0.5) * size;
      chunks.push({ id: chunks.length, center: [cx, cz], radius: size * 0.72, quads: [], lamps: [], trees: [], benches: [], monuments: [], billboards: [], props: [], rail: [], extras: [], roads: [] });
    }
  const at = (x, z) => {
    const i = Math.min(n - 1, Math.max(0, Math.floor((x + city.half) / size))), j = Math.min(n - 1, Math.max(0, Math.floor((z + city.half) / size)));
    return chunks[j * n + i];
  };
  for (let q = 0; q < quads.length / 4; q++) {
    let cx = 0, cz = 0;
    for (let k = 0; k < 4; k++) { cx += X[quads[q * 4 + k]] / 4; cz += Z[quads[q * 4 + k]] / 4; }
    at(cx, cz).quads.push(q);
  }
  for (const k of ['lamps', 'trees', 'benches', 'billboards', 'props', 'monuments', 'extras']) for (const it of city[k]) at(it.p[0], it.p[1])[k].push(it);
  const P = city.routes.rail.pts;
  for (let i = 0; i < P.length - 1; i++) at((P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2).rail.push(i);
  city.streets.forEach((st, i) => at((st.a[0] + st.b[0]) / 2, (st.a[1] + st.b[1]) / 2).roads.push(i));
  return chunks;
}
