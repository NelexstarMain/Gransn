// ─────────────────────────────────────────────────────────────────────────────
//  DZIAŁKI — „pierzeje rosnące wzdłuż ulic” (frontage growth).
//
//  Zamiast wycinać domy z jednej wspólnej, nieregularnej siatki, miasto dostaje
//  prawdziwy podział gruntu, tak jak powstawał historycznie:
//   1. Sieć ulic dzieli się na ŁAŃCUCHY (odcinki między skrzyżowaniami). Łańcuchy
//      są obsługiwane od najważniejszych (blisko rynku, szerokie) — narożne działki
//      należą więc do ważniejszej ulicy, a boczna ulica dostawia się do ich ściany.
//   2. Po obu stronach łańcucha idzie „geodeta”: odmierza kolejne działki o szerokości
//      frontu i głębokości typowej dla dzielnicy (wąskie parcele Starego Miasta,
//      szerokie kamienice śródmieścia, domy z odstępami, wille w ogrodach, hale).
//      Działka to prawie prostokąt: boki prostopadłe do ulicy, front i tył biegną
//      równolegle do niej (na łuku ulicy działka lekko się wygina).
//   3. Każda działka musi przejść pomiar: cała leży na lądzie, poza jezdniami, torami,
//      mostami i innymi działkami. Gdy się nie mieści, geodeta próbuje płytszej i
//      węższej; na ostrym narożniku — rzadko — działki ze ściętym bokiem (trapez).
//   4. Kolejne działki w rzędzie tworzą PIERZEJĘ ze wspólną linią zabudowy. Każda
//      pierzeja dostaje własną, regularną kratkę punktów (kolumny = przęsła domów,
//      rzędy = trakty w głąb działki), doklejaną do siatki miasta. Dzięki temu cała
//      reszta gry (ściany, dachy, fasady, kolizje, LOD) działa bez zmian, a domy są
//      prostokątne i stoją równo przy ulicy.
//  Wszystko jest deterministyczne z ziarna (Rng/hash) — ten sam wynik w każdym workerze.
// ─────────────────────────────────────────────────────────────────────────────
import { Rng, hash } from '../core/rng.js';
import { polyDist } from './routes.js';

// front [min,max] m · nz: wagi liczby traktów · cd: głębokość traktu · sb: odsunięcie od jezdni
// gapP/gap: przerwa po działce · skip: pusta parcela · rowMax: ile działek w jednej pierzei
export const DISTRICT = {
  old: { W: [5.6, 9.4], nz: [[2, 3], [3, 2]], cd: [4.0, 4.7], sb: [2.4, 3.0], gapP: 0.05, gap: [2.6, 3.4], skip: 0.02, rowMax: 9 },
  tenement: { W: [9, 16.5], nz: [[2, 1], [3, 4]], cd: [4.2, 4.9], sb: [2.8, 3.5], gapP: 0.06, gap: [3, 4.2], skip: 0.03, rowMax: 7 },
  houses: { W: [7.6, 12], nz: [[1, 0.6], [2, 4], [3, 0.6]], cd: [4.2, 4.9], sb: [3.2, 5.6], gapP: 0.72, gap: [2.6, 5.5], skip: 0.1, rowMax: 6 },
  villa: { W: [10, 15], nz: [[2, 3], [3, 2]], cd: [4.4, 5.0], sb: [5.5, 8.5], gapP: 1, gap: [5, 9], skip: 0.12, rowMax: 4 },
  industrial: { W: [14, 25], nz: [[3, 3], [4, 2]], cd: [4.6, 5.2], sb: [3.2, 4.4], gapP: 0.8, gap: [4, 8], skip: 0.1, rowMax: 4 },
};

const nodeKey = (p) => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);

// łańcuchy: ciągi odcinków ulic miejskich między skrzyżowaniami
function makeChains(streets) {
  const nodes = new Map();
  const ok = (s) => s.town && !s.bridge && s.type !== 'H';
  streets.forEach((s, i) => { for (const p of [s.a, s.b]) { const k = nodeKey(p); if (!nodes.has(k)) nodes.set(k, []); nodes.get(k).push(i); } });
  const used = new Uint8Array(streets.length), chains = [];
  const dirOf = (s, from) => { const a = from ? s.a : s.b, b = from ? s.b : s.a, l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const extend = (pts, si, end) => {
    // end = punkt, od którego idziemy dalej
    for (;;) {
      const s = streets[si], k = nodeKey(end), at = nodes.get(k);
      if (!at || at.length !== 2) return;
      const ni = at[0] === si ? at[1] : at[0], n = streets[ni];
      if (used[ni] || !ok(n)) return;
      const fwd = nodeKey(n.a) === k;
      const d0 = dirOf(s, nodeKey(s.b) === k), d1 = dirOf(n, fwd);
      if (d0[0] * d1[0] + d0[1] * d1[1] < 0.75) return;
      used[ni] = 1;
      end = fwd ? n.b : n.a;
      pts.push(end);
      si = ni;
    }
  };
  streets.forEach((s, i) => {
    if (used[i] || !ok(s)) return;
    used[i] = 1;
    const fw = [s.a, s.b];
    extend(fw, i, s.b);
    const bw = [s.b, s.a];
    extend(bw, i, s.a);
    chains.push({ pts: [...bw.slice(2).reverse(), ...fw], rw: s.rw, main: !!s.main });
  });
  return chains;
}

// oś łańcucha próbkowana co ~1 m, z wygładzonym kierunkiem (działki nie „łamią się” na załomach)
function sampleChain(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(2, Math.ceil(L)), h = L / n;
  const sx = new Float64Array(n + 1), sz = new Float64Array(n + 1), rx = new Float64Array(n + 1), rz = new Float64Array(n + 1), tx = new Float64Array(n + 1), tz = new Float64Array(n + 1);
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const s = Math.min(L, i * h);
    while (k < pts.length - 2 && cum[k + 1] < s) k++;
    const l = cum[k + 1] - cum[k] || 1, t = (s - cum[k]) / l;
    sx[i] = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t; sz[i] = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t;
    rx[i] = (pts[k + 1][0] - pts[k][0]) / l; rz[i] = (pts[k + 1][1] - pts[k][1]) / l;
  }
  for (let i = 0; i <= n; i++) {
    let ax = 0, az = 0;
    for (let j = Math.max(0, i - 4); j <= Math.min(n, i + 4); j++) { ax += rx[j]; az += rz[j]; }
    const l = Math.hypot(ax, az) || 1;
    tx[i] = ax / l; tz[i] = az / l;
  }
  return {
    L,
    // punkt w odległości d od osi po stronie sg, na długości u (poza końcami: przedłużenie po stycznej)
    pos(u, d, sg) {
      let x, z, ax, az;
      if (u <= 0) { ax = tx[0]; az = tz[0]; x = sx[0] + ax * u; z = sz[0] + az * u; }
      else if (u >= L) { ax = tx[n]; az = tz[n]; x = sx[n] + ax * (u - L); z = sz[n] + az * (u - L); }
      else {
        const f = u / h, i = Math.min(n - 1, Math.floor(f)), t = f - i;
        x = sx[i] + (sx[i + 1] - sx[i]) * t; z = sz[i] + (sz[i + 1] - sz[i]) * t;
        ax = tx[i] + (tx[i + 1] - tx[i]) * t; az = tz[i] + (tz[i + 1] - tz[i]) * t;
        const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
      }
      return [x - az * sg * d, z + ax * sg * d];
    },
  };
}

export function makeParcels(city, kindAt) {
  const { terrain: T, roads, seed, half } = city;
  const rail = city.routes.rail, C0 = [T.plaza.x, T.plaza.z];
  const lots = [], PX = [], PZ = [], LU = [], LV = [], pLot = [], pI = [], pJ = [], quads = [];
  // zajętość: obrysy przyjętych działek w kratce 20 m
  const occ = new Map(), OC = 20;
  const eachCell = (x0, z0, x1, z1, fn) => { for (let gx = Math.floor(x0 / OC); gx <= Math.floor(x1 / OC); gx++) for (let gz = Math.floor(z0 / OC); gz <= Math.floor(z1 / OC); gz++) fn(gx * 100003 + gz); };
  const addOcc = (lot) => {
    const q = lot.quad;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const p of q) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
    eachCell(x0 - 10, z0 - 10, x1 + 10, z1 + 10, (k) => { if (!occ.has(k)) occ.set(k, []); occ.get(k).push(lot); });
  };
  // odległość punktu od wypukłego czworokąta (0 w środku); quad nawinięty dodatnio
  const quadDist = (q, x, z) => {
    let inside = true, d = 1e18;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], ex = b[0] - a[0], ez = b[1] - a[1];
      if (ex * (z - a[1]) - ez * (x - a[0]) < 0) inside = false;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez || 1)));
      d = Math.min(d, Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t));
    }
    return inside ? 0 : d;
  };
  const lotDist = (x, z, skipRow = -1) => {
    let d = 1e9;
    const l = occ.get(Math.floor(x / OC) * 100003 + Math.floor(z / OC));
    if (l) for (const lot of l) if (lot.row !== skipRow) d = Math.min(d, quadDist(lot.quad, x, z));
    return d;
  };
  const BUILT = DISTRICT;
  const free = (x, z, minCl, row) => {
    if (Math.abs(x) > half - 8 || Math.abs(z) > half - 8) return false;
    if (roads.clearance(x, z) < minCl) return false;
    if (T.inland(x, z) < 38 || T.river(x, z).d < T.hw + 7.5) return false;
    if (polyDist(rail, x, z) < 8) return false;
    for (const ex of city.extras) if (Math.hypot(ex.p[0] - x, ex.p[1] - z) < ex.clear + 1.5) return false;
    for (const b of city.bridges) {
      const dx = x - b.p[0], dz = z - b.p[1];
      if (Math.abs(dx * b.axis[0] + dz * b.axis[1]) < b.L + 22 && Math.abs(dx * b.perp[0] + dz * b.perp[1]) < b.width / 2 + 2.5) return false;
    }
    if (!BUILT[kindAt(x, z)]) return false;
    return lotDist(x, z, row) > 0.9;
  };

  const chains = makeChains(city.streets).map((c, i) => ({ ...c, i, S: sampleChain(c.pts) })).filter((c) => c.S.L > 11);
  // najpierw ulice przy rynku i szerokie, potem boczne
  const GR = city.growth;
  // kolejność jak w historii miasta: najpierw ulice zabudowane najwcześniej, potem przy rynku i szerokie
  const prio = (c) => { const m = c.S.pos(c.S.L / 2, 0, 1), e = GR ? GR.epochAt(m[0], m[1]) || 9 : 0; return e * 400 + Math.hypot(m[0] - C0[0], m[1] - C0[1]) - c.rw * 45 - (c.main ? 80 : 0); };
  chains.sort((a, b) => prio(a) - prio(b) || a.i - b.i);
  let rowId = 0;

  for (const ch of chains) for (const sg of [1, -1]) {
    const S = ch.S, L = S.L, rng = new Rng(hash(seed, ch.i, sg + 2, 4711));
    let row = null, u = 0, skewOK = rng.chance(0.3);
    const P = (lot, uu, v) => {
      // ścięcie boków: tylny narożnik przesunięty wzdłuż ulicy (tylko skrajne działki pierzei)
      const t = Math.max(0, Math.min(1, (uu - lot.u0) / (lot.u1 - lot.u0)));
      return S.pos(uu + v * (lot.skN * (1 - t) + lot.skF * t), ch.rw + row.sb + v, sg);
    };
    const tryLot = (u0, W, nz, skN, skF) => {
      const u1 = u0 + W;
      if (u1 > L + 0.01 || nz < 1) return null;
      const D = nz * row.cd, lot = { u0, u1, skN, skF, W, D, nz };
      const c = P(lot, (u0 + u1) / 2, D / 2);
      if (!BUILT[kindAt(c[0], c[1])]) return null;
      const ku = Math.max(2, Math.ceil(W / 2.6)), kv = Math.max(2, Math.ceil(D / 2.6));
      for (let j = 0; j <= kv; j++) for (let i = 0; i <= ku; i++) { const p = P(lot, u0 + (W * i) / ku, (D * j) / kv); if (!free(p[0], p[1], Math.min(2.3, row.sb - 0.1), row.id)) return null; }
      const q = [P(lot, u0, 0), P(lot, u1, 0), P(lot, u1, D), P(lot, u0, D)];
      const fw = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), bw = Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1]);
      if (fw < W * 0.6 || fw > W * 1.5 || bw < W * 0.55 || bw > W * 1.6) return null; // za mocno zgnieciona na łuku
      let ar = 0;
      for (let i = 0; i < 4; i++) ar += q[i][0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * q[i][1];
      lot.quad = ar < 0 ? [q[3], q[2], q[1], q[0]] : q;
      lot.cx = c[0]; lot.cz = c[1];
      return lot;
    };
    const emit = () => {
      if (row) {
        while (row.cols.length && !row.cols[row.cols.length - 1].lot) row.cols.pop();
        if (row.lots.length) emitRow(row, S, ch, sg, P);
      }
      row = null;
    };
    while (u < L - 4) {
      const pc = S.pos(u + 4, ch.rw + 8, sg), kind = kindAt(pc[0], pc[1]), DP = DISTRICT[kind];
      const pf = S.pos(u + 4, ch.rw + 4, sg);
      if (!DP || (GR && !GR.developed(pf[0], pf[1]))) { emit(); u += 5; continue; } // pole nigdy nie zasiedlone: łąka
      if (row && (row.kind !== kind || row.lots.length >= DP.rowMax)) emit();
      if (!row) row = { id: rowId++, kind, sb: rng.float(DP.sb[0], DP.sb[1]), cd: rng.float(DP.cd[0], DP.cd[1]), cols: [], lots: [] };
      // im dalej od rynku, tym więcej pustych parcel
      const dc = Math.hypot(pc[0] - C0[0], pc[1] - C0[1]);
      if (rng.chance(DP.skip + (kind === 'old' || kind === 'tenement' ? 0 : 0.18 * Math.min(1, dc / 380)))) { emit(); u += rng.float(7, 12); continue; }
      const W = rng.float(DP.W[0], DP.W[1]), nz = rng.weighted(DP.nz);
      let lot = tryLot(u, W, nz, 0, 0) || tryLot(u, W, nz - 1, 0, 0) || tryLot(u, DP.W[0], Math.max(1, nz - 1), 0, 0);
      const first = row.lots.length === 0;
      if (!lot && first && skewOK) lot = tryLot(u, W, nz, 0.35, 0) || tryLot(u, W, nz, 0.6, 0);
      let last = false;
      if (!lot && !first && skewOK && row.cols[row.cols.length - 1].lot) { lot = tryLot(u, W, nz, 0, -0.35) || tryLot(u, W, Math.max(1, nz - 1), 0, -0.6); last = !!lot; }
      if (!lot) { emit(); u += 1.5; skewOK = rng.chance(0.3); continue; }
      const nx = Math.max(1, Math.round(lot.W / 4.4));
      Object.assign(lot, { id: lots.length, bid: lots.length + 1, row: row.id, kind, nx, epoch: GR ? GR.epochAt(pf[0], pf[1]) : 0, cd: row.cd, sb: row.sb, i0: row.cols.length, dc,
        first, nearStart: lot.u0 < 13, nearEnd: lot.u1 > L - 13, attL: !first && !!row.cols[row.cols.length - 1].lot, attR: false, sg });
      if (lot.attL) row.lots[row.lots.length - 1].attR = true;
      for (let i = 0; i < nx; i++) row.cols.push({ u0: lot.u0 + (lot.W * i) / nx, u1: lot.u0 + (lot.W * (i + 1)) / nx, lot });
      row.lots.push(lot); lots.push(lot); addOcc(lot);
      u = lot.u1;
      if (last) { emit(); u += 1.5; continue; }
      if (rng.chance(DP.gapP)) { const g = rng.float(DP.gap[0], DP.gap[1]); row.cols.push({ u0: u, u1: u + g, lot: null }); u += g; }
    }
    emit();
  }

  // kratka punktów pierzei: kolumny −1…C (skrajne = pierścień pustych punktów), rzędy −1…nz
  function emitRow(row, S, ch, sg, P) {
    const cols = row.cols, C = cols.length, nzR = Math.max(...row.lots.map((l) => l.nz)), base = PX.length, Wd = C + 2;
    const uc = (I) => (I < 0 ? cols[0].u0 - (cols[0].u1 - cols[0].u0) / 2 : I >= C ? cols[C - 1].u1 + (cols[C - 1].u1 - cols[C - 1].u0) / 2 : (cols[I].u0 + cols[I].u1) / 2);
    for (let J = -1; J <= nzR; J++) for (let I = -1; I <= C; I++) {
      const uu = uc(I), v = (J + 0.5) * row.cd, col = cols[Math.max(0, Math.min(C - 1, I))];
      const p = col.lot ? P(col.lot, uu, v) : S.pos(uu, ch.rw + row.sb + v, sg);
      PX.push(p[0]); PZ.push(p[1]); LU.push(uu); LV.push(v);
      const lot = I >= 0 && I < C ? cols[I].lot : null, inl = lot && J >= 0 && J < lot.nz;
      pLot.push(inl ? lot.id : -1); pI.push(inl ? I - lot.i0 : 0); pJ.push(inl ? J : 0);
    }
    for (let J = 0; J <= nzR; J++) for (let I = 0; I <= C; I++) {
      const a = base + J * Wd + I, q = [a, a + 1, a + 1 + Wd, a + Wd];
      if (q.every((k) => pLot[k] < 0)) continue;
      quads.push(...q);
    }
  }
  return { n: PX.length, X: PX, Z: PZ, LU, LV, pLot, pI, pJ, quads, lots, lotDist: (x, z) => lotDist(x, z), lotDistRow: lotDist };
}

// ── bryła na działce: wysokość komórki (i wzdłuż ulicy, j w głąb) ─────────────
export function lotHeight(info, lot, i, j, seed) {
  const { nx, nz } = lot, L0 = info.levels;
  const side = info.stepDir > 0 ? 0 : nx - 1, corner = lot.nearStart ? 0 : lot.nearEnd ? nx - 1 : side;
  const mid = nx >= 3 && i > 0 && i < nx - 1 && (nx % 2 === 1 ? i === (nx - 1) / 2 : i === nx / 2 - 1 || i === nx / 2);
  let h = L0;
  switch (info.shape) {
    case 'stepped': if (nz >= 2 && j >= 1) h -= info.stepDir > 0 ? j : j === nz - 1 ? 1 : 0; break;
    case 'tower': if (i === corner && j === 0) h += info.towerExtra; break;
    case 'crenel': if (mid && j === 0) h += 1; break;
    case 'villa': if (mid) h += 1; break;
    case 'L': if (nz >= 2 && nx >= 2 && j >= 1 && (side === 0 ? i < nx / 2 : i >= nx / 2)) h = info.variant ? Math.max(1, L0 - 1) : 0; break;
  }
  // oficyna: tylny trakt głębokiej kamienicy bywa niższy
  if (nz >= 3 && j === nz - 1 && info.shape !== 'L' && hash(seed, lot.bid, 61) % 100 < 38) h -= 1 + (hash(seed, lot.bid, 62) & 1);
  if (j === 0) h = Math.max(1, h);
  return Math.max(0, Math.min(14, h));
}

// ── dach działki: wysokość nad okapem w punkcie (u wzdłuż frontu, v w głąb) ──
export function lotRoof(lot, u, v) {
  const W = lot.W, D = lot.D, R = lot.R;
  u = Math.max(0, Math.min(W, u)); v = Math.max(0, Math.min(D, v));
  const du = Math.min(u, W - u), dv = Math.min(v, D - v), d = Math.min(du, dv);
  switch (lot.roof) {
    case 'gable': return (R * dv) / (D / 2);          // kalenica wzdłuż ulicy, szczyty po bokach
    case 'gableX': return (R * du) / (W / 2);         // szczyt od ulicy (kamieniczki)
    case 'mansard': { const k = 1.25, m = Math.min(W, D) / 2; return d < k ? (R * 0.72 * d) / k : R * 0.72 + (R * 0.28 * (d - k)) / Math.max(0.5, m - k); }
    case 'flat': return 0;
    default: return (R * d) / (Math.min(W, D) / 2);    // czterospadowy
  }
}

export function pickRoof(seed, lot, info) {
  const h = (hash(seed, lot.bid, 808) % 1000) / 1000, narrow = lot.W < 10.5 && lot.D >= lot.W * 0.8;
  const pick = (t) => { let a = 0; for (const [k, w] of t) { a += w; if (h < a) return k; } return t[t.length - 1][0]; };
  let roof;
  if (info.style === 'modern') roof = 'flat';
  else if (lot.kind === 'old') roof = pick(narrow ? [['gableX', 0.5], ['gable', 0.32], ['hip', 0.08], ['mansard', 0.1]] : [['gable', 0.6], ['mansard', 0.22], ['hip', 0.18]]);
  else if (lot.kind === 'tenement') roof = pick([['gable', 0.42], ['mansard', 0.34], ['hip', 0.24]]);
  else if (lot.kind === 'villa') roof = pick([['hip', 0.5], ['mansard', 0.2], ['gable', 0.2], ['gableX', 0.1]]);
  else if (lot.kind === 'industrial') roof = pick([['gable', 0.7], ['flat', 0.3]]);
  else roof = pick(narrow ? [['gable', 0.42], ['gableX', 0.26], ['hip', 0.27], ['mansard', 0.05]] : [['gable', 0.5], ['hip', 0.42], ['mansard', 0.08]]);
  const span = roof === 'gable' ? lot.D : roof === 'gableX' ? lot.W : Math.min(lot.W, lot.D);
  // spadek 30–52°: wąskie szczyty strome, szerokie połacie łagodniejsze
  const k = roof === 'gableX' ? 0.52 + h * 0.2 : roof === 'mansard' ? 0.36 : lot.kind === 'industrial' ? 0.22 : 0.32 + ((h * 7) % 1) * 0.16;
  return { roof, R: roof === 'flat' ? 0 : Math.max(1.6, Math.min(6.2, span * k)) };
}
