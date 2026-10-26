// Składanie świata z modułów na nieregularnej siatce czworokątów.
// Każda ściana, dach, chodnik i krawężnik to moduł z idealnej kostki,
// wciśnięty w ćwiartkę czworokąta wyznaczoną przez 4 punkty dookoła.
// Narożniki kostki NIE tworzą prostopadłościanu: czworokąty są krzywe,
// a każdy narożnik stoi na terenie na innej wysokości.
import { Builder } from './builder.js';
import { Cage } from './cage.js';
import { M } from './modules.js';
import { SHOP_SIGNS, POSTERS } from './atlas.js';
import { PROPS, moduleOf } from '../city/props.js';
import { Rng, hash } from '../core/rng.js';
import { HALF } from '../city/layout.js';
import { levelY, filled, quadGeom, wallPlan, buildingInfo, raised, lawn, T_BLD, T_COURT, T_PLAZA, T_PARK, T_GARDEN, T_STREET, T_WATER, Z_HOUSES } from '../city/grid.js';
import { RoadNet } from '../city/roadnet.js';
import { CAR_KINDS, PARKED_KINDS } from './vehicles.js';
import { polyDist } from '../city/routes.js';
import { SEG, bridgeSegments } from '../city/bridges.js';
import { SURFACE, SURF_Y } from '../render/layers.js';

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
// pole czworokąta [u0w0, u1w0, u0w1, u1w1] (dwa trójkąty)
const quadArea = (p) => Math.abs((p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1])) / 2 +
  Math.abs((p[1][0] - p[3][0]) * (p[2][1] - p[3][1]) - (p[2][0] - p[3][0]) * (p[1][1] - p[3][1])) / 2;

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
  const y = l.y ?? 0.15;
  place(b, 'lamp', cage4(T, null, boxPts(l.p, l.e, l.n, 1, 1), NONE, y, y + 6), 1, 6, 1, { metalTint: [0.17, 0.22, 0.19] });
}

const LEAF_BY = { oak: [[0.34, 0.48, 0.22], [0.3, 0.42, 0.2], [0.42, 0.5, 0.24]], birch: [[0.5, 0.62, 0.3], [0.56, 0.6, 0.28]], poplar: [[0.3, 0.44, 0.24], [0.36, 0.46, 0.22]], pine: [[0.16, 0.3, 0.18], [0.2, 0.34, 0.2]] };

function placeTree(b, T, t, r) {
  const sp = t.species || 'oak';
  const s = t.s, W = (sp === 'poplar' ? 4 : sp === 'pine' ? 5 : 7) * s, H = (sp === 'poplar' ? 14 : sp === 'pine' ? 12 : 9) * s;
  const rr = new Rng(t.seed || 1);
  const a = rr.float(0, Math.PI * 2), e = [Math.cos(a), Math.sin(a)], n = [-e[1], e[0]];
  const y = t.y ?? 0;
  place(b, 'tree', cage4(T, null, boxPts(t.p, e, n, W, W), NONE, y, y + H), W, H, W, { species: sp, seed: t.seed, leaf: rr.pick(LEAF_BY[sp]) });
}

const CAR_COLORS = [[0.12, 0.13, 0.15], [0.55, 0.12, 0.1], [0.2, 0.32, 0.24], [0.82, 0.8, 0.72], [0.25, 0.35, 0.55], [0.6, 0.6, 0.62], [0.45, 0.32, 0.2]];
const AWNINGS_ = [[[0.8, 0.2, 0.18], [0.95, 0.93, 0.86]], [[0.2, 0.45, 0.3], [0.95, 0.93, 0.86]], [[0.2, 0.3, 0.6], [0.95, 0.93, 0.86]], [[0.9, 0.7, 0.2], [0.95, 0.93, 0.86]]];
const FLOWERS_ = [[0.9, 0.2, 0.3], [0.95, 0.85, 0.3], [0.8, 0.5, 0.9], [0.98, 0.98, 0.95], [0.95, 0.55, 0.2]];
const WOODS_ = [[0.52, 0.38, 0.24], [0.42, 0.3, 0.2], [0.6, 0.46, 0.3]];

// parametry wyglądu rekwizytu (kolory, napisy) z jego własnego seeda — stałe dla danego miejsca
const VARIANT = {
  // zaparkowane auto: typ z seedu miejsca (ten sam w każdym workerze), niski poziom detalu
  car: (r) => ({ kind: r.pick(PARKED_KINDS), color: r.pick(CAR_COLORS), seat: r.pick([[0.4, 0.12, 0.1], [0.2, 0.15, 0.1], [0.15, 0.2, 0.3]]), q: 0, band: r.pick([[0.95, 0.92, 0.82], [0.85, 0.7, 0.3]]) }),
  kiosk: (r) => ({ sign: r.pick(['gin', 'milk', 'bread', 'tobacco']), color: r.pick([[0.3, 0.45, 0.35], [0.55, 0.2, 0.15], [0.25, 0.35, 0.5]]) }),
  hydrant: (r) => ({ color: r.pick([[0.85, 0.14, 0.1], [0.85, 0.14, 0.1], [0.22, 0.5, 0.32], [0.95, 0.78, 0.15]]) }),
  postbox: (r) => ({ color: r.pick([[0.85, 0.14, 0.12], [0.85, 0.14, 0.12], [0.2, 0.36, 0.72], [0.95, 0.78, 0.15]]) }),
  bollard: (r) => ({ color: r.pick([[0.13, 0.14, 0.14], [0.55, 0.53, 0.5]]) }),
  adcolumn: (r) => ({ posters: Array.from({ length: 8 }, () => r.pick(POSTERS)) }),
  planter: (r) => ({ flowers: r.pick(FLOWERS_), stone: r.pick([[0.74, 0.7, 0.64], [0.66, 0.64, 0.6], [0.8, 0.74, 0.62]]) }),
  sandwich: (r) => ({ sign: r.pick(SHOP_SIGNS) }),
  cafeset: (r) => { const a = r.pick(AWNINGS_); return { c1: a[0], c2: a[1] }; },
  stall: (r) => { const a = r.pick(AWNINGS_); return { c1: a[0], c2: a[1] }; },
  fruitstall: (r) => ({ c1: r.pick(AWNINGS_)[0] }),
  flowerstand: (r) => ({ c1: r.pick(AWNINGS_)[0], cols: [r.pick(FLOWERS_), r.pick(FLOWERS_), r.pick(FLOWERS_), r.pick(FLOWERS_)] }),
  handcart: (r) => ({ sack: r.pick([[0.78, 0.68, 0.5], [0.7, 0.62, 0.45]]) }),
  crates: (r) => ({ tint: r.pick(WOODS_) }),
  barrels: (r) => ({ tint: r.pick(WOODS_) }),
  wagon: (r) => ({ tint: r.pick([[0.45, 0.3, 0.2], [0.3, 0.4, 0.5], [0.5, 0.25, 0.2]]) }),
  statue: (r) => ({ bronze: r.pick([[0.5, 0.72, 0.62], [0.5, 0.42, 0.32], [0.7, 0.6, 0.4]]) }),
  gazebo: (r) => ({ tint: r.pick([[0.9, 0.88, 0.82], [0.85, 0.9, 0.88]]), roof: r.pick([[0.28, 0.5, 0.42], [0.55, 0.22, 0.18]]) }),
  well: (r) => ({ roof: r.pick([[0.62, 0.3, 0.2], [0.36, 0.3, 0.26]]) }),
  pergola: (r) => ({ tint: r.pick([[0.9, 0.88, 0.82], [0.5, 0.36, 0.24]]) }),
  flowerbed: (r) => ({ cols: [r.pick(FLOWERS_), r.pick(FLOWERS_), r.pick(FLOWERS_), r.pick(FLOWERS_)] }),
  shed: (r) => ({ tint: r.pick(WOODS_), roof: r.pick([[0.35, 0.3, 0.28], [0.45, 0.2, 0.15]]) }),
  haystack: (r) => ({ tint: r.pick([[0.9, 0.78, 0.38], [0.82, 0.7, 0.34]]) }),
  coop: (r) => ({ tint: r.pick(WOODS_) }),
  rock: (r) => ({ tint: r.pick([[0.6, 0.6, 0.57], [0.5, 0.48, 0.44], [0.66, 0.62, 0.55]]) }),
  windmill: (r) => ({ tint: r.pick([[0.9, 0.86, 0.78], [0.85, 0.78, 0.66]]), roof: r.pick([[0.3, 0.2, 0.15], [0.4, 0.22, 0.16]]) }),
  rowboat: (r) => ({ hull: r.pick([[0.25, 0.4, 0.55], [0.6, 0.2, 0.18], [0.85, 0.82, 0.72], [0.2, 0.42, 0.3]]) }),
  deckchair: (r) => { const a = r.pick(AWNINGS_); return { c1: a[0], c2: a[1] }; },
};

// parametry wyglądu rekwizytu o danym rodzaju i seedzie (też dla zdjęć studyjnych)
export function propParams(kind, seed = 1) {
  return VARIANT[kind] ? VARIANT[kind](new Rng(seed)) : {};
}

function placeProp(b, T, pr, seed) {
  const r = new Rng(pr.seed ?? hash(seed, Math.round(pr.p[0] * 10), Math.round(pr.p[1] * 10)));
  if (pr.kind === 'bush') {
    const s = pr.s;
    place(b, 'bush', cage4(T, null, boxPts(pr.p, [1, 0], [0, 1], 2.2 * s, 2.2 * s), NONE, (pr.y || 0) - 0.1, (pr.y || 0) + 1.6 * s), 2.2 * s, 1.7 * s, 2.2 * s, { leaf: r.pick(LEAF_BY.oak), flowers: r.chance(0.3) ? r.pick([[0.9, 0.2, 0.3], [0.95, 0.85, 0.3], [0.8, 0.5, 0.9]]) : null, seed: r.int(1, 99999) });
    return;
  }
  if (pr.kind === 'column') {
    const y = pr.y || 0;
    b.cell(cage4(T, null, boxPts(pr.p, [1, 0], [0, 1], 1, 1), NONE, y, y + 1), 1, 1, 1);
    b.cyl('stone', 0.5, 0.5, 0, 0.35, 0.42, 0.42, 10, { tint: [0.82, 0.8, 0.74] }, 'Y');
    b.cyl('stone', 0.5, 0.5, 0.35, pr.h - 0.4, 0.3, 0.26, 12, { tint: [0.88, 0.86, 0.8] });
    b.cyl('stone', 0.5, 0.5, pr.h - 0.4, pr.h + 0.2, 0.3, 0.45, 10, { tint: [0.82, 0.8, 0.74] }, 'Y');
    return;
  }
  const [W, H, D] = PROPS[pr.kind].size;
  const y0 = pr.y ?? 0.15;
  const p = VARIANT[pr.kind] ? VARIANT[pr.kind](r) : {};
  // zaparkowane auto: moduł liczy w wymiarach nominalnych typu, a klatka (stopka z props.js) lekko go ściska
  const K = pr.kind === 'car' ? CAR_KINDS[p.kind] : null;
  b.aoK = 0.45; // niskie rekwizyty nie giną w cieniu przy ziemi
  place(b, moduleOf(pr.kind), cage4(T, null, boxPts(pr.p, pr.e, pr.n, W, D), NONE, y0, y0 + H), K ? K.L : W, H, K ? K.Wd : D, p);
  b.aoK = 1;
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

function buildRail(b, city, i) {
  const T = city.terrain, R = city.routes.rail, P = R.pts;
  const a = P[i], c = P[i + 1], na = routeNormal(P, i), nc = routeNormal(P, i + 1), hw = 2.5;
  const pts = [[a[0] - na[0] * hw, a[1] - na[1] * hw], [c[0] - nc[0] * hw, c[1] - nc[1] * hw], [a[0] + na[0] * hw, a[1] + na[1] * hw], [c[0] + nc[0] * hw, c[1] + nc[1] * hw]];
  const W = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  if (T.inland(mid[0], mid[1]) < 2) return;
  const bridge = T.river(mid[0], mid[1]).d < T.hw + 3;
  // przejazd przez jezdnię: szyny równo z drogą, bez podsypki
  const crossing = !bridge && city.roads.clearance(mid[0], mid[1]) < 2.5;
  const ys = crossing ? [T.height(a[0], a[1]) - 0.45, T.height(c[0], c[1]) - 0.45] : [R.y[i], R.y[i + 1]];
  place(b, 'rail', cageY(pts, [ys[0], ys[1], ys[0], ys[1]], 1), W, 1, 2 * hw, { bridge, pier: bridge && i % 3 === 0, crossing });
}

function buildExtra(b, city, ex) {
  const T = city.terrain;
  if (ex.kind === 'lighthouse') {
    place(b, 'lighthouse', cage4(T, null, boxPts(ex.p, [1, 0], [0, 1], 8, 8), NONE, -1, 30), 8, 31, 8, {});
  } else if (ex.kind === 'pier') {
    const n = [-ex.e[1], ex.e[0]], end = [ex.p[0] + ex.e[0] * ex.len, ex.p[1] + ex.e[1] * ex.len];
    const pts = [[ex.p[0] - n[0] * 2, ex.p[1] - n[1] * 2], [end[0] - n[0] * 2, end[1] - n[1] * 2], [ex.p[0] + n[0] * 2, ex.p[1] + n[1] * 2], [end[0] + n[0] * 2, end[1] + n[1] * 2]];
    place(b, 'pier', Cage.quad(pts[0], pts[1], pts[2], pts[3], T.seaY - 4, T.seaY + 2.2), ex.len, 6.2, 4, {});
  } else if (ex.kind === 'townhall') {
    // wieża ratusza: dolne 3,6 m chowa się w dachu, całość ~17 m
    const w = ex.w, H = 17, y0 = levelY(ex.top) + 0.5 - 0.2;
    place(b, 'townhall', cage4(T, null, boxPts(ex.p, [1, 0], [0, 1], w, w), NONE, y0, y0 + H), w, H, w, { hide: 3.6 });
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
  for (const i of ch.roads) buildRoad(b, city, city.streets[i]);
  const r = new Rng(hash(city.seed, id, 99));
  for (const t of ch.trees) placeTree(b, T, t, r);
  for (const l of ch.lamps) placeLamp(b, T, l);
  for (const be of ch.benches) place(b, 'bench', cage4(T, null, boxPts(be.p, be.e, be.n, 1.8, 0.6), NONE, be.y ?? 0, (be.y ?? 0) + 1), 1.8, 1, 0.6, {});
  for (const m of ch.monuments) {
    if (m.kind === 'fountain') place(b, 'fountain', cage4(T, null, boxPts(m.p, [1, 0], [0, 1], 9, 9), NONE, 0.15, 4.15), 9, 4, 9, {});
    else place(b, 'monument', cage4(T, null, boxPts(m.p, [1, 0], [0, 1], 4, 4), NONE, 0.15, 13.15), 4, 13, 4, { poster: 'bb4' });
  }
  for (const pr of ch.props) placeProp(b, T, pr, city.seed);
  for (const i of ch.rail) buildRail(b, city, i);
  for (const ex of ch.extras) buildExtra(b, city, ex);
  for (const bb of ch.billboards) {
    const [w, h] = bb.size, H = bb.noPosts ? h + 0.6 : h + 3.2;
    const pts = boxPts(bb.p, bb.e, bb.n, w, 0.6);
    const cg = bb.y ? Cage.quad(pts[0], pts[1], pts[2], pts[3], T.plaza.y + bb.y, T.plaza.y + bb.y + H) : cage4(T, null, pts, NONE, 0.15, H + 0.15);
    place(b, 'billboard', cg, w, H, 0.6, { name: bb.name, posts: !bb.noPosts });
  }
  return b.finish();
}

function quarterInfo(G, i) {
  // ćwiartka narożnika i: [v_i, m_i (do i+1), c, m_{i-1}]
  return { v: G.p[i], mA: G.m[i], c: G.c, mB: G.m[(i + 3) % 4] };
}

function buildQuad(b, city, q) {
  const g = city.grid, seed = city.seed;
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
          // co jest dalej za końcem ściany w środku czworokąta: prosto, wypukły/wklęsły narożnik czy „szachownica”
          const other = filled(g, V[side === 0 ? (i + 3) % 4 : (i + 1) % 4], L), opp = filled(g, V[(i + 2) % 4], L);
          const ek = { kind: other ? (opp ? 'concave' : 'straight') : (opp ? 'saddle' : 'convex'), owner: side === 0 };
          wallSegment(b, city, info, a, nb, q, side, L, [f0, Qi.c, Qi.v, back1], top, ek);
        }
        if (L > 0 && !filled(g, a, L - 1)) {
          const y = levelY(L);
          b.wpoly(info.wallMat, [Qi.v, Qi.mA, Qi.c, Qi.mB].map((p) => [p[0], city.terrain.height(p[0], p[1]) + y, p[1]]), [0, -1, 0], { shade: 0.45 });
        }
      }
      roofQuarter(b, city, info, G, i, top);
      if (g.ARCH[a]) groundQuarter(b, city, G, i, q); // posadzka prześwitu / podcieni
      // rura spustowa na wypukłym narożniku (obie sąsiednie ćwiartki puste na całej wysokości)
      const nA = V[(i + 1) % 4], nB = V[(i + 3) % 4];
      if (top >= 2 && !filled(g, nA, 0) && !filled(g, nB, 0) && !filled(g, nA, top - 1) && !filled(g, nB, top - 1) && hash(seed, a, q, 5) % 3 === 0) {
        const dx = G.c[0] - G.p[i][0], dz = G.c[1] - G.p[i][1], l = Math.hypot(dx, dz) || 1;
        const px = G.c[0] + (dx / l) * 0.14, pz = G.c[1] + (dz / l) * 0.14;
        b.cell(cage4(city.terrain, null, boxPts([px, pz], [1, 0], [0, 1], 1, 1), NONE, 0, 1), 1, 1, 1);
        b.cyl('metal', 0.5, 0.5, 0.1, levelY(top) + 0.35, 0.06, 0.06, 6, { tint: [0.42, 0.44, 0.45] });
        b.cyl('metal', 0.5, 0.5, 0, 0.12, 0.1, 0.06, 6, { tint: [0.42, 0.44, 0.45] });
      }
      continue;
    }
    groundQuarter(b, city, G, i, q);
  }
}

function setTints(b, info) {
  b.setTint('plaster', info.tint);
  b.setTint('brick', info.style === 'brick' ? info.brickTint || [0.98, 0.92, 0.88] : [0.8, 0.7, 0.64]);
  b.setTint('stone', info.trim || [0.76, 0.73, 0.67]);
}

const GLASS = [[0.52, 0.58, 0.64], [0.48, 0.55, 0.62], [0.56, 0.6, 0.62], [0.62, 0.6, 0.55], [0.44, 0.42, 0.38], [0.36, 0.4, 0.45]];

function wallSegment(b, city, info, a, nb, q, side, L, pts, top, ek) {
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
    frameTint: info.frameTint, doorTint: info.doorTint, metalTint: [0.2, 0.22, 0.21], signTint: info.doorTint,
    shopGlass: [0.3, 0.32, 0.33], variant: info.variant, bars: info.bars, glassTint: GLASS[hh % GLASS.length],
    shutters: info.shutters, shutterTint: info.shutterTint, flowers: L > 0 ? info.flowers : null,
    simple: g.TY[nb] === T_COURT, sign: SHOP_SIGNS[hh % 4], winW: info.winW, winH: info.winH, curtain: info.curtain, awning: info.awning,
    endKind: ek.kind, cornerOwner: ek.owner,
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
  if (L === 0 && plan.poster) place(b, 'poster', cage, W, H, D, { name: POSTERS[hh % POSTERS.length], y: 0.9, w: Math.min(W * 0.6, 1.2) });
  // gzyms nad parterem kamienicy
  if (L === 1 && info.zone === 1 && !filled(g, nb, 0)) place(b, 'string', cage4(T, null, pts, NONE, y0, y0 + 0.32), W, 0.32, D, p);
  // okap / gzyms wieńczący — wszystkie budynki mają tę samą wysokość okapu (0,5 m),
  // więc dachy sąsiadów zawsze stykają się bez szczelin
  if (L === top - 1) {
    const ce = info.ce;
    const cg = cage4(T, null, pts, NONE, y1, y1 + ce);
    if (house) place(b, 'eave', cg, W, ce, D, { roofTint: info.roofTint, endKind: ek.kind, cornerOwner: ek.owner });
    else place(b, 'cornice', cg, W, ce, D, { style: info.style === 'modern' ? 'modern' : info.style, consoles: info.style === 'ornate', endKind: ek.kind, cornerOwner: ek.owner });
  }
}

// Dach ćwiartki. Każdy budynek ma własny dach: okap (wysokość 0) wszędzie tam,
// gdzie sąsiad jest niższy, pusty albo jest INNYM budynkiem; w środku kalenica
// o wysokości typowej dla budynku (płaski, niski, stromy...).
function roofSpec(city, G, i, top, info) {
  const g = city.grid, V = G.v, a = V[i];
  const other = (v) => g.TY[v] !== T_BLD || g.H[v] < top || g.BID[v] !== g.BID[a];
  const R = info.ridge;
  return [[G.p[i], R], [G.m[i], other(V[(i + 1) % 4]) ? 0 : R], [G.c, V.some(other) ? 0 : R], [G.m[(i + 3) % 4], other(V[(i + 3) % 4]) ? 0 : R]];
}

function roofQuarter(b, city, info, G, i, top) {
  const T = city.terrain, a = G.v[i];
  const base = levelY(top) + info.ce;
  const pts = roofSpec(city, G, i, top, info);
  b.wpoly(info.roofMat || 'roof', pts.map(([p, h]) => [p[0], T.height(p[0], p[1]) + base + h, p[1]]), [0, 1, 0], { tint: info.roofTint });
  const hv = pts[0][1];
  if (hv > 2.2 && hash(city.seed, a, 77) / 4294967296 < 0.12) {
    const pv = G.p[i];
    b.cell(cage4(T, null, boxPts(pv, [1, 0], [0, 1], 1, 1), NONE, base, base + 1), 1, 1, 1);
    M.chimney(b, 0.5, 0.5, hv - 1.2, hv + 1.3, { chimneyTint: [0.6, 0.45, 0.4] });
  }
}

// Nawierzchnia ćwiartki pustego punktu. W mieście wszystko poza jezdnią leży
// na +0,15 m (chodnik / trawnik / bruk podwórza) i jest DOCINANE do krawędzi
// jezdni; od strony niskiego terenu (las, plaża) dostaje obrzeże.
// Docinanie ćwiartki chodnika do jezdni i brzegu rzeki. Wszystkie rogi idą na TĘ
// stronę ulicy/rzeki, po której leży punkt odniesienia (punkt siatki albo — gdy
// sam stoi na jezdni — jego róg najdalej od jezdni). null = ćwiartka cała na jezdni.
export function sidewalkClamp(city, G, i) {
  const T = city.terrain, roads = city.roads;
  const raw = [G.p[i], G.m[i], G.m[(i + 3) % 4], G.c];
  let ref = G.p[i];
  if (roads.clearance(ref[0], ref[1]) < 0.3) {
    let best = -1e9;
    for (const p of raw) { const cl = roads.clearance(p[0], p[1]); if (cl > best) { best = cl; ref = p; } }
    if (best < 0.3) return null;
  }
  const own = T.bankSide(ref[0], ref[1]);
  return (p) => {
    let c = roads.clampSide(p, ref, 0.3);
    const bank = T.clampToBank(c[0], c[1], own);
    if (bank) c = [bank[0], bank[1]];
    return c;
  };
}

function groundQuarter(b, city, G, i, q) {
  const g = city.grid, T = city.terrain, roads = city.roads, a = G.v[i], ty = g.TY[a];
  if (!raised(city, a)) return;
  const clampAll = sidewalkClamp(city, G, i);
  if (!clampAll) return;
  const raw = [G.p[i], G.m[i], G.m[(i + 3) % 4], G.c];
  const mat = ty === T_PARK || ty === T_GARDEN || (ty === T_COURT && g.ZN[a] === Z_HOUSES) || lawn(city, a) ? 'lawn'
    : ty === T_COURT || ty === T_PLAZA ? 'cobblep' : 'slab';
  const lay = (pts, minArea) => {
    if (quadArea(pts) < minArea) return; // zjedzone przez jezdnię
    // narożniki rzucone na przeciwne brzegi rzeki → pas nad wodą; pomijamy
    if (Math.max(dist(pts[0], pts[1]), dist(pts[0], pts[2]), dist(pts[1], pts[3]), dist(pts[2], pts[3])) > 9) return;
    const W = Math.max(0.3, dist(pts[0], pts[1])), D = Math.max(0.3, dist(pts[0], pts[2]));
    if (mat === 'slab') place(b, 'sidewalk', cage4(T, null, pts, NONE, 0, 0.15), W, 0.15, D, { mat: 'slab', o: { drape: 0.15 } });
    else place(b, 'cobble', cage4(T, null, pts, NONE, 0, 1), W, 1, D, { mat, step: 3, o: { drape: 0.15, tint: ty === T_PLAZA ? [1, 0.96, 0.9] : undefined } });
  };
  // Przy jezdni ćwiartka dzielona jest na drobne pola, każde docinane osobno.
  // Docięcie samych narożników całej ćwiartki zostawiało pola rozpięte NAD
  // jezdnią (narożniki po obu stronach ulicy) — płyty przykrywały bruk.
  const bil = (u, w) => lerp2(lerp2(raw[0], raw[1], u), lerp2(raw[2], raw[3], u), w);
  let nearRoad = false;
  for (let k = 0; k <= 4 && !nearRoad; k++) for (let j = 0; j <= 4; j++) if (roads.clearance(...clampAll(bil(k / 4, j / 4))) < 0.45) { nearRoad = true; break; }
  if (!nearRoad) lay(raw.map(clampAll), 0.15);
  else {
    const len = Math.max(dist(raw[0], raw[1]), dist(raw[0], raw[2]), dist(raw[1], raw[3]), dist(raw[2], raw[3]));
    const n = Math.min(4, Math.max(2, Math.ceil(len / 1.1)));
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) {
        const pts = [bil(k / n, j / n), bil((k + 1) / n, j / n), bil(k / n, (j + 1) / n), bil((k + 1) / n, (j + 1) / n)].map(clampAll);
        const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4, cz = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
        // (przy rzece docięcie do brzegu potrafi wepchnąć narożnik z powrotem na jezdnię)
        if (roads.clearance(cx, cz) < 0.15 || pts.some((p) => roads.clearance(p[0], p[1]) < 0)) continue;
        lay(pts, 0.01);
      }
  }
  // obrzeża od strony niskich sąsiadów (las, plaża, tory) — bez szczelin na krawędzi
  for (const [s0, s1, nb] of [[G.m[i], G.c, G.v[(i + 1) % 4]], [G.c, G.m[(i + 3) % 4], G.v[(i + 3) % 4]]]) {
    if (raised(city, nb) || g.TY[nb] === T_BLD || g.TY[nb] === T_WATER) continue;
    const c0 = clampAll(s0), c1 = clampAll(s1);
    // docięcie do brzegu może rzucić końce na PRZECIWNE brzegi rzeki — wtedy krawężnik przecinałby wodę
    if (dist(c0, c1) < 0.2 || dist(c0, c1) > dist(s0, s1) * 2 + 1.5) continue;
    const inn = G.p[i];
    const k0 = Math.min(0.3, dist(c0, inn) * 0.5) / (dist(c0, inn) || 1), k1 = Math.min(0.3, dist(c1, inn) * 0.5) / (dist(c1, inn) || 1);
    place(b, 'curb', cage4(T, null, [c0, c1, lerp2(c0, inn, k0), lerp2(c1, inn, k1)], NONE, 0, 0.16), dist(c0, c1), 0.16, 0.3, {});
  }
}

// ── jezdnia: ciągła wstęga na kafelkach (kapsuła), krawężniki maskowane ─────
const ROAD_TINT = { cobble: [0.9, 0.88, 0.85], dirt: [0.78, 0.62, 0.46], asphalt: [1, 1, 1] };
function buildRoad(b, city, s) {
  const T = city.terrain, roads = city.roads;
  const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
  if (L < 0.5) return;
  const u = [dx / L, dz / L], n = [-u[1], u[0]], rw = s.rw;
  const mat = s.mat === 'dirt' ? 'gravel' : s.mat === 'asphalt' ? 'asphalt' : 'cobble';
  const o = { tint: ROAD_TINT[s.mat], flat: 1 };
  const yOff = s.mat === 'asphalt' ? SURF_Y.asphalt : s.mat === 'cobble' ? SURF_Y.cobble : SURF_Y.dirt;
  const Y = (x, z) => (s.bridge ? T.bankY : T.height(x, z)) + yOff;
  // ulica kończąca się przy nabrzeżu: wierzchołki z koryta wracają na brzeg (bez "balkonu" nad wodą)
  const own = s.bridge ? 0 : T.bankSide((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2);
  const onLand = (x, z) => {
    if (s.bridge) return [x, z];
    const c = T.clampToBank(x, z, own);
    return c ? [c[0], c[1]] : [x, z];
  };
  const P = (along, side) => {
    const [x, z] = onLand(s.a[0] + u[0] * along + n[0] * side, s.a[1] + u[1] * along + n[1] * side);
    return [x, Y(x, z), z];
  };
  // asfalt: autostrada ma 4 pasy (cała szerokość tekstury), ulice tylko środek z osią
  const v0 = s.type === 'H' ? 0 : 0.3, v1 = s.type === 'H' ? 1 : 0.7, s0 = s.s0 || 0;
  const steps = Math.max(1, Math.ceil(L / 3)), across = 2;
  for (let i = 0; i < steps; i++) {
    const t0 = (i / steps) * L, t1 = ((i + 1) / steps) * L;
    for (let j = 0; j < across; j++) {
      const w0 = -rw + (2 * rw * j) / across, w1 = -rw + (2 * rw * (j + 1)) / across;
      const q = [P(t0, w0), P(t1, w0), P(t1, w1), P(t0, w1)];
      const va = v0 + ((v1 - v0) * j) / across, vb = v0 + ((v1 - v0) * (j + 1)) / across;
      const oo = s.mat === 'asphalt' ? { ...o, uv: [[(s0 + t0) / 12, va], [(s0 + t1) / 12, va], [(s0 + t1) / 12, vb], [(s0 + t0) / 12, vb]] } : o;
      b.wpoly(mat, q, [0, 1, 0], oo);
    }
  }
  // zaokrąglone końce = płynne skrzyżowania i zakręty
  const cap = (c, dir) => {
    const base = Math.atan2(dir[1], dir[0]), seg = 8;
    for (let k = 0; k < seg; k++) {
      const a0 = base - Math.PI / 2 + (k / seg) * Math.PI, a1 = base - Math.PI / 2 + ((k + 1) / seg) * Math.PI;
      const p0 = onLand(c[0] + Math.cos(a0) * rw, c[1] + Math.sin(a0) * rw), p1 = onLand(c[0] + Math.cos(a1) * rw, c[1] + Math.sin(a1) * rw);
      b.wpoly(mat, [[c[0], Y(c[0], c[1]), c[1]], [p1[0], Y(p1[0], p1[1]), p1[1]], [p0[0], Y(p0[0], p0[1]), p0[1]]], [0, 1, 0], s.mat === 'asphalt' ? { ...o, uv: [[0.02, 0.5], [0.02, 0.5], [0.02, 0.5]] } : o);
    }
  };
  cap(s.b, u);
  cap(s.a, [-u[0], -u[1]]);
  // krawężniki tylko w mieście; kawałek pomijany, jeśli wpada w inną jezdnię
  if (!s.town || s.bridge) return;
  const piece = 2.2;
  const curbAt = (c0, c1, out) => {
    const m = [(c0[0] + c1[0]) / 2 + out[0] * 0.15, (c0[1] + c1[1]) / 2 + out[1] * 0.15];
    if (roads.clearance(m[0], m[1], s) < 0.05) return;
    if (T.river(m[0], m[1]).d < T.hw + 1) return;
    const bk0 = [c0[0] + out[0] * 0.3, c0[1] + out[1] * 0.3], bk1 = [c1[0] + out[0] * 0.3, c1[1] + out[1] * 0.3];
    place(b, 'curb', cage4(T, null, [c0, c1, bk0, bk1], NONE, 0, 0.16), dist(c0, c1), 0.16, 0.3, {});
  };
  const nP = Math.max(1, Math.round(L / piece));
  for (const sd of [-1, 1]) {
    const out = [n[0] * sd, n[1] * sd];
    for (let k = 0; k < nP; k++) {
      const t0 = (k / nP) * L, t1 = ((k + 1) / nP) * L;
      const c0 = [s.a[0] + u[0] * t0 + out[0] * rw, s.a[1] + u[1] * t0 + out[1] * rw];
      const c1 = [s.a[0] + u[0] * t1 + out[0] * rw, s.a[1] + u[1] * t1 + out[1] * rw];
      sd < 0 ? curbAt(c1, c0, out) : curbAt(c0, c1, out);
    }
  }
  for (const [c, dir] of [[s.b, u], [s.a, [-u[0], -u[1]]]]) {
    const base = Math.atan2(dir[1], dir[0]), seg = 6;
    for (let k = 0; k < seg; k++) {
      const a0 = base - Math.PI / 2 + (k / seg) * Math.PI, a1 = base - Math.PI / 2 + ((k + 1) / seg) * Math.PI;
      const o0 = [Math.cos(a0), Math.sin(a0)], o1 = [Math.cos(a1), Math.sin(a1)];
      const om = [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2)];
      curbAt([c[0] + o1[0] * rw, c[1] + o1[1] * rw], [c[0] + o0[0] * rw, c[1] + o0[1] * rw], om);
    }
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
  // poręcz nabrzeża stoi tylko tam, gdzie nie ma jezdni, mostu, torów ani autostrady
  const free = (x, z) => !nearBridge([x, z]) && city.roads.clearance(x, z) > 0.9 && polyDist(city.routes.rail, x, z) > 4.5 && polyDist(city.routes.highway, x, z) > 9.5;
  for (const bank of [T.bankL, T.bankR]) {
    for (let i = 0; i < bank.length - 1; i++) {
      const a = bank[i], c = bank[i + 1], L = dist(a, c), m = Math.max(1, Math.round(L / 6));
      const mid = lerp2(a, c, 0.5), rv = T.river(mid[0], mid[1]);
      const out = [rv.nx, rv.nz]; // od osi rzeki na ląd
      for (let j = 0; j < m; j++) {
        const pa = lerp2(a, c, j / m), pc = lerp2(a, c, (j + 1) / m);
        const qa = [pa[0] + out[0], pa[1] + out[1]], qc = [pc[0] + out[0], pc[1] + out[1]];
        const pm = lerp2(pa, pc, 0.5);
        if (T.inland(pm[0], pm[1]) < 12) continue;
        // przy ujściu teren opada do plaży — mur nabrzeża schodzi razem z nim (bez stopnia)
        const top = (p) => Math.max(T.waterY + 0.4, Math.min(T.bankY, T.height(p[0], p[1])));
        place(b, 'quay', cageY([pa, pc, qa, qc], [pa, pc, qa, qc].map((p) => top(p) - H), H), dist(pa, pc), H, 1, {});
        const k = Math.max(1, Math.round(dist(pa, pc) / 2.2));
        for (let u = 0; u < k; u++) {
          const ra = lerp2(pa, pc, u / k), rc = lerp2(pa, pc, (u + 1) / k), rm = lerp2(ra, rc, 0.5);
          if (!free(ra[0], ra[1]) || !free(rc[0], rc[1]) || !free(rm[0], rm[1])) continue;
          if (top(ra) < T.bankY - 0.25 || top(rc) < T.bankY - 0.25) continue; // przy ujściu mur schodzi do plaży — bez poręczy
          const rq = [ra, rc, [ra[0] + out[0], ra[1] + out[1]], [rc[0] + out[0], rc[1] + out[1]]];
          place(b, 'quayrail', cageY(rq, rq.map(top), 1.1), dist(ra, rc), 1.1, 1, {});
        }
      }
    }
  }
  // mosty: łańcuch prostych segmentów po 5 m (bridges.js), każdy dokładnie tam, gdzie kończy się poprzedni
  for (const br of city.bridges) {
    const hw = br.width / 2, Hb = T.bankY - yb;
    for (const sg of bridgeSegments(br)) {
      const pts = [[sg.a[0] - br.perp[0] * hw, sg.a[1] - br.perp[1] * hw], [sg.c[0] - br.perp[0] * hw, sg.c[1] - br.perp[1] * hw], [sg.a[0] + br.perp[0] * hw, sg.a[1] + br.perp[1] * hw], [sg.c[0] + br.perp[0] * hw, sg.c[1] + br.perp[1] * hw]];
      place(b, 'bridgeseg', Cage.quad(pts[0], pts[1], pts[2], pts[3], yb, T.bankY), SEG, Hb, br.width, { solid: sg.solid, first: sg.first, last: sg.last, sw: (br.width - 2 * (br.highway ? 5.5 : 3.5)) / 2, rail: br.rail });
    }
    // latarnie po obu stronach, na styku segmentów (co 2 segmenty od środka)
    if (!br.rail) for (const k of [-2, 2]) for (const sd of [-1, 1]) {
      const c = [br.p[0] + br.axis[0] * SEG * k, br.p[1] + br.axis[1] * SEG * k];
      const p = [c[0] + br.perp[0] * sd * (hw - 0.7), c[1] + br.perp[1] * sd * (hw - 0.7)];
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
        if (raised(city, a) && g.TY[a] !== T_PARK && g.TY[a] !== T_GARDEN && !lawn(city, a)) {
          const cl = sidewalkClamp(city, G, i);
          if (!cl) continue;
          const q4 = [G.p[i], G.m[i], G.c, G.m[(i + 3) % 4]].map(cl);
          b.wpoly('lodwalk', q4.map((p) => [p[0], T.height(p[0], p[1]) + SURFACE.lodwalk.y, p[1]]), [0, 1, 0], { flat: 1 });
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
          tint: info.wallMat === 'brick' ? [0.7, 0.5, 0.42] : info.tint, uv: [[0, nh], [1, nh], [1, top], [0, top]],
        });
      }
      roofQuarterLOD(b, city, info, G, i, top);
    }
  }
  for (const i of ch.roads) {
    const st = city.streets[i], L = dist(st.a, st.b);
    if (L < 0.5) continue;
    const n = [-(st.b[1] - st.a[1]) / L * st.rw, (st.b[0] - st.a[0]) / L * st.rw];
    const P = (p, sd) => { const x = p[0] + n[0] * sd, z = p[1] + n[1] * sd; return [x, (st.bridge ? T.bankY : T.height(x, z)) + 0.13, z]; };
    b.wpoly(st.mat === 'dirt' ? 'gravel' : st.mat === 'asphalt' ? 'asphalt' : 'cobble', [P(st.a, -1), P(st.b, -1), P(st.b, 1), P(st.a, 1)], [0, 1, 0], { tint: ROAD_TINT[st.mat], flat: 1, uv: st.type === 'H' ? [[0, 0], [L / 12, 0], [L / 12, 1], [0, 1]] : [[0, 0.3], [L / 12, 0.3], [L / 12, 0.7], [0, 0.7]] });
  }
  // wieża ratusza w LOD: trzon + miedziany hełm (widać ją z całej wyspy)
  for (const ex of ch.extras) {
    if (ex.kind !== 'townhall') continue;
    const gy = T.height(ex.p[0], ex.p[1]), w = ex.w / 2, y0 = gy + levelY(ex.top) + 0.3, ys = y0 + 8.4, yr = y0 + 14.4;
    const C = [[-w, -w], [w, -w], [w, w], [-w, w]].map(([a, c]) => [ex.p[0] + a, ex.p[1] + c]);
    for (let k = 0; k < 4; k++) {
      const a = C[k], c = C[(k + 1) % 4], hint = [(a[0] + c[0]) / 2 - ex.p[0], 0, (a[1] + c[1]) / 2 - ex.p[1]];
      b.wpoly('lod', [[a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], ys, c[1]], [a[0], ys, a[1]]], hint, { tint: [0.92, 0.88, 0.78], uv: [[0, 0], [1, 0], [1, 3], [0, 3]] });
      const h2 = w * 0.62;
      b.wpoly('lodroof', [[ex.p[0] + (a[0] - ex.p[0]) * 0.62, ys, ex.p[1] + (a[1] - ex.p[1]) * 0.62], [ex.p[0] + (c[0] - ex.p[0]) * 0.62, ys, ex.p[1] + (c[1] - ex.p[1]) * 0.62], [ex.p[0], yr + 2, ex.p[1]]], [hint[0], 0.8, hint[2]], { tint: [0.4, 0.66, 0.56] });
      void h2;
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
  const T = city.terrain, base = levelY(top) + info.ce;
  b.wpoly('lodroof', roofSpec(city, G, i, top, info).map(([p, h]) => [p[0], T.height(p[0], p[1]) + base + h, p[1]]), [0, 1, 0], { tint: info.roofTint });
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
      // podkład terenu leży 5 cm niżej i bez wybrzuszeń — jezdnie (+6 cm) i chodniki (+15 cm)
      // zawsze są nad nim, więc trawa nigdy nie przebija przez miasto
      V.push([x, T.height(x, z) - 0.05, z]);
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
      b.wpoly(T.isSand(mx, mz, y) ? 'sand' : 'grass', q, [0, 1, 0], { flat: 1 });
    }
  return b.finish();
}
