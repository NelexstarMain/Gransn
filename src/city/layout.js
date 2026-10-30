// Organiczny układ miasta — czyste dane (bez geometrii), deterministyczne z seeda.
//
//  1. Teren + rzeka (terrain.js), plac Ministerstwa w środku.
//  2. Mosty: dla każdego mostu pary "lustrzanych" ziaren po obu stronach osi,
//     więc dwusieczna Voronoi = ulica, która przechodzi płynnie w most.
//  3. Poisson-disc + 2× relaksacja Lloyda → nieregularne, ale "zdrowe" komórki.
//  4. Diagram Voronoi, przycięcie komórek brzegami rzeki, zgrzanie wierzchołków
//     i zwinięcie krótkich krawędzi (ulice = wspólne krawędzie komórek).
//  5. Komórki Voronoi wyznaczają ulice i strefy (kamienice / domki / park /
//     plac). Same budynki powstają na nieregularnej siatce czworokątów (grid.js).
import { Rng, hash } from '../core/rng.js';
import { makeQuadGrid, classifyGrid, decorate, makeChunks } from './grid.js';
import { makeRoutes } from './routes.js';
import { makeBridge, riverLength, riverSiteAt, onBridge } from './bridges.js';
import { growRoads } from './roads.js';
import { RoadNet } from './roadnet.js';
import { Terrain } from './terrain.js';
import { makeTownPlan, applyPlan } from './town.js';

export const HALF = 520; // wyspa ~0,45 km² lądu (było 460)

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function polyCentroid(p) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length];
    const c = x0 * z1 - x1 * z0;
    a += c; cx += (x0 + x1) * c; cz += (z0 + z1) * c;
  }
  if (Math.abs(a) < 1e-9) return [p[0][0], p[0][1]];
  return [cx / (3 * a), cz / (3 * a)];
}

export function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
}

// zachowuje punkty z nx*x + nz*z <= c (Sutherland–Hodgman)
function clipPoly(poly, nx, nz, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + nz * a[1] - c, db = nx * b[0] + nz * b[1] - c;
    if (da <= 0) out.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

// Odsunięcie wielokąta do środka o różne odległości na każdej krawędzi.
export function offsetPoly(q, d) {
  const n = q.length, c = polyCentroid(q);
  const lines = [];
  for (let k = 0; k < n; k++) {
    const a = q[k], b = q[(k + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    let nx = -dz / l, nz = dx / l;
    if ((c[0] - (a[0] + b[0]) / 2) * nx + (c[1] - (a[1] + b[1]) / 2) * nz < 0) { nx = -nx; nz = -nz; }
    lines.push({ p: [a[0] + nx * d[k], a[1] + nz * d[k]], d: [dx / l, dz / l], n: [nx, nz] });
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const L1 = lines[(k + n - 1) % n], L2 = lines[k];
    const den = L1.d[0] * L2.d[1] - L1.d[1] * L2.d[0];
    if (Math.abs(den) < 1e-6) { out.push(L2.p); continue; }
    const t = ((L2.p[0] - L1.p[0]) * L2.d[1] - (L2.p[1] - L1.p[1]) * L2.d[0]) / den;
    out.push([L1.p[0] + L1.d[0] * t, L1.p[1] + L1.d[1] * t]);
  }
  out.normals = lines.map((l) => l.n);
  return out;
}

// krawędzie nie mogą się "przewrócić" ani zniknąć
function offsetValid(orig, off, minLen = 3) {
  const n = orig.length;
  for (let k = 0; k < n; k++) {
    const a = orig[k], b = orig[(k + 1) % n], c = off[k], d = off[(k + 1) % n];
    const dot = (b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1]);
    if (dot <= 0 || dist(c, d) < minLen) return false;
  }
  return polyArea(off) > 50;
}

export function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function inradius(poly, c) {
  let r = 1e9;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    r = Math.min(r, Math.abs((c[0] - a[0]) * dz - (c[1] - a[1]) * dx) / l);
  }
  return r;
}

// ── mosty ───────────────────────────────────────────────────────────────────
// Dwa albo trzy mosty miejskie: proste, prostopadłe do rzeki, z segmentów po 5 m (bridges.js).
// Główny stoi najbliżej rynku (od niego idzie ulica główna), drugi dalej wzdłuż rzeki (≥ 200 m),
// trzeci tylko przy rzece płynącej przez miasto.
function makeCityBridges(terrain, center, rng, avoid = null) {
  const total = riverLength(terrain);
  // kandydaci; gdy nic nie pasuje, kryteria się poluzowują (most musi być zawsze)
  const collect = (inl, margin, avoidD) => {
    const cand = [];
    for (let s = 0; s <= total; s += 8) {
      const site = riverSiteAt(terrain, s);
      if (!site) continue;
      const p = site.p;
      if (Math.abs(p[0]) > HALF - margin || Math.abs(p[1]) > HALF - margin || terrain.inland(p[0], p[1]) <= inl) continue;
      // most miejski nie może stanąć w miejscu mostu autostrady (dwa mosty w jednym miejscu)
      if (avoid && Math.hypot(p[0] - avoid.p[0], p[1] - avoid.p[1]) < avoidD) continue;
      cand.push({ site, s: site.s, d: Math.hypot(p[0] - center[0], p[1] - center[1]) });
    }
    return cand;
  };
  let cand = collect(70, 70, 140);
  if (!cand.length) cand = collect(55, 50, 70);
  if (!cand.length) cand = collect(40, 40, 0);
  const chosen = [];
  const want = terrain.riverMode === 'through' && rng.chance(0.5) ? 3 : 2;
  while (chosen.length < want) {
    let best = null;
    for (const c of cand) {
      if (chosen.some((o) => Math.abs(o.s - c.s) < 200 || Math.hypot(o.site.p[0] - c.site.p[0], o.site.p[1] - c.site.p[1]) < 190)) continue;
      const score = c.d * (1 + 0.1 * (hash(c.s | 0, chosen.length, 77) / 4294967296));
      if (!best || score < best.score) best = { score, c };
    }
    if (!best) break;
    chosen.push(best.c);
  }
  return chosen.map((c) => makeBridge(terrain, c.site, { cols: 2 }));
}

// ── ziarna Voronoi ──────────────────────────────────────────────────────────
function seedAllowed(x, z, terrain, bridges) {
  if (Math.abs(x) > HALF - 8 || Math.abs(z) > HALF - 8) return false;
  if (terrain.inland(x, z) < 45) return false;
  if (terrain.river(x, z).d < terrain.hw + 24) return false;
  for (const b of bridges) {
    const dx = x - b.p[0], dz = z - b.p[1];
    const along = dx * b.axis[0] + dz * b.axis[1], across = dx * b.perp[0] + dz * b.perp[1];
    if (Math.abs(along) < b.L + 90 && Math.abs(across) < 46) return false;
  }
  return true;
}

// ziarna: z planu miasteczka (jądro, przedmieścia, reszta wyspy) + pary „lustrzane” przy mostach,
// dzięki którym dwusieczna Voronoi to ulica przechodząca płynnie w most
function placeSeeds(bridges, plan) {
  const seeds = plan.seeds.slice();
  const near = (x, z) => {
    let best = null, bd = 1e18;
    for (const s of plan.seeds) { if (s.dead) continue; const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = s; } }
    return best ? best.kind : 'houses';
  };
  for (const b of bridges)
    for (const s of [-1, 1])
      for (const d of [30, 85])
        for (const q of [-1, 1]) {
          const along = s * (b.L + d);
          const x = b.p[0] + b.axis[0] * along + b.perp[0] * 36 * q, z = b.p[1] + b.axis[1] * along + b.perp[1] * 36 * q;
          seeds.push({ x, z, fixed: true, kind: near(x, z) });
        }
  return seeds;
}

function voronoi(seeds) {
  const box = [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]];
  return seeds.map((s, i) => {
    let poly = box;
    const near = [];
    for (let j = 0; j < seeds.length; j++) {
      if (j === i) continue;
      const d2 = (seeds[j].x - s.x) ** 2 + (seeds[j].z - s.z) ** 2;
      if (d2 < 360 * 360) near.push([d2, seeds[j]]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, o] of near) {
      // |p-s|² <= |p-o|²  ⇔  2(o-s)·p <= |o|² - |s|²
      poly = clipPoly(poly, 2 * (o.x - s.x), 2 * (o.z - s.z), o.x * o.x + o.z * o.z - s.x * s.x - s.z * s.z);
      if (poly.length < 3) break;
    }
    return poly;
  });
}

function clipRiver(poly, seed, terrain) {
  const P = terrain.pts;
  for (let i = 0; i < P.length - 1 && poly.length >= 3; i++) {
    const a = P[i], b = P[i + 1];
    let near = false;
    for (const v of poly) {
      const r = terrain.river(v[0], v[1]);
      if (r.seg === i && r.d < terrain.hw + 0.5) { near = true; break; }
    }
    if (!near) {
      const segLen = dist(a, b);
      for (let s = 0; s <= segLen && !near; s += 8) if (pointInPoly(poly, ...lerp2(a, b, s / segLen))) near = true;
    }
    if (!near) continue;
    const side = (b[0] - a[0]) * (seed.z - a[1]) - (b[1] - a[1]) * (seed.x - a[0]) > 0 ? 1 : -1;
    // brzeg po stronie ziarna
    const bank = side > 0 ? terrain.left : terrain.right;
    const p0 = bank[i], p1 = bank[i + 1];
    let nx = -(p1[1] - p0[1]), nz = p1[0] - p0[0];
    // n ma wskazywać w stronę rzeki (to, co odcinamy)
    const mid = lerp2(a, b, 0.5);
    if ((mid[0] - p0[0]) * nx + (mid[1] - p0[1]) * nz < 0) { nx = -nx; nz = -nz; }
    poly = clipPoly(poly, nx, nz, nx * p0[0] + nz * p0[1]);
  }
  return poly;
}

function weld(cells, seeds, terrain) {
  const V = [], grid = new Map();
  const find = (x, z) => {
    const gx = Math.floor(x / 0.5), gz = Math.floor(z / 0.5);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const list = grid.get(`${gx + dx},${gz + dz}`);
        if (list) for (const id of list) if (Math.abs(V[id].x - x) < 0.05 && Math.abs(V[id].z - z) < 0.05) return id;
      }
    const id = V.length;
    V.push({ x, z });
    const k = `${gx},${gz}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(id);
    return id;
  };
  const out = [];
  cells.forEach((poly, i) => {
    if (poly.length < 3 || polyArea(poly) < 300) return;
    const ids = [];
    for (const p of poly) {
      const id = find(p[0], p[1]);
      if (ids[ids.length - 1] !== id) ids.push(id);
    }
    if (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
    if (ids.length >= 3) out.push({ ids, seed: seeds[i] });
  });
  for (const v of V) {
    v.bank = Math.abs(terrain.river(v.x, v.z).d - terrain.hw) < 0.8;
    v.border = Math.abs(v.x) > HALF - 0.01 || Math.abs(v.z) > HALF - 0.01;
  }
  return { V, cells: out };
}

// zwijanie krótkich krawędzi — skrzyżowania zamiast "ząbków"
function collapse(g, minLen) {
  const { V } = g;
  for (let iter = 0; iter < 3000; iter++) {
    let best = null, bl = minLen;
    for (const c of g.cells)
      for (let k = 0; k < c.ids.length; k++) {
        const a = c.ids[k], b = c.ids[(k + 1) % c.ids.length];
        const l = Math.hypot(V[a].x - V[b].x, V[a].z - V[b].z);
        if (l < bl) { bl = l; best = [a, b]; }
      }
    if (!best) break;
    const [a, b] = best, A = V[a], B = V[b];
    const pri = (v) => (v.border ? 2 : v.bank ? 1 : 0);
    if (pri(B) > pri(A)) { A.x = B.x; A.z = B.z; A.bank = B.bank; A.border = B.border; }
    else if (pri(A) === pri(B)) { A.x = (A.x + B.x) / 2; A.z = (A.z + B.z) / 2; }
    for (const c of g.cells) {
      c.ids = c.ids.map((id) => (id === b ? a : id)).filter((id, k, arr) => id !== arr[(k + 1) % arr.length]);
    }
    g.cells = g.cells.filter((c) => c.ids.length >= 3);
  }
}

// ── ulice ───────────────────────────────────────────────────────────────────
const SPEC = {
  bank: { road: 0.35, walk: 4.5, bank: true },
  border: { road: 3, walk: 2.5 },
  bridge: { road: 3.5, walk: 2.5, avenue: true },
  lane: { road: 2.3, walk: 1.8 },
  street: { road: 3.3, walk: 2.6 },
  avenue: { road: 5.5, walk: 4.2, avenue: true },
};

// ─────────────────────────────────────────────────────────────────────────────
export function generateCity(seed = 1984) {
  const rng = new Rng(seed);
  const terrain = new Terrain(seed, HALF);
  const center = terrain.center;
  // rynek leży płasko; przy rzece na wysokości nabrzeża (inaczej uskok między rynkiem a bulwarem)
  const rd = terrain.riverDist(center[0], center[1]);
  const wRiver = 1 - Math.max(0, Math.min(1, (rd - 90) / 110));
  terrain.plaza = { x: center[0], z: center[1], r: 70, y: terrain.hills(center[0], center[1]) * (1 - wRiver) + terrain.bankY * wRiver };
  const routes = makeRoutes(seed, terrain, []);
  const bridges = makeCityBridges(terrain, center, rng, routes.highway.bridge);
  const plan = makeTownPlan(seed, terrain, bridges, HALF);
  terrain.plaza.r = Math.max(62, Math.max(plan.rynek.a, plan.rynek.b) * 1.12 + 14);
  let seeds = placeSeeds(bridges, plan);

  let cells = voronoi(seeds);
  for (let it = 0; it < 3; it++) {
    cells.forEach((c, i) => {
      const s = seeds[i];
      if (s.fixed || c.length < 3) return;
      const cc = polyCentroid(c);
      if (seedAllowed(cc[0], cc[1], terrain, bridges)) { s.x = cc[0]; s.z = cc[1]; }
    });
    cells = voronoi(seeds);
  }
  // cienkie komórki-szczeliny (ulice biegnące równolegle tuż obok siebie, ostre kąty) znikają:
  // usuwamy ich ziarno, a sąsiedzi przejmują teren. Ziarna stałe (mosty, rynek) i komórki przy
  // rzece lub brzegu zostają, bo tam wąski kształt jest naturalny.
  for (let pass = 0; pass < 6; pass++) {
    const bad = new Set();
    cells.forEach((c, i) => {
      if (seeds[i].fixed || c.length < 3) return;
      const cc = polyCentroid(c);
      if (terrain.river(cc[0], cc[1]).d < terrain.hw + 45 || terrain.inland(cc[0], cc[1]) < 70) return;
      if (inradius(c, cc) < 11 || polyArea(c) < 1500) bad.add(i);
    });
    if (!bad.size) break;
    seeds = seeds.filter((_, i) => !bad.has(i));
    cells = voronoi(seeds);
  }
  cells = cells.map((c, i) => (c.length >= 3 ? clipRiver(c, seeds[i], terrain) : c));
  const g = weld(cells, seeds, terrain);
  collapse(g, 15);

  const onAxis = (v) => bridges.some((b) => {
    const dx = v.x - b.p[0], dz = v.z - b.p[1];
    return Math.abs(dx * b.perp[0] + dz * b.perp[1]) < 2 && Math.abs(dx * b.axis[0] + dz * b.axis[1]) < 400;
  });
  const specs = new Map();
  const edgeSpec = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    let s = specs.get(key);
    if (!s) {
      const va = g.V[a], vb = g.V[b];
      const r = new Rng(hash(seed, a, b, 5));
      if (va.bank && vb.bank) s = SPEC.bank;
      else if (va.border && vb.border) s = SPEC.border;
      else if (onAxis(va) && onAxis(vb)) s = SPEC.bridge;
      else s = r.weighted([[SPEC.lane, 2], [SPEC.street, 6], [SPEC.avenue, 0.5]]);
      specs.set(key, s);
    }
    return s;
  };

  const blocks = [];
  // rynek: wielokąt z planu (wycięty z sieci), z ulicami dookoła; blok pierwszy, żeby HUD i klasyfikacja go znalazły
  {
    const P = plan.rynek.poly, pc = polyCentroid(P);
    const curb = offsetPoly(P, P.map(() => SPEC.street.road)), bl = offsetPoly(P, P.map(() => SPEC.street.road + SPEC.street.walk));
    const ok = offsetValid(P, curb) && offsetValid(curb, bl);
    const blk = { id: 0, poly: P, specs: P.map(() => SPEC.street), curb: ok ? curb : P, bline: ok ? bl : P, center: pc, bc: polyCentroid(ok ? bl : P), kind: 'plaza' };
    fillPlaza(blk, terrain);
    blocks.push(blk);
  }
  const seen = new Set();
  const vEdges = [], vSeen = new Set();
  for (const cell of g.cells) {
    const poly = cell.ids.map((id) => [g.V[id].x, g.V[id].z]);
    const n = poly.length;
    const sp = cell.ids.map((id, k) => edgeSpec(id, cell.ids[(k + 1) % n]));
    // krawędzie Voronoi = główne ulice (szkielet dla L-systemu Parish & Müller)
    cell.ids.forEach((id, k) => {
      const nx = cell.ids[(k + 1) % n], key = id < nx ? `${id}_${nx}` : `${nx}_${id}`;
      if (vSeen.has(key) || sp[k].bank || sp[k].border) return;
      vSeen.add(key);
      const a = poly[k], b = poly[(k + 1) % n];
      if (terrain.inland(a[0], a[1]) < 30 || terrain.inland(b[0], b[1]) < 30) return;
      // szerokość wg dzielnicy: wąskie uliczki Starego Miasta, szersze ulice w rozbudowie z XIX w.
      const hw0 = hash(seed, Math.round(a[0] * 4), Math.round(a[1] * 4), Math.round(b[0] * 4)) / 4294967296, kd = cell.seed.kind;
      const rw = sp[k].road >= 5 ? 4.2 : kd === 'old' ? (hw0 < 0.5 ? 3.0 : 3.4) : kd === 'tenement' ? (hw0 < 0.35 ? 4.0 : 3.4) : kd === 'villa' ? 3.6 : kd === 'houses' || kd === 'nature' || kd === 'industrial' ? (hw0 < 0.5 ? 3.0 : 3.4) : 3.4;
      vEdges.push({ a, b, rw, planned: !!cell.seed.lat });
    });
    cell.ids.forEach((id, k) => {
      const nx = cell.ids[(k + 1) % n], key = id < nx ? `${id}_${nx}` : `${nx}_${id}`;
      if (seen.has(key) || sp[k].bank) return;
      seen.add(key);
    });
    const curb = offsetPoly(poly, sp.map((s) => s.road));
    const bline = offsetPoly(poly, sp.map((s) => s.road + s.walk));
    const ok = offsetValid(poly, curb) && offsetValid(curb, bline);
    const c = polyCentroid(poly);
    if (cell.seed.dead) continue; // komórka wewnątrz rynku: sam rynek jest blokiem pierwszym
    const blk = { id: blocks.length, poly, specs: sp, curb: ok ? curb : poly, bline: ok ? bline : poly, center: c, bc: polyCentroid(ok ? bline : poly) };
    const br = new Rng(hash(seed, Math.round(c[0] * 10), Math.round(c[1] * 10)));
    const rIn = inradius(blk.bline, blk.bc);
    // rodzaj dzielnicy z planu; wąskie albo zdegenerowane komórki i trochę losowych skwerów zamieniają się w park
    blk.kind = cell.seed.kind || 'houses';
    const built = blk.kind === 'old' || blk.kind === 'tenement' || blk.kind === 'houses' || blk.kind === 'villa' || blk.kind === 'industrial';
    if (built && (!ok || rIn < 13 || polyArea(blk.bline) < 1400 || (!cell.seed.fixed && br.chance(0.08)))) blk.kind = 'park';
    cell.seed.kind = blk.kind;
    blk.seed = cell.seed;
    blocks.push(blk);
  }
  for (const s of seeds) if (!s.kind) s.kind = 'houses';

  // ── kościół: komórka Starego Miasta albo śródmieścia blisko rynku, duża, zwarta, z dala od rzeki;
  //  reszta komórki to dziedziniec kościelny (park). Wieża od strony rynku, prezbiterium na drugim końcu.
  const extras0 = [];
  {
    const C0 = plan.F.C;
    let best = null;
    for (const blk of blocks) {
      if (blk.kind !== 'old' && blk.kind !== 'tenement') continue;
      const A = polyArea(blk.bline), rin = inradius(blk.bline, blk.bc), d = Math.hypot(blk.bc[0] - C0[0], blk.bc[1] - C0[1]);
      if (A < 2300 || rin < 19 || d < 55 || d > 230) continue;
      if (terrain.river(blk.bc[0], blk.bc[1]).d < terrain.hw + 38 || terrain.inland(blk.bc[0], blk.bc[1]) < 70) continue;
      const score = Math.abs(d - 95) * 0.6 + (hash(seed, blk.id, 88) % 1000) / 40 - Math.min(rin, 40);
      if (!best || score < best.score) best = { score, blk };
    }
    if (best) {
      const blk = best.blk, P = blk.poly, n = P.length;
      // oś: najdłuższy bok komórki; rozpiętość komórki wzdłuż niej i w poprzek
      let L0 = 0, u = [1, 0];
      for (let i = 0; i < n; i++) { const a = P[i], c = P[(i + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l > L0) { L0 = l; u = [(c[0] - a[0]) / l, (c[1] - a[1]) / l]; } }
      let lo = 1e9, hi = -1e9;
      for (const q of P) { const t = (q[0] - blk.bc[0]) * u[0] + (q[1] - blk.bc[1]) * u[1]; lo = Math.min(lo, t); hi = Math.max(hi, t); }
      const e = (blk.bc[0] - C0[0]) * u[0] + (blk.bc[1] - C0[1]) * u[1] >= 0 ? u : [-u[0], -u[1]];
      const hh = hash(seed, blk.id, 89), W = Math.max(26, Math.min(36, hi - lo - 18)), H = 38 + (hh % 9);
      const brick = (hh >> 4) % 10 < 6;
      extras0.push({
        kind: 'church', p: blk.bc, e, n: [-e[1], e[0]], W, D: 12, H, brick,
        wall: brick ? [[0.6, 0.33, 0.25], [0.55, 0.3, 0.24], [0.66, 0.38, 0.28]][(hh >> 8) % 3] : [[0.92, 0.88, 0.8], [0.9, 0.84, 0.7], [0.94, 0.92, 0.88]][(hh >> 8) % 3],
        roof: [[0.28, 0.3, 0.34], [0.6, 0.27, 0.2], [0.34, 0.26, 0.2]][(hh >> 12) % 3],
        spire: [[0.38, 0.5, 0.44], [0.26, 0.28, 0.32], [0.55, 0.3, 0.22]][(hh >> 16) % 3],
        clear: 20,
      });
      blk.kind = 'church';
      blk.seed.kind = 'church';
    }
  }

  const monuments = blocks
    .filter((b) => b.kind === 'park' && polyArea(b.bline) > 2500 && terrain.inland(b.bc[0], b.bc[1]) > 40)
    .map((b, i) => ({ p: b.bc, kind: i % 2 ? 'fountain' : 'monument' }));
  if (plan.hall.none) monuments.push({ p: plan.F.C.slice(), kind: 'fountain' }); // rynek bez ratusza: fontanna pośrodku
  const plaza = blocks.find((b) => b.kind === 'plaza');
  // słupy i tablice reklamowe na rynku: po jednym w każdej ćwiartce, między ratuszem a pierzeją
  const billboards = [];
  const RY = plan.rynek, F = plan.F;
  ['war', 'freedom', 'ignorance', 'bb4'].forEach((name, i) => {
    const su = i % 2 ? 1 : -1, sv = i < 2 ? -1 : 1;
    const u = su * Math.max(RY.a * 0.5, 12), v = sv * Math.max(RY.b * 0.5, 9);
    const p = F.w(u, v), d = [p[0] - F.C[0], p[1] - F.C[1]], l = Math.hypot(d[0], d[1]) || 1;
    billboards.push({ p, n: [-d[0] / l, -d[1] / l], e: [-d[1] / l, d[0] / l], name, y: 0, size: name.startsWith('bb') ? [5, 10] : [12, 3] });
  });

  // start: na środku mostu najbliżej rynku, twarzą w stronę placu
  const b0 = bridges.reduce((a, b) => (Math.hypot(b.p[0] - center[0], b.p[1] - center[1]) < Math.hypot(a.p[0] - center[0], a.p[1] - center[1]) ? b : a), bridges[0]);
  const toP = [plaza.center[0] - b0.p[0], plaza.center[1] - b0.p[1]];
  const sgn = toP[0] * b0.axis[0] + toP[1] * b0.axis[1] > 0 ? 1 : -1;
  const spawn = { x: b0.p[0] + b0.perp[0] * 2, z: b0.p[1] + b0.perp[1] * 2, yaw: Math.atan2(-b0.axis[0] * sgn, -b0.axis[1] * sgn) };

  // autostrada (na ziemi) wchodzi do sieci jako szeroka droga — L-system łączy się z nią
  const hwEdges = [];
  let s0 = 0;
  const HP = routes.highway.pts;
  for (let i = 0; i < HP.length - 1; i++) {
    const a = HP[i], b = HP[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (terrain.inland(a[0], a[1]) > 24 && terrain.inland(b[0], b[1]) > 24) hwEdges.push({ a, b, rw: 5.5, type: 'H', s0 });
    s0 += L;
  }
  // krawędź Voronoi biegnąca tuż obok autostrady (równolegle, < 18 m) tylko ją dubluje
  const nearHw = (e) => {
    const L = dist(e.a, e.b);
    if (L < 1) return false;
    let hit = 0;
    const ang = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
    for (let k = 0; k < 5; k++) {
      const p = lerp2(e.a, e.b, (k + 0.5) / 5);
      for (const h of hwEdges) {
        const dx = h.b[0] - h.a[0], dz = h.b[1] - h.a[1], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((p[0] - h.a[0]) * dx + (p[1] - h.a[1]) * dz) / l2));
        const d = Math.hypot(p[0] - h.a[0] - dx * t, p[1] - h.a[1] - dz * t);
        let da = Math.abs(ang - Math.atan2(dz, dx)) % Math.PI; if (da > Math.PI / 2) da = Math.PI - da;
        if (d < 18 && da < 0.45) { hit++; break; }
      }
    }
    return hit >= 3;
  };
  const vKeep = applyPlan(plan, vEdges.filter((e) => !nearHw(e)), terrain);
  const streets = growRoads(seed, terrain, bridges, center, [...hwEdges, ...vKeep], plan);
  // nawierzchnia: bruk w mieście, ubita droga w lesie, asfalt na autostradzie
  const kindAt = (x, z) => {
    let best = null, bd = 1e18;
    for (const sd of seeds) { const d = (sd.x - x) ** 2 + (sd.z - z) ** 2; if (d < bd) { bd = d; best = sd; } }
    return best ? best.kind : 'houses';
  };
  for (const st of streets) {
    const mx = (st.a[0] + st.b[0]) / 2, mz = (st.a[1] + st.b[1]) / 2;
    st.mat = kindAt(mx, mz) === 'nature' || terrain.inland(mx, mz) < 40 ? 'dirt' : 'cobble';
    if (st.type === 'H' || st.bridge || st.main) st.mat = 'cobble';
    st.town = st.mat === 'cobble' && st.type !== 'H';
  }
  // autostrada nad rzeką: most z segmentów (routes.js) i jezdnia leżąca płasko na jego pokładzie
  const hwBridge = routes.highway.bridge;
  if (hwBridge) {
    bridges.push(hwBridge);
    for (const st of streets) if (st.type === 'H' && onBridge(hwBridge, (st.a[0] + st.b[0]) / 2, (st.a[1] + st.b[1]) / 2, 1)) st.bridge = true;
  }
  const roads = new RoadNet(streets);
  const extras = makeExtras(terrain, routes, rng);
  // komin fabryczny w środku każdej większej komórki przemysłowej
  for (const blk of blocks) {
    if (blk.kind !== 'industrial' || polyArea(blk.bline) < 1800) continue;
    extras0.push({ kind: 'factorychimney', p: blk.bc, H: 27 + (hash(seed, blk.id, 90) % 11), clear: 7 });
  }
  extras.push(...extras0);
  const city = { seed, blocks, terrain, bridges, spawn, streets, roads, seedList: seeds, monuments, billboards, routes, extras, plan, size: 2 * HALF, half: HALF };
  city.grid = makeQuadGrid(seed, HALF);
  classifyGrid(city);
  decorate(city);
  city.chunks = makeChunks(city);
  return city;
}

// ── plac Ministerstwa ───────────────────────────────────────────────────────
function fillPlaza(blk, terrain) {
  const r = inradius(blk.curb, [terrain.plaza.x, terrain.plaza.z]);
  const hs = Math.max(22, Math.min(46, r * 0.55));
  blk.ministry = { tiers: [1, 0.79, 0.6, 0.42].map((k) => hs * k), tierH: 22, y: terrain.plaza.y };
}

// ── latarnia morska, molo ──────────────────────────────
function makeExtras(T, routes, rng) {
  const out = [];
  const coastPt = (a, inset) => { const r = T.coastR(a) - inset; return [Math.cos(a) * r, Math.sin(a) * r]; };
  const far = (p, d) => routes.highway.pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > d) && T.river(p[0], p[1]).d > 60;
  // wyspa z zatoką: latarnia na jej cyplu, a molo w głębi zatoki (port)
  const bay = T.isl && T.isl.bay;
  let la = bay ? bay.a + bay.w * 1.7 : rng.float(0, Math.PI * 2);
  for (let i = 0; i < 24 && !far(coastPt(la, 6), 80); i++) la += 0.27;
  out.push({ kind: 'lighthouse', p: coastPt(la, 6), clear: 12 });
  for (let k = 0; k < 2; k++) {
    let a = bay ? bay.a + (k ? 0.2 : -0.2) * bay.w : la + 1.6 + k * 2.2;
    for (let i = 0; i < 24 && !far(coastPt(a, 30), 60); i++) a += 0.2;
    const p = coastPt(a, 30), o = coastPt(a, -60);
    const L = Math.hypot(o[0] - p[0], o[1] - p[1]);
    const e = [(o[0] - p[0]) / L, (o[1] - p[1]) / L];
    out.push({ kind: 'pier', p, e, len: L, clear: 6 });
  }
  return out;
}
