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

export const LEVEL0 = 3.8, LEVEL = 3.2;
export const levelY = (L) => (L <= 0 ? 0 : LEVEL0 + (L - 1) * LEVEL);

export const T_STREET = 0, T_BLD = 1, T_COURT = 2, T_PARK = 3, T_PLAZA = 4, T_GARDEN = 5;
export const Z_HOUSES = 0, Z_TENEMENT = 1, Z_MINISTRY = 2;

export function makeQuadGrid(seed, half, s = 13) {
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
      px.push((q + r / 2) * s);
      pz.push(r * h3);
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
  for (let it = 0; it < 14; it++) {
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
    for (let i = 0; i < N; i++) if (!fixed[i] && cnt[i]) { px[i] += (ax[i] / cnt[i]) * 0.55; pz[i] += (az[i] / cnt[i]) * 0.55; }
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

export function buildingInfo(seed, bid, zone) {
  const r = new Rng(hash(seed, bid, 717));
  if (zone === Z_MINISTRY) return { zone, style: 'modern', tint: [0.9, 0.9, 0.87], wallMat: 'stone', roofTint: [0.5, 0.5, 0.5], ce: 0.6, garden: false, r };
  if (zone === Z_TENEMENT) {
    const style = r.weighted([['classic', 4], ['ornate', 3], ['plain', 3], ['brick', 2], ['modern', 0.6]]);
    const base = r.pick(GRIM);
    return {
      zone, style, levels: r.int(4, 6), tint: base.map((v) => v + r.float(-0.04, 0.04)),
      wallMat: style === 'brick' ? 'brick' : 'plaster', groundMat: style === 'brick' ? 'brick' : r.chance(0.5) ? 'stone' : 'plaster',
      roofTint: r.pick([[0.42, 0.42, 0.42], [0.5, 0.36, 0.3], [0.36, 0.38, 0.4], [0.46, 0.44, 0.4]]),
      frameTint: r.pick([[0.34, 0.24, 0.17], [0.85, 0.83, 0.78], [0.26, 0.28, 0.24]]), doorTint: r.pick(DOORS),
      ce: 0.7, bars: r.chance(0.35), shops: r.chance(0.6), variant: r.int(0, 1), garden: false, r,
    };
  }
  const style = r.weighted([['house', 6], ['ornate', 1], ['brick', 1]]);
  const base = r.pick(PASTEL);
  return {
    zone, style, levels: r.weighted([[1, 2], [2, 5], [3, 2]]), tint: base.map((v) => v + r.float(-0.04, 0.04)),
    wallMat: style === 'brick' ? 'brick' : 'plaster', groundMat: style === 'brick' ? 'brick' : 'plaster',
    roofTint: r.pick([[0.62, 0.32, 0.24], [0.55, 0.28, 0.22], [0.4, 0.4, 0.42], [0.58, 0.38, 0.28], [0.66, 0.42, 0.3]]),
    frameTint: r.pick([[0.92, 0.9, 0.85], [0.34, 0.24, 0.17]]), doorTint: r.pick(DOORS),
    shutters: r.chance(0.75), shutterTint: r.pick(SHUTTERS), flowers: r.chance(0.55) ? r.pick(FLOWERS) : null,
    ce: 0.3, shops: r.chance(0.08), garden: r.chance(0.26), variant: r.int(0, 1), r,
  };
}

const PASTEL = [
  [0.86, 0.78, 0.6], [0.84, 0.7, 0.66], [0.72, 0.8, 0.72], [0.9, 0.86, 0.74], [0.78, 0.82, 0.86],
  [0.88, 0.74, 0.56], [0.8, 0.72, 0.8], [0.92, 0.9, 0.84], [0.7, 0.76, 0.66], [0.86, 0.66, 0.56],
];
const GRIM = [
  [0.74, 0.72, 0.66], [0.70, 0.66, 0.56], [0.62, 0.62, 0.58], [0.72, 0.64, 0.52],
  [0.66, 0.68, 0.62], [0.58, 0.56, 0.52], [0.76, 0.70, 0.62], [0.64, 0.58, 0.52],
];
const DOORS = [[0.3, 0.2, 0.13], [0.22, 0.26, 0.2], [0.36, 0.24, 0.14], [0.2, 0.3, 0.38], [0.45, 0.18, 0.15]];
const SHUTTERS = [[0.25, 0.42, 0.3], [0.2, 0.32, 0.45], [0.5, 0.2, 0.16], [0.85, 0.82, 0.74], [0.35, 0.25, 0.18]];
const FLOWERS = [[0.85, 0.15, 0.15], [0.9, 0.55, 0.1], [0.75, 0.3, 0.6], [0.95, 0.85, 0.3]];

// Wysokość kalenicy dachu jako pole (ciągłe), żeby sąsiednie domy się stykały
export function ridgeH(x, z) {
  return 2.4 + 1.3 * (0.5 + 0.5 * noise3(x / 45 + 7.7, 3.3, z / 45));
}

export function classifyGrid(city) {
  const { grid, terrain: T, seed } = city;
  const { X, Z, N, quads } = grid;
  const H = new Uint8Array(N), TY = new Uint8Array(N), ZN = new Uint8Array(N), ARCH = new Uint8Array(N);
  const BID = new Int32Array(N);
  const streetAt = bucketize(city.streets, 32, (s) => [Math.min(s.a[0], s.b[0]) - 34, Math.min(s.a[1], s.b[1]) - 34, Math.max(s.a[0], s.b[0]) + 34, Math.max(s.a[1], s.b[1]) + 34]);
  const seedAt = bucketize(city.seedList, 70, (s) => [s.x - 140, s.z - 140, s.x + 140, s.z + 140]);
  const plaza = city.blocks.find((b) => b.kind === 'plaza');
  const tiers = plaza.ministry.tiers;
  const LS = 11;
  for (let v = 0; v < N; v++) {
    const x = X[v], z = Z[v];
    if (Math.abs(x) > city.half - 4 || Math.abs(z) > city.half - 4) continue;
    if (T.river(x, z).d < T.hw + 6) continue;
    let onBridge = false;
    for (const b of city.bridges) {
      const dx = x - b.p[0], dz = z - b.p[1];
      if (Math.abs(dx * b.axis[0] + dz * b.axis[1]) < b.L + 20 && Math.abs(dx * b.perp[0] + dz * b.perp[1]) < b.width / 2 + 1) onBridge = true;
    }
    if (onBridge) continue;
    let clear = 1e9;
    for (const s of streetAt(x, z)) clear = Math.min(clear, segDist(x, z, s) - s.w);
    if (clear < 0) continue; // ulica
    let ns = null, nd = 1e18;
    for (const s of seedAt(x, z)) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < nd) { nd = d; ns = s; } }
    const kind = ns ? ns.kind : 'houses';
    if (kind === 'plaza') {
      const dc = Math.max(Math.abs(x - T.plaza.x), Math.abs(z - T.plaza.z));
      if (dc < tiers[0]) {
        TY[v] = T_BLD; ZN[v] = Z_MINISTRY; BID[v] = -1;
        H[v] = dc < tiers[3] ? 28 : dc < tiers[2] ? 21 : dc < tiers[1] ? 14 : 7;
      } else TY[v] = T_PLAZA;
      continue;
    }
    if (kind === 'park') { TY[v] = T_PARK; continue; }
    const zone = kind === 'tenement' ? Z_TENEMENT : Z_HOUSES;
    ZN[v] = zone;
    if (clear > (zone === Z_TENEMENT ? 14 : 10)) { TY[v] = T_COURT; continue; }
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
    const info = buildingInfo(seed, bid, zone);
    if (info.garden) { TY[v] = T_GARDEN; continue; }
    TY[v] = T_BLD;
    const hv = hash(seed, v, 11) / 4294967296;
    H[v] = info.levels + (hv < (zone === Z_TENEMENT ? 0.03 : 0.05) ? 1 : 0);
  }
  // prześwity bramne: w kamienicach "promień" od ulicy do podwórza bez parteru
  const vAt = bucketize(Array.from({ length: N }, (_, i) => i), 16, (i) => [X[i], Z[i], X[i], Z[i]]);
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
  grid.H = H; grid.TY = TY; grid.ZN = ZN; grid.BID = BID; grid.ARCH = ARCH;
  // sąsiedztwo krawędzi → czworokąty (do krawężników)
  const Q = quads.length / 4, edgeQ = new Map();
  for (let q = 0; q < Q; q++)
    for (let i = 0; i < 4; i++) {
      const a = quads[q * 4 + i], b = quads[q * 4 + ((i + 1) % 4)];
      const k = a < b ? a * N + b : b * N + a;
      const e = edgeQ.get(k);
      if (e === undefined) edgeQ.set(k, q);
      else edgeQ.set(k, [e, q]);
    }
  grid.across = (q, a, b) => {
    const e = edgeQ.get(a < b ? a * N + b : b * N + a);
    if (Array.isArray(e)) return e[0] === q ? e[1] : e[0];
    return -1;
  };
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
  if (zone === Z_MINISTRY) {
    if (L === 0) return { mod: h < 0.3 ? 'door' : 'wall', screen: h > 0.9 };
    return { mod: 'modern' };
  }
  if (L === 0) {
    const info = buildingInfo(city.seed, g.BID[a], zone);
    if (zone === Z_TENEMENT) {
      if (facesStreet && h < 0.025) return { mod: 'rustic', screen: true };
      if (facesStreet && info.shops && h < 0.55) return { mod: 'shop' };
      if (h < 0.7) return { mod: h < 0.66 && facesStreet ? 'door' : 'window' };
      return { mod: h < 0.85 ? 'window' : 'rustic', poster: h > 0.93 };
    }
    if (facesStreet && h < 0.006) return { mod: 'wall', screen: true };
    if (h < 0.22) return { mod: 'door' };
    if (info.shops && facesStreet && h < 0.5) return { mod: 'shop' };
    return { mod: h > 0.94 ? 'wall' : 'window', poster: h > 0.94 };
  }
  return { mod: null, balcony: h < 0.08 && L <= 2 };
}

// ── dekoracje: latarnie, drzewa, ławki, teleekrany (wspólne dla świata i kolizji)
export function decorate(city) {
  const g = city.grid, { X, Z, quads, TY } = g, seed = city.seed, T = city.terrain;
  const lamps = [], trees = [], benches = [], screens = [];
  const Q = quads.length / 4;
  for (let q = 0; q < Q; q++) {
    const G = quadGeom(g, q);
    const mixed = quadMixed0(g, q);
    for (let i = 0; i < 4; i++) {
      const a = G.v[i];
      if (filled(g, a, 0)) {
        for (const side of [0, 1]) {
          const b = side === 0 ? G.v[(i + 1) % 4] : G.v[(i + 3) % 4];
          if (filled(g, b, 0)) continue;
          if (wallPlan(city, a, b, q, side, 0).screen) {
            const f0 = side === 0 ? G.m[i] : G.m[(i + 3) % 4];
            const mx = (f0[0] + G.c[0]) / 2, mz = (f0[1] + G.c[1]) / 2;
            screens.push({ x: mx, z: mz, y: T.height(mx, mz) + 2.7 });
          }
        }
        continue;
      }
      if (mixed && TY[a] === T_STREET && hash(seed, q, i, 41) / 4294967296 < 0.09) {
        const p = [X[a] + (G.c[0] - X[a]) * 0.3, Z[a] + (G.c[1] - Z[a]) * 0.3];
        const d = [G.c[0] - X[a], G.c[1] - Z[a]], l = Math.hypot(d[0], d[1]) || 1;
        const n = [d[0] / l, d[1] / l];
        lamps.push({ p, n, e: [-n[1], n[0]] });
      }
    }
  }
  for (let v = 0; v < g.N; v++) {
    const t = TY[v];
    if (t !== T_PARK && t !== T_GARDEN && t !== T_COURT) continue;
    const hv = hash(seed, v, 9) / 4294967296;
    const p = [X[v], Z[v]];
    if (Math.abs(p[0]) > city.half - 3 || Math.abs(p[1]) > city.half - 3) continue;
    const mon = city.monuments.some((m) => Math.hypot(m[0] - p[0], m[1] - p[1]) < 8);
    if (mon) continue;
    const pTree = t === T_PARK ? 0.3 : t === T_GARDEN ? 0.45 : g.ZN[v] === Z_HOUSES ? 0.14 : 0.07;
    if (hv < pTree) trees.push({ p, s: 0.75 + (hash(seed, v, 10) / 4294967296) * 0.55 });
    else if (t === T_PARK && hv < pTree + 0.05) {
      const a = (hash(seed, v, 12) / 4294967296) * Math.PI * 2;
      benches.push({ p, e: [Math.cos(a), Math.sin(a)], n: [-Math.sin(a), Math.cos(a)] });
    }
  }
  Object.assign(city, { lamps, trees, benches, screens });
}

// podział na fragmenty do strumieniowania
export function makeChunks(city, size = 80) {
  const g = city.grid, { X, Z, quads } = g, n = Math.ceil((2 * city.half) / size);
  const chunks = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const cx = -city.half + (i + 0.5) * size, cz = -city.half + (j + 0.5) * size;
      chunks.push({ id: chunks.length, center: [cx, cz], radius: size * 0.72, quads: [], lamps: [], trees: [], benches: [], monuments: [], billboards: [] });
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
  for (const k of ['lamps', 'trees', 'benches', 'billboards']) for (const it of city[k]) at(it.p[0], it.p[1])[k].push(it);
  for (const m of city.monuments) at(m[0], m[1]).monuments.push(m);
  return chunks;
}
