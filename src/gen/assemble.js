// Składanie świata z modułów na nieregularnej siatce czworokątów.
// Każda ściana, dach, chodnik i krawężnik to moduł z idealnej kostki,
// wciśnięty w ćwiartkę czworokąta wyznaczoną przez 4 punkty dookoła.
// Narożniki kostki NIE tworzą prostopadłościanu: czworokąty są krzywe,
// a każdy narożnik stoi na terenie na innej wysokości.
import { Builder } from './builder.js';
import { Cage } from './cage.js';
import { M } from './modules.js';
import { SHOP_SIGNS, POSTERS } from './atlas.js';
import { Rng, hash } from '../core/rng.js';
import { HALF } from '../city/layout.js';
import { levelY, filled, quadGeom, quadMixed0, wallPlan, buildingInfo, ridgeH, T_BLD, T_COURT, T_PLAZA, T_STREET, T_WATER, T_BEACH, T_RAIL, Z_HOUSES } from '../city/grid.js';

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

const LEAF_BY = { oak: [[0.34, 0.48, 0.22], [0.3, 0.42, 0.2], [0.42, 0.5, 0.24]], birch: [[0.5, 0.62, 0.3], [0.56, 0.6, 0.28]], poplar: [[0.3, 0.44, 0.24], [0.36, 0.46, 0.22]], pine: [[0.16, 0.3, 0.18], [0.2, 0.34, 0.2]] };

function placeTree(b, T, t, r) {
  const sp = t.species || 'oak';
  const s = t.s, W = (sp === 'poplar' ? 4 : sp === 'pine' ? 5 : 7) * s, H = (sp === 'poplar' ? 14 : sp === 'pine' ? 12 : 9) * s;
  const rr = new Rng(t.seed || 1);
  const a = rr.float(0, Math.PI * 2), e = [Math.cos(a), Math.sin(a)], n = [-e[1], e[0]];
  place(b, 'tree', cage4(T, null, boxPts(t.p, e, n, W, W), NONE, 0, H), W, H, W, { species: sp, seed: t.seed, leaf: rr.pick(LEAF_BY[sp]) });
}

const CAR_COLORS = [[0.12, 0.13, 0.15], [0.55, 0.12, 0.1], [0.2, 0.32, 0.24], [0.82, 0.8, 0.72], [0.25, 0.35, 0.55], [0.6, 0.6, 0.62], [0.45, 0.32, 0.2]];
const PROP_SIZE = { car: [3.6, 2.2, 1.7], kiosk: [2.4, 3.2, 2.0], booth: [1.0, 2.5, 1.0], busstop: [3.2, 3.1, 1.4], bin: [0.7, 1, 0.7] };

function placeProp(b, T, pr, seed) {
  const r = new Rng(hash(seed, Math.round(pr.p[0] * 10), Math.round(pr.p[1] * 10)));
  if (pr.kind === 'bush') {
    const s = pr.s;
    place(b, 'bush', cage4(T, null, boxPts(pr.p, [1, 0], [0, 1], 2.2 * s, 2.2 * s), NONE, -0.1, 1.6 * s), 2.2 * s, 1.7 * s, 2.2 * s, { leaf: r.pick(LEAF_BY.oak), flowers: r.chance(0.3) ? r.pick([[0.9, 0.2, 0.3], [0.95, 0.85, 0.3], [0.8, 0.5, 0.9]]) : null });
    return;
  }
  const [W, H, D] = PROP_SIZE[pr.kind];
  const y0 = pr.kind === 'car' ? 0 : 0.15;
  const p = pr.kind === 'car' ? { color: r.pick(CAR_COLORS), seat: r.pick([[0.4, 0.12, 0.1], [0.2, 0.15, 0.1], [0.15, 0.2, 0.3]]) } : pr.kind === 'kiosk' ? { sign: r.pick(['gin', 'milk', 'bread', 'tobacco']), color: r.pick([[0.3, 0.45, 0.35], [0.55, 0.2, 0.15], [0.25, 0.35, 0.5]]) } : {};
  place(b, pr.kind === 'car' ? 'oldcar' : pr.kind, cage4(T, null, boxPts(pr.p, pr.e, pr.n, W, D), NONE, y0, y0 + H), W, H, D, p);
}

// cage z wysokościami w 4 narożnikach (trasy: tory, estakada)
function cageY(pts, ys, h) {
  const c = (i, dy) => [pts[i][0], ys[i] + dy, pts[i][1]];
  return new Cage([c(0, 0), c(1, 0), c(0, h), c(1, h), c(2, 0), c(3, 0), c(2, h), c(3, h)]);
}

function routeNormal(P, i) {
  const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [-dz / l, dx / l];
}

function buildRoute(b, city, kind, i) {
  const T = city.terrain, R = city.routes[kind], P = R.pts;
  const a = P[i], c = P[i + 1], na = routeNormal(P, i), nc = routeNormal(P, i + 1), hw = kind === 'rail' ? 2.5 : R.width / 2;
  const pts = [[a[0] - na[0] * hw, a[1] - na[1] * hw], [c[0] - nc[0] * hw, c[1] - nc[1] * hw], [a[0] + na[0] * hw, a[1] + na[1] * hw], [c[0] + nc[0] * hw, c[1] + nc[1] * hw]];
  const W = Math.hypot(c[0] - a[0], c[1] - a[1]);
  if (kind === 'rail') {
    const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    const bridge = T.river(mid[0], mid[1]).d < T.hw + 3;
    if (T.inland(mid[0], mid[1]) < 2) return;
    place(b, 'rail', cageY(pts, [R.y[i], R.y[i + 1], R.y[i], R.y[i + 1]], 1), W, 1, 2 * hw, { bridge, pier: bridge && i % 3 === 0 });
  } else {
    let s0 = 0;
    for (let k = 0; k < i; k++) s0 += Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]);
    const ya = R.y[i] - 1.4, yc = R.y[i + 1] - 1.4;
    const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    const ground = Math.max(T.height(mid[0], mid[1]), T.seaY - 5);
    place(b, 'viaduct', cageY(pts, [ya, yc, ya, yc], 1.4), W, 1.4, 2 * hw, { s0, pillar: i % 4 === 0, drop: (ya + yc) / 2 - ground });
  }
}

function buildExtra(b, city, ex) {
  const T = city.terrain;
  if (ex.kind === 'lighthouse') {
    place(b, 'lighthouse', cage4(T, null, boxPts(ex.p, [1, 0], [0, 1], 8, 8), NONE, -1, 30), 8, 31, 8, {});
  } else if (ex.kind === 'pier') {
    const n = [-ex.e[1], ex.e[0]], end = [ex.p[0] + ex.e[0] * ex.len, ex.p[1] + ex.e[1] * ex.len];
    const pts = [[ex.p[0] - n[0] * 2, ex.p[1] - n[1] * 2], [end[0] - n[0] * 2, end[1] - n[1] * 2], [ex.p[0] + n[0] * 2, ex.p[1] + n[1] * 2], [end[0] + n[0] * 2, end[1] + n[1] * 2]];
    place(b, 'pier', Cage.quad(pts[0], pts[1], pts[2], pts[3], T.seaY - 4, T.seaY + 2.2), ex.len, 6.2, 4, {});
  } else if (ex.kind === 'station') {
    // peron wzdłuż toru + pociąg (lokomotywa i 3 wagony)
    const P = (along, side) => [ex.p[0] + ex.e[0] * along + ex.n[0] * side, ex.p[1] + ex.e[1] * along + ex.n[1] * side];
    const y = ex.y;
    b.cell(Cage.quad(P(-35, 3.2), P(35, 3.2), P(-35, 7.2), P(35, 7.2), y, y + 1), 70, 1, 4);
    b.box('stone', 0, 0, 0, 70, 0.95, 4, 'xXyYzZ', { tint: [0.7, 0.69, 0.66] });
    for (let x = 10; x <= 60; x += 10) b.box('metal', x - 0.1, 0.95, 2.9, x + 0.1, 4, 3.1, 'xXzZ', { tint: [0.25, 0.3, 0.28] });
    b.box('roof', 5, 4, 0.5, 65, 4.25, 4.2, 'xXyYzZ', { tint: [0.4, 0.42, 0.44] });
    const colors = [[0.25, 0.32, 0.5], [0.55, 0.15, 0.12], [0.55, 0.15, 0.12], [0.55, 0.15, 0.12]];
    for (let k = 0; k < 4; k++) {
      const x0 = -32 + k * 15.5, L = 14.5;
      b.cell(Cage.quad(P(x0, -1.5), P(x0 + L, -1.5), P(x0, 1.5), P(x0 + L, 1.5), y + 0.66, y + 4.6), L, 3.94, 3);
      const po = { tint: colors[k] };
      b.box('paint', 0.3, 0.6, 0.05, L - 0.3, 3.2, 2.95, 'xXyYzZ', po);
      b.poly('paint', [[0.3, 3.2, 0.05], [L - 0.3, 3.2, 0.05], [L - 0.3, 3.7, 1.5], [0.3, 3.7, 1.5]], [0, 1, -1], { tint: [0.3, 0.3, 0.32] });
      b.poly('paint', [[L - 0.3, 3.2, 2.95], [0.3, 3.2, 2.95], [0.3, 3.7, 1.5], [L - 0.3, 3.7, 1.5]], [0, 1, 1], { tint: [0.3, 0.3, 0.32] });
      const wins = k === 0 ? 2 : 7;
      for (let w = 0; w < wins; w++) {
        const xa = 1 + w * ((L - 2) / wins), xb = xa + (L - 2) / wins - 0.4;
        b.rect('glass', xa, 1.8, xb, 2.8, 0.04, { tint: [0.3, 0.35, 0.38] });
        b.rectBack('glass', xa, 1.8, xb, 2.8, 2.96, { tint: [0.3, 0.35, 0.38] });
      }
      for (const x of [2, L - 2]) for (const z of [0.1, 2.9]) b.tube('dark', [x, 0.45, z - 0.1], [x, 0.45, z + 0.1], 0.45, 0.45, 10, { tint: [0.1, 0.1, 0.1], caps: 1 });
      if (k === 0) b.box('light', L - 0.31, 1.0, 1.1, L - 0.28, 1.5, 1.9, 'X');
    }
  }
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
  for (const m of ch.monuments) {
    if (m.kind === 'fountain') place(b, 'fountain', cage4(T, null, boxPts(m.p, [1, 0], [0, 1], 9, 9), NONE, 0.05, 4.05), 9, 4, 9, {});
    else place(b, 'monument', cage4(T, null, boxPts(m.p, [1, 0], [0, 1], 4, 4), NONE, 0, 13), 4, 13, 4, { poster: 'bb4' });
  }
  for (const pr of ch.props) placeProp(b, T, pr, city.seed);
  for (const i of ch.rail) buildRoute(b, city, 'rail', i);
  for (const i of ch.highway) buildRoute(b, city, 'highway', i);
  for (const ex of ch.extras) buildExtra(b, city, ex);
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
  else if (info.zone === 2) mod = 'ornate';
  else if (plan.balcony && !house) mod = 'balcony';
  else mod = info.style === 'ornate' ? 'ornate' : info.style === 'modern' ? 'modern' : 'window';
  if (mod === 'shop' && W < 2.4) mod = 'window';
  if (mod === 'door' && W < 1.8) mod = 'wall';
  place(b, mod, cage, W, H, D, p);
  if (L === 0 && plan.screen) place(b, 'telescreen', cage, W, H, D, p);
  if (L === 0 && plan.poster) place(b, 'poster', cage, W, H, D, { name: POSTERS[hh % POSTERS.length], y: 0.9, w: Math.min(W * 0.6, 1.2) });
  // gzyms nad parterem kamienicy
  if (L === 1 && info.zone === 1 && !filled(g, nb, 0)) place(b, 'string', cage4(T, null, pts, NONE, y0, y0 + 0.32), W, 0.32, D, p);
  // okap / gzyms wieńczący
  if (L === top - 1) {
    const ce = info.ce;
    const cg = cage4(T, null, pts, NONE, y1, y1 + ce);
    if (house) place(b, 'eave', cg, W, ce, D, { roofTint: info.roofTint });
    else place(b, 'cornice', cg, W, ce, D, { style: info.style, consoles: info.style === 'ornate' });
  }
}

// dach ćwiartki: wysokość w każdym z 4 punktów z sąsiedztwa (okap = 0, kalenica = ridgeH)
function roofQuarter(b, city, info, G, i, top) {
  const g = city.grid, T = city.terrain, V = G.v;
  const a = V[i];
  const base = levelY(top) + info.ce;
  const flat = false;
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
  if (T.river(G.p[i][0], G.p[i][1]).d < T.hw + 1 || ty === T_WATER || ty === T_BEACH || ty === T_RAIL) return;
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
  if (ty === T_COURT && g.ZN[a] !== Z_HOUSES) place(b, 'cobble', cage4(T, null, pts, NONE, 0, 1), W, 1, D, { mat: 'cobble', step: 3, o: { drape: 0.04 } });
  else if (ty === T_STREET) {
    // jezdnia: bruk tylko na ćwiartkach ulic, przycięty do brzegu rzeki
    const cl = pts.map((p) => { const c = T.clampToBank(p[0], p[1]); return c ? [c[0], c[1]] : p; });
    if (dist(cl[0], cl[1]) < 0.05 && dist(cl[0], cl[2]) < 0.05) return;
    place(b, 'cobble', cage4(T, null, cl, NONE, 0, 1), W, 1, D, { mat: 'cobble', step: 3, o: { drape: 0.03 } });
  }
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
        if (ty === T_STREET || ty === T_PLAZA) {
          const q4 = [G.p[i], G.m[i], G.c, G.m[(i + 3) % 4]];
          if (q4.some((p) => T.river(p[0], p[1]).d < T.hw + 0.5)) continue;
          b.wpoly(ty === T_PLAZA ? 'slab' : 'cobble', q4.map((p) => [p[0], T.height(p[0], p[1]) + 0.04, p[1]]), [0, 1, 0], { flat: 1 });
        }
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
  const base = levelY(top) + info.ce, flat = false;
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
      const q = ids.map((k) => V[k]);
      const y = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
      if (y < T.seaY - 3.5) continue; // dno morza pod wodą
      const mx = (q[0][0] + q[2][0]) / 2, mz = (q[0][2] + q[2][2]) / 2;
      b.wpoly(T.isSand(mx, mz, y) ? 'sand' : 'grass', q, [0, 1, 0]);
    }
  return b.finish();
}
