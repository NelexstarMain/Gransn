// Składanie świata z modułów na nieregularnej siatce czworokątów.
// Każda ściana, dach, chodnik i krawężnik to moduł z idealnej kostki,
// wciśnięty w ćwiartkę czworokąta wyznaczoną przez 4 punkty dookoła.
// Narożniki kostki NIE tworzą prostopadłościanu: czworokąty są krzywe,
// a każdy narożnik stoi na terenie na innej wysokości.
import { Builder } from './builder.js';
import { Cage } from './cage.js';
import { M } from './modules.js';
import { SHOP_SIGNS, BIG_BROTHER } from './atlas.js';
import { Rng, hash } from '../core/rng.js';
import { HALF } from '../city/layout.js';
import { levelY, filled, quadGeom, quadMixed0, wallPlan, buildingInfo, ridgeH, T_BLD, T_COURT, T_PARK, T_PLAZA, T_GARDEN, Z_HOUSES } from '../city/grid.js';

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function place(b, name, cage, W, H, D, p) {
  b.cell(cage, W, H, D);
  M[name](b, W, H, D, p);
}

const NONE = [0, 0, 0, 0];

// Narożnik komórki: punkt siatki na terenie + wysokość poziomu
function corner(T, blk, p, y) {
  return [p[0], T.height(p[0], p[1]) + y, p[1]];
}

// pts = [u0w0, u1w0, u0w1, u1w1] w rzucie XZ
function cage4(T, blk, pts, fl, y0, y1) {
  const c = (i, y) => corner(T, blk, pts[i], y);
  return new Cage([c(0, y0), c(1, y0), c(0, y1), c(1, y1), c(2, y0), c(3, y0), c(2, y1), c(3, y1)]);
}

function boxPts(p, e, n, W, D) {
  const P = (su, sw) => [p[0] + e[0] * (W / 2) * su + n[0] * (D / 2) * sw, p[1] + e[1] * (W / 2) * su + n[1] * (D / 2) * sw];
  return [P(-1, -1), P(1, -1), P(-1, 1), P(1, 1)];
}

const LEAVES = [[0.36, 0.48, 0.24], [0.3, 0.42, 0.22], [0.42, 0.5, 0.26], [0.5, 0.48, 0.24], [0.28, 0.38, 0.26]];

function placeLamp(b, T, l) {
  place(b, 'lamp', cage4(T, null, boxPts(l.p, l.e, l.n, 1, 1), NONE, 0.15, 6.15), 1, 6, 1, { metalTint: [0.17, 0.22, 0.19] });
}

function placeTree(b, T, t, r) {
  const s = t.s, W = 5.2 * s, H = 8.5 * s;
  const a = r.float(0, Math.PI * 2), e = [Math.cos(a), Math.sin(a)], n = [-e[1], e[0]];
  const blobs = [[r.float(-0.05, 0.05), r.float(0.62, 0.72), 0, r.float(0.42, 0.52)]];
  for (let i = 0; i < r.int(1, 3); i++) blobs.push([r.float(-0.25, 0.25), r.float(0.5, 0.66), r.float(-0.25, 0.25), r.float(0.28, 0.38)]);
  place(b, 'tree', cage4(T, null, boxPts(t.p, e, n, W, W), NONE, 0, H), W, H, W, { leaf: r.pick(LEAVES), blobs });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Fragment świata = zbiór czworokątów siatki. Dla każdego czworokąta i każdego
//  poziomu patrzymy na 4 narożniki (marching squares na nieregularnej siatce):
//  ćwiartka narożnika pełnego obok ćwiartki pustej → ściana; najwyższy poziom
//  narożnika → dach; pusty parter pod pełnym piętrem → strop prześwitu.
// ─────────────────────────────────────────────────────────────────────────────
export function buildChunk(city, id) {
  const ch = city.chunks[id], T = city.terrain;
  const b = new Builder();
  b.ground = (x, z) => T.height(x, z);
  for (const q of ch.quads) buildQuad(b, city, q);
  const r = new Rng(hash(city.seed, id, 99));
  for (const t of ch.trees) placeTree(b, T, t, r);
  for (const l of ch.lamps) placeLamp(b, T, l);
  for (const be of ch.benches) place(b, 'bench', cage4(T, null, boxPts(be.p, be.e, be.n, 1.8, 0.6), NONE, 0.05, 1.05), 1.8, 1, 0.6, {});
  for (const m of ch.monuments) place(b, 'monument', cage4(T, null, boxPts(m.p, [1, 0], [0, 1], 4, 4), NONE, 0, 13), 4, 13, 4, { poster: 'bb4' });
  for (const bb of ch.billboards) {
    const [w, h] = bb.size, H = bb.noPosts ? h + 0.6 : h + 3.2;
    const pts = boxPts(bb.p, bb.e, bb.n, w, 0.6);
    const cg = bb.y ? Cage.quad(pts[0], pts[1], pts[2], pts[3], T.plaza.y + bb.y, T.plaza.y + bb.y + H) : cage4(T, null, pts, NONE, 0, H);
    place(b, 'billboard', cg, w, H, 0.6, { name: bb.name, posts: !bb.noPosts });
  }
  return b.finish();
}

function quarterInfo(G, i) {
  // ćwiartka narożnika i: [v_i, m_i (do i+1), c, m_{i-1}]
  return { v: G.p[i], mA: G.m[i], c: G.c, mB: G.m[(i + 3) % 4] };
}

function buildQuad(b, city, q) {
  const g = city.grid, T = city.terrain, seed = city.seed;
  const G = quadGeom(g, q);
  const V = G.v;

  for (let i = 0; i < 4; i++) {
    const a = V[i];
    const Qi = quarterInfo(G, i);
    if (g.TY[a] === T_BLD) {
      const zone = g.ZN[a];
      const info = buildingInfo(seed, g.BID[a], zone);
      const top = g.H[a];
      setTints(b, info);
      for (let L = 0; L < top; L++) {
        if (!filled(g, a, L)) continue;
        // ściany na dwóch wewnętrznych bokach ćwiartki
        for (const side of [0, 1]) {
          const nb = side === 0 ? V[(i + 1) % 4] : V[(i + 3) % 4];
          if (filled(g, nb, L)) continue;
          const f0 = side === 0 ? Qi.mA : Qi.mB, back1 = side === 0 ? Qi.mB : Qi.mA;
          wallSegment(b, city, info, a, nb, q, side, L, [f0, Qi.c, Qi.v, back1], top);
        }
        if (L > 0 && !filled(g, a, L - 1)) {
          const y = levelY(L);
          b.wpoly(info.wallMat, [Qi.v, Qi.mA, Qi.c, Qi.mB].map((p) => [p[0], T.height(p[0], p[1]) + y, p[1]]), [0, -1, 0], { shade: 0.45 });
        }
      }
      roofQuarter(b, city, info, G, i, top);
      continue;
    }
    groundQuarter(b, city, G, i, q);
  }
}

function setTints(b, info) {
  b.setTint('plaster', info.tint);
  b.setTint('brick', info.style === 'brick' ? [0.78, 0.6, 0.52] : [0.68, 0.52, 0.46]);
  b.setTint('stone', info.zone === 2 ? [0.9, 0.9, 0.87] : info.style === 'brick' ? [0.8, 0.77, 0.7] : [0.76, 0.73, 0.67]);
}

const GLASS = [[0.32, 0.36, 0.4], [0.32, 0.36, 0.4], [0.32, 0.36, 0.4], [0.78, 0.74, 0.64], [0.55, 0.44, 0.3], [0.16, 0.17, 0.18]];

function wallSegment(b, city, info, a, nb, q, side, L, pts, top) {
  const T = city.terrain, g = city.grid;
  const [f0, f1, b0, b1] = pts;
  const W = dist(f0, f1), D = (dist(f0, b0) + dist(f1, b1)) / 2;
  const y0 = levelY(L), y1 = levelY(L + 1), H = y1 - y0;
  const cage = cage4(T, null, pts, NONE, y0, y1);
  const hh = hash(city.seed, a, nb, q, L);
  const plan = wallPlan(city, a, nb, q, side, L);
  const house = info.zone === Z_HOUSES;
  const p = {
    style: info.style, wallMat: info.wallMat, groundMat: info.groundMat || info.wallMat,
    frameTint: info.frameTint, doorTint: info.doorTint, metalTint: [0.2, 0.22, 0.21], signTint: [0.25, 0.3, 0.24],
    shopGlass: [0.3, 0.32, 0.33], variant: info.variant, bars: info.bars, glassTint: GLASS[hh % GLASS.length],
    shutters: info.shutters, shutterTint: info.shutterTint, flowers: L > 0 ? info.flowers : null,
    simple: g.TY[nb] === T_COURT, sign: SHOP_SIGNS[hh % 4],
  };
  let mod;
  if (W < 1.25) mod = 'wall';
  else if (L === 0) { mod = plan.mod; p.ground = true; }
  else if (info.zone === 2) mod = 'modern';
  else if (plan.balcony && !house) mod = 'balcony';
  else mod = info.style === 'ornate' ? 'ornate' : info.style === 'modern' ? 'modern' : 'window';
  if (mod === 'shop' && W < 2.4) mod = 'window';
  if (mod === 'door' && W < 1.8) mod = 'wall';
  place(b, mod, cage, W, H, D, p);
  if (L === 0 && plan.screen) place(b, 'telescreen', cage, W, H, D, p);
  if (L === 0 && plan.poster) place(b, 'poster', cage, W, H, D, { name: BIG_BROTHER[hh % BIG_BROTHER.length], y: 0.9, w: Math.min(W * 0.6, 1.2) });
  // gzyms nad parterem kamienicy
  if (L === 1 && info.zone === 1 && !filled(g, nb, 0)) place(b, 'string', cage4(T, null, pts, NONE, y0, y0 + 0.32), W, 0.32, D, p);
  // okap / gzyms wieńczący
  if (L === top - 1) {
    const ce = info.ce;
    const cg = cage4(T, null, pts, NONE, y1, y1 + ce);
    if (house) place(b, 'eave', cg, W, ce, D, { roofTint: info.roofTint });
    else place(b, 'cornice', cg, W, ce, D, { style: info.zone === 2 ? 'modern' : info.style, consoles: info.style === 'ornate', mat: info.zone === 2 ? 'stone' : undefined });
  }
}

// dach ćwiartki: wysokość w każdym z 4 punktów z sąsiedztwa (okap = 0, kalenica = ridgeH)
function roofQuarter(b, city, info, G, i, top) {
  const g = city.grid, T = city.terrain, V = G.v;
  const a = V[i];
  const base = levelY(top) + info.ce;
  const flat = info.zone === 2;
  const lower = (v) => g.TY[v] !== T_BLD || g.H[v] < top;
  const Hr = (p, eave) => (flat || eave ? 0 : ridgeH(p[0], p[1]));
  const pv = G.p[i], pA = G.m[i], pB = G.m[(i + 3) % 4], pc = G.c;
  const hv = Hr(pv, false);
  const hA = Hr(pA, lower(V[(i + 1) % 4]));
  const hB = Hr(pB, lower(V[(i + 3) % 4]));
  const hc = Hr(pc, V.some(lower));
  const P = (p, h) => [p[0], T.height(p[0], p[1]) + base + h, p[1]];
  const o = { tint: info.roofTint };
  b.wpoly('roof', [P(pv, hv), P(pA, hA), P(pc, hc), P(pB, hB)], [0, 1, 0], o);
  if (!flat && hv > 2.6 && hash(city.seed, a, 77) / 4294967296 < 0.1) {
    const e = [1, 0], n = [0, 1];
    b.cell(cage4(T, null, boxPts(pv, e, n, 1, 1), NONE, base, base + 1), 1, 1, 1);
    M.chimney(b, 0.5, 0.5, hv - 1.2, hv + 1.3, { chimneyTint: [0.6, 0.45, 0.4] });
  }
}

// nawierzchnia ćwiartki pustego punktu: chodnik (z krawężnikiem), trawa, posadzka
function groundQuarter(b, city, G, i, q) {
  const g = city.grid, T = city.terrain, a = G.v[i], ty = g.TY[a];
  if (T.river(G.p[i][0], G.p[i][1]).d < T.hw + 1) return;
  const pts = [G.p[i], G.m[i], G.m[(i + 3) % 4], G.c];
  const W = dist(pts[0], pts[1]), D = dist(pts[0], pts[2]);
  const mixed = quadMixed0(g, q);
  const cage = cage4(T, null, pts, NONE, 0, 0.15);
  if (mixed || ty === T_PLAZA) {
    place(b, 'sidewalk', cage, W, 0.15, D, { mat: 'slab', o: { drape: 0.15 } });
    if (ty === T_PLAZA && !mixed) return;
    // krawężniki od strony czworokątów bez zabudowy
    for (const [s0, s1, inn0, inn1, other] of [
      [G.p[i], G.m[i], G.m[(i + 3) % 4], G.c, G.v[(i + 1) % 4]],
      [G.m[(i + 3) % 4], G.p[i], G.c, G.m[i], G.v[(i + 3) % 4]],
    ]) {
      const oq = g.across(q, a, other);
      if (oq >= 0 && (quadMixed0(g, oq) || g.TY[a] === T_PLAZA)) continue;
      const k0 = 0.3 / (dist(s0, inn0) || 1), k1 = 0.3 / (dist(s1, inn1) || 1);
      const bk0 = lerp2(s0, inn0, k0), bk1 = lerp2(s1, inn1, k1);
      place(b, 'curb', cage4(T, null, [s0, s1, bk0, bk1], NONE, 0, 0.16), dist(s0, s1), 0.16, 0.3, {});
    }
    return;
  }
  if (ty === T_PARK || ty === T_GARDEN || (ty === T_COURT && g.ZN[a] === Z_HOUSES)) place(b, 'cobble', cage4(T, null, pts, NONE, 0, 1), W, 1, D, { mat: 'grass', step: 3, o: { drape: 0.05 } });
  else if (ty === T_COURT) place(b, 'cobble', cage4(T, null, pts, NONE, 0, 1), W, 1, D, { mat: 'cobble', step: 3, o: { drape: 0.04 } });
}

// ── rzeka: nabrzeża i mosty (jeden stały fragment świata) ───────────────────
export function buildRiver(city) {
  const T = city.terrain, b = new Builder();
  b.ground = (x, z) => T.height(x, z);
  const yb = T.waterY - 0.6, H = T.bankY - yb;
  const nearBridge = (p) => city.bridges.some((br) => {
    const dx = p[0] - br.p[0], dz = p[1] - br.p[1];
    return Math.abs(dx * br.perp[0] + dz * br.perp[1]) < br.width / 2 + 0.6 && Math.abs(dx * br.axis[0] + dz * br.axis[1]) < br.L + 3;
  });
  for (const bank of [T.left, T.right]) {
    for (let i = 0; i < bank.length - 1; i++) {
      const a = bank[i], c = bank[i + 1], L = dist(a, c), m = Math.max(1, Math.round(L / 6));
      const mid = lerp2(a, c, 0.5), rv = T.river(mid[0], mid[1]);
      const out = [rv.nx, rv.nz]; // od osi rzeki na ląd
      for (let j = 0; j < m; j++) {
        const pa = lerp2(a, c, j / m), pc = lerp2(a, c, (j + 1) / m);
        const qa = [pa[0] + out[0], pa[1] + out[1]], qc = [pc[0] + out[0], pc[1] + out[1]];
        const rail = !nearBridge(lerp2(pa, pc, 0.5)) && !nearBridge(pa) && !nearBridge(pc);
        place(b, 'quay', Cage.quad(pa, pc, qa, qc, yb, T.bankY), dist(pa, pc), H, 1, { rail });
      }
    }
  }
  for (const br of city.bridges) {
    const spans = 3, hw = br.width / 2;
    const E = (t) => lerp2(br.e0, br.e1, t);
    const Hb = T.bankY - yb;
    for (let s = 0; s < spans; s++) {
      const a = E(s / spans), c = E((s + 1) / spans);
      const pts = [[a[0] - br.perp[0] * hw, a[1] - br.perp[1] * hw], [c[0] - br.perp[0] * hw, c[1] - br.perp[1] * hw], [a[0] + br.perp[0] * hw, a[1] + br.perp[1] * hw], [c[0] + br.perp[0] * hw, c[1] + br.perp[1] * hw]];
      place(b, 'bridge', Cage.quad(pts[0], pts[1], pts[2], pts[3], yb, T.bankY), dist(a, c), Hb, br.width, { end0: s === 0, end1: s === spans - 1 });
    }
    for (const sd of [-1, 1]) {
      const p = [br.p[0] + br.perp[0] * sd * (hw - 0.9), br.p[1] + br.perp[1] * sd * (hw - 0.9)];
      const nn = [br.perp[0] * sd, br.perp[1] * sd];
      place(b, 'lamp', Cage.oriented(p, br.axis, nn, 1, 1, T.bankY + 0.15, T.bankY + 6.15), 1, 6, 1, { metalTint: [0.17, 0.22, 0.19] });
    }
  }
  return b.finish();
}

// ── LOD: jedna płaszczyzna na odcinek ściany, dachy z tych samych punktów ──
export function buildChunkLOD(city, id) {
  const ch = city.chunks[id], T = city.terrain, g = city.grid;
  const b = new Builder();
  b.ground = (x, z) => T.height(x, z);
  for (const q of ch.quads) {
    const G = quadGeom(g, q), V = G.v;
    for (let i = 0; i < 4; i++) {
      const a = V[i];
      if (g.TY[a] !== T_BLD) {
        const ty = g.TY[a];
        if (ty === T_PARK || ty === T_GARDEN) b.wpoly('grass', [G.p[i], G.m[i], G.c, G.m[(i + 3) % 4]].map((p) => [p[0], T.height(p[0], p[1]) + 0.05, p[1]]), [0, 1, 0], { flat: 1 });
        continue;
      }
      const info = buildingInfo(city.seed, g.BID[a], g.ZN[a]);
      const top = g.H[a];
      for (const side of [0, 1]) {
        const nb = side === 0 ? V[(i + 1) % 4] : V[(i + 3) % 4];
        const nh = g.TY[nb] === T_BLD ? g.H[nb] : 0;
        if (nh >= top) continue;
        const f0 = side === 0 ? G.m[i] : G.m[(i + 3) % 4], f1 = G.c;
        const y0 = levelY(nh), y1 = levelY(top) + info.ce;
        const hint = [f0[0] - G.p[i][0] + f1[0] - G.p[i][0], 0, f0[1] - G.p[i][1] + f1[1] - G.p[i][1]];
        const ga = T.height(f0[0], f0[1]), gb = T.height(f1[0], f1[1]);
        b.wpoly('lod', [[f0[0], ga + y0, f0[1]], [f1[0], gb + y0, f1[1]], [f1[0], gb + y1, f1[1]], [f0[0], ga + y1, f0[1]]], hint, {
          tint: info.wallMat === 'brick' ? [0.62, 0.45, 0.38] : info.tint, uv: [[0, nh], [1, nh], [1, top], [0, top]],
        });
      }
      roofQuarterLOD(b, city, info, G, i, top);
    }
  }
  for (const t of ch.trees) {
    const gy = T.height(t.p[0], t.p[1]), r = 2.4 * t.s, h = 8 * t.s;
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2, a1 = ((k + 1) / 4) * Math.PI * 2;
      b.wpoly('leaf', [[t.p[0] + Math.cos(a0) * r, gy + h * 0.4, t.p[1] + Math.sin(a0) * r], [t.p[0] + Math.cos(a1) * r, gy + h * 0.4, t.p[1] + Math.sin(a1) * r], [t.p[0], gy + h, t.p[1]]], null, { tint: [0.34, 0.45, 0.24] });
    }
  }
  return b.finish();
}

function roofQuarterLOD(b, city, info, G, i, top) {
  const g = city.grid, T = city.terrain, V = G.v;
  const base = levelY(top) + info.ce, flat = info.zone === 2;
  const lower = (v) => g.TY[v] !== T_BLD || g.H[v] < top;
  const Hr = (p, eave) => (flat || eave ? 0 : ridgeH(p[0], p[1]));
  const pts = [[G.p[i], false], [G.m[i], lower(V[(i + 1) % 4])], [G.c, V.some(lower)], [G.m[(i + 3) % 4], lower(V[(i + 3) % 4])]];
  b.wpoly('lodroof', pts.map(([p, e]) => [p[0], T.height(p[0], p[1]) + base + Hr(p, e), p[1]]), [0, 1, 0], { tint: info.roofTint });
}

// ── nawierzchnia (bruk) na terenie, przycięta do brzegów rzeki ──────────────
export const GROUND_TILES = 7;
export function buildGroundTile(city, tx, tz) {
  const T = city.terrain, b = new Builder();
  const size = (2 * HALF) / GROUND_TILES;
  const pad = 40;
  const ax = -HALF + tx * size - (tx === 0 ? pad : 0), bx = -HALF + (tx + 1) * size + (tx === GROUND_TILES - 1 ? pad : 0);
  const az = -HALF + tz * size - (tz === 0 ? pad : 0), bz = -HALF + (tz + 1) * size + (tz === GROUND_TILES - 1 ? pad : 0);
  const step = 3, nx = Math.round((bx - ax) / step), nz = Math.round((bz - az) / step);
  const V = [], side = [];
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      let x = ax + ((bx - ax) * i) / nx, z = az + ((bz - az) * j) / nz;
      const cl = T.clampToBank(x, z);
      side.push(cl ? cl[2] : 0);
      if (cl) { x = cl[0]; z = cl[1]; }
      V.push([x, T.height(x, z), z]);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const ids = [j * (nx + 1) + i, j * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i];
      // kafel z wierzchołkami rzuconymi na OBA brzegi zakryłby rzekę — pomijamy
      if (ids.some((k) => side[k] > 0) && ids.some((k) => side[k] < 0)) continue;
      if (ids.every((k) => side[k] !== 0)) continue;
      b.wpoly('cobble', ids.map((k) => V[k]), [0, 1, 0]);
    }
  return b.finish();
}
